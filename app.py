"""
FastAPI application for ASL Dictionary
Provides async REST API endpoints for ASL translation and feedback collection
"""
import os
import sys
import time
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession

# Import local modules
from config import get_settings
from logger import app_logger
from database import (
    init_db, get_db, create_feedback, get_feedback_stats, get_paginated_feedback,
    create_analytics_event, get_unique_users_count, get_translations_count,
    get_popular_searches, get_daily_active_users, get_hourly_usage_pattern,
    get_shared_key_usage_today, check_shared_key_rate_limit, hash_ip,
    AsyncSessionLocal
)
from auth import verify_admin_password
from cache import init_redis, close_redis, get_cached_translation, cache_translation, get_cache_stats

# Import LangGraph ASL dictionary
sys.path.append(os.path.join(os.path.dirname(__file__), "python_code"))
from asl_dict_langgraph import build_asl_graph, SentenceDescriptionSchema, DescriptionSchema

settings = get_settings()

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    app_logger.info(f"Starting {settings.app_name} in {settings.environment} mode")

    # Initialize database
    await init_db()

    # Initialize Redis cache (optional)
    await init_redis()

    # Build LangGraph application
    app.state.asl_graph = build_asl_graph()
    app_logger.info("LangGraph ASL application initialized")

    yield

    # Cleanup
    await close_redis()
    app_logger.info("Shutting down application")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Translate English phrases to ASL sign descriptions with feedback collection",
    version="1.0.0",
    lifespan=lifespan,
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)

    # Security headers for production
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # Content Security Policy (adjust as needed)
    if settings.environment == "production":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
        )

    return response


# Analytics Tracking Middleware
@app.middleware("http")
async def analytics_tracking_middleware(request: Request, call_next):
    """Track page views and API requests for analytics"""
    # Skip analytics endpoints, health check, and static files
    skip_paths = ["/api/admin", "/health", "/assets"]
    should_track = not any(request.url.path.startswith(path) for path in skip_paths)

    if should_track:
        start_time = time.time()
        response = await call_next(request)
        response_time_ms = int((time.time() - start_time) * 1000)

        # Track in background to avoid blocking response
        async def log_analytics():
            try:
                async with AsyncSessionLocal() as session:
                    await create_analytics_event(
                        session=session,
                        event_type="page_view",
                        ip_address=get_remote_address(request),
                        endpoint=request.url.path,
                        user_agent=request.headers.get("user-agent"),
                        response_time_ms=response_time_ms
                    )
            except Exception as e:
                app_logger.error(f"Failed to log analytics: {e}")

        asyncio.create_task(log_analytics())
        return response
    else:
        return await call_next(request)


# Request/Response Models

class TranslateRequest(BaseModel):
    """Request model for translation endpoint"""
    text: str = Field(..., min_length=1, max_length=500, description="English phrase to translate")


class SignResponse(BaseModel):
    """Response model for individual ASL sign"""
    word: str
    hand_shape: str
    location: str
    movement: str
    non_manual_markers: str


class TranslateResponse(BaseModel):
    """Response model for translation endpoint"""
    query: str
    signs: List[SignResponse]
    note: str


class FeedbackRequest(BaseModel):
    """Request model for feedback submission"""
    query: str = Field(..., min_length=1, max_length=500)
    rating: str = Field(..., pattern="^(up|down)$", description="Either 'up' or 'down'")
    feedback_text: Optional[str] = Field(None, max_length=1000)


class FeedbackResponse(BaseModel):
    """Response model for feedback submission"""
    success: bool
    message: str


class GeneralFeedbackRequest(BaseModel):
    """Request model for general feedback submission"""
    category: str = Field(..., pattern="^(bug|feature|general|ui_ux)$", description="Feedback category")
    feedback_text: str = Field(..., min_length=10, max_length=2000, description="Feedback text")
    email: Optional[str] = Field(None, max_length=255, description="Optional email for follow-up")


# API Endpoints

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "environment": settings.environment,
        "app_name": settings.app_name,
    }


