"""
SQLAlchemy ORM models for the ASL app.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

from .engine import Base


class Feedback(Base):
    """Stores user ratings and comments on translations, plus general feedback."""

    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(String(500), nullable=True)  # Nullable for general feedback
    rating = Column(String(10), nullable=True)  # Nullable for general feedback
    feedback_text = Column(Text, nullable=True)
    ip_hash = Column(String(64), nullable=True)  # Hashed IP for privacy
    timestamp = Column(DateTime, default=_utcnow, nullable=False)
    feedback_type = Column(String(20), default="translation", nullable=False)
    category = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)

    def __repr__(self):
        query_preview = self.query[:30] if self.query else "None"
        return f"<Feedback(id={self.id}, query='{query_preview}...', rating={self.rating})>"


class Analytics(Base):
    """Tracks user behavior and app usage for the analytics dashboard."""

    __tablename__ = "analytics"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(
        String(50), nullable=False
    )  # 'translation', 'page_view', 'cache_hit'
    ip_hash = Column(String(64), nullable=False, index=True)  # Hashed IP for privacy
    query = Column(
        String(500), nullable=True, index=True
    )  # Translation query if applicable
    cache_hit = Column(Boolean, nullable=True)  # Whether response was from cache
    key_type = Column(String(20), nullable=True)  # 'shared', 'custom', 'server', or None for cache hits
    user_agent = Column(String(500), nullable=True)
    endpoint = Column(String(100), nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=_utcnow, nullable=False, index=True)

    def __repr__(self):
        return f"<Analytics(id={self.id}, event_type={self.event_type}, timestamp={self.timestamp})>"


class SharedKeyUsage(Base):
    """Atomic per-IP daily quota counter for the shared Gemini API key."""

    __tablename__ = "shared_key_usage"

    ip_hash = Column(String(64), primary_key=True)
    date = Column(String(10), primary_key=True)  # ISO date YYYY-MM-DD (UTC)
    count = Column(Integer, nullable=False, default=0)
