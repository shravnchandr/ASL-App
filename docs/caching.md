# Caching

The app uses three layers of caching at different points in the request lifecycle.

---

## Translation Cache (dual-layer)

Every `/translate` response is cached keyed by the lowercased query string.

### In-Memory LRU (always active)

- `_MemoryCache` in `cache.py` — OrderedDict-based LRU with TTL expiry
- Max 256 entries; entries expire based on `CACHE_TTL` (default: 3600 seconds)
- No configuration needed; works on free-tier hosts with no Redis

### Redis (optional, persists across restarts)

1. Set `REDIS_URL` in your environment (e.g. `redis://localhost:6379`)
2. Optionally set `CACHE_TTL` (seconds)
3. Writes go to both Redis and memory; reads check Redis first, then memory

Redis is optional — if unavailable, the app falls back to the in-memory cache transparently.

---

## Gemini Context Cache (pipeline-level)

The Grammar Agent's system prompt (~1,300 tokens) is uploaded to Gemini's server-side cache at app startup with a 24-hour TTL. Subsequent requests reference the cache token instead of re-sending the full prompt.

- Cached tokens are billed at 25% of the normal input rate — roughly a **73% reduction** on grammar agent input costs
- Falls back to the inline prompt gracefully if the cache expires or is unavailable
- Bypassed automatically for custom API key requests (the cache is tied to the server key)
- **Changing `_GRAMMAR_SYSTEM_PROMPT` in `pipeline.py` invalidates the cache** — it recreates automatically on the next request after a restart

Cache hit rate and lifetime token stats are exposed via `asl_graph.get_stats()` and logged per-request to stdout.

---

## Frontend Session Cache

Translation results are cached in `sessionStorage` keyed by `asl_result:<lowercased-query>`. On every new search, the cache is checked before hitting the backend. Refreshing the page restores results instantly without a re-call.
