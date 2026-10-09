"""
Simple admin authentication for accessing feedback data
"""

import hmac
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Header, Request
from typing import Optional

from config import get_settings
from deps import get_real_ip

# Brute-force guard: after MAX_FAILED_ATTEMPTS bad passwords from one IP within
# FAILED_ATTEMPT_WINDOW seconds, reject further attempts until the window clears.
# In-memory (single process), like the SlowAPI limiter.
MAX_FAILED_ATTEMPTS = 5
FAILED_ATTEMPT_WINDOW = 15 * 60
# Bound memory when many distinct IPs fail once and never return
_MAX_TRACKED_IPS = 10_000
_failed_attempts: dict[str, deque[float]] = defaultdict(deque)


def _record_failure(ip: str, now: float) -> None:
    if ip not in _failed_attempts and len(_failed_attempts) >= _MAX_TRACKED_IPS:
        for stale_ip in [k for k, v in _failed_attempts.items() if not v or now - v[-1] > FAILED_ATTEMPT_WINDOW]:
            del _failed_attempts[stale_ip]
        if len(_failed_attempts) >= _MAX_TRACKED_IPS:
            # Still full of active entries: evict the oldest-inserted
            del _failed_attempts[next(iter(_failed_attempts))]
    _failed_attempts[ip].append(now)


def _recent_failures(ip: str, now: float) -> deque[float]:
    attempts = _failed_attempts[ip]
    while attempts and now - attempts[0] > FAILED_ATTEMPT_WINDOW:
        attempts.popleft()
    if not attempts:
        _failed_attempts.pop(ip, None)
        return deque()
    return attempts


def verify_admin_password(
    request: Request,
    password: Optional[str] = Header(None, alias="X-Admin-Password"),
) -> bool:
    """Verify admin password from header"""
    # Read via Settings so values from .env are honoured (os.getenv would miss them)
    admin_password = get_settings().admin_password

    if not admin_password:
        raise HTTPException(
            status_code=503,
            detail="Admin access not configured. Set ADMIN_PASSWORD environment variable.",
        )

    ip = get_real_ip(request)
    now = time.monotonic()
    if len(_recent_failures(ip, now)) >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(FAILED_ATTEMPT_WINDOW)},
        )

    # Use compare_digest to prevent timing attacks
    if not password or not hmac.compare_digest(
        password.encode(), admin_password.encode()
    ):
        _record_failure(ip, now)
        raise HTTPException(status_code=401, detail="Invalid admin password")

    return True
