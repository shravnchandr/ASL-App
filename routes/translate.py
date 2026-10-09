"""
Translation routes: POST /translate and GET /rate-limit.
"""

import asyncio
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from deps import get_real_ip
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from logger import app_logger
from deps import limiter
from db import (
    get_db,
    AsyncSessionLocal,
    create_analytics_event,
    hash_ip,
    check_shared_key_rate_limit,
    try_consume_shared_key_quota,
    release_shared_key_quota,
)
from cache import generate_cache_key
from python_code.asl import SentenceDescriptionSchema
from .models import TranslateRequest, TranslateResponse, SignResponse

settings = get_settings()
router = APIRouter()


def _server_api_key() -> str:
    """Key used for anonymous requests. Either way it is server-funded, so the daily quota applies."""
    return settings.shared_api_key or settings.google_api_key


def _seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - now).total_seconds()))


_slots: tuple[asyncio.AbstractEventLoop, asyncio.Semaphore] | None = None


class _Job:
    """One pipeline run, possibly shared by several identical requests."""

    def __init__(self) -> None:
        self.waiters = 0
        self.started = False  # True once it holds a slot and has been handed to a thread
        self.task: asyncio.Task | None = None


_inflight: dict[str, _Job] = {}
_queued: set[_Job] = set()  # created but not yet started


def _translation_slots() -> asyncio.Semaphore:
    """Semaphore bound to the running loop (created lazily so import has no loop)."""
    global _slots
    loop = asyncio.get_running_loop()
    if _slots is None or _slots[0] is not loop:
        _slots = (loop, asyncio.Semaphore(settings.max_concurrent_translations))
    return _slots[1]


def _too_busy() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail="The AI service is taking too long right now. Please try again in a few seconds.",
    )


async def _run_pipeline(asl_graph, text: str, api_key: str | None, dedupe: bool) -> dict:
    """
    Run the pipeline in a worker thread with a concurrency cap, a bounded queue and
    a total deadline. Identical concurrent server-key requests share one run.

    A job only starts if someone is still waiting for it: when the last caller
    times out, a job still queued for a slot is cancelled, so abandoned requests
    (already answered 503 and refunded) never reach Gemini. A job already running
    in a thread can't be interrupted and finishes in the background.
    """
    key = generate_cache_key(text) if dedupe else None
    job = _inflight.get(key) if key else None
    if job is None:
        if len(_queued) >= settings.max_queued_translations:
            app_logger.warning("Translation queue full; rejecting request")
            raise _too_busy()
        job = _Job()

        async def _work() -> dict:
            async with _translation_slots():
                _queued.discard(job)
                if job.waiters == 0:
                    raise asyncio.CancelledError()
                job.started = True
                return await asyncio.to_thread(asl_graph.invoke, {"english_input": text}, api_key)

        job.task = asyncio.ensure_future(_work())
        _queued.add(job)

        def _done(_t, k=key, j=job) -> None:
            _queued.discard(j)
            if k and _inflight.get(k) is j:
                del _inflight[k]

        job.task.add_done_callback(_done)
        if key:
            _inflight[key] = job

    job.waiters += 1
    try:
        return await asyncio.wait_for(asyncio.shield(job.task), settings.translate_timeout_seconds)
    except asyncio.TimeoutError:
        app_logger.warning("Translation exceeded the server time budget")
        raise _too_busy()
    finally:
        job.waiters -= 1
        if job.waiters == 0 and not job.started and not job.task.done():
            job.task.cancel()
            if key and _inflight.get(key) is job:
                del _inflight[key]  # don't let a new identical request join a cancelled job


def _quota_headers(info: dict) -> dict:
    return {
        "X-RateLimit-Limit": str(info["limit"]),
        "X-RateLimit-Remaining": str(info["remaining"]),
        "X-RateLimit-Reset": "midnight UTC",
    }


