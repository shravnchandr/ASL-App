"""
Database engine, session factory, and core utilities.
"""

import hashlib
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from config import get_settings
from logger import app_logger

settings = get_settings()

# SQLite with aiosqlite uses StaticPool and does not accept pool_size/max_overflow/
# pool_timeout. Only connect_args is valid: timeout sets how long SQLite waits
# (in seconds) when the DB is locked before raising OperationalError.
_is_sqlite = "sqlite" in settings.database_url
_engine_kwargs = (
    dict(connect_args={"timeout": 10})
    if _is_sqlite
    else dict(pool_size=5, max_overflow=10, pool_timeout=5)
)

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
    **_engine_kwargs,
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
        if _is_sqlite:
            # WAL mode allows concurrent readers + one writer without readers blocking.
            # synchronous=NORMAL is safe with WAL and much faster than FULL.
            # Both settings persist in the DB file — only need to set them once per file.
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
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
