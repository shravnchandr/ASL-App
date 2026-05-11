"""
CRUD operations for the Feedback model.
"""

from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from logger import app_logger
from ..models import Feedback
from ..engine import hash_ip


async def create_feedback(
    session: AsyncSession,
    query: Optional[str] = None,
    rating: Optional[str] = None,
    feedback_text: Optional[str] = None,
    ip_address: Optional[str] = None,
    feedback_type: str = "translation",
    category: Optional[str] = None,
    email: Optional[str] = None,
) -> Feedback:
    """Create a new feedback entry."""
    feedback = Feedback(
        query=query,
        rating=rating,
        feedback_text=feedback_text,
        ip_hash=hash_ip(ip_address) if ip_address else None,
        feedback_type=feedback_type,
        category=category,
        email=email,
    )
    session.add(feedback)
    await session.commit()
    app_logger.info(f"Feedback created: type={feedback_type}")
    return feedback


async def get_feedback_stats(session: AsyncSession) -> dict:
    """Get aggregate feedback statistics (single query)."""
    from sqlalchemy import case, func, select

    row = (
        await session.execute(
            select(
                func.count(Feedback.id).label("total"),
                func.count(case((Feedback.rating == "up", Feedback.id))).label("thumbs_up"),
                func.count(case((Feedback.rating == "down", Feedback.id))).label("thumbs_down"),
                func.count(case((Feedback.feedback_text.isnot(None), Feedback.id))).label("with_text"),
            )
        )
    ).one()

    return {
        "total_feedback": row.total or 0,
        "thumbs_up": row.thumbs_up or 0,
        "thumbs_down": row.thumbs_down or 0,
        "with_text_feedback": row.with_text or 0,
    }


async def get_recent_feedback(session: AsyncSession, limit: int = 10) -> List[Feedback]:
    """Get the most recent feedback entries."""
    from sqlalchemy import select

    result = await session.execute(
        select(Feedback).order_by(Feedback.timestamp.desc()).limit(limit)
    )
    return result.scalars().all()


async def get_paginated_feedback(
    session: AsyncSession,
    page: int = 1,
    limit: int = 50,
    feedback_type: Optional[str] = None,
) -> tuple[List[Feedback], int]:
    """Get paginated feedback with optional type filtering."""
    from sqlalchemy import select, func

    query = select(Feedback)
    count_query = select(func.count(Feedback.id))

    if feedback_type:
        query = query.where(Feedback.feedback_type == feedback_type)
        count_query = count_query.where(Feedback.feedback_type == feedback_type)

    total = (await session.execute(count_query)).scalar()

    offset = (page - 1) * limit
    result = await session.execute(
        query.order_by(Feedback.timestamp.desc()).offset(offset).limit(limit)
    )
    return result.scalars().all(), total