@app.post(f"{settings.api_prefix}/translate", response_model=TranslateResponse)
@limiter.limit(settings.rate_limit)
async def translate_to_asl(request: Request, translate_req: TranslateRequest, db: AsyncSession = Depends(get_db)):
    """
    Translate English phrase to ASL sign descriptions

    Rate limited to prevent abuse
    Uses Redis caching for improved performance
    Supports shared API key with IP-based rate limiting
    """
    start_time = time.time()
    cache_hit = False
    using_shared_key = False
    rate_limit_info = None

    try:
        app_logger.info(f"Translation request: '{translate_req.text}'")

        # Check cache first
        cached_result = await get_cached_translation(translate_req.text)
        if cached_result:
            cache_hit = True
            response_time_ms = int((time.time() - start_time) * 1000)

            # Track cache hit analytics in background
            async def log_cache_hit():
                try:
                    async with AsyncSessionLocal() as session:
                        await create_analytics_event(
                            session=session,
                            event_type="translation",
                            ip_address=get_remote_address(request),
                            query=translate_req.text,
                            cache_hit=True,
                            user_agent=request.headers.get("user-agent"),
                            endpoint="/api/translate",
                            response_time_ms=response_time_ms
                        )
                except Exception as e:
                    app_logger.error(f"Failed to log cache hit analytics: {e}")

            asyncio.create_task(log_cache_hit())

            app_logger.info(f"Returning cached translation for: '{translate_req.text}'")
            return TranslateResponse(**cached_result)

        # Get LangGraph app from state
        asl_graph = request.app.state.asl_graph

        # Get custom API key from header if provided
        custom_api_key = request.headers.get("X-Custom-API-Key")

        # Determine which API key to use
        api_key_to_use = None
        original_api_key = os.environ.get("GOOGLE_API_KEY")

        if custom_api_key:
            # User provided their own API key
            api_key_to_use = custom_api_key
            app_logger.info("Using custom API key from request header")
        elif settings.shared_api_key:
            # Use shared API key with rate limiting
            using_shared_key = True
            ip_hash = hash_ip(get_remote_address(request))

            # Check rate limit for shared key usage
            rate_limit_info = await check_shared_key_rate_limit(
                db,
                ip_hash,
                settings.shared_key_daily_limit
            )

            if not rate_limit_info["allowed"]:
                app_logger.warning(f"Shared key rate limit exceeded for IP hash: {ip_hash[:8]}...")
                raise HTTPException(
                    status_code=429,
                    detail=f"Daily limit of {settings.shared_key_daily_limit} translations reached. Add your own API key for unlimited access.",
                    headers={
                        "X-RateLimit-Limit": str(settings.shared_key_daily_limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": "midnight UTC"
                    }
                )

            api_key_to_use = settings.shared_api_key
            app_logger.info(f"Using shared API key (remaining: {rate_limit_info['remaining']})")
        elif original_api_key:
            # Fall back to server's main API key
            api_key_to_use = original_api_key
            app_logger.info("Using server's main API key")
        else:
            # No API key available
            raise HTTPException(
                status_code=503,
                detail="Translation service unavailable. Please add your own API key."
            )

        # Temporarily set environment variable with selected API key
        if api_key_to_use != original_api_key:
            os.environ["GOOGLE_API_KEY"] = api_key_to_use

        try:
            # Initial state
            initial_state = {"english_input": translate_req.text}

            # Execute LangGraph workflow
            final_state = asl_graph.invoke(initial_state)
        finally:
            # Restore original API key
            if api_key_to_use != original_api_key:
                if original_api_key:
                    os.environ["GOOGLE_API_KEY"] = original_api_key
                else:
                    os.environ.pop("GOOGLE_API_KEY", None)

        # Check for errors
        if final_state.get("error"):
            app_logger.error(f"Translation error: {final_state['error']}")
            raise HTTPException(status_code=500, detail=f"Translation failed: {final_state['error']}")

        # Get final output
        final_output: SentenceDescriptionSchema = final_state.get("final_output")

        if not final_output:
            app_logger.error("No output from LangGraph")
            raise HTTPException(status_code=500, detail="Translation produced no output")

        # Convert to response format
        signs = [
            SignResponse(
                word=sign.word,
                hand_shape=sign.hand_shape,
                location=sign.location,
                movement=sign.movement,
                non_manual_markers=sign.non_manual_markers,
            )
            for sign in final_output.signs
        ]

        response = TranslateResponse(
            query=translate_req.text,
            signs=signs,
            note=final_output.note,
        )

        # Cache the result
        await cache_translation(
            translate_req.text,
            response.model_dump()
        )

        # Track translation analytics in background
        response_time_ms = int((time.time() - start_time) * 1000)

        async def log_translation():
            try:
                async with AsyncSessionLocal() as session:
                    await create_analytics_event(
                        session=session,
                        event_type="translation",
                        ip_address=get_remote_address(request),
                        query=translate_req.text,
                        cache_hit=False,
                        user_agent=request.headers.get("user-agent"),
                        endpoint="/api/translate",
                        response_time_ms=response_time_ms
                    )
            except Exception as e:
                app_logger.error(f"Failed to log translation analytics: {e}")

        asyncio.create_task(log_translation())

        app_logger.info(f"Translation successful: {len(signs)} signs returned")

        # Add rate limit headers if using shared key
        if using_shared_key and rate_limit_info:
            # Recalculate after this translation (increment used count)
            updated_used = rate_limit_info["used"] + 1
            updated_remaining = max(0, settings.shared_key_daily_limit - updated_used)

            return JSONResponse(
                content=response.model_dump(),
                headers={
                    "X-RateLimit-Limit": str(settings.shared_key_daily_limit),
                    "X-RateLimit-Remaining": str(updated_remaining),
                    "X-RateLimit-Reset": "midnight UTC",
                    "X-Using-Shared-Key": "true"
                }
            )

        return response

    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Unexpected error in translation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get(f"{settings.api_prefix}/rate-limit")
async def get_rate_limit_status(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get rate limit status for shared API key usage

    Returns remaining translations for the current IP address
    """
    try:
        # Check if shared key is configured
        if not settings.shared_api_key:
            return {
                "shared_key_available": False,
                "message": "Shared API key not configured"
            }

        # Get rate limit info for this IP
        ip_hash = hash_ip(get_remote_address(request))
        rate_limit_info = await check_shared_key_rate_limit(
            db,
            ip_hash,
            settings.shared_key_daily_limit
        )

        return {
            "shared_key_available": True,
            "limit": rate_limit_info["limit"],
            "used": rate_limit_info["used"],
            "remaining": rate_limit_info["remaining"],
            "reset": "midnight UTC"
        }

    except Exception as e:
        app_logger.exception(f"Error checking rate limit: {e}")
        raise HTTPException(status_code=500, detail="Failed to check rate limit")


@app.post(f"{settings.api_prefix}/feedback", response_model=FeedbackResponse)
@limiter.limit(settings.rate_limit)
async def submit_feedback(
    request: Request,
    feedback_req: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit user feedback for a translation
    
    Rate limited to prevent spam
    """
    try:
        app_logger.info(f"Feedback submission: {feedback_req.rating} for '{feedback_req.query[:50]}'")
        
        # Get client IP
        client_ip = get_remote_address(request)
        
        # Create feedback entry
        await create_feedback(
            session=db,
            query=feedback_req.query,
            rating=feedback_req.rating,
            feedback_text=feedback_req.feedback_text,
            ip_address=client_ip,
        )
        
        return FeedbackResponse(
            success=True,
            message="Thank you for your feedback!"
        )
        
    except Exception as e:
        app_logger.exception(f"Error saving feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback")


@app.post(f"{settings.api_prefix}/feedback/general", response_model=FeedbackResponse)
@limiter.limit(settings.rate_limit)
async def submit_general_feedback(
    request: Request,
    feedback_req: GeneralFeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit general feedback (bug reports, feature requests, etc.)
    
    Rate limited to prevent spam
    """
    try:
        app_logger.info(f"General feedback submission: {feedback_req.category}")
        
        # Get client IP
        client_ip = get_remote_address(request)
        
        # Create feedback entry
        await create_feedback(
            session=db,
            feedback_text=feedback_req.feedback_text,
            ip_address=client_ip,
            feedback_type="general",
            category=feedback_req.category,
            email=feedback_req.email,
        )
        
        return FeedbackResponse(
            success=True,
            message="Thank you for your feedback! We appreciate your input."
        )
        
    except Exception as e:
        app_logger.exception(f"Error saving general feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback")


@app.get(f"{settings.api_prefix}/feedback/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """
    Get feedback statistics (optional analytics endpoint)
    """
    try:
        stats = await get_feedback_stats(db)
        return stats
    except Exception as e:
        app_logger.exception(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")


# Admin Endpoints

@app.get(f"{settings.api_prefix}/admin/feedback")
async def get_admin_feedback(
    page: int = 1,
    limit: int = 50,
    feedback_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password)
):
    """
    Get paginated feedback for admin review
    Requires admin password in X-Admin-Password header
    """
    try:
        if limit > 100:
            limit = 100  # Max 100 items per page

        items, total = await get_paginated_feedback(db, page, limit, feedback_type)

        # Convert to dict for JSON response
        feedback_list = [
            {
                "id": item.id,
                "query": item.query,
                "rating": item.rating,
                "feedback_text": item.feedback_text,
                "timestamp": item.timestamp.isoformat(),
                "feedback_type": item.feedback_type,
                "category": item.category,
                "email": item.email,
            }
            for item in items
        ]

        return {
            "items": feedback_list,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit  # Ceiling division
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching admin feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch feedback")


@app.delete(f"{settings.api_prefix}/admin/feedback/{{feedback_id}}")
async def delete_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password)
):
    """
    Delete a specific feedback entry
    Requires admin password in X-Admin-Password header
    """
    try:
        from sqlalchemy import select, delete
        from database import Feedback

        # Check if feedback exists
        query = select(Feedback).where(Feedback.id == feedback_id)
        result = await db.execute(query)
        feedback = result.scalar_one_or_none()

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")

        # Delete feedback
        delete_query = delete(Feedback).where(Feedback.id == feedback_id)
        await db.execute(delete_query)
        await db.commit()

        app_logger.info(f"Feedback {feedback_id} deleted by admin")

        return {"success": True, "message": "Feedback deleted"}
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error deleting feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete feedback")


@app.get(f"{settings.api_prefix}/admin/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password)
):
    """
    Get detailed admin statistics
    Requires admin password in X-Admin-Password header
    """
    try:
        from sqlalchemy import select, func
        from database import Feedback

        # Get basic stats
        stats = await get_feedback_stats(db)

        # Get counts by feedback type
        type_query = select(
            Feedback.feedback_type,
            func.count(Feedback.id).label('count')
        ).group_by(Feedback.feedback_type)
        type_result = await db.execute(type_query)
        type_counts = {row.feedback_type: row.count for row in type_result}

        # Get counts by category (for general feedback)
        category_query = select(
            Feedback.category,
            func.count(Feedback.id).label('count')
        ).where(
            Feedback.category.isnot(None)
        ).group_by(Feedback.category)
        category_result = await db.execute(category_query)
        category_counts = {row.category: row.count for row in category_result}

        # Get cache stats
        cache_stats = await get_cache_stats()

        return {
            **stats,
            "by_type": type_counts,
            "by_category": category_counts,
            "cache": cache_stats
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching admin stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch statistics")


@app.get(f"{settings.api_prefix}/admin/analytics/overview")
async def get_analytics_overview(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password)
):
    """
    Get analytics overview with key metrics
    Requires admin password in X-Admin-Password header
    """
    try:
        # Calculate date ranges
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        return {
            "unique_users_30d": await get_unique_users_count(db, start_date=thirty_days_ago),
            "unique_users_7d": await get_unique_users_count(db, start_date=seven_days_ago),
            "unique_users_today": await get_unique_users_count(db, start_date=today_start),
            "translations": await get_translations_count(db, start_date=thirty_days_ago),
            "popular_searches": await get_popular_searches(db, limit=10, start_date=thirty_days_ago),
            "daily_active_users": await get_daily_active_users(db, days=30),
            "hourly_usage": await get_hourly_usage_pattern(db, days=7)
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching analytics overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@app.get(f"{settings.api_prefix}/admin/analytics/users")
async def get_user_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password)
):
    """
    Get detailed user analytics
    Requires admin password in X-Admin-Password header
    """
    try:
        start_date = datetime.utcnow() - timedelta(days=days)

        return {
            "daily_active_users": await get_daily_active_users(db, days=days),
            "unique_users": await get_unique_users_count(db, start_date=start_date)
        }
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching user analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user analytics")


@app.get(f"{settings.api_prefix}/admin/analytics/searches")
async def get_search_analytics(
    limit: int = 20,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_password)
):
    """
    Get popular search analytics
    Requires admin password in X-Admin-Password header
    """
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        return await get_popular_searches(db, limit=limit, start_date=start_date)
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Error fetching search analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch search analytics")


# Serve frontend in production
if settings.environment == "production":
    # Mount static files FIRST (order matters!)
    static_path = os.path.join(os.path.dirname(__file__), "dist")
    if os.path.exists(static_path):
        # Mount static assets - this must be BEFORE the catch-all route
        app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")

        @app.get("/")
        async def serve_frontend():
            """Serve the React frontend"""
            return FileResponse(os.path.join(static_path, "index.html"))

        # Catch-all route for SPA (must be last!)
        # This will NOT match /assets/* or /api/* routes
        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            """Serve SPA - return index.html for all non-API, non-asset routes"""
            # Don't interfere with API or assets routes
            if full_path.startswith("api/") or full_path.startswith("assets/"):
                raise HTTPException(status_code=404, detail="Not found")

            # Try to serve the file if it exists
            file_path = os.path.join(static_path, full_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return FileResponse(file_path)

            # Otherwise return index.html for client-side routing
            return FileResponse(os.path.join(static_path, "index.html"))


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler"""
    app_logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
