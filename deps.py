"""
Shared FastAPI dependencies used by both app.py and route modules.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Single limiter instance imported by app.py (for registration) and all route modules
limiter = Limiter(key_func=get_remote_address)
