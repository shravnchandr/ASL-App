"""
Async database management for feedback storage
Uses SQLAlchemy with async SQLite (aiosqlite)
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, Integer, String, DateTime, Text
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
