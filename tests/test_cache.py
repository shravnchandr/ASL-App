"""Cache layer: Redis credential redaction, stall deadlines, and backoff."""

import asyncio
import time

import pytest

import cache
from logger import app_logger


class StalledRedis:
    """Every command hangs; counts calls."""

    def __init__(self):
        self.calls = 0

    async def get(self, key):
        self.calls += 1
        await asyncio.sleep(60)

    async def setex(self, key, ttl, value):
        self.calls += 1
        await asyncio.sleep(60)

    async def aclose(self):
        pass


@pytest.fixture(autouse=True)
def reset_cache_state(monkeypatch):
    monkeypatch.setattr(cache, "_redis_client", None)
    monkeypatch.setattr(cache, "_redis_retry_at", 0.0)
    monkeypatch.setattr(cache, "_redis_unavailable", False)
    monkeypatch.setattr(cache, "_memory_cache", cache._MemoryCache())
    monkeypatch.setattr(cache, "_REDIS_OP_TIMEOUT", 0.05)
    yield


def test_redact_url_hides_credentials():
    redacted = cache._redact_url("redis://user:s3cret@redis.example.com:6380/0")
    assert redacted == "redis://redis.example.com:6380"
    assert "s3cret" not in redacted


@pytest.mark.asyncio
async def test_connect_log_does_not_contain_password(monkeypatch):
    monkeypatch.setattr(cache.settings, "redis_url", "redis://user:s3cret@host:6379/0")

    async def fake_connect():
        return StalledRedis()

    monkeypatch.setattr(cache, "_connect_redis", fake_connect)
    messages: list[str] = []
    sink_id = app_logger.add(lambda m: messages.append(str(m)), level="INFO")
    try:
        await cache.init_redis()
    finally:
        app_logger.remove(sink_id)
    assert any("Redis connected" in m for m in messages)
    assert not any("s3cret" in m for m in messages)


@pytest.mark.asyncio
async def test_stalled_redis_does_not_block_and_backs_off(monkeypatch):
    monkeypatch.setattr(cache.settings, "redis_url", "redis://host:6379")
    stalled = StalledRedis()
    monkeypatch.setattr(cache, "_redis_client", stalled)

    start = time.monotonic()
    assert await cache.get_cached_translation("hello") is None
    assert time.monotonic() - start < 1.0
    assert stalled.calls == 1

    # Within the backoff window Redis is skipped entirely
    await cache.cache_translation("hello", {"query": "hello"})
    assert stalled.calls == 1
    assert await cache.get_cached_translation("hello") == {"query": "hello"}


@pytest.mark.asyncio
async def test_memory_hit_skips_redis(monkeypatch):
    monkeypatch.setattr(cache.settings, "redis_url", "redis://host:6379")
    cache._memory_cache.set(cache.generate_cache_key("hi"), '{"query": "hi"}', 60)
    stalled = StalledRedis()
    monkeypatch.setattr(cache, "_redis_client", stalled)

    assert await cache.get_cached_translation("hi") == {"query": "hi"}
    assert stalled.calls == 0
