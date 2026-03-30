"""
Database engine, session factory, and core utilities.
"""

import hashlib
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from config import get_settings
from logger import app_logger

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def init_db():
    """Initialize database tables. Models are imported here to ensure they are
    registered with Base before create_all runs."""
    from . import models  # noqa: F401 — registers Feedback and Analytics with Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app_logger.info("Database initialized successfully")


async def get_db():
    """FastAPI dependency: yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def hash_ip(ip: str) -> str:
    """Hash an IP address with SHA-256 for privacy-preserving storage."""
    return hashlib.sha256(ip.encode()).hexdigest()
