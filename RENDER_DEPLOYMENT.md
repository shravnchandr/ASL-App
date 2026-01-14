# Deploy ASL Dictionary to Render.com

Complete guide for deploying your ASL Dictionary app to Render.com with automatic deployments and PR previews.

---

## 🚀 Quick Start

### Prerequisites

1. **GitHub Account** - Your code must be in a GitHub repository
2. **Render Account** - Sign up at [render.com](https://render.com) (free)
3. **Google Gemini API Key** - Get one at [makersuite.google.com](https://makersuite.google.com/app/apikey)

---

## Step-by-Step Deployment

### Step 1: Push Your Code to GitHub

If you haven't already, push your code to GitHub:

```bash
# Make sure you're in the project directory
cd /Users/shravnchandr/Projects/asl-app

# Check git status
git status

# Add all changes (render.yaml, updated configs, etc.)
git add .

# Commit changes
git commit -m "Add Render.com deployment configuration"

# Push to GitHub
git push origin main
```

**⚠️ Important:** Make sure your `.env` file with the API key is NOT pushed (it's already in `.gitignore`).

---

### Step 2: Connect Render to GitHub

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **"New +"** in the top right
3. Select **"Blueprint"**
4. Click **"Connect GitHub"** and authorize Render
5. Select your repository: `asl-app`

Render will automatically detect your `render.yaml` file!

---

### Step 3: Configure Environment Variables

**CRITICAL:** You need to set your Google API key as a secret.

1. After connecting the repo, Render will show you the services defined in `render.yaml`
2. Before deploying, click on **"asl-dictionary"** service
3. Go to **"Environment"** tab
4. Find **"GOOGLE_API_KEY"** (it will show as "Not Set")
5. Click **"Generate"** or **"Add"** and paste your NEW API key
   ```
   GOOGLE_API_KEY=your_new_google_gemini_api_key_here
   ```
6. Click **"Save Changes"**

**All other environment variables** are already configured in `render.yaml`:
- ✅ ENVIRONMENT=production
- ✅ PORT=8000
- ✅ RATE_LIMIT=100/minute
- ✅ LOG_LEVEL=INFO
- ✅ LOG_FORMAT=json
- ✅ DATABASE_URL (SQLite)

---

### Step 4: Deploy!

1. Click **"Apply"** to create the service
2. Render will:
   - ✅ Build your Docker image
   - ✅ Run your FastAPI backend
   - ✅ Serve your React frontend
   - ✅ Run health checks
3. Wait 5-10 minutes for the first build

**Watch the build logs** in real-time on the Render dashboard.

---

### Step 5: Update CORS Origins

Once deployed, Render will give you a URL like:
```
https://asl-dictionary.onrender.com
```

You need to update CORS to allow requests from this domain:

#### Option A: Update via Render Dashboard (Easiest)

1. Go to your service in Render Dashboard
2. Click **"Environment"** tab
3. Find **"CORS_ORIGINS"**
4. Update to:
   ```json
   ["https://asl-dictionary.onrender.com","https://www.asl-dictionary.onrender.com"]
   ```
   *(Replace with your actual Render URL)*
5. Click **"Save Changes"**
6. Service will automatically redeploy

#### Option B: Update in Code

Edit `config.py` (lines 31-35):

```python
# Add production origins when deploying
if environment == "production":
    cors_origins.extend([
        "https://asl-dictionary.onrender.com",  # Your Render URL
    ])
```

Then commit and push:
```bash
git add config.py
git commit -m "Update CORS for Render deployment"
git push origin main
```

Render will **auto-deploy** when you push to `main`! 🎉

---

## 🎯 Your App is Live!

Visit your deployed app at:
```
https://asl-dictionary.onrender.com
```

Test these endpoints:
- **Frontend:** `https://asl-dictionary.onrender.com/`
- **Health Check:** `https://asl-dictionary.onrender.com/health`
- **API:** `https://asl-dictionary.onrender.com/api/translate`

---

## 🔄 Automatic Deployments

With `render.yaml`, you get automatic deployments:

### Auto-Deploy on Push
```bash
# Make changes to your code
git add .
git commit -m "Add new feature"
git push origin main

# Render automatically deploys! ✨
```

### PR Preview Environments
When you create a Pull Request:
1. Render automatically creates a **preview environment**
2. Each PR gets its own URL: `https://asl-dictionary-pr-123.onrender.com`
3. Test your changes before merging
4. Preview auto-deletes 7 days after PR is closed

**Example PR workflow:**
```bash
# Create a feature branch
git checkout -b feature/new-feature

# Make changes and push
git add .
git commit -m "Add new feature"
git push origin feature/new-feature

# Open PR on GitHub
# Render creates preview: https://asl-dictionary-pr-1.onrender.com
# Test the preview
# Merge PR → Automatically deploys to production
```

---

## ⚡ Render Free Tier Details

Your app uses Render's **Free Tier** with these limits:

### Free Tier Includes:
- ✅ **750 hours/month** of runtime (plenty for a single service)
- ✅ **Automatic HTTPS** with SSL certificate
- ✅ **Custom domain** support (optional)
- ✅ **Automatic deployments** from GitHub
- ✅ **PR preview environments**
- ✅ **Health checks** and monitoring
- ✅ **100GB bandwidth/month**

### Free Tier Limitations:
- ⚠️ **Spins down after 15 minutes** of inactivity (first request takes ~30 seconds to wake up)
- ⚠️ **512MB RAM** (sufficient for your app)
- ⚠️ **Shared CPU** (slower builds and responses)

### Upgrade to Paid Plan ($7/month):
- No spin-down (always running)
- More RAM and CPU
- Priority support

---

## 📊 Monitoring Your App

### View Logs

1. Go to Render Dashboard
2. Click on your service
3. Click **"Logs"** tab
4. See real-time logs in JSON format

### Monitor Health

Render automatically monitors your `/health` endpoint:
- If health check fails 3 times, service restarts
- Health checks run every 30 seconds

### Metrics

Render shows:
- CPU usage
- Memory usage
- Request count
- Response times

---

## 🗄️ Database Management

### Current Setup: SQLite
- Your app uses SQLite by default
- Database file: `asl_feedback.db`
- ⚠️ **Data persists** but is lost if you redeploy or service restarts

### Upgrade to PostgreSQL (Recommended for Production)

1. **Add PostgreSQL to `render.yaml`**

   Uncomment the database section in `render.yaml`:
   ```yaml
   databases:
     - name: asl-dictionary-db
       plan: free  # 256MB storage
       databaseName: asl_dictionary
       user: asl_user
       region: oregon
   ```

2. **Update DATABASE_URL**

   In `render.yaml`, change:
   ```yaml
   - key: DATABASE_URL
     value: ${{asl-dictionary-db.DATABASE_URL}}
   ```

3. **Commit and push**
   ```bash
   git add render.yaml
   git commit -m "Add PostgreSQL database"
   git push origin main
   ```

4. Render will automatically create and connect the database!

**PostgreSQL Free Tier:**
- 256MB storage
- 1GB data transfer/month
- Automatic backups (7 days retention)
- Connection pooling

---

## 🔒 Security Checklist

Before going live:

- [x] API key set as environment variable (not in code) ✅
- [x] `.env` file in `.gitignore` ✅
- [x] Security headers enabled ✅
- [x] CORS configured for your domain ✅
- [x] Rate limiting enabled (100/min) ✅
- [ ] Update CORS after getting Render URL
- [ ] Test all endpoints work
- [ ] Monitor logs for errors

---

## 🌐 Custom Domain (Optional)

Want to use your own domain instead of `*.onrender.com`?

1. Go to your service in Render Dashboard
2. Click **"Settings"** tab
3. Scroll to **"Custom Domain"**
4. Click **"Add Custom Domain"**
5. Enter your domain: `yourdomain.com`
6. Update your DNS settings with the provided values
7. Render automatically provisions SSL certificate

**DNS Configuration:**
```
Type: CNAME
Name: @ (or subdomain)
Value: asl-dictionary.onrender.com
```

---

## 🛠️ Troubleshooting

### Build Fails

**Check build logs:**
1. Go to Render Dashboard
2. Click on your service
3. Click **"Events"** tab
4. View build logs

**Common issues:**
- Missing dependencies → Check `package.json` and `requirements.txt`
- Docker build fails → Test locally with `docker build -t asl-app .`
- TypeScript errors → Run `npm run build` locally

### Service Won't Start

**Check runtime logs:**
1. View logs in dashboard
2. Look for Python errors

**Common issues:**
- Missing `GOOGLE_API_KEY` → Set in Environment tab
- Port misconfiguration → Should be 8000 (already set)
- Database connection issues → Check DATABASE_URL

### App is Slow

**Free tier spins down after 15 minutes:**
- First request after spin-down takes ~30 seconds
- Solution: Upgrade to paid plan ($7/month)

**Or keep it warm with a cron job:**
```bash
# Ping health endpoint every 10 minutes
*/10 * * * * curl https://asl-dictionary.onrender.com/health
```

### CORS Errors

**Update CORS origins:**
1. Environment tab → Edit CORS_ORIGINS
2. Or edit `config.py` and redeploy

### Database Lost After Redeploy

**SQLite data is ephemeral on Render:**
- Solution: Upgrade to PostgreSQL (see Database Management section)

---

## 📈 Scaling Your App

When your app grows:

### 1. Upgrade Service Plan
```
Free → Starter ($7/month)
  - Always running (no spin-down)
  - 512MB RAM
  - Shared CPU

Starter → Standard ($25/month)
  - 2GB RAM
  - Dedicated CPU
  - Faster performance
```

### 2. Add PostgreSQL
- Better performance for concurrent users
- Reliable data persistence
- Automatic backups

### 3. Add Redis (Optional)
- Cache frequent translations
- Reduce API calls to Gemini
- Speed up responses

### 4. Enable CDN
- Render includes Cloudflare CDN on paid plans
- Faster global delivery

---

## 📝 Render.yaml Configuration Explained

```yaml
services:
  - type: web              # Web service (API + frontend)
    name: asl-dictionary   # Service name in Render
    runtime: docker        # Uses your Dockerfile
    plan: free            # Tier: free, starter, standard, pro
    region: oregon        # Datacenter location

    dockerfilePath: ./Dockerfile
    dockerContext: .

    healthCheckPath: /health  # Render pings this endpoint

    envVars:              # Environment variables
      - key: ENVIRONMENT
        value: production

      - key: GOOGLE_API_KEY
        sync: false       # Must be set manually (secret)

    autoDeploy: true      # Auto-deploy on push to main

    previewsEnabled: true # Enable PR previews
    previewsExpireAfterDays: 7
```

---

## 🎓 Next Steps

1. **Deploy to Render** using the steps above
2. **Test your deployment** thoroughly
3. **Monitor logs** for any errors
4. **Set up custom domain** (optional)
5. **Upgrade to PostgreSQL** for persistent data
6. **Share your app** with users! 🎉

---

## 🆘 Getting Help

### Render Support
- [Render Documentation](https://render.com/docs)
- [Render Community Forum](https://community.render.com)
- [Render Discord](https://render.com/discord)

### Your App
- See `DEPLOYMENT.md` for general deployment info
- See `PRODUCTION_READY.md` for production checklist
- See `README.md` for app overview

---

## 📋 Quick Reference Commands

```bash
# Deploy to Render (after initial setup)
git add .
git commit -m "Deploy update"
git push origin main

# View logs locally
docker logs -f <container_id>

# Test build locally
docker build -t asl-dictionary .
docker run -p 8000:8000 -e GOOGLE_API_KEY=your_key asl-dictionary

# Test health endpoint
curl https://asl-dictionary.onrender.com/health

# Test API endpoint
curl -X POST https://asl-dictionary.onrender.com/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"hello"}'
```

---

**Ready to deploy?** Follow the steps above and your app will be live in minutes! 🚀

**Questions?** Check the Troubleshooting section or Render's documentation.

**Happy deploying!** ✨
