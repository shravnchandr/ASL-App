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

1. **User Input** → Frontend (React) → `src/services/api.ts` → axios request
2. **Backend API** → FastAPI (`app.py`) → Rate limiting check → Route handler
3. **AI Processing** → LangGraph workflow (`python_code/asl_dict_langgraph.py`)
4. **Grammar Agent** → Analyzes English input, determines if reordering needed (ASL uses Time-Topic-Comment structure)
5. **Translation Agent** → Generates detailed ASL sign descriptions (hand shape, location, movement, facial expressions)
6. **Response** → FastAPI → Frontend → Display in SignCard components

### Backend Architecture (Python/FastAPI)

**Core Entry Point:** `app.py`
- FastAPI application with async/await support
- Lifespan events: Initialize database and LangGraph on startup
- Rate limiting: SlowAPI with IP-based tracking (10/min dev, 100/min prod)
- Security middleware: Adds CSP, HSTS, X-Frame-Options headers
- **CRITICAL**: Production mode serves static files from `dist/` directory
  - `/assets/*` mounted BEFORE catch-all route to prevent interception
  - Catch-all `/{full_path:path}` returns `index.html` for SPA routing

**Configuration:** `config.py`
- Pydantic BaseSettings for environment-based config
- CORS origins list (add production domain here!)
- Database URL, API keys, logging config
- Cached with `@lru_cache()` for performance

**Database:** `database.py`
- Async SQLAlchemy with aiosqlite
- `Feedback` model: Stores translation feedback and general app feedback
- IP addresses are hashed (SHA-256) for privacy
- Two feedback types: "translation" and "general"

**AI Workflow:** `python_code/asl_dict_langgraph.py`
- LangGraph state machine with two agents:
  1. **Grammar Agent**: Analyzes English input, determines if ASL TTC reordering needed
  2. **Translation Agent**: Generates detailed sign descriptions using structured output
- Uses Google Gemini 2.5 Flash model
- Built at startup and stored in `app.state.asl_graph`
- Invoked via `asl_graph.invoke({"english_input": text})`

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
- `src/components/SignCard.tsx`: Displays individual ASL sign descriptions
- `src/components/FeedbackWidget.tsx`: Rating system (thumbs up/down)
- `src/components/features/`: Feature-specific components (ApiKeyModal, ThemeSwitcher, etc.)

**API Layer:** `src/services/api.ts`
- Axios instance with 30s timeout (AI processing takes time)
- `setCustomApiKey()`: Sets `X-Custom-API-Key` header for requests
- All API calls go to `/api/*` prefix
- Dev mode: Proxied to localhost:8000 via Vite config
- Prod mode: Same-origin requests to FastAPI

**Utilities:**
- `src/utils/storage.ts`: LocalStorage wrapper (search history, favorites, theme, API key)
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

1. Add Pydantic request/response models in `app.py`
2. Create route handler with `@app.post()` or `@app.get()`
3. Add `@limiter.limit(settings.rate_limit)` decorator for rate limiting
4. Use `async def` and `await` for all database operations
5. Add corresponding function in `src/services/api.ts`
6. Update TypeScript types in `src/types.ts`

### Modifying AI Translation Logic

The LangGraph workflow in `python_code/asl_dict_langgraph.py`:
- Two-agent system: Grammar → Translation
- Uses Pydantic structured output for type safety
- State flows through `ASLState` TypedDict
- Modify prompts in `grammar_planner_node()` and `translation_node()`
- Always test with various phrase types (questions, statements, temporal phrases)

### Static File Serving Issues

If CSS/JS files don't load in production:
1. Check that `/assets` mount happens BEFORE catch-all route
2. Verify `dist/` directory exists and contains `assets/` subdirectory
3. Check catch-all route explicitly excludes `assets/` prefix
4. Look for 404s in browser Network tab

### CORS Configuration

Production domains must be added to `config.py` line 32-35:
```python
if environment == "production":
    cors_origins.extend([
        "https://your-domain.com",
    ])
```

Or set `CORS_ORIGINS` environment variable as JSON array.

### Rate Limiting

- Development: 10 requests/minute per IP
- Production: 100 requests/minute per IP
- Uses SlowAPI with in-memory storage
- For scaling, migrate to Redis-backed rate limiting

### Security Headers

Configured in `app.py` middleware (lines 76-98):
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
6. **Import errors**: LangGraph code is in `python_code/`, must be in sys.path

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

## Key Files Reference

- `app.py`: FastAPI application, routes, middleware
- `python_code/asl_dict_langgraph.py`: AI translation workflow
- `config.py`: Environment configuration
- `database.py`: Database models and operations
- `src/App.tsx`: Main React component
- `src/services/api.ts`: API client
- `vite.config.ts`: Build configuration, dev proxy
- `Dockerfile`: Multi-stage production build
- `render.yaml`: Render.com deployment config

## Tech Stack Summary

- **Frontend**: React 18.3, TypeScript 5.9, Vite 7, Material 3 Design
- **Backend**: FastAPI, Python 3.11+, uvicorn
- **AI**: Google Gemini 2.5 Flash, LangGraph, LangChain
- **Database**: SQLAlchemy (async), aiosqlite/PostgreSQL
- **Deployment**: Docker, Render.com
