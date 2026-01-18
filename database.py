"""
Async database management for feedback storage
Uses SQLAlchemy with async SQLite (aiosqlite)
"""
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from config import get_settings
from logger import app_logger
import hashlib

settings = get_settings()

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


class Feedback(Base):
    """Feedback model for storing user ratings and comments"""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(String(500), nullable=True)  # Nullable for general feedback
    rating = Column(String(10), nullable=True)  # Nullable for general feedback
    feedback_text = Column(Text, nullable=True)
    ip_hash = Column(String(64), nullable=True)  # Hashed IP for privacy
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    # New fields for general feedback
    feedback_type = Column(String(20), default="translation", nullable=False)
    category = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)

    def __repr__(self):
        return f"<Feedback(id={self.id}, query='{self.query[:30]}...', rating={self.rating})>"


class Analytics(Base):
    """Analytics model for tracking user behavior and app usage"""
    __tablename__ = "analytics"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False)  # 'translation', 'page_view', 'cache_hit'
    ip_hash = Column(String(64), nullable=False, index=True)  # Hashed IP for privacy
    query = Column(String(500), nullable=True, index=True)  # Translation query (if applicable)
    cache_hit = Column(Boolean, nullable=True)  # Whether translation was from cache
    user_agent = Column(String(500), nullable=True)  # Browser/client information
    endpoint = Column(String(100), nullable=True)  # API endpoint accessed
    response_time_ms = Column(Integer, nullable=True)  # Response time in milliseconds
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    def __repr__(self):
        return f"<Analytics(id={self.id}, event_type={self.event_type}, timestamp={self.timestamp})>"


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app_logger.info("Database initialized successfully")


