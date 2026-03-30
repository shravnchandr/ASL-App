# This module has been split into the db/ package.
# This file is kept only for backwards compatibility (tests, external tooling).
#
# New locations:
#   db/engine.py        — engine, AsyncSessionLocal, Base, init_db, get_db, hash_ip
#   db/models.py        — Feedback, Analytics ORM models
#   db/crud/feedback.py — feedback CRUD operations
#   db/crud/analytics.py — analytics CRUD operations

from db import (  # noqa: F401
    Base,
    engine,
    AsyncSessionLocal,
    init_db,
    get_db,
    hash_ip,
    Feedback,
    Analytics,
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
