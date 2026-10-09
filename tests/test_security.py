"""
Tests for security fixes: static path confinement, client-IP extraction,
admin brute-force lockout, IP hashing, and translation error handling.
"""

from pathlib import Path
from types import SimpleNamespace

import pytest
from httpx import AsyncClient

import auth
from app import app, resolve_spa_path
from config import get_settings
from deps import get_real_ip
from db import engine, hash_ip
from python_code.asl import SentenceDescriptionSchema
from python_code.asl.schemas import DescriptionSchema, GrammarPlanSchema


# ── Static file serving ─────────────────────────────────────────────────────


@pytest.fixture
def static_root(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "sign-data" / "signs").mkdir(parents=True)
    (dist / "index.html").write_text("<html>")
    (dist / "robots.txt").write_text("User-agent: *")
    (dist / "sign-data" / "signs" / "hello.json").write_text("{}")
    (tmp_path / "secret.env").write_text("GOOGLE_API_KEY=leak")
    return dist


class TestResolveSpaPath:
    def test_serves_existing_file(self, static_root: Path):
        assert resolve_spa_path(static_root, "robots.txt") == (static_root / "robots.txt").resolve()

    def test_client_route_falls_back_to_index(self, static_root: Path):
        assert resolve_spa_path(static_root, "translate").name == "index.html"

    @pytest.mark.parametrize(
        "path",
        ["../secret.env", "sign-data/../../secret.env", "/etc/hosts", "../../../../etc/hosts"],
    )
    def test_traversal_is_rejected(self, static_root: Path, path: str):
        assert resolve_spa_path(static_root, path) is None

    def test_sibling_dir_with_shared_prefix_is_rejected(self, static_root: Path):
        # "dist-evil" starts with "dist" — a naive startswith() check would allow it
        evil = static_root.parent / "dist-evil"
        evil.mkdir()
        (evil / "x.txt").write_text("x")
        assert resolve_spa_path(static_root, "../dist-evil/x.txt") is None

    def test_missing_data_file_404s_instead_of_index(self, static_root: Path):
        assert resolve_spa_path(static_root, "sign-data/signs/hello.json") is not None
        assert resolve_spa_path(static_root, "sign-data/signs/missing.json") is None
        assert resolve_spa_path(static_root, "models/asl-classifier/model.json") is None


# ── Client IP extraction ────────────────────────────────────────────────────


def _request(xff: str | None, peer: str = "10.0.0.1"):
    headers = {"X-Forwarded-For": xff} if xff is not None else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


class TestGetRealIp:
    def test_uses_proxy_appended_entry_not_client_supplied(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 1)
        # Client sent "1.2.3.4"; Render's edge appended the real address
        assert get_real_ip(_request("1.2.3.4, 203.0.113.9")) == "203.0.113.9"

    def test_single_entry(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 1)
        assert get_real_ip(_request("203.0.113.9")) == "203.0.113.9"

    def test_two_hops(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 2)
        assert get_real_ip(_request("1.2.3.4, 203.0.113.9, 10.0.0.5")) == "203.0.113.9"

    def test_zero_hops_ignores_header(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 0)
        assert get_real_ip(_request("1.2.3.4", peer="198.51.100.7")) == "198.51.100.7"

    def test_no_header_uses_peer(self):
        assert get_real_ip(_request(None, peer="198.51.100.7")) == "198.51.100.7"


# ── IP hashing ──────────────────────────────────────────────────────────────


class TestHashIp:
    def test_salt_changes_hash(self, monkeypatch):
        settings = get_settings()
        monkeypatch.setattr(settings, "ip_hash_salt", "")
        unsalted = hash_ip("203.0.113.9")
        monkeypatch.setattr(settings, "ip_hash_salt", "s3cret")
        salted = hash_ip("203.0.113.9")
        assert salted != unsalted
        assert len(salted) == 64
        assert salted == hash_ip("203.0.113.9")


# ── Admin brute-force lockout ───────────────────────────────────────────────