async def get_db():
    """Dependency for getting database sessions"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def hash_ip(ip: str) -> str:
    """Hash IP address for privacy-preserving storage"""
    return hashlib.sha256(ip.encode()).hexdigest()


# CRUD Operations

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
    """Create a new feedback entry"""
    ip_hash = hash_ip(ip_address) if ip_address else None
    
    feedback = Feedback(
        query=query,
        rating=rating,
        feedback_text=feedback_text,
        ip_hash=ip_hash,
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
    """Get feedback statistics"""
    from sqlalchemy import func, select
    
    # Count total feedback
    total_query = select(func.count(Feedback.id))
    total_result = await session.execute(total_query)
    total = total_result.scalar()
    
    # Count by rating
    up_query = select(func.count(Feedback.id)).where(Feedback.rating == "up")
    up_result = await session.execute(up_query)
    thumbs_up = up_result.scalar()
    
    down_query = select(func.count(Feedback.id)).where(Feedback.rating == "down")
    down_result = await session.execute(down_query)
    thumbs_down = down_result.scalar()
    
    # Count feedback with text
    text_query = select(func.count(Feedback.id)).where(Feedback.feedback_text.isnot(None))
    text_result = await session.execute(text_query)
    with_text = text_result.scalar()
    
    return {
        "total_feedback": total,
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "with_text_feedback": with_text,
    }


async def get_recent_feedback(session: AsyncSession, limit: int = 10) -> List[Feedback]:
    """Get recent feedback entries (for admin/analytics)"""
    from sqlalchemy import select

    query = select(Feedback).order_by(Feedback.timestamp.desc()).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()


async def get_paginated_feedback(
    session: AsyncSession,
    page: int = 1,
    limit: int = 50,
    feedback_type: Optional[str] = None
) -> tuple[List[Feedback], int]:
    """Get paginated feedback with optional filtering"""
    from sqlalchemy import select, func

    # Build base query
    query = select(Feedback)
    count_query = select(func.count(Feedback.id))

    # Apply filter if specified
    if feedback_type:
        query = query.where(Feedback.feedback_type == feedback_type)
        count_query = count_query.where(Feedback.feedback_type == feedback_type)

    # Get total count
    total_result = await session.execute(count_query)
    total = total_result.scalar()

    # Apply pagination
    offset = (page - 1) * limit
    query = query.order_by(Feedback.timestamp.desc()).offset(offset).limit(limit)

    result = await session.execute(query)
    items = result.scalars().all()

    return items, total


# ==================== Analytics CRUD Operations ====================

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
    """Create a new analytics event"""
    ip_hash_value = hash_ip(ip_address)

    event = Analytics(
        event_type=event_type,
        ip_hash=ip_hash_value,
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
    end_date: Optional[datetime] = None
) -> int:
    """Get count of unique users (distinct IP hashes)"""
    from sqlalchemy import func, select

    query = select(func.count(func.distinct(Analytics.ip_hash)))

    if start_date:
        query = query.where(Analytics.timestamp >= start_date)
    if end_date:
        query = query.where(Analytics.timestamp <= end_date)

    result = await session.execute(query)
    return result.scalar() or 0


async def get_translations_count(
    session: AsyncSession,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> dict:
    """Get total translation counts with cache statistics"""
    from sqlalchemy import func, select

    # Total translations
    total_query = select(func.count(Analytics.id)).where(
        Analytics.event_type == "translation"
    )

    # Cache hits
    hits_query = select(func.count(Analytics.id)).where(
        Analytics.event_type == "translation",
        Analytics.cache_hit == True
    )

    # Cache misses
    misses_query = select(func.count(Analytics.id)).where(
        Analytics.event_type == "translation",
        Analytics.cache_hit == False
    )

    # Apply date filters
    if start_date:
        total_query = total_query.where(Analytics.timestamp >= start_date)
        hits_query = hits_query.where(Analytics.timestamp >= start_date)
        misses_query = misses_query.where(Analytics.timestamp >= start_date)
    if end_date:
        total_query = total_query.where(Analytics.timestamp <= end_date)
        hits_query = hits_query.where(Analytics.timestamp <= end_date)
        misses_query = misses_query.where(Analytics.timestamp <= end_date)

    # Execute queries
    total_result = await session.execute(total_query)
    hits_result = await session.execute(hits_query)
    misses_result = await session.execute(misses_query)

    total = total_result.scalar() or 0
    cache_hits = hits_result.scalar() or 0
    cache_misses = misses_result.scalar() or 0

    return {
        "total": total,
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "cache_hit_rate": (cache_hits / total * 100) if total > 0 else 0
    }


async def get_popular_searches(
    session: AsyncSession,
    limit: int = 10,
    start_date: Optional[datetime] = None
) -> List[dict]:
    """Get most popular search queries"""
    from sqlalchemy import func, select

    query = (
        select(Analytics.query, func.count(Analytics.id).label("count"))
        .where(
            Analytics.event_type == "translation",
            Analytics.query.isnot(None)
        )
        .group_by(Analytics.query)
        .order_by(func.count(Analytics.id).desc())
        .limit(limit)
    )

    if start_date:
        query = query.where(Analytics.timestamp >= start_date)

    result = await session.execute(query)
    rows = result.all()

    return [{"query": row.query, "count": row.count} for row in rows]


async def get_daily_active_users(
    session: AsyncSession,
    days: int = 30
) -> List[dict]:
    """Get daily active users for the last N days"""
    from sqlalchemy import func, select, cast, Date

    start_date = datetime.utcnow() - timedelta(days=days)

    # Use DATE function for SQLite compatibility
    query = (
        select(
            func.date(Analytics.timestamp).label("date"),
            func.count(func.distinct(Analytics.ip_hash)).label("unique_users")
        )
        .where(Analytics.timestamp >= start_date)
        .group_by(func.date(Analytics.timestamp))
        .order_by(func.date(Analytics.timestamp))
    )

    result = await session.execute(query)
    rows = result.all()

    return [
        {
            "date": str(row.date),
            "unique_users": row.unique_users
        }
        for row in rows
    ]


async def get_hourly_usage_pattern(
    session: AsyncSession,
    days: int = 7
) -> dict:
    """Get usage pattern by hour of day (0-23)"""
    from sqlalchemy import func, select, extract

    start_date = datetime.utcnow() - timedelta(days=days)

    query = (
        select(
            extract('hour', Analytics.timestamp).label("hour"),
            func.count(Analytics.id).label("count")
        )
        .where(Analytics.timestamp >= start_date)
        .group_by(extract('hour', Analytics.timestamp))
        .order_by(extract('hour', Analytics.timestamp))
    )

    result = await session.execute(query)
    rows = result.all()

    # Initialize all hours to 0
    hourly_data = {str(i): 0 for i in range(24)}

    # Fill in actual counts
    for row in rows:
        hour = str(int(row.hour)) if row.hour is not None else "0"
        hourly_data[hour] = row.count

    return hourly_data


async def get_shared_key_usage_today(
    session: AsyncSession,
    ip_hash: str
) -> int:
    """Get count of translations using shared key today for a specific IP"""
    from sqlalchemy import func, select

    # Get today's start (midnight UTC)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    query = (
        select(func.count(Analytics.id))
        .where(
            Analytics.ip_hash == ip_hash,
            Analytics.event_type == "translation",
            Analytics.timestamp >= today_start
        )
    )

    result = await session.execute(query)
    count = result.scalar() or 0

    return count


async def check_shared_key_rate_limit(
    session: AsyncSession,
    ip_hash: str,
    daily_limit: int
) -> dict:
    """
    Check if IP has exceeded shared key rate limit

    Returns:
        dict with 'allowed' (bool), 'used' (int), 'limit' (int), 'remaining' (int)
    """
    used = await get_shared_key_usage_today(session, ip_hash)
    remaining = max(0, daily_limit - used)
    allowed = used < daily_limit

    return {
        "allowed": allowed,
        "used": used,
        "limit": daily_limit,
        "remaining": remaining
    }
