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
            diagnose=True,
        )
    
    # Also log to file in production
    if settings.environment == "production":
        logger.add(
            "logs/asl_api_{time:YYYY-MM-DD}.log",
            rotation="00:00",  # Rotate daily
            retention="30 days",
            compression="zip",
            level=settings.log_level,
            serialize=True,
        )
    
    logger.info(f"Logging configured for {settings.environment} environment")
    return logger


# Create logger instance
app_logger = setup_logging()
