"""
HTTP middleware for security headers and analytics tracking.
Register both functions in app.py with app.middleware("http").
"""

import asyncio
import time

from fastapi import Request
from deps import get_real_ip

from config import get_settings
from logger import app_logger
from db import AsyncSessionLocal, create_analytics_event

settings = get_settings()

# Strong refs to in-flight analytics writes — the event loop only keeps weak refs,
# so an unreferenced task can be garbage-collected before it runs.
_background_tasks: set[asyncio.Task] = set()


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
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com; "
            "worker-src 'self' blob: https://cdn.jsdelivr.net; "
        )

    return response


# Prefixes that are never page views: API calls (translate logs its own events),
# health checks, and static/data downloads fetched in the background.
_UNTRACKED_PREFIXES = ("/api/", "/health", "/assets", "/sign-data", "/models")
# Drop events instead of queueing unbounded SQLite writes under load
_MAX_PENDING_ANALYTICS = 50


def _is_page_view(request: Request, status_code: int) -> bool:
    path = request.url.path
    if request.method != "GET" or status_code != 200:
        return False
    if path.startswith(_UNTRACKED_PREFIXES):
        return False
    # Files (sw.js, manifest.json, favicon.ico, robots.txt, …) aren't navigations
    return "." not in path.rsplit("/", 1)[-1]


async def analytics_tracking_middleware(request: Request, call_next):
    """Record successful SPA page navigations for the analytics dashboard."""
    start_time = time.time()
    response = await call_next(request)

    if not _is_page_view(request, response.status_code):
        return response
    if len(_background_tasks) >= _MAX_PENDING_ANALYTICS:
        app_logger.debug("Analytics backlog full; dropping page view")
        return response

    response_time_ms = int((time.time() - start_time) * 1000)

    async def _log():
        try:
            async with AsyncSessionLocal() as session:
                await create_analytics_event(
                    session=session,
                    event_type="page_view",
                    ip_address=get_real_ip(request),
                    endpoint=request.url.path,
                    user_agent=request.headers.get("user-agent"),
                    response_time_ms=response_time_ms,
                )
        except Exception as e:
            app_logger.error(f"Failed to log analytics: {e}")

    task = asyncio.create_task(_log())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return response
