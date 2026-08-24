# ResumeLens

ResumeLens screens resumes against a job description and gives standalone
resume-quality feedback — powered entirely by [Groq](https://groq.com).
No other LLM provider required.

It has two modes:

- **Screen Candidates** — paste a job description and one or more resumes,
  and get a match score with reasoning for each candidate.
- **Resume Insights** — paste a single resume (no job description needed)
  and get standalone feedback on clarity, structure, and impact.

---





VIDEO:



https://github.com/user-attachments/assets/70354266-d788-4e31-a419-d05c42c651d6






## Project Structure

```
resumelens/
├── backend/
│   ├── main.py                  # FastAPI app entrypoint
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Template for environment variables
│   ├── llm/
│   │   ├── client.py             # Groq API client wrapper
│   │   └── prompts.py            # Prompt templates for screening/insights
│   ├── models/
│   │   ├── db.py                 # Database models/setup
│   │   └── schemas.py            # Pydantic request/response schemas
│   ├── parsers/
│   │   └── resume_parser.py      # PDF/DOCX resume text extraction
│   └── routes/
│       └── screening.py          # API endpoints (/api/...)
├── frontend/
│   ├── index.html                # Dashboard UI (two tabs)
│   ├── app.js                    # Frontend logic + API calls
│   └── style.css                 # Styling
├── sample_data/
│   ├── job_description.txt
│   ├── resume_strong_match.txt
│   └── resume_partial_match.txt
└── README.md
```

---

## Tech Stack

| Layer      | Technology                                   |
|------------|-----------------------------------------------|
| Backend    | FastAPI, Python                                |
| LLM        | Groq API (`openai/gpt-oss-120b` by default)    |
| Parsing    | pdfplumber, python-docx                        |
| Database   | SQLAlchemy (SQLite by default)                 |
| Frontend   | Plain HTML, CSS, JavaScript (no framework)     |

---

## Prerequisites

- Python 3.10+
- A free Groq API key — get one at https://console.groq.com/keys

---

## Setup & Run

### 1. Clone the repo

```bash
git clone https://github.com/ananyasinnh7/smart-resume-screener-.git
cd smart-resume-screener-
```

### 2. Backend setup

```bash
cd backend
cp .env.example .env
```

Open `.env` and paste your Groq API key:

```
GROQ_API_KEY=your_actual_key_here
DEFAULT_MODEL=openai/gpt-oss-120b
```

Install dependencies and start the server:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend will be running at `http://127.0.0.1:8000`.
Check it's alive at `http://127.0.0.1:8000/health` or view the interactive
API docs at `http://127.0.0.1:8000/docs`.

### 3. Frontend setup

In a **second terminal**:

```bash
cd frontend
python -m http.server 5500
```

Open `http://127.0.0.1:5500` in your browser.

### 4. Connect frontend to backend

1. Go to **Settings** in the app.
2. Set backend URL to `http://127.0.0.1:8000`.
3. Click **Test connection**.
4. Click **Save**.

You're ready to use either tab.

---

## Try it with sample data

The `sample_data/` folder includes a ready-to-use job description and two
resumes (one strong match, one partial match) so you can test the
**Screen Candidates** flow immediately without writing your own inputs.

---

## Environment Variables

| Variable         | Required | Description                                              |
|-------------------|----------|------------------------------------------------------------|
| `GROQ_API_KEY`    | Yes      | Your Groq API key. Get one free at console.groq.com/keys  |
| `DEFAULT_MODEL`   | No       | Groq model to use. Defaults to `openai/gpt-oss-120b`.      |

**Never commit your `.env` file.** It's already listed in `.gitignore`.
If you ever paste your key somewhere public (a chat, a screenshot, a
commit), rotate it immediately at console.groq.com/keys.

---

## Troubleshooting

| Symptom                                      | Likely Cause                                                    |
|-----------------------------------------------|-------------------------------------------------------------------|
| `{"detail":"Not Found"}` at `/`               | Normal — FastAPI has no route at `/`. Check `/docs` instead.     |
| `401 Invalid API Key`                         | `.env` still has placeholder text, or key wasn't saved/restarted.|
| `Could not import module "main"`              | You ran `uvicorn` from the wrong folder — must be inside `backend/`. |
| Frontend can't reach backend                  | Backend URL not set/saved correctly in Settings, or backend isn't running. |

---

## License

Add a license of your choice (e.g. MIT) via GitHub's **Add file → Create
new file → LICENSE** template picker.
