"""
Feedback routes: POST /feedback, POST /feedback/general, GET /feedback/stats.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from logger import app_logger
from deps import limiter
from db import get_db, create_feedback, get_feedback_stats
from .models import FeedbackRequest, FeedbackResponse, GeneralFeedbackRequest

settings = get_settings()
router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
@limiter.limit(settings.rate_limit)
async def submit_feedback(
    request: Request,
    feedback_req: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit a thumbs-up/down rating for a translation."""
    try:
        app_logger.info(
            f"Feedback submission: {feedback_req.rating} for '{feedback_req.query[:50]}'"
        )
        await create_feedback(
            session=db,
            query=feedback_req.query,
            rating=feedback_req.rating,
            feedback_text=feedback_req.feedback_text,
            ip_address=get_remote_address(request),
        )
        return FeedbackResponse(success=True, message="Thank you for your feedback!")
    except Exception as e:
        app_logger.exception(f"Error saving feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback")


@router.post("/feedback/general", response_model=FeedbackResponse)
@limiter.limit(settings.rate_limit)
async def submit_general_feedback(
    request: Request,
    feedback_req: GeneralFeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit a general bug report, feature request, or other feedback."""
    try:
        app_logger.info(f"General feedback submission: {feedback_req.category}")
        await create_feedback(
            session=db,
            feedback_text=feedback_req.feedback_text,
            ip_address=get_remote_address(request),
            feedback_type="general",
            category=feedback_req.category,
            email=feedback_req.email,
        )
        return FeedbackResponse(
            success=True,
            message="Thank you for your feedback! We appreciate your input.",
        )
    except Exception as e:
        app_logger.exception(f"Error saving general feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback")


@router.get("/feedback/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Return aggregate feedback statistics."""
    try:
        return await get_feedback_stats(db)
    except Exception as e:
        app_logger.exception(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")
