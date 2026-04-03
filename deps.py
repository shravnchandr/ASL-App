"""
Shared FastAPI dependencies used by both app.py and route modules.
"""

from fastapi import Request
from slowapi import Limiter


def get_real_ip(request: Request) -> str:
    """
    Extract the real client IP address.

    Render (and most reverse proxies) set X-Forwarded-For to the actual
    client IP. Using request.client.host returns the load-balancer's internal
    10.x.x.x address, causing all users to share a single rate-limit bucket.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For can be a comma-separated chain; leftmost is the client
        return forwarded_for.split(",")[0].strip()
    return request.client.host or "unknown"


# Single limiter instance imported by app.py (for registration) and all route modules
limiter = Limiter(key_func=get_real_ip)
