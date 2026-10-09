"""Analytics page-view filtering and retention pruning."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from db.crud.analytics import prune_old_records
from db.models import Analytics, SharedKeyUsage
from middleware import _is_page_view


def _req(path: str, method: str = "GET"):
    return SimpleNamespace(method=method, url=SimpleNamespace(path=path))


@pytest.mark.parametrize(
    "path,method,status,expected",
    [
        ("/", "GET", 200, True),
        ("/translate", "GET", 200, True),
        ("/dictionary", "GET", 200, True),
        ("/sign-data/signs/hello.json", "GET", 200, False),
        ("/models/asl-classifier/model.json", "GET", 200, False),
        ("/sw.js", "GET", 200, False),
        ("/manifest.json", "GET", 200, False),
        ("/favicon.ico", "GET", 200, False),
        ("/api/translate", "POST", 200, False),
        ("/translate", "GET", 404, False),
        ("/translate", "HEAD", 200, False),
    ],
)
def test_only_successful_navigations_are_page_views(path, method, status, expected):
    assert _is_page_view(_req(path, method), status) is expected


async def test_prune_old_records(test_db):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    test_db.add_all([
        Analytics(event_type="page_view", ip_hash="a", timestamp=now - timedelta(days=200)),
        Analytics(event_type="page_view", ip_hash="b", timestamp=now - timedelta(days=1)),
        SharedKeyUsage(ip_hash="a", date=(now - timedelta(days=5)).date().isoformat(), count=3),
        SharedKeyUsage(ip_hash="a", date=now.date().isoformat(), count=1),
    ])
    await test_db.commit()

    deleted = await prune_old_records(test_db, analytics_retention_days=90)
    assert deleted == {"analytics": 1, "quota_rows": 1}
    assert (await test_db.execute(select(func.count()).select_from(Analytics))).scalar() == 1
    assert (await test_db.execute(select(func.count()).select_from(SharedKeyUsage))).scalar() == 1


async def test_refund_after_midnight_hits_reservation_day(test_db, monkeypatch):
    from db.crud import analytics as crud

    before = datetime(2026, 10, 9, 23, 59, 59)
    after = datetime(2026, 10, 10, 0, 0, 1)

    monkeypatch.setattr(crud, "_utcnow", lambda: before)
    reserved = await crud.try_consume_shared_key_quota(test_db, "ip", 10)
    assert reserved["date"] == "2026-10-09"

    # The new day already has usage of its own
    monkeypatch.setattr(crud, "_utcnow", lambda: after)
    await crud.try_consume_shared_key_quota(test_db, "ip", 10)

    await crud.release_shared_key_quota(test_db, "ip", reserved["date"])
    rows = dict((await test_db.execute(select(SharedKeyUsage.date, SharedKeyUsage.count))).all())
    assert rows == {"2026-10-09": 0, "2026-10-10": 1}
