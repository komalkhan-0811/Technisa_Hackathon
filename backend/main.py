"""Backend for "Are You Actually Reading?" (FR3).

Currently stubbed: /generate-quiz returns mock quiz data derived from the
input text so the rest of the pipeline (extension -> backend -> popup) can
be built and tested end-to-end without an LLM API key. Swap the body of
generate_quiz() for a real Claude/OpenAI call once a key is available --
the response schema below must stay the same.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/generate-quiz", response_model=GenerateQuizResponse)
def generate_quiz(req: GenerateQuizRequest):
    # TODO: replace with a real LLM call (Claude/OpenAI, structured/JSON
    # mode). The excerpt returned in each question MUST be an exact
    # substring of req.text -- if the model paraphrases, anchor it back to
    # the source text yourself rather than trusting the model's excerpt.
    excerpt = req.text[:120].strip() or "No text provided."
    return GenerateQuizResponse(
        questions=[
            QuizQuestion(
                question="[MOCK] What is this passage primarily about?",
                options=["Option A", "Option B", "Option C", "Option D"],
                correct_index=0,
                source_excerpt=excerpt,
            )
            for _ in range(req.num_questions)
        ]
    )
