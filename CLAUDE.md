# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ASL Dictionary is a full-stack web application that translates English phrases into detailed American Sign Language (ASL) descriptions using Google Gemini AI. The app uses a React TypeScript frontend with Material 3 design and a FastAPI Python backend with LangGraph for AI workflow orchestration.

## Development Commands

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
3. **AI Processing** → LangGraph workflow (`python_code/asl/`)
4. **Grammar Agent** → Analyzes English input, determines if reordering needed (ASL uses Time-Topic-Comment structure)
5. **Translation Agent** → Generates detailed ASL sign descriptions (hand shape, location, movement, facial expressions)
6. **Response** → FastAPI → Frontend → Display in SignCard components

### Backend Architecture (Python/FastAPI)

**Entry Point:** `app.py` (~60 lines — slim orchestrator only)
- FastAPI setup, lifespan (database + Redis + LangGraph init), middleware registration, router includes, static file serving, uvicorn entry point
- **CRITICAL**: Production mode serves static files from `dist/` directory
  - `/assets/*` mounted BEFORE catch-all route to prevent interception
  - Catch-all `/{full_path:path}` returns `index.html` for SPA routing

**Shared Dependencies:** `deps.py`
- Single `Limiter` instance imported by both `app.py` and all route modules (avoids duplication)

**Middleware:** `middleware.py`
- `add_security_headers` — CSP (production only), HSTS, X-Frame-Options, X-Content-Type-Options
- `analytics_tracking_middleware` — records page views to the Analytics table in the background
- Both are registered in `app.py` via `app.middleware("http")(fn)`

**Routes:** `routes/` package
- `routes/models.py` — Pydantic request/response models (TranslateRequest, SignResponse, FeedbackRequest, …)
- `routes/translate.py` — `POST /translate` (LangGraph invocation, caching, shared-key rate limiting), `GET /rate-limit`
- `routes/feedback.py` — `POST /feedback`, `POST /feedback/general`, `GET /feedback/stats`
- `routes/admin.py` — `GET/DELETE /admin/feedback`, `GET /admin/stats`, `GET /admin/analytics/*`
- Included in `app.py` via `app.include_router(router, prefix=settings.api_prefix)`

**Configuration:** `config.py`
- Pydantic BaseSettings for environment-based config
- CORS origins list (add production domain here!)
- Database URL, API keys, logging config
- Cached with `@lru_cache()` for performance

**Database:** `db/` package (`database.py` is a backwards-compat shim that re-exports everything)
- `db/engine.py` — async engine, `AsyncSessionLocal`, `Base`, `init_db`, `get_db`, `hash_ip`
- `db/models.py` — `Feedback` and `Analytics` ORM models
- `db/crud/feedback.py` — `create_feedback`, `get_feedback_stats`, `get_paginated_feedback`, `get_recent_feedback`
- `db/crud/analytics.py` — `create_analytics_event`, `get_unique_users_count`, `check_shared_key_rate_limit`, and all aggregation queries
- IP addresses are hashed (SHA-256) for privacy; two feedback types: "translation" and "general"
- **Currently using SQLite in production** (switched from PostgreSQL when Render trial expired)
- SQLite file: `asl_feedback.db` — note Render's filesystem is **ephemeral**, so data resets on each deploy
- All queries use `func.date()` and SQLite-compatible syntax — no code changes needed to switch back
- To re-enable PostgreSQL: set `DATABASE_URL=postgresql+asyncpg://...` in `render.yaml` and uncomment the `databases:` block

**AI Workflow:** `python_code/asl/` package (`python_code/asl_dict_langgraph.py` is a backwards-compat shim)
- `asl/schemas.py` — Pydantic models (`DescriptionSchema`, `SentenceDescriptionSchema`, `GrammarPlanSchema`) and `ASLState` TypedDict
- `asl/knowledge_base.py` — KB loading, exact lookup, optional semantic lookup (`_build_knowledge_context`, `_extract_fs_glosses`, `_get_kb_matched_words`)
- `asl/nodes.py` — Grammar Agent (`grammar_planner_node`), Translation Agent (`sign_instructor_node`), reorder node, conditional edge
- `asl/graph.py` — `build_asl_graph()` compiles the LangGraph workflow
- `asl/cli.py` — interactive CLI for local testing (`python -m python_code.asl.cli`)
- LangGraph state machine with two agents:
  1. **Grammar Agent**: Applies 10 ASL grammar rules — TTC structure, function-word omission, negation placement, topicalization, wh-question formation, yes/no questions, conditionals, verb directionality, aspect, and classifiers
  2. **Translation Agent**: Generates detailed sign descriptions using structured output, grounded by the verified sign knowledge base. Also identifies proper nouns and sets `is_fingerspelled=true` + `fingerspell_letters` on those signs
