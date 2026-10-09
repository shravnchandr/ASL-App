"""FastAPI entry point — middleware, routers, static serving, and pipeline init."""

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import get_settings
from logger import app_logger
from deps import limiter
from db import init_db, engine, retention_loop
from cache import init_redis, close_redis
from middleware import add_security_headers, analytics_tracking_middleware
from routes import translate_router, feedback_router, admin_router

sys.path.append(os.path.join(os.path.dirname(__file__), "python_code"))
from asl import build_asl_graph  # noqa: E402

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init database, Redis cache, and the ASL pipeline. Shutdown: close them."""
    app_logger.info(f"Starting {settings.app_name} in {settings.environment} mode")
    await init_db()
    retention_task = asyncio.create_task(retention_loop(settings.analytics_retention_days))
    await init_redis()
    # Anonymous requests use the shared key when configured (see routes/translate.py),
    # so build the pipeline (shared client + grammar context cache) around that key.
    app.state.asl_graph = build_asl_graph(
        settings.shared_api_key or settings.google_api_key or None, settings.model_name
    )
    app_logger.info(f"ASL pipeline initialized (model={settings.model_name})")
    yield
    retention_task.cancel()
    app.state.asl_graph.close()
    await close_redis()
    await engine.dispose()
    app_logger.info("Shutting down application")


app = FastAPI(
    title=settings.app_name,
    description="Translate English phrases to ASL sign descriptions with feedback collection",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Let cross-origin frontends read quota/backoff info on 429s and successes
    expose_headers=[
        "Retry-After",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "X-RateLimit-Scope",
    ],
)

# Registered in reverse order: add_security_headers runs first (outermost wrapper)
app.middleware("http")(analytics_tracking_middleware)
app.middleware("http")(add_security_headers)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.environment,
        "app_name": settings.app_name,
    }


app.include_router(translate_router, prefix=settings.api_prefix)
app.include_router(feedback_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)


# Paths that must 404 when missing rather than fall back to index.html — the
# service worker caches these as data, so an HTML 200 would be cached as JSON.
_NO_SPA_FALLBACK = ("sign-data/", "models/")


def resolve_spa_path(static_root: Path, full_path: str) -> Optional[Path]:
    """Map a request path to a file to serve from static_root.

    Returns the file, index.html for client-side routes, or None for a 404.
    The path param is already percent-decoded, so "..%2f" arrives as "../" —
    resolving and checking containment keeps requests inside static_root.
    """
    root = static_root.resolve()
    file_path = (root / full_path).resolve()
    if not file_path.is_relative_to(root):
        return None
    if file_path.is_file():
        return file_path
    if full_path.startswith(_NO_SPA_FALLBACK):
        return None
    return root / "index.html"


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

        _api_prefix = settings.api_prefix.strip("/") + "/"
        _static_root = Path(static_path)

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith(_api_prefix) or full_path.startswith("assets/"):
                raise HTTPException(status_code=404, detail="Not found")
            file_path = resolve_spa_path(_static_root, full_path)
            if file_path is None:
                raise HTTPException(status_code=404, detail="Not found")
            return FileResponse(file_path)


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
