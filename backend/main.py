"""
ResumeLens - FastAPI backend entrypoint.

Run with:
    uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import screening

app = FastAPI(
    title="ResumeLens",
    description="Screens resumes against job descriptions and gives standalone resume-quality feedback, powered by Groq.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(screening.router, prefix="/api", tags=["screening"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
