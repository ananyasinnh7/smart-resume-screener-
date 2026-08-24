"""
Minimal persistence layer: stores every parsed resume + score so past
screenings/insights can be reviewed later. SQLite by default (zero
setup); swap the DATABASE_URL env var for Postgres in production.
"""
import os
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./resumelens.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class ScreeningRecord(Base):
    __tablename__ = "screening_records"

    id = Column(Integer, primary_key=True, index=True)
    candidate_name = Column(String, nullable=True)
    resume_filename = Column(String, nullable=False)
    job_description = Column(Text, nullable=False)
    profile_json = Column(Text, nullable=False)
    match_json = Column(Text, nullable=False)
    score = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class InsightsRecord(Base):
    __tablename__ = "insights_records"

    id = Column(Integer, primary_key=True, index=True)
    candidate_name = Column(String, nullable=True)
    resume_filename = Column(String, nullable=False)
    profile_json = Column(Text, nullable=False)
    insights_json = Column(Text, nullable=False)
    overall_score = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def init_db():
    Base.metadata.create_all(bind=engine)
