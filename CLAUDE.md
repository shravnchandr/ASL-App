# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ASL Dictionary is a full-stack web application that translates English phrases into detailed American Sign Language (ASL) descriptions using Google Gemini AI. The app uses a React TypeScript frontend with a custom calm design system and a FastAPI Python backend with a direct google-genai SDK pipeline for AI workflow orchestration.

## Development Commands

### Python Dependencies

`pyproject.toml` is the single source of truth; `uv.lock` pins the full tree. `requirements.txt` (runtime, used by the Docker image) and `requirements-dev.txt` (runtime + test tools, used by CI) are **generated** from the lock: never edit them by hand. After changing dependencies:

```bash
uv lock
uv export --no-dev --no-emit-project --format requirements-txt > requirements.txt
uv export --no-emit-project --format requirements-txt > requirements-dev.txt
```

CI runs `uv lock --check` and diffs both exports, failing on drift. Optional sets: `uv sync --extra semantic` (sentence-transformers for `ENABLE_SEMANTIC_LOOKUP`), `uv sync --group training` (torch, scikit-learn, pandas for `alphabet_translate/` and `python_code/convert_*.py`). Landmark extraction keeps its own Python 3.11 venv (see "Extraction Environment Setup").

### Local Development (Requires TWO terminals)

**Terminal 1 - Backend (FastAPI):**
```bash
python app.py
# Runs on http://localhost:8000
```

**Terminal 2 - Frontend (React + Vite):**
```bash
npm run dev
# Runs on http://localhost:5173 with HMR
```

Access the app at http://localhost:5173 (frontend proxies API calls to backend).

### Building and Deployment

```bash
# Frontend build (TypeScript + Vite)
npm run build
# Output: dist/ directory with optimized production build

# Frontend linting
npm run lint

# Production test (serves both frontend and backend from one process)
ENVIRONMENT=production python app.py
# Access at http://localhost:8000
```

### Docker

```bash
# Development with docker-compose (both services)
docker-compose up

# Production build
docker build -t asl-dictionary .
docker run -p 8000:8000 -e GOOGLE_API_KEY=your_key asl-dictionary
```

### Deployment

Production deployment uses Render.com with automatic deploys via `render.yaml`. Push to `main` branch triggers auto-deployment.

## Architecture Overview

### Request Flow

1. **User Input** → Frontend (React) → `src/services/api/` → axios request
2. **Backend API** → FastAPI (`app.py`) → Rate limiting check → Route handler in `routes/`
3. **AI Processing** → direct google-genai pipeline (`python_code/asl/pipeline.py`)
4. **Grammar Agent** → Analyzes English input, determines if reordering needed (ASL uses Time-Topic-Comment structure)
5. **Translation Agent** → Generates a plain-English `simple_description` shown upfront, plus detailed ASL sign fields (hand shape, location, movement, facial expressions) shown in "More details"
6. **Response** → FastAPI → Frontend → Display in SignCard components

### Backend Architecture (Python/FastAPI)

**Entry Point:** `app.py` (~127 lines — slim orchestrator only)
- FastAPI setup, lifespan (database + Redis + pipeline init), middleware registration, router includes, static file serving, uvicorn entry point
- **CRITICAL**: Production mode serves static files from `dist/` directory
  - `/assets/*` mounted BEFORE catch-all route to prevent interception
  - Catch-all `/{full_path:path}` returns `index.html` for SPA routing

