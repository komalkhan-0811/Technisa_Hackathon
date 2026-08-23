"""Backend for "Are You Actually Reading?" (FR3).

/generate-quiz calls Gemini to generate reading-comprehension questions
from a passage, then verifies/repairs each source_excerpt so it is an
exact substring of the input text.
"""

import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types


# ---------- Setup ----------

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quiz-backend")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Put it in backend/.env."
    )

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

# Initialize client without low timeouts that kill structured output generation
client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Pydantic models ----------

class GenerateQuizRequest(BaseModel):
    text: str
    num_questions: int = Field(default=3, ge=1)


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    source_excerpt: str


class GenerateQuizResponse(BaseModel):
    questions: list[QuizQuestion]


# ---------- Gemini structured-output schemas ----------

QUIZ_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "questions": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "question": types.Schema(type=types.Type.STRING),
                    "options": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(type=types.Type.STRING),
                    ),
                    "correct_index": types.Schema(type=types.Type.INTEGER),
                    "source_excerpt": types.Schema(type=types.Type.STRING),
                },
                required=[
                    "question",
                    "options",
                    "correct_index",
                    "source_excerpt",
                ],
            ),
        )
    },
    required=["questions"],
)


EXTRACT_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "excerpts": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(type=types.Type.STRING),
        )
    },
    required=["excerpts"],
)


QUIZ_SYSTEM_PROMPT = """You write short reading-comprehension quizzes from a passage of text.

Rules:
- Write exactly the requested number of multiple-choice questions.
- Each question has exactly 4 options and correct_index (0-3) pointing to the right one.
- Questions must test actual comprehension of the passage, not trivia outside it.
- Wrong options should be plausible, not silly.
- For source_excerpt: copy a short span (roughly 10-25 words) VERBATIM,
  character-for-character, from the passage. Do not paraphrase it.
"""


EXTRACT_SYSTEM_PROMPT = """You will be given a passage and a list of claims/questions.

For each item, return the exact verbatim substring (10-25 words) copied
character-for-character from the passage that best supports it.

Do not paraphrase, fix typos, or add ellipses.

Return exactly one excerpt per item, in the same order as the items.
"""


# ---------- Anchoring ----------

def find_exact_anchor(source_text: str, excerpt: str) -> str | None:
    if excerpt and excerpt in source_text:
        return excerpt
    return None


def find_normalized_anchor(source_text: str, excerpt: str) -> str | None:
    excerpt = excerpt.strip()
    if not excerpt:
        return None

    normalized = excerpt.translate(
        str.maketrans(
            {
                '"': "\0Q\0",
                "\u201c": "\0Q\0",
                "\u201d": "\0Q\0",
                "'": "\0A\0",
                "\u2018": "\0A\0",
                "\u2019": "\0A\0",
            }
        )
    )

    tokens = normalized.split()
    if not tokens:
        return None

    pattern = r"\s+".join(re.escape(tok) for tok in tokens)

    pattern = pattern.replace(
        re.escape("\0Q\0"),
        '["\u201c\u201d]'
    )
    pattern = pattern.replace(
        re.escape("\0A\0"),
        "['\u2018\u2019]"
    )

    match = re.search(pattern, source_text, re.IGNORECASE)
    return match.group(0) if match else None


def anchor_excerpt(source_text: str, model_excerpt: str) -> str | None:
    return (
        find_exact_anchor(source_text, model_excerpt)
        or find_normalized_anchor(source_text, model_excerpt)
    )


# ---------- Repair excerpts ----------

def repair_excerpts_via_llm(
    source_text: str,
    claims: list[str]
) -> list[str | None]:
    prompt = (
        f"{EXTRACT_SYSTEM_PROMPT}\n\n"
        f"Passage:\n\"\"\"\n{source_text}\n\"\"\"\n\n"
        f"Items:\n"
        + "\n".join(
            f"{i + 1}. {claim}"
            for i, claim in enumerate(claims)
        )
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=EXTRACT_SCHEMA,
                temperature=0.0,
            ),
        )

        data = json.loads(response.text)
        excerpts = data.get("excerpts", [])

        if not isinstance(excerpts, list):
            return [None] * len(claims)

        return excerpts

    except Exception as e:
        logger.error(f"Repair extraction call failed: {e}")
        return [None] * len(claims)


