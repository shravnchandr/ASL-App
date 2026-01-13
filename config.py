"""
Configuration management for ASL Dictionary API
Handles environment-based settings for development and production
"""
import os
from typing import List
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application
    app_name: str = "ASL Dictionary API"
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = environment == "development"
    
    # API Configuration
    api_prefix: str = "/api"
    rate_limit: str = os.getenv("RATE_LIMIT", "10/minute")
    
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
            # "https://yourdomain.com"
        ])
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./asl_feedback.db"
    
    # Google Gemini API
    google_api_key: str = os.getenv("GOOGLE_API_KEY", "")
    model_name: str = "gemini-2.5-flash"
    
    # Logging
    log_level: str = "INFO" if environment == "production" else "DEBUG"
    log_format: str = "json" if environment == "production" else "pretty"
    
    # Server
    host: str = "0.0.0.0"
    port: int = int(os.getenv("PORT", "8000"))
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
