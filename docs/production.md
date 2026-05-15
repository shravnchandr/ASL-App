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
- **Health check** — `/health` endpoint used by Render and Docker

---

## PostgreSQL

The app currently uses SQLite in production (Render PostgreSQL trial expired). Data resets on each deploy because Render's filesystem is ephemeral.

To re-enable PostgreSQL:

1. Set `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname` in `render.yaml` (or Render Dashboard environment variables)
2. Uncomment the `databases:` block in `render.yaml`
3. No code changes needed — the ORM and all queries are already compatible

All queries use `func.date()` and SQLite-compatible syntax to support both drivers without modification.

---

## Deployment Notes

- Push to `main` triggers auto-deploy on Render.com (via `render.yaml`)
- Build time: 5–10 minutes (Docker multi-stage)
- Check Render Dashboard logs for build/runtime errors

### Current URLs

| | URL |
|---|---|
| Production | `https://asl-guide.onrender.com` |
| Old URL (kept live for shared professor links) | `https://asl-dictionary.onrender.com` |

`render.yaml` and `config.py` still reference `asl-dictionary.onrender.com` and need updating. Override with the `CORS_ORIGINS` environment variable in the Render Dashboard in the meantime.

### Custom Domain Migration

Run the following sed command replacing `asl-guide.onrender.com` with the new domain:

```bash
sed -i '' 's|asl-guide\.onrender\.com|new-domain.com|g' \
  public/sitemap.xml \
  public/robots.txt \
  public/og-image.svg \
  index.html \
  render.yaml \
  config.py
```

Then update `CORS_ORIGINS` in the Render Dashboard and re-verify in Google Search Console (the verification file `public/googleed041497d630e95f.html` is already deployed).
