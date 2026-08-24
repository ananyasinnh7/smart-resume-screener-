"""
Endpoints:
    POST /api/screen           - one resume vs one job description
    POST /api/shortlist        - many resumes vs one job description (batch mode)
    POST /api/insights         - standalone resume feedback, no job description needed
    GET  /api/history          - past screening records
    GET  /api/insights-history - past insights records
"""
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from llm.client import extract_profile, generate_insights, score_candidate
from models.db import InsightsRecord, ScreeningRecord, SessionLocal, init_db
from models.schemas import InsightsResponse, ScreenResponse, ShortlistResponse

router = APIRouter()

init_db()


def _save_screening_record(db: Session, resume_filename: str, job_description: str, result: ScreenResponse) -> None:
    record = ScreeningRecord(
        candidate_name=result.match.candidate_name,
        resume_filename=resume_filename,
        job_description=job_description,
        profile_json=result.profile.model_dump_json(),
        match_json=result.match.model_dump_json(),
        score=result.match.score,
    )
    db.add(record)
    db.commit()


def _save_insights_record(db: Session, resume_filename: str, result: InsightsResponse) -> None:
    record = InsightsRecord(
        candidate_name=result.profile.name,
        resume_filename=resume_filename,
        profile_json=result.profile.model_dump_json(),
        insights_json=result.insights.model_dump_json(),
        overall_score=result.insights.overall_score,
    )
    db.add(record)
    db.commit()


@router.post("/screen", response_model=ScreenResponse)
async def screen_resume(
    job_description: str = Form(...),
    resume: UploadFile = File(...),
    model: str | None = Form(None),
):
    from parsers.resume_parser import extract_text

    try:
        file_bytes = await resume.read()
        resume_text = extract_text(resume.filename, file_bytes)
        if not resume_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract any text from the resume file.")

        profile = extract_profile(resume_text, model=model)
        match = score_candidate(profile, job_description, model=model)
        result = ScreenResponse(profile=profile, match=match)

        db = SessionLocal()
        try:
            _save_screening_record(db, resume.filename, job_description, result)
        finally:
            db.close()

        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Screening failed: {exc}") from exc


@router.post("/shortlist", response_model=ShortlistResponse)
async def shortlist_resumes(
    job_description: str = Form(...),
    resumes: List[UploadFile] = File(...),
    model: str | None = Form(None),
):
    from parsers.resume_parser import extract_text

    results = []
    db = SessionLocal()
    try:
        for resume in resumes:
            file_bytes = await resume.read()
            try:
                resume_text = extract_text(resume.filename, file_bytes)
                profile = extract_profile(resume_text, model=model)
                match = score_candidate(profile, job_description, model=model)
                result = ScreenResponse(profile=profile, match=match)
                _save_screening_record(db, resume.filename, job_description, result)
                results.append(result)
            except Exception:
                continue
    finally:
        db.close()

    results.sort(key=lambda r: r.match.score, reverse=True)
    return ShortlistResponse(job_description=job_description, results=results)


@router.post("/insights", response_model=InsightsResponse)
async def resume_insights(
    resume: UploadFile = File(...),
    model: str | None = Form(None),
):
    """Standalone resume review - no job description required.
    Gives the candidate feedback on their resume as a document."""
    from parsers.resume_parser import extract_text

    try:
        file_bytes = await resume.read()
        resume_text = extract_text(resume.filename, file_bytes)
        if not resume_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract any text from the resume file.")

        profile = extract_profile(resume_text, model=model)
        insights = generate_insights(profile, resume_text, model=model)
        result = InsightsResponse(profile=profile, insights=insights)

        db = SessionLocal()
        try:
            _save_insights_record(db, resume.filename, result)
        finally:
            db.close()

        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Resume analysis failed: {exc}") from exc


@router.get("/history")
def get_history(limit: int = 50):
    db = SessionLocal()
    try:
        records = (
            db.query(ScreeningRecord)
            .order_by(ScreeningRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "candidate_name": r.candidate_name,
                "resume_filename": r.resume_filename,
                "score": r.score,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
    finally:
        db.close()


@router.get("/insights-history")
def get_insights_history(limit: int = 50):
    db = SessionLocal()
    try:
        records = (
            db.query(InsightsRecord)
            .order_by(InsightsRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "candidate_name": r.candidate_name,
                "resume_filename": r.resume_filename,
                "overall_score": r.overall_score,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
    finally:
        db.close()