- Uses Google Gemini 2.5 Flash model
- Built at startup and stored in `app.state.asl_graph`
- Invoked via `await asyncio.to_thread(asl_graph.invoke, {"english_input": text})` — runs in a thread pool to avoid blocking the async event loop

**Sign Knowledge Base:** `python_code/sign_knowledge_base.json`
- Verified hand shape, location, movement, and non-manual marker descriptions for all 100 signs (A-Z, 0-9, 12 months, 52 common signs)
- Sourced from Lifeprint/ASLU (Bill Vicars) and Gallaudet conventions
- Loaded once at module startup into `SIGN_KNOWLEDGE_BASE` dict
- `_build_knowledge_context()` extracts glosses from the Grammar Agent's output, looks up matches, and injects verified descriptions directly into the Translation Agent's system prompt
  - **Exact lookup first**: case-insensitive, handles hyphenated compounds (`THANK-YOU → thank_you`)
  - **Alphabet guard**: Single-letter KB keys (a-z) are collected into `_ALPHABET_KEYS` frozenset and **only match `fs-` prefixed glosses** (fingerspelling). Bare single-letter glosses like "I" (pronoun) or "A" (article) are routed to the "Signs to generate" section so the LLM describes the word sign, not the alphabet handshape. This prevents homograph collisions across all 26 letters.
  - **Translation Agent context-awareness**: The system prompt includes a `CRITICAL: CONTEXT-AWARE SIGN DESCRIPTIONS` section instructing the LLM that bare glosses are words/concepts, not alphabet letters. Includes explicit examples (e.g. "I" = pointing at chest, not pinky-up handshape).
  - **Semantic fallback** (opt-in): if exact match fails, `_semantic_lookup()` uses cosine similarity against embeddings of all 100 KB keys (via `all-MiniLM-L6-v2`) to resolve synonyms (e.g. `GLAD → happy`, `AUTOMOBILE → car`). Threshold: 0.60. Matched key and similarity score are logged and annotated in the prompt. Semantic matches to alphabet keys are also guarded.
  - **Disabled by default** — loading `sentence-transformers` uses ~200MB of RAM, which exceeds Render's free tier (512MB total). Enable with `ENABLE_SEMANTIC_LOOKUP=true` on plans with sufficient memory.
  - When enabled, embeddings are computed once at startup from `SIGN_KNOWLEDGE_BASE` keys and held in a numpy array (`_KB_EMBEDDINGS`) — no vector database needed
- Signs not in the knowledge base are explicitly flagged for LLM generation; matched signs (exact or semantic) instruct the LLM to copy descriptions faithfully

**Caching:** `cache.py`
- Dual-layer caching: Redis (when available) + in-memory LRU fallback
- `_MemoryCache` class: OrderedDict-based LRU with TTL expiry, max 256 entries
- Always writes to memory cache; also writes to Redis if connected
- Reads try Redis first, then memory cache
- Works without Redis configured (Render free tier has no Redis)
- `init_redis()` imports `redis.asyncio` lazily — no import error if redis package isn't installed

**Custom API Keys:**
- Users can provide their own Google Gemini API key
- Sent via `X-Custom-API-Key` header from frontend
- Temporarily swapped into `os.environ["GOOGLE_API_KEY"]` during request
- Original key restored after request completes

### Frontend Architecture (React/TypeScript)

**Entry Point:** `src/main.tsx` → `src/App.tsx`

**State Management:**
- `src/contexts/AppContext.tsx`: Global app state (search history, custom API key)
- `src/contexts/ThemeContext.tsx`: Theme state (light/dark/high-contrast)
- Local storage for persistence via `src/utils/storage.ts`

