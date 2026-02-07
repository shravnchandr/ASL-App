"""
Pytest configuration and fixtures
"""

import os
import sys

# Set test environment BEFORE importing any app modules
os.environ["ENVIRONMENT"] = "test"
os.environ["GOOGLE_API_KEY"] = "test-key-not-used"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["RATE_LIMIT"] = "1000/minute"  # High limit for testing

import pytest
import asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

# Import database models FIRST to ensure they're registered
from database import Base, get_db, Feedback


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_engine():
    """Create a test database engine"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Clean up
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture(scope="function")
async def test_db(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session"""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session
        await session.rollback()


@pytest.fixture(scope="function")
async def client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client"""
    # Import app here to avoid initialization issues
    from app import app

    # Override the database dependency
    async def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture
def mock_translation_result():
    """Mock translation result from LangGraph"""
    return {
        "query": "hello",
        "signs": [
            {
                "word": "HELLO",
                "hand_shape": "Flat hand, palm forward",
                "location": "Near the forehead",
                "movement": "Move hand forward in a small wave",
                "non_manual_markers": "Smile, friendly expression",
            }
        ],
        "note": "This is a common greeting in ASL.",
    }