class TestAdminLockout:
    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "admin_password", "correct-horse")
        auth._failed_attempts.clear()
        yield
        auth._failed_attempts.clear()

    async def test_correct_password_accepted(self, client: AsyncClient):
        r = await client.get("/api/admin/stats", headers={"X-Admin-Password": "correct-horse"})
        assert r.status_code == 200

    async def test_non_ascii_password_is_401_not_500(self, client: AsyncClient):
        r = await client.get(
            "/api/admin/stats", headers={"X-Admin-Password": "pässwörd".encode()}
        )
        assert r.status_code == 401

    async def test_locks_out_after_repeated_failures(self, client: AsyncClient):
        for _ in range(auth.MAX_FAILED_ATTEMPTS):
            r = await client.get("/api/admin/stats", headers={"X-Admin-Password": "wrong"})
            assert r.status_code == 401
        # Even the right password is refused while locked out
        r = await client.get("/api/admin/stats", headers={"X-Admin-Password": "correct-horse"})
        assert r.status_code == 429

    async def test_pagination_params_are_bounded(self, client: AsyncClient):
        headers = {"X-Admin-Password": "correct-horse"}
        assert (await client.get("/api/admin/feedback?page=0", headers=headers)).status_code == 422
        assert (await client.get("/api/admin/feedback?limit=1000", headers=headers)).status_code == 422


# ── Translation ─────────────────────────────────────────────────────────────


class _FakePipeline:
    def __init__(self, result: dict):
        self.result = result
        self.calls: list[tuple[dict, str | None]] = []

    def invoke(self, state: dict, api_key: str | None = None) -> dict:
        self.calls.append((state, api_key))
        return {"english_input": state["english_input"], **self.result}


@pytest.fixture
async def fake_pipeline():
    original = getattr(app.state, "asl_graph", None)

    def _install(result: dict) -> _FakePipeline:
        app.state.asl_graph = _FakePipeline(result)
        return app.state.asl_graph

    yield _install
    app.state.asl_graph = original
    # The route's background analytics write uses the module-level engine; its
    # aiosqlite worker thread is non-daemon and would block interpreter exit.
    await engine.dispose()


class TestTranslate:
    async def test_success_uses_settings_key(self, client: AsyncClient, fake_pipeline, monkeypatch):
        monkeypatch.setattr(get_settings(), "shared_api_key", "")
        monkeypatch.setattr(get_settings(), "google_api_key", "server-key")
        pipeline = fake_pipeline({
            "grammar_plan": GrammarPlanSchema(should_reorder=False, asl_gloss_order="HELLO"),
            "final_output": SentenceDescriptionSchema(
                signs=[DescriptionSchema(
                    word="HELLO", simple_description="Salute outward.", hand_shape="flat",
                    location="forehead", movement="outward", non_manual_markers="smile",
                )],
                note="Greeting.",
            ),
        })
        r = await client.post("/api/translate", json={"text": "hello security test"})
        assert r.status_code == 200
        body = r.json()
        assert body["signs"][0]["word"] == "HELLO"
        assert body["asl_gloss_order"] == "HELLO"
        assert pipeline.calls[0][1] == "server-key"

    async def test_upstream_error_is_not_echoed(self, client: AsyncClient, fake_pipeline, monkeypatch):
        monkeypatch.setattr(get_settings(), "shared_api_key", "")
        fake_pipeline({"error": "internal detail: projects/123/locations/x quota blah"})
        r = await client.post("/api/translate", json={"text": "error leak test"})
        assert r.status_code == 500
        assert "projects/123" not in r.text

    async def test_rejected_custom_key_is_400(self, client: AsyncClient, fake_pipeline):
        fake_pipeline({"error": "400 INVALID_ARGUMENT. API key not valid. Please pass a valid API key."})
        r = await client.post(
            "/api/translate", json={"text": "bad key test"}, headers={"X-Custom-API-Key": "nope"}
        )
        assert r.status_code == 400
        assert "API key" in r.json()["detail"]