**Key Components:**
- `src/components/SearchBar.tsx`: Main search input with URL query param support
- `src/components/SignCard.tsx`: Displays individual ASL sign descriptions with compact/expanded toggle, embedded animations, and practice links. Skips loading letter animation files for single-letter non-fingerspelled words (prevents pronoun "I" from showing letter animation)
- `src/components/SentenceAnimator.tsx`: Plays sign animations in sequence for multi-sign results. Word chips show progress, skips single-letter non-fingerspelled words
- `src/components/DictionaryPage.tsx`: Main dictionary page with landing content (Sign of the Day, onboarding callout, quick-try chips, learn progress card, category cards) and post-search follow-up suggestions
- `src/components/FeedbackWidget.tsx`: Rating system (thumbs up/down)
- `src/components/features/`: Feature-specific components (ApiKeyModal, ThemeSwitcher, etc.)

**API Layer:** `src/services/api/` package (`src/services/api.ts` is a re-export shim — existing imports unchanged)
- `api/client.ts` — shared axios instance (30s timeout), `setCustomApiKey()`
- `api/translate.ts` — `translateToASL`, `getRateLimitStatus`, `checkHealth`
- `api/feedback.ts` — `submitFeedback`, `submitGeneralFeedback`, `getFeedbackStats`
- `api/admin.ts` — `getAdminFeedback`, `deleteAdminFeedback`, `getAdminStats`, `getAnalyticsOverview`
- `api/index.ts` — barrel re-export (all consumers import from `'../services/api'` as before)
- All API calls go to `/api/*` prefix; dev mode proxied to localhost:8000 via Vite config

**Utilities:**
- `src/utils/storage.ts`: LocalStorage wrapper with SM-2 spaced repetition (search history, favorites, theme, API key, learning progress with `easeFactor`, `interval`, `repetitions`, `nextReview`, and `getSignsDueForReview()`)
- `src/utils/signOfTheDay.ts`: Deterministic daily sign picker using date hash
- `src/utils/accessibility.ts`: Screen reader announcements
- `src/utils/print.ts`: Print-optimized layouts
- `src/utils/share.ts`: Web Share API integration

**Styling:**
- Material 3 Expressive design system
- Ocean Blue & Teal color palette
- CSS custom properties for theming (light/dark/high-contrast)
- All styles are component-scoped CSS files

### Production Serving

**CRITICAL UNDERSTANDING:** In production (`ENVIRONMENT=production`):

1. Vite builds frontend to `dist/` directory
2. FastAPI mounts `dist/assets/` as static files at `/assets`
3. FastAPI serves `dist/index.html` for root route `/`
4. **Catch-all route** `/{full_path:path}` handles SPA client-side routing
   - Explicitly checks for `api/` and `assets/` prefixes to avoid interception
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

The LangGraph workflow lives in `python_code/asl/`:
- Two-agent system: Grammar → Translation
- Uses Pydantic structured output for type safety
- State flows through `ASLState` TypedDict (defined in `asl/schemas.py`)
- Modify Grammar Agent prompt in `asl/nodes.py` → `_GRAMMAR_SYSTEM_PROMPT` constant
- Modify Translation Agent prompt in `asl/nodes.py` → `sign_instructor_node()`
- KB lookup and context injection logic is in `asl/knowledge_base.py`
- Always test with various phrase types (questions, statements, temporal phrases, negations, conditionals)

**`DescriptionSchema` fields:**
- `word`, `hand_shape`, `location`, `movement`, `non_manual_markers` — standard sign fields
- `is_fingerspelled: bool` — set `true` for proper nouns (names, cities, brands, abbreviations) that are fingerspelled letter by letter in ASL
- `fingerspell_letters: List[str]` — ordered uppercase letters, e.g. `['S','H','R','A','V','A','N']` for SHRAVAN

**How fingerspelling is detected (three layers):**
1. **Grammar Agent** — GLOSS CONVENTIONS require `fs-` prefix for all proper nouns (e.g. `fs-SHRAVAN`, `fs-BOSTON`). Examples are included in the prompt.
2. **`_build_knowledge_context`** — `fs-` prefixed glosses get a dedicated `FINGERSPELLING REQUIRED` section injected into the Translation Agent's context, with pre-computed letters and field values. The LLM copies these rather than reasoning about them.
3. **Post-processing in `sign_instructor_node`** — after the LLM responds, `_extract_fs_glosses()` scans the gloss sequence and force-sets `is_fingerspelled=True` and `fingerspell_letters` on matching signs in Python. This is deterministic and immune to LLM omission.

**Fingerspelling frontend rendering** (`src/components/SignCard.tsx`):
- When `is_fingerspelled` is true, a collapsible "Fingerspell" section appears below the sign details
- Letter chips display the full sequence at a glance (always visible)
- "Show letter guide" expands a `<dl>` list with each letter and its hand shape description
- Descriptions come from a static `LETTER_SHAPES` lookup table (A-Z) hardcoded in `SignCard.tsx` — no API call needed

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
- For scaling, migrate to Redis-backed rate limiting

### Security Headers

Configured in `middleware.py` → `add_security_headers`:
- CSP (Content Security Policy): Production only, allows inline styles/scripts
- HSTS: Enforces HTTPS
- X-Frame-Options: Prevents clickjacking
- X-Content-Type-Options: Prevents MIME sniffing

Modify CSP if adding external scripts or resources.

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

**Current production URL:** `https://asl-dictionary.onrender.com`
**Render service name:** `asl-guide` (display name only — does not affect URL)

**Do not change the URL yet.** The `asl-dictionary.onrender.com` URL has been shared with professors and changing it would break those links before they respond.

### When ready to migrate to `asl-guide.onrender.com` (or a custom domain):

All domain references are in exactly 4 files — do a global replace of `asl-dictionary.onrender.com` → new domain:

```bash
sed -i '' 's|asl-dictionary\.onrender\.com|NEW-DOMAIN|g' \
  public/sitemap.xml \
  public/robots.txt \
  public/og-image.svg \
  index.html
```

Then update Render environment variable:
- `CORS_ORIGINS` → `["https://NEW-DOMAIN"]`

Then re-verify Google Search Console for the new domain (the verification file `public/googleed041497d630e95f.html` is already deployed — just add the new property in Search Console and click Verify).

### SEO files in place (as of April 2026):
- `public/robots.txt` — allows all crawlers, points to sitemap
- `public/sitemap.xml` — covers `/`, `/dictionary`, `/learn`, `/camera`
- `public/og-image.svg` — 1200×630 social share image
- `public/googleed041497d630e95f.html` — Google Search Console verification
- `index.html` — JSON-LD (`WebSite` + `SearchAction` + `EducationalApplication`), og:image, keywords, canonical
- `src/components/DictionaryPage.tsx` — `?q=` param synced to URL (shareable search results)

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
- `database.py`: Backwards-compat shim — re-exports everything from `db/`

**Backend — AI (`python_code/asl/`):**
- `asl/schemas.py`: `DescriptionSchema`, `SentenceDescriptionSchema`, `GrammarPlanSchema`, `ASLState`
- `asl/knowledge_base.py`: KB loading, semantic lookup, `_build_knowledge_context`
- `asl/nodes.py`: `_GRAMMAR_SYSTEM_PROMPT` constant + all LangGraph node functions
- `asl/graph.py`: `build_asl_graph()` — compiles and returns the StateGraph
- `asl/cli.py`: Interactive CLI for local testing
- `python_code/sign_knowledge_base.json`: Verified sign descriptions for all 100 signs (grounding source)
- `python_code/asl_dict_langgraph.py`: Backwards-compat shim — re-exports from `asl/`

**Frontend Core:**
- `src/App.tsx`: Main React component with lazy loading
- `src/main.tsx`: Entry point with ErrorBoundary
- `src/services/api/client.ts`: Axios instance, `setCustomApiKey`, `API_PREFIX`
- `src/services/api/translate.ts`: `translateToASL`, `getRateLimitStatus`, `checkHealth`
- `src/services/api/feedback.ts`: `submitFeedback`, `submitGeneralFeedback`, `getFeedbackStats`
- `src/services/api/admin.ts`: `getAdminFeedback`, `deleteAdminFeedback`, `getAdminStats`, `getAnalyticsOverview`
- `src/services/api.ts`: Backwards-compat shim — re-exports from `api/index.ts`
- `src/components/ErrorBoundary.tsx`: Global error handling

