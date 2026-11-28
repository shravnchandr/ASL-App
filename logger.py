"""
Structured logging configuration using loguru
Provides JSON-formatted logs for production and pretty logs for development
"""

import sys
from loguru import logger
from config import get_settings

settings = get_settings()


def setup_logging():
    """Configure loguru logger based on environment"""

    # Remove default handler
    logger.remove()

    # Diagnose mode prints local variable values in tracebacks (API keys,
    # phrase text), so it is never enabled in production, whatever the format
    is_production = settings.environment == "production"

    if settings.log_format == "json":
        # Production: JSON formatted logs
        logger.add(
            sys.stdout,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
            level=settings.log_level,
            serialize=True,  # JSON output
            backtrace=True,
            diagnose=False,  # Don't expose sensitive info in production
        )
    else:
        # Development: Pretty colored logs
        logger.add(
            sys.stdout,
            format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
            level=settings.log_level,
            colorize=True,
            backtrace=True,
            diagnose=not is_production,
        )

    # Optional file log. Off by default: hosts like Cloud Run collect stdout, and
    # their filesystem is in memory, so files would use the container's RAM.
    if settings.log_to_file:
        logger.add(
            "logs/asl_api_{time:YYYY-MM-DD}.log",
            rotation="00:00",  # Rotate daily
            retention="30 days",
            compression="zip",
            level=settings.log_level,
            serialize=True,
            diagnose=False,
        )

    logger.info(f"Logging configured for {settings.environment} environment")
    return logger


# Create logger instance
app_logger = setup_logging()
