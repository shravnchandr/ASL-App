"""
FastAPI application for ASL Dictionary
Provides async REST API endpoints for ASL translation and feedback collection
"""
import os
import sys
from contextlib import asynccontextmanager
from typing import Optional, List
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
from database import init_db, get_db, create_feedback, get_feedback_stats

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
    
    # Build LangGraph application
    app.state.asl_graph = build_asl_graph()
    app_logger.info("LangGraph ASL application initialized")
    
    yield
    
    # Cleanup
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
async def translate_to_asl(request: Request, translate_req: TranslateRequest):
    """
    Translate English phrase to ASL sign descriptions
    
    Rate limited to prevent abuse
    """
    try:
        app_logger.info(f"Translation request: '{translate_req.text}'")
        
        # Get LangGraph app from state
        asl_graph = request.app.state.asl_graph
        
        # Get custom API key from header if provided
        custom_api_key = request.headers.get("X-Custom-API-Key")
        
        # Temporarily set environment variable if custom key provided
        original_api_key = os.environ.get("GOOGLE_API_KEY")
        if custom_api_key:
            os.environ["GOOGLE_API_KEY"] = custom_api_key
            app_logger.info("Using custom API key from request header")
        
        try:
            # Initial state
            initial_state = {"english_input": translate_req.text}
            
            # Execute LangGraph workflow
            final_state = asl_graph.invoke(initial_state)
        finally:
            # Restore original API key
            if custom_api_key:
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
        
        app_logger.info(f"Translation successful: {len(signs)} signs returned")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Unexpected error in translation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


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


# Serve frontend in production
if settings.environment == "production":
    # Mount static files
    static_path = os.path.join(os.path.dirname(__file__), "dist")
    if os.path.exists(static_path):
        app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")
        
        @app.get("/")
        async def serve_frontend():
            """Serve the React frontend"""
            return FileResponse(os.path.join(static_path, "index.html"))
        
        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            """Serve SPA - return index.html for all non-API routes"""
            file_path = os.path.join(static_path, full_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return FileResponse(file_path)
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
