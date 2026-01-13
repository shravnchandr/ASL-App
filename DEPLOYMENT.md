# ASL Dictionary - Deployment Guide

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ and npm
- **Python** 3.11+
- **Docker** (optional, for containerized deployment)
- **Google Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))

---

## 📦 Local Development Setup

### 1. Clone and Install

```bash
cd /Users/shravnchandr/Projects/asl-app

# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Google API key:

```env
GOOGLE_API_KEY=your_actual_api_key_here
ENVIRONMENT=development
PORT=8000
RATE_LIMIT=10/minute
```

### 3. Run Development Servers

**Option A: Run separately (recommended for development)**

Terminal 1 - Backend:
```bash
python app.py
```

Terminal 2 - Frontend:
```bash
npm run dev
```

Visit: http://localhost:5173

**Option B: Use Docker Compose**

```bash
docker-compose up
```

Visit: http://localhost:5173 (frontend) or http://localhost:8000 (backend API)

---

## 🏗️ Production Build

### Build Frontend

```bash
npm run build
```

This creates a `dist/` directory with optimized static files.

### Test Production Build Locally

```bash
# Set environment to production
export ENVIRONMENT=production
export GOOGLE_API_KEY=your_api_key

# Run FastAPI (serves both API and frontend)
python app.py
```

Visit: http://localhost:8000

---

## 🐳 Docker Deployment

### Build Docker Image

```bash
docker build -t asl-dictionary .
```

### Run Docker Container

```bash
docker run -p 8000:8000 \
  -e GOOGLE_API_KEY=your_api_key \
  -e ENVIRONMENT=production \
  asl-dictionary
```

Visit: http://localhost:8000

---

## ☁️ Cloud Deployment

### Deploy to Render

1. **Create account** at [render.com](https://render.com)

2. **Create new Web Service**
   - Connect your GitHub repository
   - Select "Docker" as environment
   - Set environment variables:
     ```
     GOOGLE_API_KEY=your_api_key
     ENVIRONMENT=production
     PORT=8000
     ```

3. **Deploy**
   - Render will automatically build and deploy
   - Your app will be available at `https://your-app.onrender.com`

### Deploy to Railway

1. **Create account** at [railway.app](https://railway.app)

2. **New Project → Deploy from GitHub**
   - Select your repository
   - Railway auto-detects Dockerfile

3. **Add Environment Variables**
   ```
   GOOGLE_API_KEY=your_api_key
   ENVIRONMENT=production
   ```

4. **Deploy**
   - Railway provides a public URL automatically

### Deploy to Fly.io

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and Launch**
   ```bash
   fly auth login
   fly launch
   ```

3. **Set Secrets**
   ```bash
   fly secrets set GOOGLE_API_KEY=your_api_key
   fly secrets set ENVIRONMENT=production
   ```

4. **Deploy**
   ```bash
   fly deploy
   ```

---

## 🔒 Production Checklist

Before deploying to production, ensure:

- [ ] **Environment Variables Set**
  - `GOOGLE_API_KEY` configured
  - `ENVIRONMENT=production`
  - `RATE_LIMIT` configured (default: 10/minute)

- [ ] **CORS Origins Updated**
  - Edit `config.py` to add your production domain
  - Example: `cors_origins.append("https://yourdomain.com")`

- [ ] **Database Backup**
  - SQLite database is stored in `asl_feedback.db`
  - Set up regular backups if needed
  - For high traffic, consider migrating to PostgreSQL

- [ ] **Logging Configured**
  - Logs are written to `logs/` directory in production
  - Set up log rotation and monitoring

- [ ] **Health Check Endpoint**
  - Verify `/health` endpoint is accessible
  - Configure your hosting platform to use it

- [ ] **Rate Limiting Tested**
  - Test that rate limiting works (10 requests/minute default)
  - Adjust in `.env` if needed

- [ ] **SSL/HTTPS Enabled**
  - Most platforms (Render, Railway, Fly.io) provide this automatically

---

## 📊 Monitoring & Logs

### View Logs (Docker)

```bash
docker logs -f <container_id>
```

### View Logs (Local)

```bash
# Backend logs
tail -f logs/asl_api_*.log

# Or check console output
```

### Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "environment": "production",
  "app_name": "ASL Dictionary API"
}
```

### Feedback Statistics

```bash
curl http://localhost:8000/api/feedback/stats
```

---

## 🔧 Troubleshooting

### Frontend not loading in production

- Ensure `npm run build` completed successfully
- Check that `dist/` directory exists
- Verify `ENVIRONMENT=production` is set

### API errors

- Check `GOOGLE_API_KEY` is set correctly
- Verify API key has Gemini API access enabled
- Check rate limits haven't been exceeded

### Database errors

- Ensure write permissions for `asl_feedback.db`
- Check disk space availability

### CORS errors

- Add your frontend domain to `cors_origins` in `config.py`
- Rebuild and redeploy

---

## 🔄 Updating the Application

### Update Code

```bash
git pull origin main
```

### Update Dependencies

```bash
# Python
pip install -r requirements.txt --upgrade

# Node
npm install
```

### Rebuild and Deploy

```bash
# Docker
docker build -t asl-dictionary .
docker push your-registry/asl-dictionary

# Or use your platform's deployment command
```

---

## 📈 Scaling Considerations

### Database Migration (SQLite → PostgreSQL)

When traffic increases, migrate to PostgreSQL:

1. Update `config.py`:
   ```python
   database_url: str = "postgresql+asyncpg://user:pass@host/db"
   ```

2. Install asyncpg:
   ```bash
   pip install asyncpg
   ```

3. Migrate data using a migration tool

### Caching

Add Redis for caching frequent translations:
- Cache translation results for common phrases
- Reduce API calls to Gemini

### Load Balancing

For high traffic:
- Deploy multiple instances
- Use a load balancer (provided by most cloud platforms)
- Consider CDN for static assets

---

## 🆘 Support

For issues or questions:
- Check logs first
- Verify environment variables
- Test health endpoint
- Review API rate limits

---

## 📝 License & Credits

Built with:
- **FastAPI** - Modern Python web framework
- **React** - UI library
- **Material 3** - Design system
- **Google Gemini** - AI translation
- **LangGraph** - Agentic workflow

---

**Happy Deploying! 🚀**