@router.post("/translate", response_model=TranslateResponse)
@limiter.limit(settings.rate_limit)
async def translate_to_asl(
    request: Request,
    translate_req: TranslateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Translate an English phrase to ASL sign descriptions.
    Rate limited per minute; requests on the server's key also have a per-IP daily
    allowance that counts successful translations (failed ones are refunded).
    """
    start_time = time.time()
    rate_limit_info = None
    quota_reservation: tuple[str, str] | None = None  # (ip_hash, date) of the reserved slot

    try:
        app_logger.info(f"Translation request ({len(translate_req.text)} chars)")

        from cache import get_cached_translation, cache_translation

        cached_result = await get_cached_translation(translate_req.text)
        if cached_result:
            response_time_ms = int((time.time() - start_time) * 1000)

            async def _log_cache_hit():
                try:
                    async with AsyncSessionLocal() as session:
                        await create_analytics_event(
                            session=session,
                            event_type="translation",
                            ip_address=get_real_ip(request),
                            query=translate_req.text,
                            cache_hit=True,
                            user_agent=request.headers.get("user-agent"),
                            endpoint="/api/translate",
                            response_time_ms=response_time_ms,
                        )
                except Exception as e:
                    app_logger.error(f"Failed to log cache hit analytics: {e}")

            background_tasks.add_task(_log_cache_hit)
            app_logger.info("Returning cached translation")
            # Echo the caller's phrasing, not whichever variant populated the cache
            return TranslateResponse(**{**cached_result, "query": translate_req.text})

        asl_graph = request.app.state.asl_graph
        custom_api_key = request.headers.get("X-Custom-API-Key")
        api_key_to_use = None
        key_type = "server"
        server_key = _server_api_key()

        if custom_api_key:
            api_key_to_use = custom_api_key
            key_type = "custom"
            app_logger.info("Using custom API key from request header")
        elif server_key:
            key_type = "shared" if settings.shared_api_key else "server"
            ip_hash = hash_ip(get_real_ip(request))
            rate_limit_info = await try_consume_shared_key_quota(
                db, ip_hash, settings.shared_key_daily_limit
            )
            if not rate_limit_info["allowed"]:
                app_logger.warning(
                    f"Daily translation limit exceeded for IP hash: {ip_hash[:8]}..."
                )
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"You've used all {settings.shared_key_daily_limit} free translations for today. "
                        "The limit resets at midnight UTC, or add your own API key for unlimited access."
                    ),
                    headers={
                        **_quota_headers(rate_limit_info),
                        "Retry-After": str(_seconds_until_utc_midnight()),
                        "X-RateLimit-Scope": "daily",
                    },
                )
            quota_reservation = (ip_hash, rate_limit_info["date"])
            api_key_to_use = server_key
            app_logger.info(
                f"Using {key_type} API key (remaining today: {rate_limit_info['remaining']})"
            )
        else:
            raise HTTPException(
                status_code=503,
                detail="Translation service unavailable. Please add your own API key.",
            )

        final_state = await _run_pipeline(
            asl_graph, translate_req.text, api_key_to_use, dedupe=key_type != "custom"
        )

        if final_state.get("error"):
            err = final_state["error"]
            app_logger.error(f"Translation error: {err}")
            err_lower = err.lower()
            if any(p in err_lower for p in ("503", "unavailable", "resource exhausted", "429", "overloaded")):
                raise HTTPException(
                    status_code=503,
                    detail="The AI service is experiencing high demand. Please try again in a few seconds.",
                )
            if key_type == "custom" and any(
                p in err_lower for p in ("api key not valid", "api_key_invalid", "permission denied", "401", "403")
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Your API key was rejected by Google. Check it in Settings and try again.",
                )
            # Don't echo raw upstream errors to the client; they're logged above.
            raise HTTPException(status_code=500, detail="Translation failed. Please try again.")

        final_output: SentenceDescriptionSchema = final_state.get("final_output")
        if not final_output:
            app_logger.error("No output from LangGraph")
            raise HTTPException(
                status_code=500, detail="Translation produced no output"
            )

        signs = [
            SignResponse(
                word=sign.word,
                simple_description=sign.simple_description,
                hand_shape=sign.hand_shape,
                location=sign.location,
                movement=sign.movement,
                non_manual_markers=sign.non_manual_markers,
                is_fingerspelled=sign.is_fingerspelled,
                fingerspell_letters=sign.fingerspell_letters,
                kb_verified=sign.kb_verified,
            )
            for sign in final_output.signs
        ]

        grammar_plan = final_state.get("grammar_plan")
        response = TranslateResponse(
            query=translate_req.text,
            signs=signs,
            note=final_output.note,
            asl_gloss_order=grammar_plan.asl_gloss_order if grammar_plan else "",
        )

        await cache_translation(translate_req.text, response.model_dump())

        response_time_ms = int((time.time() - start_time) * 1000)

        async def _log_translation():
            try:
                async with AsyncSessionLocal() as session:
                    await create_analytics_event(
                        session=session,
                        event_type="translation",
                        ip_address=get_real_ip(request),
                        query=translate_req.text,
                        cache_hit=False,
                        key_type=key_type,
                        user_agent=request.headers.get("user-agent"),
                        endpoint="/api/translate",
                        response_time_ms=response_time_ms,
                    )
            except Exception as e:
                app_logger.error(f"Failed to log translation analytics: {e}")

        background_tasks.add_task(_log_translation)
        app_logger.info(f"Translation successful: {len(signs)} signs returned")

        if rate_limit_info:
            return JSONResponse(
                content=response.model_dump(),
                headers={**_quota_headers(rate_limit_info), "X-Using-Shared-Key": "true"},
            )

        return response

    except HTTPException:
        await _refund_quota(db, quota_reservation)
        raise
    except Exception as e:
        await _refund_quota(db, quota_reservation)
        app_logger.exception(f"Unexpected error in translation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


async def _refund_quota(db: AsyncSession, reservation: tuple[str, str] | None) -> None:
    """Give back a reserved daily slot when the translation did not succeed."""
    if not reservation:
        return
    try:
        await release_shared_key_quota(db, *reservation)
    except Exception as e:
        app_logger.error(f"Failed to refund translation quota: {e}")


@router.get("/rate-limit")
async def get_rate_limit_status(request: Request, db: AsyncSession = Depends(get_db)):
    """Return the daily free-translation allowance for the calling IP."""
    try:
        if not _server_api_key():
            return {
                "shared_key_available": False,
                "message": "No server API key configured",
            }

        ip_hash = hash_ip(get_real_ip(request))
        rate_limit_info = await check_shared_key_rate_limit(
            db, ip_hash, settings.shared_key_daily_limit
        )
        return {
            "shared_key_available": True,
            "limit": rate_limit_info["limit"],
            "used": rate_limit_info["used"],
            "remaining": rate_limit_info["remaining"],
            "reset": "midnight UTC",
        }
    except Exception as e:
        app_logger.exception(f"Error checking rate limit: {e}")
        raise HTTPException(status_code=500, detail="Failed to check rate limit")