**Learning Feature:**
- `src/components/learn/LearnPage.tsx`: Main learning page
- `src/components/learn/LevelCard.tsx`: Level card component
- `src/components/learn/LevelSelector.tsx`: Level selection grid
- `src/components/learn/CameraPracticeExercise.tsx`: Camera practice integration
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
- `src/hooks/useCamera.ts`: Camera stream management
- `src/hooks/useHandDetection.ts`: MediaPipe Hands integration
- `src/hooks/useASLClassifier.ts`: TensorFlow.js inference
- `src/hooks/useSoundEffects.ts`: Web Audio API sounds
- `src/utils/predictionBuffer.ts`: Rolling window smoothing
- `src/utils/handLandmarks.ts`: Landmark normalization
- `public/models/asl-classifier/`: TensorFlow.js model files

**Utilities:**
- `src/utils/sanitize.ts`: XSS protection with DOMPurify
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

**PWA:**
- `public/manifest.json`: Web App Manifest (name, icons, theme color, display mode)
- `public/sw.js`: Service Worker with three cache strategies:
  - App shell (stale-while-revalidate)
  - Sign data `/sign-data/*` (cache-first)
  - ML models `/models/*` (cache-first)
  - API calls `/api/*` (network-only)
- `index.html`: SW registration script, Open Graph + Twitter Card meta tags

**Configuration:**
- `vite.config.ts`: Build configuration, dev proxy, vitest config
- `Dockerfile`: Multi-stage production build
- `docker-compose.yml`: Development environment
- `render.yaml`: Render.com deployment config

## Tech Stack Summary

- **Frontend**: React 18.3, TypeScript 5.9, Vite 7, Vitest, Material 3 Design
- **Backend**: FastAPI, Python 3.11+, uvicorn
- **AI**: Google Gemini 2.5 Flash, LangGraph, LangChain, sentence-transformers (all-MiniLM-L6-v2)
- **Browser ML**: TensorFlow.js, MediaPipe Hands (Tasks Vision API)
- **Database**: SQLAlchemy (async), aiosqlite/PostgreSQL
- **Caching**: Redis (optional) + in-memory LRU fallback
- **Deployment**: Docker, Render.com, PWA (Service Worker + Web Manifest)

---

## ASL Learning Feature

The app includes a Duolingo-style learning feature with animated sign demonstrations using MediaPipe landmark data.

### App Modes (Home Page)

The app has three modes accessible from the home page (`/`):
1. **Text to Signs** (`/dictionary`) - AI-powered text translation to ASL instructions
2. **Learn Signs** (`/learn`) - Interactive exercises with animated sign demonstrations
3. **Live Camera** (`/camera`) - Real-time ASL fingerspelling recognition using browser camera

### Learning Feature Architecture

**Entry Points:**
- `src/components/HomePage.tsx` - Landing page with mode selection
- `src/components/learn/LearnPage.tsx` - Main learning page with exercises
- `src/components/learn/SignBrowser.tsx` - Sign library browser with search

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

// Camera feature keys
SOUND_EFFECTS_KEY: 'asl_sound_effects_enabled',  // Sound toggle
TUTORIAL_KEY: 'asl_camera_tutorial_seen',        // Tutorial completed
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

- Category filters: All, Alphabet, Numbers, Months, Common
- Search bar for quick sign lookup
- Play/pause animation previews
- "Press Play to View" placeholder for unloaded signs

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
- **Model Caching**: TensorFlow.js caches model in browser storage
- **Mounted Check**: `isMountedRef` prevents state updates after unmount

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

## Security Utilities

### XSS Protection with DOMPurify

The app includes sanitization utilities in `src/utils/sanitize.ts`:

```typescript
import { sanitizeHtml, sanitizeText, sanitizeUrl } from './utils/sanitize';

// Allow limited HTML tags
sanitizeHtml(userContent);  // Allows b, i, em, strong, br, p, span

// Strip all HTML
sanitizeText(userContent);  // Returns plain text only

// Block dangerous protocols
sanitizeUrl(url);  // Blocks javascript:, data:, vbscript:
```

**Usage:** Apply sanitization to any user-generated or API-provided content before rendering.

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

ThemeSwitcher is displayed on the home page header for easy access:

```tsx
// src/components/HomePage.tsx
<div className="home-page__controls">
  <ThemeSwitcher />
</div>
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

Admin uses M3 Expressive design with glassmorphism effects matching the rest of the app. See `src/components/Admin.css` for styling.
