# Admin Dashboard

## Access

- URL: `/admin` (or append `?admin=true` to any URL)
- Password: set via `ADMIN_PASSWORD` environment variable (default in development: `admin123`)

---

## Features

### Feedback Management

- View all user feedback submissions (translation ratings and general feedback)
- Filter by rating (thumbs up/down), feedback type, and category
- Delete individual feedback entries

### Analytics Dashboard

- **Unique users** — today, last 7 days, last 30 days (privacy-preserving: IP addresses are SHA-256 hashed)
- **Translation volume** — total requests and cache hit rates
- **Popular searches** — top 10 queries
- **Daily active users** — chart padded to 14 days
- **Hourly usage patterns** — traffic distribution across hours

---

## Implementation

- Routes: `routes/admin.py` — all `/admin/*` endpoints
- Analytics CRUD: `db/crud/analytics.py`
- Frontend: `src/components/Admin.tsx` + `src/components/Admin.css`
- API layer: `src/services/api/admin.ts`

All analytics data is anonymized. IP addresses are hashed at write time in `db/engine.py → hash_ip()` and never stored in plaintext.