# ---------- Health ----------

@app.get("/health")
def health():
    return {
        "ok": True,
        "model": GEMINI_MODEL,
    }


# ---------- Generate quiz ----------

@app.post(
    "/generate-quiz",
    response_model=GenerateQuizResponse
)
def generate_quiz(req: GenerateQuizRequest):
    text = req.text.strip()

    if len(text) < 100:
        raise HTTPException(
            status_code=400,
            detail="Selection is too short (minimum 100 characters required).",
        )

    if len(text) > 8000:
        raise HTTPException(
            status_code=400,
            detail="Selection is too long (maximum 8,000 characters allowed).",
        )

    prompt = (
        f"{QUIZ_SYSTEM_PROMPT}\n\n"
        f"Number of questions: {req.num_questions}\n\n"
        f"Passage:\n\"\"\"\n{text}\"\"\""
    )

    # ---------- Main Gemini call with retry ----------

    response = None

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=QUIZ_SCHEMA,
                    temperature=0.4,
                ),
            )
            break
        except Exception as e:
            logger.error(f"Gemini quiz call failed (attempt {attempt + 1}/2): {e}")
            if attempt == 0:
                time.sleep(0.5)
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM call failed: {e}",
                )

    # ---------- Parse Gemini response ----------

    try:
        data = json.loads(response.text)
        raw_questions = data.get("questions", [])

        if not isinstance(raw_questions, list):
            raise ValueError("questions field is not a list")

    except Exception as e:
        logger.error(f"Bad JSON from model: {getattr(response, 'text', None)}")
        raise HTTPException(
            status_code=502,
            detail=f"Model returned malformed JSON: {e}",
        )

    # ---------- Validate and anchor questions ----------

    pending: list[dict] = []
    needs_repair_idx: list[int] = []

    for q in raw_questions:
        if not isinstance(q, dict):
            continue

        question = q.get("question")
        options = q.get("options")
        correct_index = q.get("correct_index")
        model_excerpt = q.get("source_excerpt", "")

        if not isinstance(question, str) or not question.strip():
            continue

        if not isinstance(options, list) or len(options) != 4:
            continue

        if not isinstance(correct_index, int) or correct_index not in range(4):
            correct_index = 0

        anchored = anchor_excerpt(text, str(model_excerpt))

        entry = {
            "question": question.strip(),
            "options": [str(opt) for opt in options],
            "correct_index": correct_index,
            "source_excerpt": anchored,
        }

        if anchored is None:
            needs_repair_idx.append(len(pending))

        pending.append(entry)

    # ---------- Repair failed excerpts ----------

    if needs_repair_idx:
        claims = [
            pending[i]["question"]
            for i in needs_repair_idx
        ]

        repaired = repair_excerpts_via_llm(text, claims)

        for slot, repaired_excerpt in zip(needs_repair_idx, repaired):
            if isinstance(repaired_excerpt, str):
                anchored = anchor_excerpt(text, repaired_excerpt)
                if anchored is not None:
                    pending[slot]["source_excerpt"] = anchored

    # ---------- Fallback: use sentence extraction if repair failed ----------

    verified = []
    for entry in pending:
        if entry["source_excerpt"] is None:
            # Fallback: grab the first sentence from text > 20 chars to prevent dropping the question
            sentences = [s.strip() for s in re.split(r'[.!?]', text) if len(s.strip()) > 20]
            if sentences:
                entry["source_excerpt"] = sentences[0]
            
        if entry["source_excerpt"] is not None:
            verified.append(QuizQuestion(**entry))

    if not verified:
        raise HTTPException(
            status_code=502,
            detail="Could not generate any valid questions from passage.",
        )

    return GenerateQuizResponse(questions=verified)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )