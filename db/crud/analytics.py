"""
CRUD operations for the Analytics model.
"""

from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from logger import app_logger
from ..models import Analytics
from ..engine import hash_ip


async def create_analytics_event(
    session: AsyncSession,
    event_type: str,
    ip_address: str,
    query: Optional[str] = None,
    cache_hit: Optional[bool] = None,
    user_agent: Optional[str] = None,
    endpoint: Optional[str] = None,
    response_time_ms: Optional[int] = None,
) -> Analytics:
    """Record a new analytics event."""
    event = Analytics(
        event_type=event_type,
        ip_hash=hash_ip(ip_address),
        query=query,
        cache_hit=cache_hit,
        user_agent=user_agent,
        endpoint=endpoint,
        response_time_ms=response_time_ms,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    app_logger.debug(f"Analytics event created: {event.event_type} - {event.id}")
    return event


async def get_unique_users_count(
    session: AsyncSession,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> int:
    """Count distinct IP hashes (unique users) within an optional date range."""
    from sqlalchemy import func, select

    query = select(func.count(func.distinct(Analytics.ip_hash)))
    if start_date:
        query = query.where(Analytics.timestamp >= start_date)
    if end_date:
        query = query.where(Analytics.timestamp <= end_date)

    return (await session.execute(query)).scalar() or 0


async def get_translations_count(
    session: AsyncSession,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> dict:
    """Get total translation counts broken down by cache hit/miss."""
    from sqlalchemy import func, select

    total_q = select(func.count(Analytics.id)).where(
        Analytics.event_type == "translation"
    )
    hits_q = select(func.count(Analytics.id)).where(
        Analytics.event_type == "translation", Analytics.cache_hit
    )
    misses_q = select(func.count(Analytics.id)).where(
        Analytics.event_type == "translation", ~Analytics.cache_hit
    )

    if start_date:
        total_q = total_q.where(Analytics.timestamp >= start_date)
        hits_q = hits_q.where(Analytics.timestamp >= start_date)
        misses_q = misses_q.where(Analytics.timestamp >= start_date)
    if end_date:
        total_q = total_q.where(Analytics.timestamp <= end_date)
        hits_q = hits_q.where(Analytics.timestamp <= end_date)
        misses_q = misses_q.where(Analytics.timestamp <= end_date)

    total = (await session.execute(total_q)).scalar() or 0
    cache_hits = (await session.execute(hits_q)).scalar() or 0
    cache_misses = (await session.execute(misses_q)).scalar() or 0

    return {
        "total": total,
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "cache_hit_rate": (cache_hits / total * 100) if total > 0 else 0,
    }


async def get_popular_searches(
    session: AsyncSession, limit: int = 10, start_date: Optional[datetime] = None
) -> List[dict]:
    """Get the most frequently searched queries."""
    from sqlalchemy import func, select

    query = (
        select(Analytics.query, func.count(Analytics.id).label("count"))
        .where(Analytics.event_type == "translation", Analytics.query.isnot(None))
        .group_by(Analytics.query)
        .order_by(func.count(Analytics.id).desc())
        .limit(limit)
    )
    if start_date:
        query = query.where(Analytics.timestamp >= start_date)

    rows = (await session.execute(query)).all()
    return [{"query": row.query, "count": row.count} for row in rows]


async def get_daily_active_users(session: AsyncSession, days: int = 30) -> List[dict]:
    """Get distinct daily active users for the last N days."""
    from sqlalchemy import func, select

    start_date = datetime.utcnow() - timedelta(days=days)
    query = (
        select(
            func.date(Analytics.timestamp).label("date"),
            func.count(func.distinct(Analytics.ip_hash)).label("unique_users"),
        )
        .where(Analytics.timestamp >= start_date)
        .group_by(func.date(Analytics.timestamp))
        .order_by(func.date(Analytics.timestamp))
    )
    rows = (await session.execute(query)).all()
    return [{"date": str(row.date), "unique_users": row.unique_users} for row in rows]


async def get_hourly_usage_pattern(session: AsyncSession, days: int = 7) -> dict:
    """Get request counts grouped by hour of day (0–23) for the last N days."""
    from sqlalchemy import func, select, extract

    start_date = datetime.utcnow() - timedelta(days=days)
    query = (
        select(
            extract("hour", Analytics.timestamp).label("hour"),
            func.count(Analytics.id).label("count"),
        )
        .where(Analytics.timestamp >= start_date)
        .group_by(extract("hour", Analytics.timestamp))
        .order_by(extract("hour", Analytics.timestamp))
    )
    rows = (await session.execute(query)).all()

    hourly_data = {str(i): 0 for i in range(24)}
    for row in rows:
        hour = str(int(row.hour)) if row.hour is not None else "0"
        hourly_data[hour] = row.count

    return hourly_data


async def get_shared_key_usage_today(session: AsyncSession, ip_hash: str) -> int:
    """Count translations made with the shared key today for a specific IP hash."""
    from sqlalchemy import func, select

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    query = select(func.count(Analytics.id)).where(
        Analytics.ip_hash == ip_hash,
        Analytics.event_type == "translation",
        Analytics.timestamp >= today_start,
    )
    return (await session.execute(query)).scalar() or 0


async def check_shared_key_rate_limit(
    session: AsyncSession, ip_hash: str, daily_limit: int
) -> dict:
    """
    Check whether an IP has exceeded the shared-key daily translation limit.
    Returns dict with keys: allowed, used, limit, remaining.
    """
    used = await get_shared_key_usage_today(session, ip_hash)
    remaining = max(0, daily_limit - used)
    return {
        "allowed": used < daily_limit,
        "used": used,
        "limit": daily_limit,
        "remaining": remaining,
    }
