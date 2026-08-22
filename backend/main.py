"""Backend for "Are You Actually Reading?" (FR3).

/generate-quiz calls Gemini (Google AI Studio, free tier) to generate quiz
questions from a passage, then verifies/repairs each source_excerpt so it's
guaranteed to be an exact substring of the input text -- required so the
content script (FR5) can find and highlight it via string search.
"""

import os
import re
import json
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quiz-backend")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Put it in backend/.env "
        "(get a free key at https://aistudio.google.com/apikey)"
    )

# gemini-2.5-flash is stable as of Aug 2026 but shuts down Oct 16, 2026 --
# swap to "gemini-3.1-flash-lite" via this env var if AI Studio flags it.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

# The extension makes requests from a chrome-extension:// origin, not http(s),
# so CORS is opened broadly here -- fine for a local hackathon backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateQuizRequest(BaseModel):
    text: str
    num_questions: int = Field(default=2, ge=1, le=3)


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
                required=["question", "options", "correct_index", "source_excerpt"],
            ),
        )
    },
    required=["questions"],
)

# Repair pass: pure extraction, one quote per claim, same order as given.
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
- Wrong options should be plausible, not silly -- no obviously-wrong joke answers.
- For source_excerpt: copy a short span (roughly 10-25 words) VERBATIM,
  character-for-character, from the passage. Do not paraphrase it."""

EXTRACT_SYSTEM_PROMPT = """You will be given a passage and a list of claims/questions.
For each item, return the exact verbatim substring (10-25 words) copied
character-for-character from the passage that best supports it. Do not
paraphrase, fix typos, or add ellipses. Return exactly one excerpt per item,
in the same order as the items."""


# ---------- Anchoring: force source_excerpt to be a real substring ----------
# The model is told to quote verbatim but paraphrases anyway even when
# instructed not to -- so we never trust its excerpt directly. Three passes:
# exact match -> whitespace/quote-tolerant regex match (formatting drift,
# not real paraphrasing) -> a second, extraction-only Gemini call for
# anything still unresolved (much more reliable than lexical fuzzy-matching,
# which testing showed can score the wrong span higher than the right one).

def find_exact_anchor(source_text: str, excerpt: str) -> str | None:
    if excerpt and excerpt in source_text:
        return excerpt
    return None


def find_normalized_anchor(source_text: str, excerpt: str) -> str | None:
    excerpt = excerpt.strip()
    if not excerpt:
        return None
    normalized = excerpt.translate(
        str.maketrans({'"': "\0Q\0", "\u201c": "\0Q\0", "\u201d": "\0Q\0",
                       "'": "\0A\0", "\u2018": "\0A\0", "\u2019": "\0A\0"})
    )
    pattern = re.escape(normalized)
    pattern = re.sub(r"(\\ )+", r"\\s+", pattern)
    pattern = pattern.replace(re.escape("\0Q\0"), '["\u201c\u201d]')
    pattern = pattern.replace(re.escape("\0A\0"), "['\u2018\u2019]")
    match = re.search(pattern, source_text, re.IGNORECASE)
    return match.group(0) if match else None


def repair_excerpts_via_llm(source_text: str, claims: list[str]) -> list[str | None]:
    prompt = (
        f"{EXTRACT_SYSTEM_PROMPT}\n\n"
        f"Passage:\n\"\"\"\n{source_text}\n\"\"\"\n\n"
        f"Items:\n" + "\n".join(f"{i+1}. {c}" for i, c in enumerate(claims))
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
        return data.get("excerpts", [None] * len(claims))
    except Exception:
        logger.exception("Repair extraction call failed")
        return [None] * len(claims)


def anchor_excerpt(source_text: str, model_excerpt: str) -> str | None:
    return find_exact_anchor(source_text, model_excerpt) or find_normalized_anchor(
        source_text, model_excerpt
    )


@app.get("/health")
def health():
    return {"ok": True, "model": GEMINI_MODEL}


@app.post("/generate-quiz", response_model=GenerateQuizResponse)
def generate_quiz(req: GenerateQuizRequest):
    text = req.text.strip()
    if len(text) < 40:
        raise HTTPException(status_code=400, detail="text is too short to quiz on")

    prompt = (
        f"{QUIZ_SYSTEM_PROMPT}\n\n"
        f"Number of questions: {req.num_questions}\n\n"
        f"Passage:\n\"\"\"\n{text}\n\"\"\""
    )

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
    except Exception as e:
        logger.exception("Gemini call failed")
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    try:
        raw_questions = json.loads(response.text)["questions"]
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.exception("Bad JSON from model: %s", getattr(response, "text", None))
        raise HTTPException(status_code=502, detail=f"Model returned malformed JSON: {e}")

    # Pass 1 & 2: exact / normalized anchoring. Track what needs repair.
    pending: list[dict] = []
    needs_repair_idx: list[int] = []
    for q in raw_questions:
        options = q.get("options", [])
        if len(options) != 4 or "question" not in q or "correct_index" not in q:
            continue  # malformed question -- skip it, don't fail the whole request

        anchored = anchor_excerpt(text, q.get("source_excerpt", ""))
        entry = {
            "question": q["question"],
            "options": options,
            "correct_index": q["correct_index"],
            "source_excerpt": anchored,  # may be None, fixed in pass 3
        }
        if anchored is None:
            needs_repair_idx.append(len(pending))
        pending.append(entry)

    # Pass 3: one batched repair call for everything that didn't anchor.
    if needs_repair_idx:
        claims = [pending[i]["question"] for i in needs_repair_idx]
        repaired = repair_excerpts_via_llm(text, claims)
        for slot, repaired_excerpt in zip(needs_repair_idx, repaired):
            if repaired_excerpt:
                pending[slot]["source_excerpt"] = anchor_excerpt(text, repaired_excerpt)

    verified = [
        QuizQuestion(**entry) for entry in pending if entry["source_excerpt"] is not None
    ]

    if not verified:
        raise HTTPException(
            status_code=502,
            detail="Could not generate any question with a verifiable source excerpt.",
        )

    return GenerateQuizResponse(questions=verified)