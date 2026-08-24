"""
Thin wrapper around the Groq API implementing three pipelines:
    - extract_profile()   resume text -> structured CandidateProfile
    - score_candidate()   profile + JD -> MatchResult
    - generate_insights() profile + resume text -> ResumeInsights

Groq only - no other provider. This keeps setup to a single API key
(free at console.groq.com) and one place to change if the model
lineup ever changes.

=====================================================================
 WHERE YOUR API KEY GOES
=====================================================================
    backend/.env
        GROQ_API_KEY=gsk_...
        DEFAULT_MODEL=openai/gpt-oss-120b   (optional, this is already the default)

python-dotenv loads backend/.env automatically at startup. The key
never appears in the frontend or in any HTTP response.
=====================================================================
"""
import json
import os

from dotenv import load_dotenv
from groq import Groq

from llm.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    INSIGHTS_SYSTEM_PROMPT,
    SCORING_SYSTEM_PROMPT,
    build_extraction_prompt,
    build_insights_prompt,
    build_scoring_prompt,
)
from models.schemas import CandidateProfile, MatchResult, ResumeInsights

load_dotenv()

# openai/gpt-oss-120b and openai/gpt-oss-20b are Groq's current
# (2026) flagship open-weight models. Both are "reasoning" models -
# see _call_groq below for why that matters for max_tokens.
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "openai/gpt-oss-120b")

_groq_key = os.environ.get("GROQ_API_KEY")
if not _groq_key:
    raise RuntimeError(
        "GROQ_API_KEY is not set. Copy backend/.env.example to "
        "backend/.env and add your key from https://console.groq.com - see SETUP.md."
    )
_groq_client = Groq(api_key=_groq_key)


def _call_groq(system_prompt: str, user_prompt: str, model: str, max_tokens: int = 2048) -> dict:
    response = _groq_client.chat.completions.create(
        model=model,
        # Reasoning models (openai/gpt-oss-*) spend part of the token
        # budget "thinking" before writing the actual JSON. Give a
        # generous ceiling and turn reasoning effort down so more of
        # the budget goes to the actual answer.
        max_tokens=max(max_tokens, 4096),
        extra_body={"reasoning_effort": "low"},
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw_text = response.choices[0].message.content or ""
    cleaned = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Model did not return valid JSON. Raw response: {raw_text[:300]}") from exc


def extract_profile(resume_text: str, model: str | None = None) -> CandidateProfile:
    """resume text -> structured CandidateProfile."""
    data = _call_groq(
        EXTRACTION_SYSTEM_PROMPT,
        build_extraction_prompt(resume_text),
        model=model or DEFAULT_MODEL,
    )
    return CandidateProfile(**data)


def score_candidate(profile: CandidateProfile, job_description: str, model: str | None = None) -> MatchResult:
    """profile + JD -> MatchResult with justification."""
    data = _call_groq(
        SCORING_SYSTEM_PROMPT,
        build_scoring_prompt(profile.model_dump_json(), job_description),
        model=model or DEFAULT_MODEL,
    )
    if data.get("candidate_name") is None:
        data["candidate_name"] = profile.name
    data["recommendation"] = _recommendation_for_score(data.get("score", 0))
    return MatchResult(**data)


def generate_insights(profile: CandidateProfile, resume_text: str, model: str | None = None) -> ResumeInsights:
    """profile + raw resume text -> standalone resume quality feedback."""
    data = _call_groq(
        INSIGHTS_SYSTEM_PROMPT,
        build_insights_prompt(profile.model_dump_json(), resume_text),
        model=model or DEFAULT_MODEL,
        max_tokens=3072,
    )
    return ResumeInsights(**data)


def _recommendation_for_score(score: int) -> str:
    """Computed server-side so the label always agrees with the number
    shown next to it - see prompts.py for why this isn't left to the model."""
    if score >= 8:
        return "Proceed"
    if score >= 5:
        return "Consider"
    return "Not a fit"
