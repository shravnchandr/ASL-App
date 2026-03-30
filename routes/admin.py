"""
Admin routes: feedback management and analytics dashboard endpoints.
All routes require X-Admin-Password header (verified via verify_admin_password dependency).
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from logger import app_logger
from auth import verify_admin_password
from cache import get_cache_stats
from db import (
    get_db,
    get_feedback_stats,
    get_paginated_feedback,
    get_unique_users_count,
    get_translations_count,
    get_popular_searches,
    get_daily_active_users,
    get_hourly_usage_pattern,
)
from db.models import Feedback

router = APIRouter()


@router.get("/admin/feedback")
async def get_admin_feedback(
    page: int = 1,
    limit: int = 50,
    feedback_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password),
):
    """Get paginated feedback for admin review."""
    try:
        if limit > 100:
            limit = 100

        items, total = await get_paginated_feedback(db, page, limit, feedback_type)
        feedback_list = [
            {
                "id": item.id,
                "query": item.query,
                "rating": item.rating,
                "feedback_text": item.feedback_text,
                "timestamp": item.timestamp.isoformat(),
                "feedback_type": item.feedback_type,
                "category": item.category,
                "email": item.email,
            }
            for item in items
        ]
        return {
            "items": feedback_list,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching admin feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch feedback")


@router.delete("/admin/feedback/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password),
):
    """Delete a specific feedback entry by ID."""
    try:
        result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
        feedback = result.scalar_one_or_none()

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")

        await db.execute(delete(Feedback).where(Feedback.id == feedback_id))
        await db.commit()
        app_logger.info(f"Feedback {feedback_id} deleted by admin")
        return {"success": True, "message": "Feedback deleted"}
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error deleting feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete feedback")


@router.get("/admin/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password),
):
    """Get detailed admin statistics including feedback breakdown and cache info."""
    try:
        stats = await get_feedback_stats(db)

        type_result = await db.execute(
            select(
                Feedback.feedback_type, func.count(Feedback.id).label("count")
            ).group_by(Feedback.feedback_type)
        )
        type_counts = {row.feedback_type: row.count for row in type_result}

        category_result = await db.execute(
            select(Feedback.category, func.count(Feedback.id).label("count"))
            .where(Feedback.category.isnot(None))
            .group_by(Feedback.category)
        )
        category_counts = {row.category: row.count for row in category_result}

        cache_stats = await get_cache_stats()
        return {
            **stats,
            "by_type": type_counts,
            "by_category": category_counts,
            "cache": cache_stats,
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching admin stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")


@router.get("/admin/analytics/overview")
async def get_analytics_overview(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password),
):
    """Get key analytics metrics for the last 30/7/1 days."""
    try:
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        return {
            "unique_users_30d": await get_unique_users_count(
                db, start_date=thirty_days_ago
            ),
            "unique_users_7d": await get_unique_users_count(
                db, start_date=seven_days_ago
            ),
            "unique_users_today": await get_unique_users_count(
                db, start_date=today_start
            ),
            "translations": await get_translations_count(
                db, start_date=thirty_days_ago
            ),
            "popular_searches": await get_popular_searches(
                db, limit=10, start_date=thirty_days_ago
            ),
            "daily_active_users": await get_daily_active_users(db, days=30),
            "hourly_usage": await get_hourly_usage_pattern(db, days=7),
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching analytics overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@router.get("/admin/analytics/users")
async def get_user_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password),
):
    """Get daily active users and unique user counts for the last N days."""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        return {
            "daily_active_users": await get_daily_active_users(db, days=days),
            "unique_users": await get_unique_users_count(db, start_date=start_date),
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching user analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user analytics")


@router.get("/admin/analytics/searches")
async def get_search_analytics(
    limit: int = 20,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password),
):
    """Get the most popular search queries for the last N days."""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        return await get_popular_searches(db, limit=limit, start_date=start_date)
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching search analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch search analytics")
