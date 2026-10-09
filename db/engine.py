"""
Database engine, session factory, and core utilities.
"""

import hashlib
import hmac
from sqlalchemy import inspect, text
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


# Columns added to existing tables after their first release: (table, column, DDL type).
# Must be nullable (or have a server default) so ALTER TABLE succeeds on populated tables.
_ADDED_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("analytics", "key_type", "VARCHAR(20)"),
)


def _missing_columns(sync_conn) -> list[tuple[str, str, str]]:
    inspector = inspect(sync_conn)
    existing = {
        table: {c["name"] for c in inspector.get_columns(table)}
        for table in {t for t, _, _ in _ADDED_COLUMNS}
        if inspector.has_table(table)
    }
    return [(t, c, ddl) for t, c, ddl in _ADDED_COLUMNS if t in existing and c not in existing[t]]


async def init_db():
    """Initialize database tables. Models are imported here to ensure they are
    registered with Base before create_all runs."""
    from . import models  # noqa: F401 — registers Feedback and Analytics with Base

    async with engine.begin() as conn:
        if _is_sqlite:
            # WAL: concurrent readers + one writer; NORMAL sync is safe with WAL and faster than FULL.
            # Both settings persist in the DB file.
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
        await conn.run_sync(Base.metadata.create_all)
        # create_all adds missing tables but not columns to existing ones. Inspect
        # first instead of attempting the ALTER and swallowing the error: on
        # PostgreSQL a failed statement aborts the whole startup transaction.
        missing = await conn.run_sync(_missing_columns)
        for table, column, ddl_type in missing:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
            app_logger.info(f"Migration: added {table}.{column}")
    if settings.environment == "production" and _is_sqlite:
        app_logger.warning(
            "DATABASE_URL is SQLite: feedback, analytics and daily quotas are lost whenever "
            "the container filesystem resets (every deploy on Render without a disk)"
        )
    if settings.environment == "production" and not settings.ip_hash_salt:
        app_logger.warning("IP_HASH_SALT is not set — stored IP hashes are reversible")
    app_logger.info("Database initialized successfully")


async def get_db():
    """FastAPI dependency: yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def hash_ip(ip: str) -> str:
    """Hash an IP address for privacy-preserving storage.

    With IP_HASH_SALT set this is HMAC-SHA256 keyed by the salt, which can't be
    reversed by enumerating the IPv4 space. Without it, falls back to plain SHA-256
    (reversible — set the salt in production).
    """
    if settings.ip_hash_salt:
        return hmac.new(settings.ip_hash_salt.encode(), ip.encode(), hashlib.sha256).hexdigest()
    return hashlib.sha256(ip.encode()).hexdigest()
