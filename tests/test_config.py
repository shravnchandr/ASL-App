"""DATABASE_URL normalisation for hosted Postgres (Neon, Cloud SQL)."""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from config import Settings


def _url(value: str) -> str:
    return Settings(database_url=value).database_url


@pytest.mark.parametrize("value", [
    "postgres://u:p@ep-x.neon.tech/asl?sslmode=require&channel_binding=require",
    "postgresql://u:p@ep-x.neon.tech/asl?sslmode=require&channel_binding=require",
    "postgresql+asyncpg://u:p@ep-x.neon.tech/asl?sslmode=require&channel_binding=require",
])
def test_neon_connection_string_becomes_asyncpg_arguments(value):
    url = _url(value)
    assert url == "postgresql+asyncpg://u:p@ep-x.neon.tech/asl?ssl=require"
    engine = create_async_engine(url)
    _, kwargs = engine.dialect.create_connect_args(engine.url)
    # Every keyword must be one asyncpg.connect() accepts
    assert kwargs == {"host": "ep-x.neon.tech", "database": "asl", "user": "u", "password": "p", "ssl": "require"}


def test_explicit_ssl_wins_and_special_characters_survive():
    url = _url("postgresql://u:p%40ss@h/asl?ssl=verify-full&sslmode=require")
    assert url == "postgresql+asyncpg://u:p%40ss@h/asl?ssl=verify-full"


def test_cloud_sql_socket_url_is_kept():
    url = _url("postgresql+asyncpg://u:p@/asl?host=/cloudsql/proj:us-central1:asl")
    assert url == "postgresql+asyncpg://u:p@/asl?host=/cloudsql/proj:us-central1:asl"


def test_sqlite_is_untouched():
    assert _url("sqlite+aiosqlite:///./asl_feedback.db") == "sqlite+aiosqlite:///./asl_feedback.db"
