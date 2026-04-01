"""
Caching layer for ASL Dictionary
Uses Redis when available, falls back to an in-memory LRU cache.
"""

import json
import hashlib
import time
from collections import OrderedDict
from typing import Optional

from config import get_settings
from logger import app_logger

settings = get_settings()

# ───────────────────────────── In-memory LRU cache ─────────────────────────────

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
            1 for k, (exp, _) in self._store.items()
            if k.startswith(prefix) and now <= exp
        )


_memory_cache = _MemoryCache()

# ───────────────────────────── Redis client ─────────────────────────────

# Global Redis client
_redis_client = None


async def init_redis():
    """Initialize Redis connection. Falls back to memory cache on failure."""
    global _redis_client

    if not settings.redis_url:
        app_logger.info("Redis URL not configured, using in-memory cache")
        return None

    try:
        from redis.asyncio import from_url

        _redis_client = from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
        )

        # Test connection
        await _redis_client.ping()
        app_logger.info(f"Redis connected successfully at {settings.redis_url}")
        return _redis_client

    except Exception as e:
        app_logger.warning(f"Failed to connect to Redis: {e}. Using in-memory cache.")
        _redis_client = None
        return None


async def close_redis():
    """Close Redis connection"""
    global _redis_client

    if _redis_client:
        await _redis_client.close()
        app_logger.info("Redis connection closed")
        _redis_client = None


def get_redis():
    """Get Redis client instance"""
    return _redis_client


# ───────────────────────────── Cache operations ─────────────────────────────

def generate_cache_key(text: str, prefix: str = "asl:translation") -> str:
    """
    Generate a cache key for a given text.
    Uses SHA256 hash to handle long texts and special characters.
    """
    text_hash = hashlib.sha256(text.lower().encode()).hexdigest()[:16]
    return f"{prefix}:{text_hash}"


async def get_cached_translation(text: str) -> Optional[dict]:
    """
    Get cached translation result.
    Tries Redis first, falls back to memory cache.
    """
    cache_key = generate_cache_key(text)

    # Try Redis
    if _redis_client:
        try:
            cached_data = await _redis_client.get(cache_key)
            if cached_data:
                app_logger.debug(f"Redis cache hit for key: {cache_key}")
                return json.loads(cached_data)
        except Exception as e:
            app_logger.warning(f"Redis read error: {e}")

    # Try memory cache
    cached_data = _memory_cache.get(cache_key)
    if cached_data:
        app_logger.debug(f"Memory cache hit for key: {cache_key}")
        return json.loads(cached_data)

    app_logger.debug(f"Cache miss for key: {cache_key}")
    return None


async def cache_translation(text: str, translation_data: dict) -> bool:
    """
    Cache translation result.
    Writes to both Redis (if available) and in-memory cache.
    """
    cache_key = generate_cache_key(text)
    cached_json = json.dumps(translation_data)
    ttl = settings.cache_ttl

    # Always write to memory cache
    _memory_cache.set(cache_key, cached_json, ttl)

    # Also write to Redis if available
    if _redis_client:
        try:
            await _redis_client.setex(cache_key, ttl, cached_json)
            app_logger.debug(f"Cached translation (Redis + memory) for key: {cache_key}")
            return True
        except Exception as e:
            app_logger.warning(f"Redis write error: {e}")

    app_logger.debug(f"Cached translation (memory only) for key: {cache_key}")
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
        if _redis_client:
            try:
                await _redis_client.delete(cache_key)
            except Exception as e:
                app_logger.warning(f"Redis delete error: {e}")
        app_logger.info(f"Invalidated cache for: {text[:50]}")
    else:
        count = _memory_cache.clear_prefix("asl:translation:")
        if _redis_client:
            try:
                keys = []
                async for key in _redis_client.scan_iter(match="asl:translation:*"):
                    keys.append(key)
                if keys:
                    await _redis_client.delete(*keys)
                    count = max(count, len(keys))
            except Exception as e:
                app_logger.warning(f"Redis clear error: {e}")
        app_logger.info(f"Invalidated {count} cache entries")


async def get_cache_stats() -> dict:
    """Get cache statistics"""
    memory_count = _memory_cache.count_prefix("asl:translation:")

    if _redis_client:
        try:
            info = await _redis_client.info("stats")

            cache_keys = 0
            async for _ in _redis_client.scan_iter(match="asl:translation:*"):
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
            app_logger.warning(f"Error getting Redis cache stats: {e}")

    return {
        "enabled": True,
        "backend": "memory",
        "status": "active",
        "cached_translations": memory_count,
        "max_entries": _MEMORY_CACHE_MAX,
    }
