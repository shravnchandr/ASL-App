"""Environment-based configuration for ASL Dictionary API."""

from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings
from sqlalchemy.engine import make_url
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "ASL Dictionary API"
    environment: str = "development"
    debug: bool = False
    # Not really configurable: the frontend (API_PREFIX), service worker and analytics
    # middleware all assume "/api". Change them together if this ever changes.
    api_prefix: str = "/api"
    rate_limit: str = "10/minute"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.environment == "development":
            object.__setattr__(self, "debug", True)

    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    database_url: str = "sqlite+aiosqlite:///./asl_feedback.db"

    @field_validator("database_url")
    @classmethod
    def fix_postgres_url(cls, v: str) -> str:
        """Accept a host's libpq-style URL (e.g. Neon's) for the asyncpg driver.

        postgres:// and postgresql:// become postgresql+asyncpg://. SQLAlchemy passes
        query parameters to asyncpg.connect() as keywords, and asyncpg has no
        `sslmode` or `channel_binding`: `sslmode` becomes asyncpg's `ssl` (same
        values), and `channel_binding` is dropped because asyncpg can't do it.
        """
        if v and v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v and v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if not v.startswith("postgresql+asyncpg://"):
            return v
        url = make_url(v)
        if "sslmode" not in url.query and "channel_binding" not in url.query:
            return v
        query = dict(url.query)
        query.pop("channel_binding", None)
        sslmode = query.pop("sslmode", None)
        if sslmode is not None:
            query.setdefault("ssl", sslmode)
        return url.set(query=query).render_as_string(hide_password=False)

    google_api_key: str = ""
    model_name: str = "gemini-2.5-flash"
    shared_api_key: str = ""
    shared_key_daily_limit: int = 10  # translations per day per IP
    # Pipeline runs allowed at once (each holds a worker thread for two Gemini calls)
    max_concurrent_translations: int = 4
    # Distinct translations allowed to wait for a slot; beyond this requests get 503
    max_queued_translations: int = 16
    # Total server-side budget for one translation; the browser gives up at 60s
    translate_timeout_seconds: float = 55.0
    admin_password: str = ""
    # Number of reverse proxies in front of the app that append to X-Forwarded-For.
    # 0 = ignore the header and use the socket peer address.
    trusted_proxy_hops: int = 1
    # X-Forwarded-For is only trusted when the socket peer is in one of these
    # networks (a host's load balancer usually connects from its private network).
    # Set to ["0.0.0.0/0", "::/0"] only if every path to the app goes through a proxy.
    trusted_proxy_networks: list[str] = [
        "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "::1/128", "fc00::/7",
    ]
    # Secret salt for IP hashing. Unsalted SHA-256 of an IPv4 address is reversible
    # by brute force (only 2^32 inputs), so set this in production.
    ip_hash_salt: str = ""
    # Analytics events older than this are deleted (daily quota rows after 1 day)
    analytics_retention_days: int = 90
    redis_url: str = ""
    cache_ttl: int = 3600  # seconds
    log_level: str = "INFO"
    log_format: str = "pretty"
    log_to_file: bool = False  # also write daily files under logs/
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
