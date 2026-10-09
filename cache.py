"""
Caching layer for ASL Dictionary
Uses Redis when available, falls back to an in-memory LRU cache.
"""

import asyncio
import json
import hashlib
import time
from collections import OrderedDict
from typing import Optional
from urllib.parse import urlsplit

from config import get_settings
from logger import app_logger

settings = get_settings()

_MEMORY_CACHE_MAX = 256


class _MemoryCache:
    """Simple in-memory LRU cache with TTL expiry."""

    def __init__(self, max_size: int = _MEMORY_CACHE_MAX):
        self._store: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._max_size = max_size

    def get(self, key: str) -> Optional[str]:
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: str, ttl: int) -> None:
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = (time.monotonic() + ttl, value)
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear_prefix(self, prefix: str) -> int:
        keys = [k for k in self._store if k.startswith(prefix)]
        for k in keys:
            del self._store[k]
        return len(keys)

    def count_prefix(self, prefix: str) -> int:
        now = time.monotonic()
        return sum(
            1
            for k, (exp, _) in self._store.items()
            if k.startswith(prefix) and now <= exp
        )


_memory_cache = _MemoryCache()

# Redis is an optional accelerator: every operation has a short deadline, and after
# a failure Redis is skipped for _REDIS_RETRY_AFTER seconds (then reconnected lazily)
# so a stalled server never blocks requests that the memory cache can answer.
_REDIS_OP_TIMEOUT = 0.5
_REDIS_CONNECT_TIMEOUT = 2.0
_REDIS_RETRY_AFTER = 30.0

_redis_client = None
_redis_retry_at = 0.0
_redis_unavailable = False  # package missing — never retry
_redis_connect_lock = asyncio.Lock()


def _redact_url(url: str) -> str:
    """scheme://host:port only — never log credentials or db paths."""
    parsed = urlsplit(url)
    return f"{parsed.scheme}://{parsed.hostname or '?'}:{parsed.port or 6379}"


def _mark_redis_down(action: str, error: Exception) -> None:
    global _redis_retry_at
    _redis_retry_at = time.monotonic() + _REDIS_RETRY_AFTER
    app_logger.warning(
        f"Redis {action} failed ({type(error).__name__}: {error}); "
        f"using memory cache for {int(_REDIS_RETRY_AFTER)}s"
    )


async def _connect_redis():
    from redis.asyncio import from_url

    client = from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=_REDIS_CONNECT_TIMEOUT,
        socket_timeout=_REDIS_OP_TIMEOUT,
    )
    try:
        await asyncio.wait_for(client.ping(), _REDIS_CONNECT_TIMEOUT)
    except BaseException:
        await client.aclose()
        raise
    return client


async def _get_redis():
    """Return a healthy Redis client, reconnecting lazily after the backoff window."""
    global _redis_client, _redis_unavailable
    if not settings.redis_url or _redis_unavailable:
        return None
    if time.monotonic() < _redis_retry_at:
        return None
    if _redis_client is not None:
        return _redis_client
    async with _redis_connect_lock:
        if _redis_client is None and time.monotonic() >= _redis_retry_at:
            try:
                _redis_client = await _connect_redis()
                app_logger.info(f"Redis connected at {_redact_url(settings.redis_url)}")
            except ImportError:
                _redis_unavailable = True
                app_logger.warning("redis package not installed; using in-memory cache")
            except Exception as e:
                _mark_redis_down("connect", e)
    return _redis_client if time.monotonic() >= _redis_retry_at else None


async def _redis_call(action: str, fn, *args):
    """Run one Redis command with a deadline. Returns (ok, result)."""
    client = await _get_redis()
    if client is None:
        return False, None
    try:
        return True, await asyncio.wait_for(getattr(client, fn)(*args), _REDIS_OP_TIMEOUT)
    except Exception as e:
        _mark_redis_down(action, e)
        return False, None


async def init_redis():
    """Initialize Redis connection. Falls back to memory cache on failure."""
    if not settings.redis_url:
        app_logger.info("Redis URL not configured, using in-memory cache")
        return None
    return await _get_redis()


