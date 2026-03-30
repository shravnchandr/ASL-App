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
    await session.refresh(feedback)
    app_logger.info(f"Feedback created: {feedback.id} - Type: {feedback_type}")
    return feedback


async def get_feedback_stats(session: AsyncSession) -> dict:
    """Get aggregate feedback statistics."""
    from sqlalchemy import func, select

    total = (await session.execute(select(func.count(Feedback.id)))).scalar()
    thumbs_up = (
        await session.execute(
            select(func.count(Feedback.id)).where(Feedback.rating == "up")
        )
    ).scalar()
    thumbs_down = (
        await session.execute(
            select(func.count(Feedback.id)).where(Feedback.rating == "down")
        )
    ).scalar()
    with_text = (
        await session.execute(
            select(func.count(Feedback.id)).where(Feedback.feedback_text.isnot(None))
        )
    ).scalar()

    return {
        "total_feedback": total,
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "with_text_feedback": with_text,
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
