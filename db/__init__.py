"""
Database package — engine, models, and CRUD operations.

Modules:
  engine     — async engine, session factory, Base, init_db, get_db, hash_ip
  models     — Feedback and Analytics ORM models
  crud/      — domain-split CRUD operations
"""

from .engine import Base, engine, AsyncSessionLocal, init_db, get_db, hash_ip
from .models import Feedback, Analytics
from .crud import (
    create_feedback,
    get_feedback_stats,
    get_recent_feedback,
    get_paginated_feedback,
    create_analytics_event,
    get_unique_users_count,
    get_translations_count,
    get_popular_searches,
    get_daily_active_users,
    get_hourly_usage_pattern,
    get_shared_key_usage_today,
    check_shared_key_rate_limit,
)

__all__ = [
    "Base",
    "engine",
    "AsyncSessionLocal",
    "init_db",
    "get_db",
    "hash_ip",
    "Feedback",
    "Analytics",
    "create_feedback",
    "get_feedback_stats",
    "get_recent_feedback",
    "get_paginated_feedback",
    "create_analytics_event",
    "get_unique_users_count",
    "get_translations_count",
    "get_popular_searches",
    "get_daily_active_users",
    "get_hourly_usage_pattern",
    "get_shared_key_usage_today",
    "check_shared_key_rate_limit",
]
