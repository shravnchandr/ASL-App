"""
Configuration management for ASL Dictionary API
Handles environment-based settings for development and production
"""
import os
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application
    app_name: str = "ASL Dictionary API"
    environment: str = "development"
    debug: bool = False

    # API Configuration
    api_prefix: str = "/api"
    rate_limit: str = "10/minute"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Set debug based on environment after initialization
        if self.environment == "development":
            object.__setattr__(self, 'debug', True)
    
    # CORS Settings
    cors_origins: List[str] = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://localhost:8000",  # Same origin
    ]
    
    # Add production origins when deploying
    if environment == "production":
        cors_origins.extend([
            # Add your production domain here
            "https://asl-dictionary.onrender.com",
        ])
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./asl_feedback.db"

    @field_validator('database_url')
    @classmethod
    def fix_postgres_url(cls, v: str) -> str:
        """Convert postgres:// to postgresql+asyncpg:// for Render compatibility"""
        if v and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v and v.startswith("postgresql://") and "+asyncpg" not in v:
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v
    
    # Google Gemini API
    google_api_key: str = ""
    model_name: str = "gemini-2.5-flash"

    # Shared API Key for new users (optional)
    shared_api_key: str = ""
    shared_key_daily_limit: int = 10  # Translations per day per IP

    # Admin Access
    admin_password: str = ""

    # Redis Cache (optional)
    redis_url: str = ""
    cache_ttl: int = 3600  # 1 hour default

    # Logging
    log_level: str = "INFO"
    log_format: str = "pretty"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
