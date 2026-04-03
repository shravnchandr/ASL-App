"""
HTTP middleware for security headers and analytics tracking.
Register both functions in app.py with app.middleware("http").
"""

import asyncio
import time

from fastapi import Request
from slowapi.util import get_remote_address

from config import get_settings
from logger import app_logger
from db import AsyncSessionLocal, create_analytics_event

settings = get_settings()


async def add_security_headers(request: Request, call_next):
    """Add security headers to every response."""
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )

    if settings.environment == "production":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
        )

    return response


async def analytics_tracking_middleware(request: Request, call_next):
    """Track page views and API requests for the analytics dashboard."""
    # Skip /api/ entirely — translate.py already logs its own analytics for translations.
    # Double-logging every API call floods SQLite under concurrent load.
    skip_paths = ["/api/", "/health", "/assets"]
    should_track = not any(request.url.path.startswith(p) for p in skip_paths)

    if not should_track:
        return await call_next(request)

    start_time = time.time()
    response = await call_next(request)
    response_time_ms = int((time.time() - start_time) * 1000)

    async def _log():
        try:
            async with AsyncSessionLocal() as session:
                await create_analytics_event(
                    session=session,
                    event_type="page_view",
                    ip_address=get_remote_address(request),
                    endpoint=request.url.path,
                    user_agent=request.headers.get("user-agent"),
                    response_time_ms=response_time_ms,
                )
        except Exception as e:
            app_logger.error(f"Failed to log analytics: {e}")

    asyncio.create_task(_log())
    return response
