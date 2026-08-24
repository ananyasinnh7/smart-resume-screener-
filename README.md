# ResumeLens

Screens resumes against a job description AND gives standalone
resume-quality feedback (the "Resume Insights" tab) — powered entirely
by Groq. No other LLM provider required.

- `backend/` — FastAPI + Groq. See `backend/SETUP.md` for exact run steps.
- `frontend/` — plain HTML/CSS/JS dashboard, two views: Screen Candidates
  and Resume Insights.
- `sample_data/` — a sample job description and two sample resumes to
  test with immediately.

## Quick start

```bash
cd backend
cp .env.example .env   # then paste your Groq key into .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
python -m http.server 5500
```

Open http://127.0.0.1:5500, go to Settings, set backend URL to
http://127.0.0.1:8000, Test connection, Save. Then try either tab.

Get a free Groq key at https://console.groq.com/keys.
