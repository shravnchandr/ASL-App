"""Environment-based configuration for ASL Dictionary API."""

from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "ASL Dictionary API"
    environment: str = "development"
    debug: bool = False
    api_prefix: str = "/api"
    rate_limit: str = "10/minute"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.environment == "development":
            object.__setattr__(self, "debug", True)
        # Must extend CORS here — class-body runs before env vars are loaded
        if self.environment == "production":
            origins = list(self.cors_origins)
            origins.extend(["https://asl-dictionary.onrender.com"])
            object.__setattr__(self, "cors_origins", origins)

    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    database_url: str = "sqlite+aiosqlite:///./asl_feedback.db"

    @field_validator("database_url")
    @classmethod
    def fix_postgres_url(cls, v: str) -> str:
        """Convert postgres:// to postgresql+asyncpg:// for Render compatibility"""
        if v and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v and v.startswith("postgresql://") and "+asyncpg" not in v:
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    google_api_key: str = ""
    model_name: str = "gemini-2.5-flash"
    shared_api_key: str = ""
    shared_key_daily_limit: int = 10  # translations per day per IP
    admin_password: str = ""
    redis_url: str = ""
    cache_ttl: int = 3600  # seconds
    log_level: str = "INFO"
    log_format: str = "pretty"
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
