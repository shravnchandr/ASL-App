"""Check that the app's database code works against the database in DATABASE_URL.

    DATABASE_URL='postgresql://...' uv run python scripts/check_database.py

Creates the tables if they are missing (as the app does at startup), runs every
query the app makes once, and deletes the rows it wrote. Safe to run against
a live database: its rows use a made-up IP that no real visitor has.
"""

import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
# Not "development", which turns on SQL echo
os.environ.setdefault("ENVIRONMENT", "check")

from sqlalchemy import delete, text  # noqa: E402

import db  # noqa: E402
from config import get_settings  # noqa: E402
from db import Analytics, Feedback, SharedKeyUsage  # noqa: E402

# A documentation-only address (RFC 5737) with a random suffix, so reruns don't collide
CHECK_IP = f"192.0.2.1#check-{uuid.uuid4().hex[:8]}"


async def main() -> None:
    print(f"Database: {db.engine.url.render_as_string(hide_password=True)}")
    await db.init_db()
    await db.init_db()  # startup must be repeatable
    ip_hash = db.hash_ip(CHECK_IP)
    try:
        async with db.AsyncSessionLocal() as s:
            results = [await db.try_consume_shared_key_quota(s, ip_hash, 2) for _ in range(3)]
            assert [r["allowed"] for r in results] == [True, True, False], results
            await db.release_shared_key_quota(s, ip_hash, results[0]["date"])
            status = await db.check_shared_key_rate_limit(s, ip_hash, 2)
            assert status["used"] == 1, status
            print("daily quota: reserve, refuse at the limit, refund ok")

            # Concurrent reservations must never exceed the limit
            async def reserve():
                async with db.AsyncSessionLocal() as own:
                    return (await db.try_consume_shared_key_quota(own, ip_hash, 5))["allowed"]
            allowed = await asyncio.gather(*(reserve() for _ in range(10)))
            assert sum(allowed) == 4, allowed  # 1 already used, limit 5
            print("daily quota: 10 concurrent reservations, exactly 4 allowed ok")

            await db.create_feedback(s, query="check", rating="up", ip_address=CHECK_IP)
            await db.create_feedback(s, feedback_text="check", feedback_type="general",
                                     category="bug", ip_address=CHECK_IP)
            await db.get_feedback_stats(s)
            await db.get_recent_feedback(s)
            await db.get_paginated_feedback(s)
            print("feedback: write and read ok")

            await db.create_analytics_event(s, "translation", CHECK_IP, query="check",
                                            cache_hit=False, key_type="shared", response_time_ms=10)
            await db.get_unique_users_count(s)
            await db.get_translations_count(s)
            await db.get_popular_searches(s)
            await db.get_daily_active_users(s)
            await db.get_hourly_usage_pattern(s)
            print("analytics: write and every admin query ok")

            # The app's own retention, so this deletes nothing the app wouldn't
            await db.prune_old_records(s, get_settings().analytics_retention_days)
            print("retention cleanup ok")
    finally:
        async with db.AsyncSessionLocal() as s:
            for model in (Feedback, Analytics, SharedKeyUsage):
                await s.execute(delete(model).where(model.ip_hash == ip_hash))
            await s.commit()
            left = (await s.execute(text(
                "SELECT (SELECT count(*) FROM feedback WHERE ip_hash = :h)"
                " + (SELECT count(*) FROM analytics WHERE ip_hash = :h)"
                " + (SELECT count(*) FROM shared_key_usage WHERE ip_hash = :h)"), {"h": ip_hash})).scalar()
            assert left == 0, left
        await db.engine.dispose()
    print("All checks passed; the check's rows were removed.")


if __name__ == "__main__":
    asyncio.run(main())
