# Are You Actually Reading?

Chrome extension that detects skimming on long-form pages and lets you quiz
yourself on what you just skimmed, highlighting the source passage if you
get it wrong.

## Structure

```
/extension   Chrome extension (Manifest V3): content script, background
             service worker, popup UI.
/backend     FastAPI server exposing POST /generate-quiz. Currently
             returns mock quiz data -- no LLM key required to run.
```

## Running the backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Loading the extension

1. Go to `chrome://extensions`, enable Developer Mode.
2. "Load unpacked" -> select the `extension/` folder.

## Status

Scaffolded per the project spec. Core logic (skim detection, real LLM
quiz generation, highlighting) is stubbed with TODOs -- see FR2, FR3, FR5
in the spec for what's next.
