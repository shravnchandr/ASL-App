"""
Redis caching layer for ASL Dictionary
Caches translation results to improve performance
"""
import json
import hashlib
from typing import Optional
from redis.asyncio import Redis, from_url
from config import get_settings
from logger import app_logger

settings = get_settings()

# Global Redis client
_redis_client: Optional[Redis] = None


async def init_redis() -> Optional[Redis]:
    """Initialize Redis connection"""
    global _redis_client

    if not settings.redis_url:
        app_logger.info("Redis URL not configured, caching disabled")
        return None

    try:
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
        app_logger.warning(f"Failed to connect to Redis: {e}. Caching disabled.")
        _redis_client = None
        return None


async def close_redis():
    """Close Redis connection"""
    global _redis_client

    if _redis_client:
        await _redis_client.close()
        app_logger.info("Redis connection closed")
        _redis_client = None


def get_redis() -> Optional[Redis]:
    """Get Redis client instance"""
    return _redis_client


def generate_cache_key(text: str, prefix: str = "asl:translation") -> str:
    """
    Generate a cache key for a given text
    Uses SHA256 hash to handle long texts and special characters
    """
    text_hash = hashlib.sha256(text.lower().encode()).hexdigest()[:16]
    return f"{prefix}:{text_hash}"


async def get_cached_translation(text: str) -> Optional[dict]:
    """
    Get cached translation result
    Returns None if not cached or caching is disabled
    """
    if not _redis_client:
        return None

    try:
        cache_key = generate_cache_key(text)
        cached_data = await _redis_client.get(cache_key)

        if cached_data:
            app_logger.debug(f"Cache hit for key: {cache_key}")
            return json.loads(cached_data)

        app_logger.debug(f"Cache miss for key: {cache_key}")
        return None

    except Exception as e:
        app_logger.warning(f"Error retrieving from cache: {e}")
        return None


async def cache_translation(text: str, translation_data: dict) -> bool:
    """
    Cache translation result
    Returns True if cached successfully, False otherwise
    """
    if not _redis_client:
        return False

    try:
        cache_key = generate_cache_key(text)
        cached_json = json.dumps(translation_data)

        await _redis_client.setex(
            cache_key,
            settings.cache_ttl,
            cached_json
        )

        app_logger.debug(f"Cached translation for key: {cache_key}")
        return True

    except Exception as e:
        app_logger.warning(f"Error caching translation: {e}")
        return False


async def invalidate_cache(text: Optional[str] = None):
    """
    Invalidate cache entries
    If text is provided, invalidates specific entry
    If text is None, clears all translation cache
    """
    if not _redis_client:
        return

    try:
        if text:
            cache_key = generate_cache_key(text)
            await _redis_client.delete(cache_key)
            app_logger.info(f"Invalidated cache for: {text[:50]}")
        else:
            # Clear all translation cache keys
            pattern = "asl:translation:*"
            keys = []
            async for key in _redis_client.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                await _redis_client.delete(*keys)
                app_logger.info(f"Invalidated {len(keys)} cache entries")

    except Exception as e:
        app_logger.warning(f"Error invalidating cache: {e}")


async def get_cache_stats() -> dict:
    """Get cache statistics"""
    if not _redis_client:
        return {
            "enabled": False,
            "status": "disabled"
        }

    try:
        info = await _redis_client.info("stats")
        pattern = "asl:translation:*"

        # Count cache keys
        cache_keys = 0
        async for _ in _redis_client.scan_iter(match=pattern):
            cache_keys += 1

        return {
            "enabled": True,
            "status": "connected",
            "cached_translations": cache_keys,
            "total_commands": info.get("total_commands_processed", 0),
            "keyspace_hits": info.get("keyspace_hits", 0),
            "keyspace_misses": info.get("keyspace_misses", 0),
        }

    except Exception as e:
        app_logger.warning(f"Error getting cache stats: {e}")
        return {
            "enabled": True,
            "status": "error",
            "error": str(e)
        }
