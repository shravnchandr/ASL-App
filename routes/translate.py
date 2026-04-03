"""
Translation routes: POST /translate and GET /rate-limit.
"""

import os
import asyncio
import time

from fastapi import APIRouter, HTTPException, Request, Depends
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
)
from python_code.asl import SentenceDescriptionSchema
from .models import TranslateRequest, TranslateResponse, SignResponse

settings = get_settings()
router = APIRouter()


@router.post("/translate", response_model=TranslateResponse)
@limiter.limit(settings.rate_limit)
async def translate_to_asl(
    request: Request,
    translate_req: TranslateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Translate an English phrase to ASL sign descriptions.
    Rate limited; supports shared API key with per-IP daily limits.
    """
    start_time = time.time()
    using_shared_key = False
    rate_limit_info = None

    try:
        app_logger.info(f"Translation request: '{translate_req.text}'")

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

            asyncio.create_task(_log_cache_hit())
            app_logger.info(f"Returning cached translation for: '{translate_req.text}'")
            return TranslateResponse(**cached_result)

        asl_graph = request.app.state.asl_graph
        custom_api_key = request.headers.get("X-Custom-API-Key")
        original_api_key = os.environ.get("GOOGLE_API_KEY")
        api_key_to_use = None

        if custom_api_key:
            api_key_to_use = custom_api_key
            app_logger.info("Using custom API key from request header")
        elif settings.shared_api_key:
            using_shared_key = True
            ip_hash = hash_ip(get_real_ip(request))
            rate_limit_info = await check_shared_key_rate_limit(
                db, ip_hash, settings.shared_key_daily_limit
            )
            if not rate_limit_info["allowed"]:
                app_logger.warning(
                    f"Shared key rate limit exceeded for IP hash: {ip_hash[:8]}..."
                )
                raise HTTPException(
                    status_code=429,
                    detail=f"Daily limit of {settings.shared_key_daily_limit} translations reached. Add your own API key for unlimited access.",
                    headers={
                        "X-RateLimit-Limit": str(settings.shared_key_daily_limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": "midnight UTC",
                    },
                )
            api_key_to_use = settings.shared_api_key
            app_logger.info(
                f"Using shared API key (remaining: {rate_limit_info['remaining']})"
            )
        elif original_api_key:
            api_key_to_use = original_api_key
            app_logger.info("Using server's main API key")
        else:
            raise HTTPException(
                status_code=503,
                detail="Translation service unavailable. Please add your own API key.",
            )

        if api_key_to_use != original_api_key:
            os.environ["GOOGLE_API_KEY"] = api_key_to_use

        try:
            final_state = await asyncio.to_thread(
                asl_graph.invoke, {"english_input": translate_req.text}
            )
        finally:
            if api_key_to_use != original_api_key:
                if original_api_key:
                    os.environ["GOOGLE_API_KEY"] = original_api_key
                else:
                    os.environ.pop("GOOGLE_API_KEY", None)

        if final_state.get("error"):
            app_logger.error(f"Translation error: {final_state['error']}")
            raise HTTPException(
                status_code=500, detail=f"Translation failed: {final_state['error']}"
            )

        final_output: SentenceDescriptionSchema = final_state.get("final_output")
        if not final_output:
            app_logger.error("No output from LangGraph")
            raise HTTPException(
                status_code=500, detail="Translation produced no output"
            )

        signs = [
            SignResponse(
                word=sign.word,
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
                        user_agent=request.headers.get("user-agent"),
                        endpoint="/api/translate",
                        response_time_ms=response_time_ms,
                    )
            except Exception as e:
                app_logger.error(f"Failed to log translation analytics: {e}")

        asyncio.create_task(_log_translation())
        app_logger.info(f"Translation successful: {len(signs)} signs returned")

        if using_shared_key and rate_limit_info:
            updated_used = rate_limit_info["used"] + 1
            updated_remaining = max(0, settings.shared_key_daily_limit - updated_used)
            return JSONResponse(
                content=response.model_dump(),
                headers={
                    "X-RateLimit-Limit": str(settings.shared_key_daily_limit),
                    "X-RateLimit-Remaining": str(updated_remaining),
                    "X-RateLimit-Reset": "midnight UTC",
                    "X-Using-Shared-Key": "true",
                },
            )

        return response

    except HTTPException:
        raise
    except Exception as e:
        app_logger.exception(f"Unexpected error in translation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/rate-limit")
async def get_rate_limit_status(request: Request, db: AsyncSession = Depends(get_db)):
    """Return shared API key rate limit status for the calling IP."""
    try:
        if not settings.shared_api_key:
            return {
                "shared_key_available": False,
                "message": "Shared API key not configured",
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