def _hello_result() -> dict:
    return {
        "grammar_plan": GrammarPlanSchema(should_reorder=False, asl_gloss_order="HELLO"),
        "final_output": SentenceDescriptionSchema(
            signs=[DescriptionSchema(
                word="HELLO", simple_description="Salute outward.", hand_shape="flat",
                location="forehead", movement="outward", non_manual_markers="smile",
            )],
            note="Greeting.",
        ),
    }


class TestDailyQuota:
    """The daily allowance applies to any server-funded key and counts successes only."""

    @pytest.fixture(autouse=True)
    def _server_key_only(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "shared_api_key", "")
        monkeypatch.setattr(get_settings(), "google_api_key", "server-key")
        monkeypatch.setattr(get_settings(), "shared_key_daily_limit", 1)

    async def test_server_key_requests_are_capped(self, client: AsyncClient, fake_pipeline):
        fake_pipeline(_hello_result())
        first = await client.post("/api/translate", json={"text": "quota one"})
        assert first.status_code == 200
        assert first.headers["X-RateLimit-Remaining"] == "0"

        second = await client.post("/api/translate", json={"text": "quota two"})
        assert second.status_code == 429
        assert second.headers["X-RateLimit-Scope"] == "daily"
        assert 0 < int(second.headers["Retry-After"]) <= 86400
        assert "midnight UTC" in second.json()["detail"]

    async def test_failed_translation_is_refunded(self, client: AsyncClient, fake_pipeline):
        fake_pipeline({"error": "500 something broke"})
        failed = await client.post("/api/translate", json={"text": "refund one"})
        assert failed.status_code == 500

        fake_pipeline(_hello_result())
        ok = await client.post("/api/translate", json={"text": "refund two"})
        assert ok.status_code == 200

    async def test_custom_key_is_not_charged(self, client: AsyncClient, fake_pipeline):
        fake_pipeline(_hello_result())
        for i in range(3):
            r = await client.post(
                "/api/translate", json={"text": f"custom {i}"}, headers={"X-Custom-API-Key": "mine"}
            )
            assert r.status_code == 200

    async def test_rate_limit_endpoint_reports_server_key_allowance(self, client: AsyncClient):
        r = await client.get("/api/rate-limit")
        body = r.json()
        assert body["shared_key_available"] is True
        assert body["limit"] == 1


class TestPipelineScheduling:
    async def test_identical_concurrent_requests_share_one_run(self):
        # Exercised below the HTTP layer: the test client shares one DB session,
        # which can't serve two concurrent requests.
        import asyncio
        import time as _time
        from routes.translate import _run_pipeline

        pipeline = _FakePipeline(_hello_result())
        original = pipeline.invoke

        def slow_invoke(state, api_key=None):
            _time.sleep(0.2)
            return original(state, api_key)

        pipeline.invoke = slow_invoke
        shared = await asyncio.gather(
            _run_pipeline(pipeline, "dedupe me", "server-key", dedupe=True),
            _run_pipeline(pipeline, "dedupe me", "server-key", dedupe=True),
        )
        assert shared[0] is shared[1]
        assert len(pipeline.calls) == 1

        # Custom-key requests are never merged
        await asyncio.gather(
            _run_pipeline(pipeline, "dedupe me", "user-key", dedupe=False),
            _run_pipeline(pipeline, "dedupe me", "user-key", dedupe=False),
        )
        assert len(pipeline.calls) == 3

    async def test_time_budget_returns_503_and_refunds(self, client: AsyncClient, fake_pipeline, monkeypatch):
        import time as _time

        monkeypatch.setattr(get_settings(), "shared_api_key", "")
        monkeypatch.setattr(get_settings(), "google_api_key", "server-key")
        monkeypatch.setattr(get_settings(), "translate_timeout_seconds", 0.05)
        monkeypatch.setattr(get_settings(), "shared_key_daily_limit", 1)
        pipeline = fake_pipeline(_hello_result())
        original = pipeline.invoke
        pipeline.invoke = lambda state, api_key=None: (_time.sleep(0.3), original(state, api_key))[1]

        r = await client.post("/api/translate", json={"text": "too slow"})
        assert r.status_code == 503
        status = (await client.get("/api/rate-limit")).json()
        assert status["remaining"] == 1


