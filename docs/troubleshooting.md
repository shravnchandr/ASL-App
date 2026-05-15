# Troubleshooting

## Backend Not Connecting

**Error:** `ECONNREFUSED` when trying to translate

1. Make sure the backend is running: `python app.py` (should be on http://localhost:8000)
2. Check backend terminal for errors
3. Verify port 8000 is not in use by another process

## API Key Issues

**Error:** Translation fails even with an API key set

1. Confirm the key has no leading/trailing spaces
2. Check that the Gemini API is enabled at [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Verify you haven't exceeded free tier quota
4. Try regenerating a new key, clear browser cache, re-enter it in the app

## CORS Errors in Production

**Error:** CORS policy blocking requests

1. Update `CORS_ORIGINS` environment variable in the Render Dashboard with your domain
2. Or add the domain directly in `config.py` inside the `__init__` method (not at class body level)
3. Redeploy

## Build Fails

**Error:** TypeScript or Vite build errors

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Docker Issues

**Error:** Container fails to start

1. Ensure `GOOGLE_API_KEY` is set in the environment
2. Check logs: `docker logs <container_id>`
3. Verify the port is available: `docker ps`

## Static Files 404 in Production

CSS/JS not loading after deployment:

1. Confirm `dist/` was built (`npm run build`) before the Docker image was created
2. Check that `/assets` is mounted **before** the catch-all route in `app.py`
3. Look for 404s in the browser Network tab — the catch-all route may be intercepting asset requests

## Rate Limit in Development

If you hit the 10/minute dev rate limit, restart `python app.py` — the in-memory counter resets on restart.