async def close_redis():
    """Close Redis connection"""
    global _redis_client

    if _redis_client:
        await _redis_client.aclose()
        app_logger.info("Redis connection closed")
        _redis_client = None


def get_redis():
    """Get Redis client instance"""
    return _redis_client


# Bump when the response shape or pipeline semantics change so stale entries
# (e.g. pre-v2 model-claimed kb_verified flags) are never served.
CACHE_VERSION = "v2"


def normalize_query(text: str) -> str:
    """Cache identity for a phrase: case- and whitespace-insensitive."""
    return " ".join(text.lower().split())


def generate_cache_key(text: str, prefix: str = "asl:translation") -> str:
    """
    Generate a cache key for a given text.
    Uses SHA256 hash to handle long texts and special characters.
    """
    text_hash = hashlib.sha256(normalize_query(text).encode()).hexdigest()[:16]
    return f"{prefix}:{CACHE_VERSION}:{text_hash}"


async def get_cached_translation(text: str) -> Optional[dict]:
    """Memory first (every write lands there), then Redis for entries from other workers/restarts."""
    cache_key = generate_cache_key(text)

    cached_data = _memory_cache.get(cache_key)
    if cached_data:
        app_logger.debug(f"Memory cache hit for key: {cache_key}")
        return json.loads(cached_data)

    ok, cached_data = await _redis_call("read", "get", cache_key)
    if ok and cached_data:
        app_logger.debug(f"Redis cache hit for key: {cache_key}")
        _memory_cache.set(cache_key, cached_data, settings.cache_ttl)
        return json.loads(cached_data)

    app_logger.debug(f"Cache miss for key: {cache_key}")
    return None


async def cache_translation(text: str, translation_data: dict) -> bool:
    """Write to in-memory cache and Redis (when available)."""
    cache_key = generate_cache_key(text)
    cached_json = json.dumps(translation_data)
    ttl = settings.cache_ttl

    _memory_cache.set(cache_key, cached_json, ttl)

    ok, _ = await _redis_call("write", "setex", cache_key, ttl, cached_json)
    app_logger.debug(
        f"Cached translation ({'Redis + memory' if ok else 'memory only'}) for key: {cache_key}"
    )
    return True


async def invalidate_cache(text: Optional[str] = None):
    """
    Invalidate cache entries.
    If text is provided, invalidates specific entry.
    If text is None, clears all translation cache.
    """
    if text:
        cache_key = generate_cache_key(text)
        _memory_cache.delete(cache_key)
        await _redis_call("delete", "delete", cache_key)
        app_logger.info(f"Invalidated cache entry {cache_key}")
    else:
        count = _memory_cache.clear_prefix("asl:translation:")
        client = await _get_redis()
        if client:
            try:
                keys = []
                async for key in client.scan_iter(match="asl:translation:*"):
                    keys.append(key)
                if keys:
                    await client.delete(*keys)
                    count = max(count, len(keys))
            except Exception as e:
                _mark_redis_down("clear", e)
        app_logger.info(f"Invalidated {count} cache entries")


async def get_cache_stats() -> dict:
    """Get cache statistics"""
    memory_count = _memory_cache.count_prefix("asl:translation:")

    client = await _get_redis()
    if client:
        try:
            info = await asyncio.wait_for(client.info("stats"), _REDIS_OP_TIMEOUT)

            cache_keys = 0
            async for _ in client.scan_iter(match="asl:translation:*"):
                cache_keys += 1

            return {
                "enabled": True,
                "backend": "redis",
                "status": "connected",
                "cached_translations": cache_keys,
                "memory_cache_entries": memory_count,
                "total_commands": info.get("total_commands_processed", 0),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
            }
        except Exception as e:
            _mark_redis_down("stats", e)

    return {
        "enabled": True,
        "backend": "memory",
        "status": "redis-unavailable" if settings.redis_url else "active",
        "cached_translations": memory_count,
        "max_entries": _MEMORY_CACHE_MAX,
    }