class TestForwardedTrustBoundary:
    @pytest.fixture(autouse=True)
    def _one_hop(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 1)

    def test_untrusted_public_peer_cannot_choose_identity(self):
        assert get_real_ip(_request("198.51.100.123", peer="203.0.113.17")) == "203.0.113.17"

    def test_trusted_private_peer_header_is_used(self):
        assert get_real_ip(_request("198.51.100.123", peer="10.1.2.3")) == "198.51.100.123"

    def test_short_chain_falls_back_to_peer(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 2)
        assert get_real_ip(_request("198.51.100.123", peer="10.1.2.3")) == "10.1.2.3"

    def test_garbage_entry_falls_back_to_peer(self):
        assert get_real_ip(_request("not-an-ip", peer="10.1.2.3")) == "10.1.2.3"

    def test_configurable_networks(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "trusted_proxy_networks", ["203.0.113.0/24"])
        assert get_real_ip(_request("198.51.100.123", peer="203.0.113.17")) == "198.51.100.123"


def test_admin_failure_tracking_is_bounded(monkeypatch):
    monkeypatch.setattr(auth, "_MAX_TRACKED_IPS", 3)
    auth._failed_attempts.clear()
    for i in range(10):
        auth._record_failure(f"203.0.113.{i}", now=float(i))
    assert len(auth._failed_attempts) <= 3
    auth._failed_attempts.clear()


class TestAbandonedJobs:
    @pytest.fixture(autouse=True)
    def _one_slot(self, monkeypatch):
        import routes.translate as rt

        monkeypatch.setattr(get_settings(), "max_concurrent_translations", 1)
        monkeypatch.setattr(get_settings(), "translate_timeout_seconds", 0.05)
        monkeypatch.setattr(rt, "_slots", None)
        yield
        monkeypatch.setattr(rt, "_slots", None)

    async def test_jobs_abandoned_while_queued_never_start(self):
        import asyncio
        import time as _time
        from fastapi import HTTPException as _HTTPException
        from routes.translate import _run_pipeline

        pipeline = _FakePipeline(_hello_result())
        original = pipeline.invoke
        pipeline.invoke = lambda state, api_key=None: (_time.sleep(0.3), original(state, api_key))[1]

        results = await asyncio.gather(
            *[_run_pipeline(pipeline, f"job {i}", "server-key", dedupe=True) for i in range(4)],
            return_exceptions=True,
        )
        assert all(isinstance(r, _HTTPException) and r.status_code == 503 for r in results)
        await asyncio.sleep(0.5)  # let the running job and any (wrongly) queued ones finish
        assert len(pipeline.calls) == 1  # only the job that already held the slot ran

    async def test_queue_is_bounded(self, monkeypatch):
        import asyncio
        import time as _time
        from fastapi import HTTPException as _HTTPException
        from routes.translate import _run_pipeline

        monkeypatch.setattr(get_settings(), "max_queued_translations", 1)
        monkeypatch.setattr(get_settings(), "translate_timeout_seconds", 2.0)
        pipeline = _FakePipeline(_hello_result())
        pipeline.invoke = lambda state, api_key=None: _time.sleep(0.3) or {}

        running = asyncio.ensure_future(_run_pipeline(pipeline, "a", "k", dedupe=False))
        await asyncio.sleep(0.05)  # "a" takes the only slot
        queued = asyncio.ensure_future(_run_pipeline(pipeline, "b", "k", dedupe=False))
        await asyncio.sleep(0)     # "b" waits for the slot (queue now full)

        start = _time.monotonic()
        with pytest.raises(_HTTPException) as exc:
            await _run_pipeline(pipeline, "c", "k", dedupe=False)
        assert exc.value.status_code == 503
        assert _time.monotonic() - start < 0.1  # rejected immediately, not after the deadline
        await asyncio.gather(running, queued)