**Shared Dependencies:** `deps.py`
- Single `Limiter` instance imported by both `app.py` and all route modules (avoids duplication)
- `get_real_ip()` takes the client IP from the **right** end of `X-Forwarded-For` (`TRUSTED_PROXY_HOPS` entries from the end, default 1 for Render's edge). The leftmost entries are client-supplied and spoofable — never use them for rate limiting or quotas. The header is only honoured when the socket peer is in `TRUSTED_PROXY_NETWORKS` (private ranges by default); otherwise, or when the chain is shorter than the hop count or unparseable, the peer address is used. A one-time warning is logged when an untrusted peer sends the header — if that appears on Render, add the load balancer's range.

**Middleware:** `middleware.py`
- `add_security_headers` — CSP (production only), HSTS, X-Frame-Options, X-Content-Type-Options. **CSP must include `cdn.jsdelivr.net` in `script-src`, `connect-src`, and `worker-src` for MediaPipe WASM to load, plus `'wasm-unsafe-eval'` in `script-src` and `blob:` in `worker-src`.** Missing any of these directives silently breaks the camera page in production.
- `analytics_tracking_middleware` — records **successful GET navigations only** (no `/api`, `/assets`, `/sign-data`, `/models`, or file paths like `sw.js`) to the Analytics table in the background; drops events when 50 writes are already pending. `retention_loop` (started in `app.py` lifespan) deletes analytics older than `ANALYTICS_RETENTION_DAYS` (90) and quota rows older than yesterday
- Both are registered in `app.py` via `app.middleware("http")(fn)`

**Routes:** `routes/` package
- `routes/models.py` — Pydantic request/response models (TranslateRequest, SignResponse, FeedbackRequest, …)
- `routes/translate.py` — `POST /translate` (pipeline invocation, caching, daily quota for server-funded requests), `GET /rate-limit`
- `routes/feedback.py` — `POST /feedback`, `POST /feedback/general`, `GET /feedback/stats`
- `routes/admin.py` — `GET/DELETE /admin/feedback`, `GET /admin/stats`, `GET /admin/analytics/*`
- Included in `app.py` via `app.include_router(router, prefix=settings.api_prefix)`

**Configuration:** `config.py`
- Pydantic BaseSettings for environment-based config
- CORS origins list (add production domain here!)
- Database URL, API keys, logging config
- Cached with `@lru_cache()` for performance

**Database:** `db/` package
- `db/engine.py` — async engine, `AsyncSessionLocal`, `Base`, `init_db`, `get_db`, `hash_ip`
- `db/models.py` — `Feedback` and `Analytics` ORM models
- `db/crud/feedback.py` — `create_feedback`, `get_feedback_stats`, `get_paginated_feedback`, `get_recent_feedback`
- `db/crud/analytics.py` — `create_analytics_event`, `get_unique_users_count`, `check_shared_key_rate_limit`, and all aggregation queries
- IP addresses are hashed for privacy via `hash_ip()` — HMAC-SHA256 keyed by `IP_HASH_SALT` (plain SHA-256 if unset, which is reversible; a warning is logged in production). Two feedback types: "translation" and "general"
- **Currently using SQLite in production** (switched from PostgreSQL when Render trial expired)
- SQLite file: `asl_feedback.db` — note Render's filesystem is **ephemeral**, so data resets on each deploy
- All queries use `func.date()` and SQLite-compatible syntax — no code changes needed to switch back
- To re-enable PostgreSQL: set `DATABASE_URL=postgresql+asyncpg://...` in `render.yaml` and uncomment the `databases:` block

**AI Workflow:** `python_code/asl/` package
- `asl/schemas.py` — Pydantic models (`DescriptionSchema`, `SentenceDescriptionSchema`, `GrammarPlanSchema`) and `ASLState` TypedDict
- `asl/knowledge_base.py` — KB loading, exact lookup, optional semantic lookup (`_build_knowledge_context`, `_extract_fs_glosses`, `_get_kb_matched_words`)
- `asl/pipeline.py` — **active implementation**: `ASLPipeline` class with `.invoke()`, `build_asl_graph()` factory. Uses `google-genai` SDK directly (no LangChain/LangGraph) for ~120MB RAM savings on Render Starter. Two-agent logic: Grammar Agent → Translation Agent. Key internals:
  - **Context cache**: `_try_create_grammar_cache()` uploads `_GRAMMAR_SYSTEM_PROMPT` to Gemini at startup with 24h TTL; `_can_use_grammar_cache(api_key)` bypasses it for custom API key requests; stale cache triggers recreation automatically. **Changing `_GRAMMAR_SYSTEM_PROMPT` invalidates the cache** — it recreates on the next request automatically.
  - **Retry logic**: `_gemini_with_retry(fn, *args, **kwargs)` wraps every `generate_content` call; retries up to 3 times on 503/429/overloaded errors with exponential backoff (2s → 4s → 8s). Non-transient errors (auth, not-found) are re-raised immediately.
  - **Token tracking**: `_usage_counts()` extracts prompt/cached/thinking/output counts from every response; `_PipelineStats` dataclass accumulates lifetime totals; `get_stats()` returns cache hit rate and token breakdown; `_log_usage()` prints per-agent counts to stdout
  - **`_run_grammar_agent`** is an instance method (not module-level) so it can access the cache handle on `self`
  - **Thread-safe key passing**: `invoke(state, api_key=None)` accepts the key directly; `_make_client(api_key)` uses it per-call. No `os.environ` mutation — concurrent requests with different keys cannot interfere
- `asl/cli.py` — interactive CLI for local testing (`python -m python_code.asl.cli`)
- Two-agent pipeline (in `pipeline.py`):
  1. **Grammar Agent**: Applies 11 ASL grammar rules — TTC structure, function-word omission, negation placement, topicalization, wh-question formation, yes/no questions, conditionals, verb directionality, aspect, classifiers, and **numbers** (years split as 2-digit chunks e.g. `2030 → 20 30`; phone/zip/serial numbers fingerspelled digit-by-digit; quantities and ages use number signs; money uses number + DOLLAR/CENT; never `fs-` on years or plain quantities)
  2. **Translation Agent**: Generates a plain-English `simple_description` (shown upfront on the sign card) plus detailed sign descriptions using structured output (`response_mime_type="application/json"`, `response_schema=SentenceDescriptionSchema`), grounded by the verified sign knowledge base. Also identifies proper nouns and sets `is_fingerspelled=true` + `fingerspell_letters` on those signs
- Uses Google Gemini 2.5 Flash model via `google-genai` SDK
- `ASLPipeline` instance built at startup and stored in `app.state.asl_graph`; `__init__` also creates the Gemini context cache for `_GRAMMAR_SYSTEM_PROMPT`
- Invoked via `_run_pipeline()` in `routes/translate.py`: `asyncio.to_thread(asl_graph.invoke, ...)` behind a semaphore (`MAX_CONCURRENT_TRANSLATIONS`, 4) with a total budget (`TRANSLATE_TIMEOUT_SECONDS`, 55 → 503). Identical concurrent server-key requests share one run (custom-key requests never do). At most `MAX_QUEUED_TRANSLATIONS` (16) distinct jobs may wait for a slot (else immediate 503); a job whose callers have all timed out is cancelled before it starts, so abandoned (refunded) requests never reach Gemini
- The pipeline reuses one `genai.Client` for the server key (closed on shutdown); custom-key clients are created per request and closed. Each HTTP call has a 25s timeout. The model comes from `Settings.model_name` (`MODEL_NAME` env)
- Expired grammar cache: `_refresh_grammar_cache()` recreates it once under a lock and the retry uses the **new** cache name
- **Modifying prompts**: edit `_GRAMMAR_SYSTEM_PROMPT` and `_run_instructor_agent()` in `asl/pipeline.py`. **Note**: changing `_GRAMMAR_SYSTEM_PROMPT` requires restarting the app to recreate the context cache with the new content

**Sign Knowledge Base:** `python_code/sign_knowledge_base.json`
- Verified hand shape, location, movement, and non-manual marker descriptions for all 100 signs (A-Z, 0-9, 12 months, 52 common signs)
- Sourced from Lifeprint/ASLU (Bill Vicars) and Gallaudet conventions
- Loaded once at module startup into `SIGN_KNOWLEDGE_BASE` dict
- `_build_knowledge_context()` extracts glosses from the Grammar Agent's output, looks up matches, and injects verified descriptions directly into the Translation Agent's system prompt
  - **Exact lookup first**: case-insensitive, handles hyphenated compounds (`THANK-YOU → thank_you`)
  - **Alphabet guard**: Single-letter KB keys (a-z) are collected into `_ALPHABET_KEYS` frozenset and **only match `fs-` prefixed glosses** (fingerspelling). Bare single-letter glosses like "I" (pronoun) or "A" (article) are routed to the "Signs to generate" section so the LLM describes the word sign, not the alphabet handshape. This prevents homograph collisions across all 26 letters.
  - **Translation Agent context-awareness**: The system prompt includes a `CRITICAL: CONTEXT-AWARE SIGN DESCRIPTIONS` section instructing the LLM that bare glosses are words/concepts, not alphabet letters. Includes explicit examples (e.g. "I" = pointing at chest, not pinky-up handshape).
  - **Semantic fallback** (opt-in): if exact match fails, `_semantic_lookup()` uses cosine similarity against embeddings of all 100 KB keys (via `all-MiniLM-L6-v2`) to resolve synonyms (e.g. `GLAD → happy`, `AUTOMOBILE → car`). Threshold: 0.60. Matched key and similarity score are logged and annotated in the prompt. Semantic matches to alphabet keys are also guarded.
  - **Disabled by default** — loading `sentence-transformers` + `numpy` uses ~200MB of RAM, which exceeds Render Starter (512MB total). Enable with `ENABLE_SEMANTIC_LOOKUP=true` on plans with >700MB available. Both packages live in the `semantic` extra in `pyproject.toml` (not in the default image): add them with `uv sync --extra semantic` locally, or export with `--extra semantic` for a deploy that enables it.
  - When enabled, `numpy` is imported lazily (inside the `if ENABLE_SEMANTIC_LOOKUP` block), not at module level. Embeddings are computed once at startup from `SIGN_KNOWLEDGE_BASE` keys and held in a numpy array (`_KB_EMBEDDINGS`) — no vector database needed
- Signs not in the knowledge base are explicitly flagged for LLM generation; matched signs (exact or semantic) instruct the LLM to copy descriptions faithfully
- **`kb_verified` is server-computed only.** Gemini receives `GeneratedSentenceSchema` (no provenance field). `_postprocess_signs()` sets `kb_verified=True` only for **exact** KB matches and overwrites `hand_shape`/`location`/`movement`/`non_manual_markers` with the KB entry; `simple_description` stays model-written. Semantic matches are prompt hints only and are never marked verified

**Caching:** `cache.py`
- Dual-layer caching: Redis (when available) + in-memory LRU fallback
- `_MemoryCache` class: OrderedDict-based LRU with TTL expiry, max 256 entries
- Always writes to memory cache; also writes to Redis if connected
- Reads try memory first, then Redis (with deadline + backoff, see "Caching notes")
- Works without Redis configured (Render free tier has no Redis)
- `init_redis()` imports `redis.asyncio` lazily — no import error if redis package isn't installed

**Daily free-translation quota:**
- Any request **without** `X-Custom-API-Key` runs on a server-funded key (`SHARED_API_KEY` if set, else `GOOGLE_API_KEY`) and reserves one slot of `SHARED_KEY_DAILY_LIMIT` per hashed IP per UTC day (`try_consume_shared_key_quota`, atomic). Failed translations are refunded (`release_shared_key_quota(ip_hash, date)` with the **reservation's** date, so a request straddling UTC midnight never decrements the new day), so only successes count. Cache hits are free
- A daily-limit 429 carries `Retry-After` (seconds to UTC midnight) and `X-RateLimit-Scope: daily`; the frontend shows "Daily limit reached" with an h/m countdown. `RateLimitBanner` refetches `/rate-limit` after every translation via `refreshKey`

**Caching notes:** Redis is optional and never blocks: reads hit memory first; every Redis command has a 0.5s deadline; any failure skips Redis for 30s, then it reconnects lazily. The Redis URL is only ever logged redacted (`_redact_url`).

**Custom API Keys:**
- Users can provide their own Google Gemini API key
- Sent via `X-Custom-API-Key` header from frontend
- Passed directly to `ASLPipeline.invoke(state, api_key=...)` — no `os.environ` mutation
- `_make_client(api_key)` uses the provided key; `ASLPipeline(default_api_key)` holds the server key (passed from `settings.google_api_key` in `app.py`, env var fallback for the CLI)
- **Read secrets from `get_settings()`, not `os.environ`** — pydantic-settings loads `.env` into `Settings` but does not export it to `os.environ`
- `_can_use_grammar_cache(api_key)` compares the provided key against `self._init_api_key` directly, so context cache is correctly bypassed for custom keys without reading env

### Frontend Architecture (React/TypeScript)

**Entry Point:** `src/main.tsx` → `src/App.tsx`

**State Management:**
- `src/contexts/AppContext.tsx`: Global app state (search history, custom API key)
- `src/contexts/ThemeContext.tsx`: Theme state (light/dark/high-contrast)
- Local storage for persistence via `src/utils/storage.ts`

**Key Components:**
- `src/components/SearchBar.tsx`: Main search input with URL query param support
- `src/components/SignCard.tsx`: Text-only sign card — word name + "HOW TO DO IT" plain-English description always visible; expandable "More details" shows hand shape tiles, practice links, fingerspell guide, and external links. No per-card animation (animation handled by SentenceAnimator). Hero strip shows a **"Verified"** badge (green, `sign-card__badge--verified`) when `kb_verified=true`, or an **"AI generated"** badge (muted outline, `sign-card__badge--ai`) when `kb_verified` is falsy and the sign is not fingerspelled; fingerspelled signs show neither
- `src/components/SentenceAnimator.tsx`: Plays sign animations in sequence in a sticky right column alongside the sign cards. Always shown for any result (not just multi-sign). Word chips show progress, skips single-letter non-fingerspelled words. Input is `buildAnimationSteps(result.signs)` (`src/utils/animationSteps.ts`, memoized in DictionaryPage): glosses map to library files via `toSignKey()` (`THANK-YOU → thank_you`, `3 → three`), and fingerspelled words expand to one step per letter/digit
- `src/components/DictionaryPage.tsx`: AI translation page at `/translate`. Landing state shows onboarding callout, quick-try chips, learn progress card, category cards. During a translation, shows `TranslateLoadingView` — a full-screen pipeline progress card (4 steps with shimmer skeleton sign cards and CSS `@keyframes tlShimmer` animation) that replaces the old simple spinner. Results use a two-column grid: sign cards on the left, SentenceAnimator sticky on the right; grammar notes + follow-up suggestions + feedback widget are full-width below the grid. Results cache to `sessionStorage` (`asl_result:v2:<normalized query>`, `{savedAt, response}`, 1h TTL, shape-validated, all access in try/catch) — checked on every `handleSearch` call before hitting the API. `?q=` is followed on mount **and** on later URL changes (Back/Forward, links) via `lastQueryRef`; share links point at `/translate?q=` (old `/?q=` links redirect). Save PDF builds the document from the typed `TranslateResponse` (`src/utils/pdf.ts`, jsPDF loaded on demand), never from page markup. Results header includes an **AI disclaimer**. The **GlossBar** shows two rows: "English: [original query]" and "ASL order: [gloss tokens]". The results footer includes a **"Practice these signs"** button. **Error handling**: errors are prefixed by type (`ai_busy:`, `rate_limit:N:`, `network:`, `server:`) so the error card can show a context-aware title, the right hint, and the right actions — auto-retry for transient errors, a live countdown for rate limits (parsed from `Retry-After` header), a "Report this error" button for unexpected failures (calls `submitGeneralFeedback` with the error pre-filled). A **Cancel** button aborts the in-flight request via `AbortController`. Progressive loading hints appear at 4s/8s/14s to reassure users during backend retries.
- `src/components/SignBrowserPage.tsx`: Sign dictionary browser at `/dictionary` (alias `/signs`). Features: A–Z sidebar jump nav, search bar, category filter tabs (All, A–Z, Numbers, Months, Common, Greetings, Family, Verified only — last three are derived filters, not metadata categories). Cards are grouped by first letter, each with an IntersectionObserver lazy-load for sign data + `SignAnimator`. Only one card plays at a time (`playingSign` state). The "Verified only" filter shows signs where `source !== 'ai_generated'`; Greetings and Family are derived from hardcoded `GREETINGS_SIGNS` / `FAMILY_SIGNS` sets matching Level 3 & 4 sign lists.
- `src/components/FeedbackWidget.tsx`: Rating system (thumbs up/down)
- `src/components/features/`: Feature-specific components (ApiKeyModal, ThemeSwitcher, etc.)

**API Layer:** `src/services/api/` package
- `api/client.ts` — shared axios instance (60s timeout), `setCustomApiKey()`
- `api/translate.ts` — `translateToASL(text, signal?)`, `getRateLimitStatus`. Errors are thrown with a type prefix: `ai_busy:`, `rate_limit:N:` (N = Retry-After seconds), `network:`, `server:`. Non-string FastAPI `detail` values (e.g. 422 validation arrays) are coerced to a generic message rather than `[object Object]`.
- `api/feedback.ts` — `submitFeedback`, `submitGeneralFeedback`
- `api/admin.ts` — `getAdminFeedback`, `deleteAdminFeedback`, `getAdminStats`, `getAnalyticsOverview`
- `api/index.ts` — barrel re-export
- All API calls go to `/api/*` prefix; dev mode proxied to localhost:8000 via Vite config

**Utilities:**
- `src/utils/storage.ts`: LocalStorage wrapper with SM-2 spaced repetition (search history, favorites, theme, API key, learning progress with `easeFactor`, `interval`, `repetitions`, `nextReview`, and `getSignsDueForReview()`). Also persists active session state via `ActiveSessionData` interface and `saveActiveSession` / `getActiveSession` / `clearActiveSession` — used for mid-session resume. `getActiveSession()` validates structural integrity and sign-name format before returning data.
- `src/utils/signOfTheDay.ts`: Deterministic daily sign picker using date hash
- `src/utils/accessibility.ts`: Screen reader announcements
- `src/utils/print.ts`: Print-optimized layouts
- `src/utils/share.ts`: Web Share API integration

**Styling:**
- Custom "Calm" design system — warm off-white paper, cool slate ink, ocean accent (inspired by Apple Translate / Linear / Notion). Uses `--md-sys-*` CSS custom property naming but does **not** import the Material 3 library.
- CSS custom properties for theming (light/dark/high-contrast)
- All styles are component-scoped CSS files

### Production Serving

**CRITICAL UNDERSTANDING:** In production (`ENVIRONMENT=production`):

1. Vite builds frontend to `dist/` directory
2. FastAPI mounts `dist/assets/` as static files at `/assets`
3. FastAPI serves `dist/index.html` for root route `/`
4. **Catch-all route** `/{full_path:path}` handles SPA client-side routing
   - Explicitly checks for `api/` and `assets/` prefixes to avoid interception
   - Path resolution is in `resolve_spa_path()`: the resolved path must stay inside `dist/` (the path param is percent-decoded, so `..%2f` arrives as `../`). Covered by `tests/test_security.py`
   - Missing `sign-data/*` and `models/*` files return 404, not `index.html` (the service worker would cache HTML as data)
   - Returns `index.html` for all other routes (SPA routing)

**Route Priority:**
1. API routes (`/api/*`, `/health`)
2. Static assets (`/assets/*`) - mounted as StaticFiles
3. Root route (`/`)
4. Catch-all (`/{full_path:path}`) - SPA fallback

### Environment Variables

Required in `.env` file:
```bash
GOOGLE_API_KEY=your_key_here          # REQUIRED: Google Gemini API key
ENVIRONMENT=development                # or "production"
PORT=8000
RATE_LIMIT=10/minute                  # 100/minute in production
DATABASE_URL=sqlite+aiosqlite:///./asl_feedback.db
ADMIN_PASSWORD=your_secure_password   # For admin dashboard access
IP_HASH_SALT=random_secret            # Salt for IP hashing (Render generates one via render.yaml)
TRUSTED_PROXY_HOPS=1                  # Proxies appending to X-Forwarded-For (0 = ignore header)
TRUSTED_PROXY_NETWORKS='["10.0.0.0/8","172.16.0.0/12","192.168.0.0/16","127.0.0.0/8","::1/128","fc00::/7"]'  # peers allowed to set X-Forwarded-For (default shown)
SHARED_KEY_DAILY_LIMIT=10             # Free translations per IP per UTC day without a user key
MODEL_NAME=gemini-2.5-flash           # Gemini model used by the pipeline
MAX_CONCURRENT_TRANSLATIONS=4
TRANSLATE_TIMEOUT_SECONDS=55
ANALYTICS_RETENTION_DAYS=90
```

Frontend env (optional):
```bash
VITE_API_URL=                         # Empty for same-origin (production)
```

### Database Schema

**Feedback table:**
```sql
- id: Primary key
- query: English phrase (nullable for general feedback)
- rating: "up" or "down" (nullable for general feedback)
- feedback_text: User comments
- ip_hash: SHA-256 hashed IP for privacy
- timestamp: UTC datetime
- feedback_type: "translation" or "general"
- category: "bug", "feature", "general", "ui_ux" (for general feedback)
- email: Optional email for follow-up
```

## Important Implementation Details

### Adding New API Endpoints

1. Add Pydantic request/response models in `routes/models.py`
2. Create route handler in the appropriate `routes/` module (`translate.py`, `feedback.py`, or `admin.py`) using `@router.post()` / `@router.get()`
3. Add `@limiter.limit(settings.rate_limit)` decorator for rate limiting (import `limiter` from `deps`)
4. Use `async def` and `await` for all database operations
5. Add corresponding function in the appropriate `src/services/api/` module and re-export it from `api/index.ts`
6. Update TypeScript types in `src/types.ts`

### Modifying AI Translation Logic

The pipeline lives in `python_code/asl/pipeline.py`:
- Two-agent system: Grammar Agent → Translation Agent
- Uses Pydantic structured output via `google-genai` SDK (`response_mime_type="application/json"`, `response_schema=Schema`)
- State flows as a plain `dict` with keys: `english_input`, `grammar_plan`, `translated_input`, `final_output`
- Modify Grammar Agent prompt in `asl/pipeline.py` → `_GRAMMAR_SYSTEM_PROMPT` constant
- Modify Translation Agent prompt in `asl/pipeline.py` → `_run_instructor_agent()` → `system_prompt` f-string
- KB lookup and context injection logic is in `asl/knowledge_base.py`
- Always test with various phrase types (questions, statements, temporal phrases, negations, conditionals)

**`DescriptionSchema` fields:**
- `word`, `hand_shape`, `location`, `movement`, `non_manual_markers` — standard sign fields
- `simple_description: str` — 1-2 sentence plain-English guide for beginners, no ASL jargon (e.g. "cup your fingers" not "O handshape"). Always generated by the LLM for every sign. Shown always-visible on the sign card; the detailed fields are hidden behind "More details"
- `is_fingerspelled: bool` — set `true` for proper nouns (names, cities, brands, abbreviations) that are fingerspelled letter by letter in ASL
- `fingerspell_letters: List[str]` — ordered uppercase letters, e.g. `['S','H','R','A','V','A','N']` for SHRAVAN

**How fingerspelling is detected (three layers):**
1. **Grammar Agent** — GLOSS CONVENTIONS require `fs-` prefix for all proper nouns (e.g. `fs-SHRAVAN`, `fs-BOSTON`). Multi-word proper nouns are hyphenated into a single token: `fs-NEW-YORK-CITY` (not `fs-NEW YORK CITY`). Examples are included in the prompt.
2. **`_build_knowledge_context`** — `fs-` prefixed glosses get a dedicated `FINGERSPELLING REQUIRED` section injected into the Translation Agent's context, with pre-computed letters and field values. The LLM copies these rather than reasoning about them.
3. **Post-processing in `_postprocess_signs`** — after the LLM responds, `_extract_fs_glosses()` scans the gloss sequence and force-sets `is_fingerspelled=True` and `fingerspell_letters` on matching signs in Python. Letters **and digits** are kept (`fs-6-1-7 → ['6','1','7']`, displayed as `617`); hyphens in multi-word tokens (e.g. `NEW-YORK-CITY`) are dropped. Matching normalises hyphens/spaces/underscores so `sign.word="New York City"` correctly matches fs_map key `"NEW-YORK-CITY"`. This is deterministic and immune to LLM omission.

**Fingerspelling frontend rendering** (`src/components/SignCard.tsx`):
- When `is_fingerspelled` is true, a collapsible "Fingerspell" section appears in the expandable "More details" area
- Letter chips display the full sequence at a glance (always visible)
- "Show letter guide" expands a `<dl>` list with each letter and its hand shape description
- Descriptions come from a static `LETTER_SHAPES` lookup table (A-Z, 0-9) hardcoded in `SignCard.tsx` — no API call needed

### Updating the Sign Knowledge Base

`python_code/sign_knowledge_base.json` contains verified descriptions for all 100 signs:
- Each entry has `hand_shape`, `location`, `movement`, and `non_manual_markers` fields matching `DescriptionSchema`
- Keys are lowercase with underscores (e.g., `thank_you`, `one`, `january`)
- When adding new signs, add an entry here in addition to extracting MediaPipe landmarks — this ensures the Translation Agent uses accurate descriptions for known signs
- The `_source` and `_schema` keys at the top are metadata and are filtered out at load time

### Static File Serving Issues

If CSS/JS files don't load in production:
1. Check that `/assets` mount happens BEFORE catch-all route
2. Verify `dist/` directory exists and contains `assets/` subdirectory
3. Check catch-all route explicitly excludes `assets/` prefix
4. Look for 404s in browser Network tab

### CORS Configuration

Production domains must be added inside the `__init__` method in `config.py` (not at class body level — class-body code runs at definition time before env vars are loaded):
```python
def __init__(self, **kwargs):
    super().__init__(**kwargs)
    if self.environment == "production":
        origins = list(self.cors_origins)
        origins.extend(["https://your-domain.com"])
        object.__setattr__(self, "cors_origins", origins)
```

Or set `CORS_ORIGINS` environment variable as JSON array.

### Rate Limiting

- Development: 10 requests/minute per IP
- Production: 100 requests/minute per IP
- Uses SlowAPI with in-memory storage
- Admin endpoints: 5 failed passwords from one IP within 15 minutes → 429 until the window clears (`auth.py`, in-memory, at most 10k tracked IPs)
- For scaling, migrate to Redis-backed rate limiting

### Security Headers

Configured in `middleware.py` → `add_security_headers`:
- CSP (Content Security Policy): Production only. **MediaPipe requires `cdn.jsdelivr.net` in `script-src`, `connect-src`, and `worker-src`; `'wasm-unsafe-eval'` in `script-src`; and `blob:` in `worker-src`.** Omitting any of these blocks camera hand detection silently (no JS error, just fails to load).
- HSTS: Enforces HTTPS
- X-Frame-Options: Prevents clickjacking
- X-Content-Type-Options: Prevents MIME sniffing

Modify CSP if adding external scripts or resources. The CSP is only applied in production (`settings.environment == "production"`), so camera works locally but may fail on Render if CSP is wrong.

## Common Pitfalls

1. **Forgetting to run both services**: Frontend and backend must both be running in development
2. **API key not set**: Translation fails without `GOOGLE_API_KEY` in environment or user-provided key
3. **CORS errors**: Production domain not added to config.py
4. **Static files 404**: Catch-all route intercepting `/assets/*` requests
5. **Rate limiting in dev**: Clear rate limit with API restart (in-memory storage)
6. **Import errors**: Backend packages (`db/`, `routes/`, `deps.py`, `middleware.py`) and `python_code/asl/` must be on sys.path — `app.py` sets this via `sys.path.insert(0, "python_code")` at startup

## Testing Changes Locally

1. Make changes to code
2. Restart appropriate service:
   - Backend changes: Restart `python app.py`
   - Frontend changes: Vite HMR auto-reloads
   - Config changes: Restart both services
3. Test translation flow end-to-end
4. Check browser console for errors
5. Check backend logs for API errors
6. Test with and without custom API key

## Deployment Notes

- Push to `main` branch triggers Render.com auto-deploy
- Build takes 5-10 minutes (Docker multi-stage build)
- Check Render dashboard logs for build/runtime errors
- Update `CORS_ORIGINS` environment variable after first deploy
- Health check endpoint: `/health` (used by Render and Docker)

## Domain / URL Status

**Current production URL:** `https://asl-guide.onrender.com`
**Render service name (render.yaml):** `asl-dictionary` ← not yet updated to match new URL
**Old URL (still live, kept for shared professor links):** `https://asl-dictionary.onrender.com`

Frontend SEO files were updated in April 2026 (`public/sitemap.xml`, `public/robots.txt`, `public/og-image.svg`, `index.html` canonical/og tags all reference `asl-guide.onrender.com`). `render.yaml` (`CORS_ORIGINS`) and `config.py` now list both `asl-guide.onrender.com` and `asl-dictionary.onrender.com`. The Render service name in `render.yaml` is still `asl-dictionary` (renaming it would create a new service).

```bash
# What was run for SEO files:
sed -i '' 's|asl-dictionary\.onrender\.com|asl-guide.onrender.com|g' \
  public/sitemap.xml \
  public/robots.txt \
  public/og-image.svg \
  index.html
```

### To migrate to a custom domain in the future:

Run the same sed command replacing `asl-guide.onrender.com` with the new domain, then update the Render environment variable:
- `CORS_ORIGINS` → `["https://NEW-DOMAIN"]`

Re-verify Google Search Console for the new domain (the verification file `public/googleed041497d630e95f.html` is already deployed — just add the new property in Search Console and click Verify).

### SEO files in place (as of April 2026):
- `public/robots.txt` — allows all crawlers, points to sitemap
- `public/sitemap.xml` — covers `/`, `/translate`, `/dictionary`, `/learn`, `/camera`
- `public/og-image.svg` — 1200×630 social share image
- `public/googleed041497d630e95f.html` — Google Search Console verification
- `index.html` — JSON-LD (`WebSite` + `SearchAction` + `EducationalApplication`), og:image, keywords, canonical
- `src/components/DictionaryPage.tsx` — `?q=` param synced to URL for shareable translation results

## Key Files Reference

**Backend — Entry Point:**
- `app.py`: Slim FastAPI entry point — lifespan, router registration, static file serving
- `deps.py`: Shared `limiter` (SlowAPI) instance imported by all route modules
- `middleware.py`: `add_security_headers` + `analytics_tracking_middleware`
- `config.py`: Pydantic-based environment configuration (cached with `@lru_cache`)

**Backend — Routes (`routes/`):**
- `routes/models.py`: All Pydantic request/response models
- `routes/translate.py`: `/translate` and `/rate-limit` endpoints
- `routes/feedback.py`: `/feedback`, `/feedback/general`, `/feedback/stats` endpoints
- `routes/admin.py`: All `/admin/*` endpoints (feedback management + analytics)

**Backend — Database (`db/`):**
- `db/engine.py`: SQLAlchemy engine, session factory, `init_db`, `get_db`, `hash_ip`
- `db/models.py`: `Feedback` and `Analytics` ORM models
- `db/crud/feedback.py`: Feedback CRUD operations
- `db/crud/analytics.py`: Analytics CRUD and aggregation queries

**Backend — AI (`python_code/asl/`):**
- `asl/schemas.py`: `DescriptionSchema`, `SentenceDescriptionSchema`, `GrammarPlanSchema`, `ASLState`
- `asl/knowledge_base.py`: KB loading, semantic lookup, `_build_knowledge_context`
- `asl/pipeline.py`: `_GRAMMAR_SYSTEM_PROMPT` (11 rules), `_gemini_with_retry()` (exponential backoff helper), `_run_instructor_agent()` (module-level), `ASLPipeline` (with `__init__`, `_run_grammar_agent()` method, `_try_create_grammar_cache()`, `_can_use_grammar_cache()`, `get_stats()`), `build_asl_graph()`. Edit this file to change prompts or pipeline logic. Token helpers: `_PipelineStats` dataclass, `_usage_counts()`, `_log_usage()`.
- `asl/cli.py`: Interactive CLI for local testing
- `python_code/sign_knowledge_base.json`: Verified sign descriptions for all 100 signs (grounding source)

**Frontend Core:**
- `src/App.tsx`: Main React component with lazy loading. Route map: `/` → `HomePage`, `/translate` → `DictionaryPage`, `/dictionary` + `/signs` → `SignBrowserPage`, `/learn` → `LearnPage`, `/camera` → `CameraPage`, `/onboarding` → `OnboardingPage`, `/admin` → `Admin`.
- `src/main.tsx`: Entry point with ErrorBoundary
- `src/components/Layout.tsx`: App shell with top bar and bottom pill nav. Top nav items: Home, Translate, Learn, Camera, Dictionary. ⌘K shortcut navigates to `/dictionary`. Learn nav icon is a graduation cap.
- `src/components/HomePage.tsx`: Home page at `/` with Sign of the Day, lesson plan card, streak card, and mode selection shortcuts.
- `src/components/DictionaryPage.tsx`: AI translation page at `/translate` (see Key Components above).
- `src/components/SignBrowserPage.tsx`: Sign dictionary at `/dictionary` — A–Z sidebar, search, category filters, lazy-loaded card grid (see Key Components above).
- `src/components/OnboardingPage.tsx`: Onboarding walkthrough at `/onboarding`.
- `src/components/GemShape.tsx`: M3 Expressive rounded heptagon shape component (7-sided, heavy corner rounding). Used for XP display on Learn page hero. Same pattern as `FlowerShape.tsx`.
- `src/services/api/client.ts`: Axios instance, `setCustomApiKey`, `API_PREFIX`
- `src/services/api/translate.ts`: `translateToASL`, `getRateLimitStatus`
- `src/services/api/feedback.ts`: `submitFeedback`, `submitGeneralFeedback`
- `src/services/api/admin.ts`: `getAdminFeedback`, `deleteAdminFeedback`, `getAdminStats`, `getAnalyticsOverview`
- `src/components/ErrorBoundary.tsx`: Global error handling

**Learning Feature:**
- `src/components/learn/LearnPage.tsx`: Main learning page. No header bar — bottom nav handles navigation. Level-detail view has an inline "← All levels" back button. Hero is left-aligned; XP shown in a `GemShape` (M3 rounded heptagon). **Browse all signs is no longer in the hero** — navigate to `/learn?browse=1` instead (home page "Browse library" card does this). Handles `?browse=1` on mount to open `SignBrowser` directly. Session complete screen shows a blue header + floating score card + two-column sign list/actions layout (stacks to single column below 720px)
- `src/components/learn/LevelCard.tsx`: Level card component with FlowerShape badge, status indicators (Complete/Continue/Locked)
- `src/components/learn/LevelSelector.tsx`: Level selection grid with a current-level hero card above the grid. Accepts `hasResumeSession` and `onResume` props — when a saved incomplete session exists for the current level, shows **"Resume session"** (primary) + **"New session"** (ghost) buttons; otherwise shows **"Preview session"** alone.
- `src/components/learn/CameraPracticeExercise.tsx`: Camera practice integration
- `src/contexts/LearnContext.tsx`: Exercise generation — sign-to-word and word-to-sign are mixed from the first session (50/50 random); recall only appears when mastery ≥ 70% and timesStudied ≥ 3. Exposes `startPracticeSession(signWords: string[])` which filters a caller-supplied word list to signs available in the animation library, deduplicates, and starts a mixed SM-2-aware session — used by the "Practice these signs" flow from the dictionary. Also exposes `resumeSession()` which loads a persisted incomplete session from localStorage and resumes at the first **unanswered** exercise at or after the saved `currentIndex`. `state.activeSessionLevelId` is non-null when an incomplete saved session exists for that level (drives the "Resume session" button). `answerExercise()` is idempotent per exercise id (a synchronous `answeredIdsRef` guard runs before any storage write, so two calls in one tick can't double-award) and returns the XP actually awarded (`null` if already answered); one `ANSWER_EXERCISE` action appends to `state.results`, adds to `sessionScore`, and takes lifetime XP from `storage.addXP()` (never adds it again). The streak bonus needs the *previous* answer to be correct. Results are saved to localStorage immediately on answer; the level-unlock check runs in an effect on `state.results`. `loadSign` is a stable wrapper around the loader's bounded, deduplicated cache (no second copy in state). Camera-practice sessions only target signs the classifier can detect (`isCameraRecognizable`, no "ten"); `CameraPracticeExercise` is lazy-loaded.
- `src/constants/levels.ts`: Level definitions

**Camera Feature:**
- `src/components/camera/CameraPage.tsx`: Main camera page orchestrator
- `src/components/camera/CameraView.tsx`: Video + canvas landmark overlay
- `src/components/camera/PredictionDisplay.tsx`: Floating prediction card
- `src/components/camera/SpellingDisplay.tsx`: Letter accumulation display
- `src/components/camera/CameraControls.tsx`: Bottom control bar
- `src/components/camera/HandGuide.tsx`: Hand positioning guide
- `src/components/camera/SessionStats.tsx`: Session statistics
- `src/components/camera/CameraTutorial.tsx`: Onboarding tutorial
- `src/hooks/useCamera.ts`: Camera stream management. Every start/stop bumps a generation counter; a start that resolves after a newer start, a stop, or unmount stops its own tracks. `startCamera` is stable, and the hook alone restarts on facing-mode flips (callers must not)
- `src/hooks/useHandDetection.ts`: MediaPipe Hands integration — module-level singleton (`_singleton.landmarker`); `getOrLoadHandLandmarker()` coalesces concurrent mounts onto one load promise, resets on failure for retryability; no `close()` on unmount so the landmarker persists for the session. **`MEDIAPIPE_VERSION` constant must match the installed `@mediapipe/tasks-vision` package version** (currently `0.10.32`) — mismatch causes silent WASM init failure in production
- `src/hooks/useASLClassifier.ts`: TensorFlow.js inference — module-level singleton (`_singleton.model/scaler/labels`); same coalescing pattern as useHandDetection; `predict()` is async (uses `await probabilities.data()` instead of `dataSync()` to avoid blocking the main thread); no `dispose()` on unmount
- `src/hooks/useSoundEffects.ts`: Web Audio API sounds
- `src/utils/predictionBuffer.ts`: Rolling window smoothing
- `src/utils/handLandmarks.ts`: Landmark normalization
- `public/models/asl-classifier/`: TensorFlow.js model files

**Utilities:**
- `src/utils/storage.ts`: LocalStorage with level persistence and SM-2 spaced repetition
- `src/utils/signOfTheDay.ts`: Deterministic daily sign picker
- `src/utils/format.ts`: `formatSignName()` display helper

**Testing:**
- `vitest.config` embedded in `vite.config.ts` (test block)
- `src/test/setup.ts`: Test setup file
- `src/utils/__tests__/predictionBuffer.test.ts`: PredictionBuffer unit tests (8 tests)
- `src/utils/__tests__/signOfTheDay.test.ts`: Sign of the Day tests (4 tests)
- `src/utils/__tests__/storage.test.ts`: SM-2 spaced repetition tests (7 tests)
- Run: `npm test` (single run) or `npm run test:watch` (watch mode)
- Backend: `pytest` (install with `uv sync`, or `pip install -r requirements-dev.txt`). `tests/test_security.py` covers static path confinement, client-IP extraction, admin lockout, IP hashing, and `/translate` with a fake pipeline. `tests/test_pipeline.py` runs the real pipeline against a fake Gemini client (verification provenance, KB grounding, numeric fingerspelling)
- CI type check uses `tsc -b` — `tsconfig.json` is a solution file, so plain `tsc --noEmit` checks nothing

**PWA:**
- `public/manifest.json`: Web App Manifest (name, icons, theme color, display mode)
- `public/sw.js`: Service Worker (bump the `-vN` cache names when changing strategy):
  - Navigations (network-first, falls back to cached `/` offline — so a deploy's new chunk hashes are always picked up)
  - Hashed `/assets/*` (cache-first, oldest trimmed beyond 80 entries)
  - Sign data `/sign-data/*` (stale-while-revalidate; HTML responses never cached)
  - Classifier files (`MODEL_FILES` under `/models/asl-classifier/`, keep in sync with `useASLClassifier`): atomic versioned bundles. A refresh (shared by requests within 60s) downloads all four; only if all succeed are they written to a new `asl-model-bundle-<ts>` cache and the pointer in `asl-model-pointer-v1` switched. Offline or on partial failure the last complete bundle is used. Each page (SW client) is **pinned** to the bundle chosen on its first model request (in memory and in the pointer cache under `/__model-pin/<clientId>`, so it survives a worker restart), so a later request from that page never switches version even if a retry succeeds. Bundles are deleted only when no open page is pinned to them. If no complete bundle exists (empty cache and the download failed), model requests fail with `Response.error()` rather than falling back to per-file network requests that could straddle a deploy; the page's failed decision isn't remembered, so the classifier's retry downloads a complete bundle. Covered by `src/utils/__tests__/swModelBundle.test.ts`
  - API calls `/api/*` (network-only)
- `index.html`: SW registration script, Open Graph + Twitter Card meta tags

**Configuration:**
- `vite.config.ts`: Build configuration, dev proxy, vitest config
- `Dockerfile`: Multi-stage production build
- `docker-compose.yml`: Development environment
- `render.yaml`: Render.com deployment config

## Tech Stack Summary

- **Frontend**: React 18.3, TypeScript 5.9, Vite 7, Vitest, custom Calm design system
- **Backend**: FastAPI, Python 3.11+, uvicorn
- **AI**: Google Gemini 2.5 Flash, google-genai SDK, sentence-transformers (all-MiniLM-L6-v2, opt-in)
- **Browser ML**: TensorFlow.js, MediaPipe Hands (Tasks Vision API)
- **Database**: SQLAlchemy (async), aiosqlite/PostgreSQL
- **Caching**: Redis (optional) + in-memory LRU fallback
- **Deployment**: Docker, Render.com, PWA (Service Worker + Web Manifest)

---

## ASL Learning Feature

The app includes a Duolingo-style learning feature with animated sign demonstrations using MediaPipe landmark data.

### App Modes (Home Page)

The app has three modes accessible from the home page (`/`):
1. **Text to Signs** (`/translate`) - AI-powered text translation to ASL instructions
2. **Learn Signs** (`/learn`) - Interactive exercises with animated sign demonstrations
3. **Live Camera** (`/camera`) - Real-time ASL fingerspelling recognition using browser camera

### Learning Feature Architecture

**Entry Points:**
- `src/components/DictionaryPage.tsx` - AI translation page at `/translate`. Landing state shows onboarding callout, quick-try chips, and category cards. Translation results use a two-column grid. During loading, shows `TranslateLoadingView` — a pipeline progress card with shimmer skeleton sign cards.
- `src/components/SignBrowserPage.tsx` - Sign library browser at `/dictionary` (and `/signs` alias). Sidebar A–Z jump nav, search bar, category filter tabs (All, A–Z, Numbers, Months, Common, Greetings, Family, Verified only), section-grouped card grid with IntersectionObserver lazy loading.
- `src/components/learn/LearnPage.tsx` - Main learning page with exercises
- `src/components/learn/SignBrowser.tsx` - (Legacy) embedded sign browser used within LearnPage

**Key Components:**
- `SignAnimator.tsx` - Canvas-based MediaPipe landmark renderer
- `PlaybackControls.tsx` - Animation speed and playback controls
- `ExerciseCard.tsx` - Exercise wrapper with progress and feedback
- `SignToWordExercise.tsx` - Show animation, pick word (easiest)
- `WordToSignExercise.tsx` - Show word, pick animation (medium)
- `RecallExercise.tsx` - Show animation, type word (hardest)

**Level Components:**
- `LevelCard.tsx` - Individual level card with progress, lock state, mastery display
- `LevelSelector.tsx` - Grid of all 10 levels with visual progression path

**State Management:**
- `src/contexts/LearnContext.tsx` - Learning session state, progress tracking, XP system, level unlocking

### Sign Data (100 Signs)

Sign data is stored in `public/sign-data/`:
```
public/sign-data/
├── metadata.json           # Sign index with categories
└── signs/
    ├── a.json ... z.json   # 26 alphabet letters
    ├── one.json ... ten.json  # 10 numbers
    ├── january.json ... december.json  # 12 months
    └── [common signs].json # 52 common signs
```

**Categories:**
- `alphabet` - A-Z fingerspelling (26 signs)
- `numbers` - one through ten (10 signs)
- `months` - January through December (12 signs)
- `common` - Greetings, feelings, family, actions, etc. (52 signs)

### Level-Based Learning System

The learning feature uses a 10-level progression system defined in `src/constants/levels.ts`:

| Level | Name | Signs | Count |
|-------|------|-------|-------|
| 1 | Alphabet | A-Z | 26 |
| 2 | Numbers | one-ten | 10 |
| 3 | Greetings & Basics | hello, goodbye, please, thank_you, etc. | 8 |
| 4 | Family & People | mother, family, friend, etc. | 5 |
| 5 | Feelings | happy, sad, angry, scared, etc. | 7 |
| 6 | Actions | sit, stand, wait, read, write, etc. | 8 |
| 7 | Questions | how, when, where, which, who, why | 6 |
| 8 | Time | now, later, today, tomorrow, etc. | 6 |
| 9 | Places & Things | home, school, hospital, etc. | 8 |
| 10 | Months & Essentials | January-December + want, need, etc. | 16 |

**Unlock Mechanic:** 80% average mastery on current level unlocks the next level.

**Key Files:**
- `src/constants/levels.ts` - Level definitions with sign lists
- `src/components/learn/LevelCard.tsx` - Level card UI component
- `src/components/learn/LevelSelector.tsx` - Level selection grid
- `src/utils/storage.ts` - Level progress persistence

**Sign JSON Structure:**
```json
{
  "sign": "hello",
  "frames": [
    {
      "pose": [[x, y, z], ...],      // 33 pose landmarks
      "left_hand": [[x, y, z], ...], // 21 hand landmarks
      "right_hand": [[x, y, z], ...],// 21 hand landmarks
      "face": [[x, y, z], ...]       // 33 key face landmarks
    }
  ],
  "frame_count": 45,
  "fps": 29.97
}
```

### Adding New Signs

**Step 1: Download ASL videos**

Download videos manually from ASL education sources:
- Signing Savvy: https://www.signingsavvy.com/search/{sign_name}
- HandSpeak: https://www.handspeak.com
- ASLU/Lifeprint: https://www.lifeprint.com

Save videos as `data/videos/{sign_name}.mp4` (lowercase, underscores for spaces).

**Step 2: Extract landmarks**
```bash
# Activate extraction environment
source python_code/.venv-extraction/bin/activate

# Extract from all videos in folder
python python_code/extract_landmarks_from_video.py --folder data/videos/

# Extract single video
python python_code/extract_landmarks_from_video.py --video data/videos/hello.mp4 --sign hello
```

This creates JSON files in `public/sign-data/signs/` and updates `metadata.json`.

### Extraction Environment Setup

The extraction requires Python 3.11 (MediaPipe doesn't support 3.12+):
```bash
cd python_code
python3.11 -m venv .venv-extraction
source .venv-extraction/bin/activate
pip install mediapipe opencv-python yt-dlp beautifulsoup4
```

MediaPipe models are auto-downloaded to `mediapipe_models/` on first run.

### Key Utility Files

- `src/utils/format.ts` - `formatSignName()` converts "thank_you" to "Thank You"
- `src/utils/signDataLoader.ts` - Loads sign JSON data, handles caching
- `src/utils/signOfTheDay.ts` - Deterministic daily sign picker (date hash → sign index)
- `src/utils/storage.ts` - Learning progress persistence with SM-2 spaced repetition (localStorage)

### Learning Progress Storage Keys

```typescript
LEARNING_PROGRESS: 'asl_learn_progress',  // Per-sign mastery + SM-2 state
LEARNING_SETTINGS: 'asl_learn_settings',  // Animation speed, difficulty
LEARNING_STATS: 'asl_learn_stats',        // Total XP, level, streak
LEVEL_PROGRESS: 'asl_level_progress',     // Unlocked levels, current level
ONBOARDING_DISMISSED: 'asl_onboarding_dismissed',  // First-visit callout
ACTIVE_SESSION: 'asl_active_session',     // Incomplete session queue + index for mid-session resume
                                          // Cleared on endSession() or when last exercise is answered
                                          // Structure: ActiveSessionData { exercises, currentIndex, levelId, sessionScore, results? }
                                          // results = ExerciseResult[] saved on every answer; resume skips answered
                                          // exercises so XP is never awarded twice. getActiveSession() validates
                                          // exercise shapes, index bounds, and level id

// Camera feature keys
SOUND_EFFECTS_KEY: 'asl_sound_effects_enabled',  // Sound toggle
TUTORIAL_KEY: 'asl_camera_tutorial_seen',        // Tutorial completed

// sessionStorage (tab-scoped, not persisted)
asl_result:v2:<query>      // {savedAt, response} cached TranslateResponse (1h TTL; restores on refresh)
asl_practice_words         // JSON string[] of normalized sign words set by DictionaryPage
                           // "Practice these signs" button; consumed and cleared by LearnPage on mount
                           // when navigating to /learn?practice=1
```

### SM-2 Spaced Repetition

`storage.updateSignProgress()` implements the SM-2 algorithm:
- **`easeFactor`**: Starts at 2.5, minimum 1.3. Adjusted after each review: `EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))`
- **`interval`**: Days until next review. Correct: 1 → 6 → `interval * easeFactor`. Incorrect: reset to 1
- **`repetitions`**: Consecutive correct count. Reset to 0 on incorrect
- **`nextReview`**: ISO date string for next scheduled review
- **`mastery`**: Combines accuracy (80% weight) + repetition confidence (20% weight)
- **`getSignsDueForReview()`**: Returns signs with `nextReview <= today`, sorted most overdue first

### Python Scripts Reference

| Script | Purpose |
|--------|---------|
| `python_code/extract_landmarks_from_video.py` | Extract MediaPipe landmarks from videos |
| `python_code/convert_landmarks.py` | Convert parquet data to JSON (legacy) |
| `python_code/convert_to_tfjs.py` | Convert PyTorch model to TensorFlow.js format |

### Sign Browser Features

**`SignBrowserPage`** (`/dictionary`) is the standalone sign library:
- Category filters: All, A–Z, Numbers, Months, Common, Greetings (8), Family (5), Verified only (100)
  - Greetings and Family are derived from hardcoded sets (not a metadata category)
  - Verified only = signs where `source !== 'ai_generated'` in metadata.json
- A–Z sidebar for jump navigation
- Search bar — filters by sign name in real time
- Cards grouped by first letter; one playing at a time
- IntersectionObserver lazy-loads sign JSON + `SignAnimator` on scroll-into-view
- AI badge on unverified signs

### Animation Renderer Features

- Canvas-based MediaPipe landmark visualization
- Body skeleton (pose), hands, face with connections
- Hand zoom panel (bottom-right corner) for detail
- Face estimation from shoulders when face not detected
- Dark/light mode support
- Mobile responsive (hand zoom scales/hides on small screens)

---

## Live Camera ASL Recognition

The app includes a browser-based live camera feature for real-time ASL fingerspelling and number recognition.

### Camera Feature Architecture

**Entry Point:** `src/components/camera/CameraPage.tsx`

The camera feature runs entirely in the browser using:
- **MediaPipe Hands** - Real-time hand landmark detection (21 3D landmarks per hand)
- **TensorFlow.js** - Browser-based ML inference for ASL classification
- **getUserMedia API** - Camera access with front/back switching

### Model Details

**Location:** `public/models/asl-classifier/`
```
public/models/asl-classifier/
├── model.json          # TensorFlow.js model topology
├── group1-shard1of1.bin  # Model weights (~150KB)
├── labels.json         # Class labels ["0", "1", ..., "9", "a", "b", ..., "z"]
└── scaler.json         # StandardScaler params {mean: [], scale: []}
```

**Model Specifications:**
- Input: 63 features (21 landmarks × 3 coordinates)
- Output: 36 classes (digits 0-9 + letters A-Z)
- Test Accuracy: 95.5%
- Format: TensorFlow.js LayersModel (converted from PyTorch)

### Camera Components

| Component | File | Purpose |
|-----------|------|---------|
| CameraPage | `CameraPage.tsx` | Main orchestrator, state management |
| CameraView | `CameraView.tsx` | Video element + landmark canvas overlay |
| PredictionDisplay | `PredictionDisplay.tsx` | Floating card showing current prediction |
| SpellingDisplay | `SpellingDisplay.tsx` | Accumulated letters with copy/speak buttons |
| CameraControls | `CameraControls.tsx` | Bottom bar: back, sound toggle, flip camera |
| HandGuide | `HandGuide.tsx` | Visual positioning guide when no hand detected |
| SessionStats | `SessionStats.tsx` | Signs recognized + session time counter |
| CameraTutorial | `CameraTutorial.tsx` | First-time user onboarding (4 steps) |

### Camera Hooks

| Hook | File | Purpose |
|------|------|---------|
| useCamera | `useCamera.ts` | getUserMedia management, front/back switching |
| useHandDetection | `useHandDetection.ts` | MediaPipe Hands integration, landmark extraction |
| useASLClassifier | `useASLClassifier.ts` | TensorFlow.js model loading and inference |
| useSoundEffects | `useSoundEffects.ts` | Web Audio API sound effects |

### Prediction Pipeline

```
1. Video Frame → useCamera (15 FPS throttled)
2. Frame → MediaPipe Hands → 21 3D landmarks
3. Landmarks → Normalize with scaler.json (StandardScaler)
4. Normalized features → TensorFlow.js model → prediction + confidence
5. Prediction → PredictionBuffer (5-frame rolling window, 60% threshold)
6. Stable prediction → Display + spelling logic
```

### Spelling Mode

Hold a sign steady for 1 second to add it to the spelled word:

```typescript
// CameraPage.tsx - Timestamp-based hold detection
const letterHoldStartRef = useRef<number | null>(null);
const LETTER_HOLD_THRESHOLD = 1000; // 1 second

// When stable prediction matches last prediction
if (stablePrediction === lastStablePredictionRef.current) {
  if (letterHoldStartRef.current !== null && confidence > 0.8) {
    const elapsed = Date.now() - letterHoldStartRef.current;
    setHoldProgress(Math.min(elapsed / LETTER_HOLD_THRESHOLD, 1));

    if (elapsed >= LETTER_HOLD_THRESHOLD) {
      setSpelledLetters(prev => [...prev, stablePrediction]);
      // Reset and play sound
    }
  }
}
```

**Spelling Controls:**
- Copy to clipboard
- Text-to-speech (speak spelled word)
- Backspace (remove last letter)
- Clear all

### Prediction Smoothing

`src/utils/predictionBuffer.ts`:

```typescript
class PredictionBuffer {
  private buffer: string[] = [];
  private size = 5;          // Window size
  private threshold = 0.6;   // 60% agreement needed

  add(prediction: string): void { ... }

  getStablePrediction(): string | null {
    // Returns mode if it appears in 60%+ of buffer
    // Prevents flickering between predictions
  }
}
```

### Camera State Machine

```typescript
type CameraState = 'loading' | 'permission' | 'active' | 'error';

// State is derived from other values (no useEffect)
const state: CameraState = (() => {
  if (isLoading) return 'loading';    // Models loading
  if (error) return 'error';          // Camera/model error
  if (!cameraReady) return 'permission';  // Requesting camera
  return 'active';                    // Recognition running
})();
```

### Sound Effects

`src/hooks/useSoundEffects.ts`:
- Web Audio API oscillator-based sounds
- `letterAdded`: Short beep when letter added to spelling
- `success`: Ascending chord for achievements
- `error`: Low tone for errors
- Toggle stored in localStorage (`asl_sound_effects_enabled`)

### Tutorial System

`src/components/camera/CameraTutorial.tsx`:
- 4-step onboarding for first-time users
- Tracks completion in localStorage (`asl_camera_tutorial_seen`)
- Steps: Show Hand → Sign Letters → Hold to Spell → Copy & Speak

### Camera Practice in Learn Module

The camera recognition integrates with Levels 1 (Alphabet) and 2 (Numbers):

**File:** `src/components/learn/CameraPracticeExercise.tsx`

```typescript
// Shows target sign, user must perform it on camera
interface CameraPracticeExerciseProps {
  targetSign: string;  // e.g., "a" or "one"
  onComplete: () => void;
}

// Maps classifier output to level 2 word labels
const NUMBER_LABEL_MAP: Record<string, string> = {
  '1': 'one', '2': 'two', // ... etc
};
```

### Performance Optimizations

- **Frame Rate Throttling**: 15 FPS (configurable via `TARGET_FPS`)
- **requestAnimationFrame**: Smooth animation loop with cleanup
- **Lazy Loading**: Camera page is lazy-loaded (~400KB gzipped for TensorFlow.js)
- **Session-Level Model Singleton**: Both `useHandDetection` and `useASLClassifier` use module-level singletons — models load once per browser session and survive React unmounts/remounts (e.g. navigating away and back). Concurrent hook mounts coalesce onto one `loadPromise`; failed loads reset the promise so the next mount can retry.
- **Mounted Check**: `isCurrent` flag prevents state updates after unmount
- **Async Inference**: `predict()` uses `await probabilities.data()` (non-blocking) instead of `dataSync()` to keep the camera feed responsive during GPU computation

### LocalStorage Keys

```typescript
SOUND_EFFECTS_KEY: 'asl_sound_effects_enabled'  // Sound toggle
TUTORIAL_KEY: 'asl_camera_tutorial_seen'        // Tutorial completed
```

### Accessibility

- Screen reader announcements via `announceToScreenReader()`
- ARIA live regions for prediction updates
- Keyboard-accessible controls
- Focus management on state changes
- Reduced motion support

### Model Conversion (Development)

The TensorFlow.js model was converted from PyTorch:

```bash
# Training scripts (not committed, in .gitignore)
alphabet_translate/
├── data_processing.py    # Dataset preparation
├── model_training.py     # PyTorch model training
└── live_recognition.py   # Local testing script

# Saved artifacts (not committed, in .gitignore)
saved_models/
├── hand_landmark_model_state.pth  # PyTorch weights
└── scaler.pkl                     # sklearn StandardScaler
```

**Conversion Pipeline:**
```
PyTorch (.pth) → ONNX (.onnx) → TensorFlow SavedModel → TensorFlow.js
```

### Adding Support for More Signs

To extend beyond 36 classes (A-Z, 0-9):

1. **Collect training data** with additional signs
2. **Retrain PyTorch model** with new classes
3. **Update labels.json** with new class names
4. **Convert to TensorFlow.js** format
5. **Replace files** in `public/models/asl-classifier/`
6. **No code changes needed** - labels loaded dynamically

### Troubleshooting

**Camera Permission Denied:**
- Check browser settings for camera permissions
- Ensure HTTPS in production (required for getUserMedia)

**Model Load Failed:**
- Verify model files exist in `public/models/asl-classifier/`
- Check browser console for TensorFlow.js errors
- Ensure WebGL is enabled

**Low Recognition Accuracy:**
- Improve lighting conditions
- Position hand clearly in frame
- Check for webcam quality issues

---

## Error Handling & Resilience

### React Error Boundary

The app uses a global Error Boundary (`src/components/ErrorBoundary.tsx`) to catch React rendering errors:

```tsx
// Wrapped in src/main.tsx
<ErrorBoundary>
  <ThemeProvider>
    <AppProvider>
      <App />
    </AppProvider>
  </ThemeProvider>
</ErrorBoundary>
```

**Features:**
- Catches rendering errors and displays recovery UI
- Shows error details in development mode only
- Three recovery options: Refresh Page, Go to Home, Try Again
- Styled with M3E glassmorphism

### Code Splitting & Lazy Loading

Heavy components are lazy-loaded for faster initial page load:

```tsx
// src/App.tsx
const Admin = lazy(() => import('./components/Admin'));
const LearnPage = lazy(() => import('./components/learn/LearnPage'));
const CameraPage = lazy(() => import('./components/camera/CameraPage'));

// Usage with Suspense
<Suspense fallback={<PageLoader />}>
  <Admin />
</Suspense>
```

**Lazy-loaded components:**
- `Admin` - Admin dashboard (~11KB gzipped)
- `LearnPage` - Learning feature (~12KB gzipped)
- `CameraPage` - Camera recognition (~400KB gzipped, includes TensorFlow.js)

### Memory Leak Prevention

Components use proper cleanup patterns:

```tsx
// Timer cleanup with refs
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, []);

// AbortController for fetch requests
const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  abortControllerRef.current = new AbortController();
  fetch(url, { signal: abortControllerRef.current.signal });
  return () => abortControllerRef.current?.abort();
}, []);
```

### Virtualization

SignBrowser uses IntersectionObserver for lazy rendering:

```tsx
const SignCard = memo(({ sign }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );
    // ...
  }, []);
});
```

---

## Accessibility Features

### Focus Indicators

Global focus styles in `src/styles/global.css`:

```css
:focus-visible {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px hsla(205, 90%, 55%, 0.2);
}
```

### ARIA Support

- `aria-disabled` used instead of `disabled` for locked levels (allows focus for screen readers)
- `aria-label` on all interactive elements
- `aria-live` regions for dynamic content updates
- Proper heading hierarchy

### Keyboard Navigation

- All interactive elements are keyboard accessible
- Skip links for main content
- Escape key closes modals
- Arrow key navigation in grids

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

---

## Theme System

### Auto Theme Detection

The app automatically follows system preference with manual override option:

```tsx
// src/contexts/ThemeContext.tsx
const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');

// System preference detection
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
```

**Theme Options:**
- `auto` - Follows system preference (default)
- `light` - Force light mode
- `dark` - Force dark mode
- `high-contrast` - Enhanced contrast for accessibility

### Theme Controls on Home Page

ThemeSwitcher is displayed in the global app header for easy access:

```tsx
// src/components/Layout.tsx
<ThemeSwitcher />
```

---

## Admin Dashboard

### Access

- URL: `/admin` or append `?admin=true` to any URL
- Password: Set via `ADMIN_PASSWORD` environment variable (default: `admin123` in development)

### Features

- **Feedback Management** - View, filter, search all user feedback
- **Analytics Dashboard** - Unique users, popular searches, usage patterns
- **Privacy-Preserving** - All user data anonymized with IP hashing

### Styling

Admin uses the same Calm design system with glassmorphism effects matching the rest of the app. See `src/components/Admin.css` for styling.
