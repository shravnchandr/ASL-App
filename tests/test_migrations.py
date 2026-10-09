"""Startup schema creation/migration against real (file-backed) SQLite databases."""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

import importlib

engine_module = importlib.import_module("db.engine")


@pytest.fixture
async def temp_engine(tmp_path, monkeypatch):
    eng = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'startup.db'}")
    monkeypatch.setattr(engine_module, "engine", eng)
    yield eng
    await eng.dispose()


async def _columns(eng, table: str) -> set[str]:
    async with eng.connect() as conn:
        return await conn.run_sync(lambda c: {col["name"] for col in inspect(c).get_columns(table)})


async def test_fresh_database_startup_is_idempotent(temp_engine):
    await engine_module.init_db()
    await engine_module.init_db()  # second boot must not fail or re-add columns
    assert "key_type" in await _columns(temp_engine, "analytics")


async def test_old_schema_gets_missing_column(temp_engine):
    async with temp_engine.begin() as conn:
        await conn.execute(text(
            "CREATE TABLE analytics (id INTEGER PRIMARY KEY, event_type VARCHAR(50) NOT NULL, "
            "ip_hash VARCHAR(64) NOT NULL, query VARCHAR(500), cache_hit BOOLEAN, "
            "user_agent VARCHAR(500), endpoint VARCHAR(100), response_time_ms INTEGER, "
            "timestamp DATETIME NOT NULL)"
        ))
        await conn.execute(text(
            "INSERT INTO analytics (event_type, ip_hash, timestamp) VALUES ('page_view', 'x', '2026-01-01')"
        ))

    await engine_module.init_db()
    assert "key_type" in await _columns(temp_engine, "analytics")
    async with temp_engine.connect() as conn:
        assert (await conn.execute(text("SELECT count(*) FROM analytics"))).scalar() == 1
