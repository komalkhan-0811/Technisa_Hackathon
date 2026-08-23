# ReadActually

An AI-powered Chrome extension and FastAPI backend that turns web reading into active learning through highlighted text quizzes, automated skim tracking, and quote anchoring.

## Key Features

- **Manual Highlight Quizzes:** Highlight text between 100 and 8,000 characters on any webpage to instantly launch an in-page quiz overlay.
- **Automated Skim Tracking:** Monitors reading progression and prompts review questions as you scroll through key sections.
- **Quote Anchoring Backend:** Uses a validation pipeline with Google Gemini to anchor quiz questions directly in source text and prevent hallucinations.
- **Theme Syncing:** Automatically adapts the quiz overlay appearance to match your saved theme and light/dark mode settings.
- **Domain Permissions:** Remembers per-site tracking preferences locally so you aren't constantly nagged by prompt banners on trusted pages.

## Tech Stack

- **Extension:** Manifest V3, JavaScript, Shadow DOM web components, Chrome Storage API.
- **Backend:** Python, FastAPI, Uvicorn, Google Gemini API, Pydantic.

## Getting Started

### 1. Setting Up the Backend

- Open your terminal in the backend directory.
- Create and activate a virtual environment:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

- Create a .env file in the backend folder with a Gemini API key
- Run the backend: uvicorn main:app --reload --port 8000

### Loading the extension

1. Go to `chrome://extensions`, enable Developer Mode.
2. "Load unpacked" -> select the `extension/` folder.

### Project Images

<img width="324" height="550" alt="Screenshot 2026-08-23 000346" src="https://github.com/user-attachments/assets/ff74a868-964e-4dd1-8a79-76719a60864b" />
<img width="372" height="400" alt="Screenshot 2026-08-22 235623" src="https://github.com/user-attachments/assets/1d669d1d-b226-40c3-adba-494448938ff6" />

