# Render Deployment Setup

This guide explains how to deploy the ASL Dictionary application on Render with PostgreSQL and Redis.

## Prerequisites

- A Render account (https://render.com)
- GitHub repository connected to Render

## Step 1: Create PostgreSQL Database

1. Go to Render Dashboard → **New** → **PostgreSQL**
2. Configure:
   - **Name**: `asl-dictionary-db`
   - **Database**: `asl_dictionary`
   - **User**: (auto-generated)
   - **Region**: Choose closest to your users
   - **Plan**: Free or paid based on needs
3. Click **Create Database**
4. Copy the **Internal Database URL** (starts with `postgresql://`)

## Step 2: Create Redis Instance

1. Go to Render Dashboard → **New** → **Redis**
2. Configure:
   - **Name**: `asl-dictionary-cache`
   - **Region**: Same as your database
   - **Plan**: Free (25MB) or paid
   - **Maxmemory Policy**: `allkeys-lru` (recommended for caching)
3. Click **Create Redis**
4. Copy the **Internal Redis URL** (starts with `redis://`)

## Step 3: Deploy Web Service

1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `asl-dictionary-api`
   - **Region**: Same as database and Redis
   - **Branch**: `main`
   - **Root Directory**: (leave empty)
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn app:app --host 0.0.0.0 --port $PORT
     ```
   - **Plan**: Free or paid based on needs

4. **Environment Variables** (click "Advanced" → "Add Environment Variable"):

   ### Required
   ```
   GOOGLE_API_KEY=your_google_gemini_api_key_here
   ADMIN_PASSWORD=your_strong_admin_password_here
   ENVIRONMENT=production
   ```

   ### Database (copy from Step 1)
   ```
   DATABASE_URL=postgresql+asyncpg://user:password@host:5432/dbname
   ```
   **Important**: Replace `postgresql://` with `postgresql+asyncpg://` in the URL from Render

   ### Redis (copy from Step 2)
   ```
   REDIS_URL=redis://red-xxxxx:6379
   CACHE_TTL=3600
   ```

   ### Optional
   ```
   LOG_LEVEL=INFO
   LOG_FORMAT=json
   RATE_LIMIT=10/minute
   ```

5. Click **Create Web Service**

## Step 4: Deploy Frontend (Optional)

If you want to deploy the frontend separately:

1. Go to Render Dashboard → **New** → **Static Site**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `asl-dictionary-frontend`
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Publish Directory**: `dist`
   - **Add Environment Variable**:
     ```
     VITE_API_URL=https://asl-dictionary-api.onrender.com
     ```

4. Click **Create Static Site**

## Step 5: Configure CORS

After deployment, update the backend's `CORS_ORIGINS` environment variable:

```
CORS_ORIGINS=["https://your-frontend-url.onrender.com","https://asl-dictionary-api.onrender.com"]
```

Or update in `config.py`:
```python
cors_origins: List[str] = [
    "https://your-frontend-url.onrender.com",
]
```

## Verification

1. **Health Check**: Visit `https://your-app.onrender.com/health`
   - Should return: `{"status": "healthy", "environment": "production", ...}`

2. **API Docs**: Visit `https://your-app.onrender.com/docs`
   - Interactive API documentation

3. **Admin Panel**: Visit `https://your-frontend.onrender.com/admin`
   - Login with your `ADMIN_PASSWORD`
   - Check cache statistics to verify Redis is connected

4. **Test Translation**:
   - Translate a phrase twice
   - First time: ~2-3 seconds (API call)
   - Second time: <200ms (cached!)

## Monitoring

### Database Connections
- Render's free tier PostgreSQL allows 100 connections
- Our app uses async connection pooling

### Redis Usage
- Monitor in Render dashboard
- Free tier: 25MB storage
- Check cache hit ratio in admin panel

### Logs
- View in Render Dashboard → Your Service → Logs
- Structured JSON logging in production

## Cost Estimate

### Free Tier (Good for testing)
- PostgreSQL: Free (1GB storage, 100 connections)
- Redis: Free (25MB)
- Web Service: Free (750 hours/month)
- **Total: $0/month**

### Paid Tier (Production ready)
- PostgreSQL: $7/month (10GB storage)
- Redis: $10/month (256MB)
- Web Service: $7/month (512MB RAM)
- **Total: $24/month**

## Troubleshooting

### Redis Not Connecting
- Verify `REDIS_URL` format: `redis://host:port`
- Check Redis instance is in same region
- App will work without Redis (caching disabled)

### Database Connection Errors
- Ensure URL uses `postgresql+asyncpg://` (not `postgresql://`)
- Verify database is in same region
- Check connection limit not exceeded

### CORS Errors
- Update `CORS_ORIGINS` with your frontend URL
- Clear browser cache

## Performance Tips

1. **Enable Redis**: Reduces API costs and improves response time
2. **Use Same Region**: Place database, Redis, and web service in same region
3. **Monitor Cache Hit Rate**: Aim for >70% hit rate for frequently translated phrases
4. **Scale as Needed**: Upgrade Redis size if cache eviction rate is high

## Security Best Practices

1. Use strong `ADMIN_PASSWORD` (20+ characters, mixed case, numbers, symbols)
2. Never commit `.env` file or credentials to Git
3. Rotate `GOOGLE_API_KEY` periodically
4. Monitor admin panel access logs
5. Use Render's HTTPS by default (automatic)

## Backup Strategy

1. **Database**: Render provides automatic daily backups (paid plans)
2. **Redis**: Cache data is ephemeral (can be regenerated)
3. **Code**: Version controlled in GitHub

## Next Steps

- Set up custom domain (Render supports this)
- Configure monitoring alerts
- Set up staging environment
- Enable auto-deploy from main branch
