"""
FastAPI application entry point.
Wires together middleware, routers, static file serving, and the LangGraph workflow.
"""

import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import get_settings
from logger import app_logger
from deps import limiter
from db import init_db
from cache import init_redis, close_redis
from middleware import add_security_headers, analytics_tracking_middleware
from routes import translate_router, feedback_router, admin_router

# Ensure python_code/ is on the path for the asl package
sys.path.append(os.path.join(os.path.dirname(__file__), "python_code"))
from asl import build_asl_graph  # noqa: E402

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init database, Redis cache, and LangGraph. Shutdown: close Redis."""
    app_logger.info(f"Starting {settings.app_name} in {settings.environment} mode")
    await init_db()
    await init_redis()
    app.state.asl_graph = build_asl_graph()
    app_logger.info("LangGraph ASL application initialized")
    yield
    await close_redis()
    app_logger.info("Shutting down application")


app = FastAPI(
    title=settings.app_name,
    description="Translate English phrases to ASL sign descriptions with feedback collection",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middleware (registered in reverse order — last registered runs first)
app.middleware("http")(analytics_tracking_middleware)
app.middleware("http")(add_security_headers)


# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.environment,
        "app_name": settings.app_name,
    }


# API routers
app.include_router(translate_router, prefix=settings.api_prefix)
app.include_router(feedback_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)


# Serve frontend in production
if settings.environment == "production":
    static_path = os.path.join(os.path.dirname(__file__), "dist")
    if os.path.exists(static_path):
        app.mount(
            "/assets",
            StaticFiles(directory=os.path.join(static_path, "assets")),
            name="assets",
        )

        @app.get("/")
        async def serve_frontend():
            return FileResponse(os.path.join(static_path, "index.html"))

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/") or full_path.startswith("assets/"):
                raise HTTPException(status_code=404, detail="Not found")
            file_path = os.path.join(static_path, full_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(static_path, "index.html"))


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    app_logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
