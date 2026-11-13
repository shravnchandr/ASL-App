# Production & Deployment

## Bundle Sizes

```
dist/assets/CameraPage.css            15.86 kB │ gzip:   3.19 kB  (lazy)
dist/assets/Admin.css                 20.89 kB │ gzip:   3.40 kB  (lazy)
dist/assets/LearnPage.css             62.58 kB │ gzip:   8.15 kB  (lazy)
dist/assets/index.css                 93.13 kB │ gzip:  14.33 kB
dist/assets/Admin.js                  12.26 kB │ gzip:   3.07 kB  (lazy)
dist/assets/CameraPage.js             16.14 kB │ gzip:   4.79 kB  (lazy)
dist/assets/api.js                    35.79 kB │ gzip:  14.00 kB
dist/assets/LearnPage.js              45.87 kB │ gzip:  12.11 kB  (lazy)
dist/assets/vendor.js                139.62 kB │ gzip:  45.02 kB
dist/assets/index.js                 510.96 kB │ gzip: 160.58 kB
dist/assets/useSoundEffects.js     1,006.30 kB │ gzip: 258.62 kB  (lazy, TF.js)
Initial load (gzipped): ~222 kB (Admin, Learn & Camera lazy loaded)
```

---

## Production Optimizations

- **Security headers** — CSP (production only), HSTS, X-Frame-Options, X-Content-Type-Options (`middleware.py`)
- **Code splitting** — separate vendor, API, and lazy-loaded bundles (Admin, Learn, Camera)
- **Terser minification** — console removal in production builds
- **PWA** — Service Worker with cache-first for sign data and ML models, stale-while-revalidate for app shell, network-only for API calls
- **Rate limiting** — 100 requests/minute per IP in production (10/minute in development)
- **Gemini context caching** — ~73% reduction on grammar agent input token cost (see [caching.md](caching.md))
- **Dual-layer translation caching** — Redis + in-memory LRU fallback
- **Health check** — `/health` endpoint used by Docker and host health checks

---

## PostgreSQL

The app uses SQLite by default. On a host without a persistent disk, the SQLite file (feedback, analytics, daily quotas) is lost on every deploy.

To use PostgreSQL, set `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname`. No code changes are needed: all queries use `func.date()` and SQLite-compatible syntax, so both drivers work.

---

## Deployment Notes

The app is not currently deployed anywhere. To host it, build the Docker image (`Dockerfile`, multi-stage, 5–10 minutes) and set the environment variables from `.env.example`, including `CORS_ORIGINS` for the public domain.

When it has a public URL again, restore the absolute URLs that search engines and link previews need: a canonical link, `og:url`, absolute `og:image` / `twitter:image` and JSON-LD `url` in `index.html`, plus a `public/sitemap.xml` referenced from `public/robots.txt`. Then verify the domain in Google Search Console (the verification file `public/googleed041497d630e95f.html` is still in place).
