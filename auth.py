"""
Simple admin authentication for accessing feedback data
"""
import os
from fastapi import HTTPException, Header
from typing import Optional


def verify_admin_password(password: Optional[str] = Header(None, alias="X-Admin-Password")) -> bool:
    """Verify admin password from header"""
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    if not admin_password:
        raise HTTPException(
            status_code=503,
            detail="Admin access not configured. Set ADMIN_PASSWORD environment variable."
        )

    if not password or password != admin_password:
        raise HTTPException(
            status_code=401,
            detail="Invalid admin password"
        )

    return True
