"""
Pydantic models used across the app: request/response shapes and the
structured JSON contracts we force the LLM to return.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class Role(BaseModel):
    title: str
    company: str
    duration: Optional[str] = None


class Education(BaseModel):
    degree: str
    field: Optional[str] = None
    institution: Optional[str] = None


class CandidateProfile(BaseModel):
    """Stage 1 output: structured facts extracted from a raw resume."""
    name: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    total_experience_years: Optional[float] = None
    education: List[Education] = Field(default_factory=list)
    roles: List[Role] = Field(default_factory=list)
    low_confidence_fields: List[str] = Field(
        default_factory=list,
        description="Fields the model was not fully confident about extracting cleanly.",
    )


class MatchResult(BaseModel):
    """Stage 2 output: score + justification for a candidate against a JD."""
    candidate_name: Optional[str] = None
    score: int = Field(ge=1, le=10)
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    justification: str
    strengths: List[str] = Field(default_factory=list)
    concerns: List[str] = Field(default_factory=list)
    recommendation: str = Field(default="Consider")


class ScreenResponse(BaseModel):
    profile: CandidateProfile
    match: MatchResult


class ShortlistResponse(BaseModel):
    job_description: str
    results: List[ScreenResponse]


# ----------------------------------------------------------------
# Resume Insights: standalone resume feedback, no job description
# needed. This is the new "decode my resume" feature - it reviews
# the resume purely on its own merits (clarity, impact, ATS-
# friendliness, structure) rather than fit against a specific role.
# ----------------------------------------------------------------
class ResumeInsights(BaseModel):
    overall_score: int = Field(ge=1, le=10, description="Overall resume quality/polish score.")
    ats_friendliness: int = Field(ge=1, le=10, description="How well the resume would survive ATS keyword parsing.")
    summary: str = Field(description="2-3 sentence overall take on the resume.")
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    missing_sections: List[str] = Field(
        default_factory=list,
        description="Standard resume sections that appear to be missing or thin (e.g. quantified impact, summary).",
    )
    keyword_suggestions: List[str] = Field(
        default_factory=list,
        description="Industry/role keywords that could strengthen ATS matching, based on the candidate's apparent field.",
    )
    rewrite_suggestions: List[str] = Field(
        default_factory=list,
        description="2-4 concrete before/after style suggestions for weak bullet points.",
    )


class InsightsResponse(BaseModel):
    profile: CandidateProfile
    insights: ResumeInsights
