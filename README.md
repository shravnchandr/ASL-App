# 🤟 ASL Dictionary Web Application

A modern, production-ready web application that translates English phrases into detailed American Sign Language (ASL) descriptions using Google Gemini AI. Built with Material 3 Expressive design featuring an Ocean Blue and Teal color palette.

[![Material 3](https://img.shields.io/badge/Material%203-Expressive-blue)](https://m3.material.io/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3+-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Production Ready](https://img.shields.io/badge/Production-Ready-success)](PRODUCTION_READY.md)

---

## ✨ Features

### Core Functionality
- 🔤 **ASL Translation** - Detailed sign descriptions including hand shapes, locations, movements, and facial expressions powered by Google Gemini AI
- 📚 **Search History & Favorites** - Save and quickly access frequently used phrases with browser local storage
- 🔗 **Share, Print & Export** - Share translations via Web Share API, print-optimized views, or export to PDF
- 💾 **Feedback System** - Rate translations and provide feedback stored in database
- 🎯 **Admin Dashboard** - Password-protected admin panel for managing feedback and viewing analytics

### User Experience
- 🎨 **Material 3 Expressive UI** - Stunning Ocean Blue & Teal design with fluid animations and micro-interactions
- 🌙 **Multiple Themes** - Light, Dark, and High Contrast modes for all lighting conditions
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- ⚡ **Fast & Optimized** - Production-optimized builds with code splitting, lazy loading, and Redis caching
- 📄 **PDF Export** - Download professional PDFs of translation results for offline reference

### Security & Privacy
- 🔑 **Custom API Key Support** - Use your own free Google Gemini API key (stored locally)
- 🔒 **Security Headers** - Comprehensive security headers (CSP, HSTS, X-Frame-Options)
- 🚫 **No Data Collection** - All data stays in your browser or your own database
- 🛡️ **Rate Limiting** - Built-in API rate limiting to prevent abuse

### Accessibility
- ♿ **WCAG AAA Compliant** - Full keyboard navigation and screen reader support
- 🔍 **Text Resizing** - Support for browser zoom and text resizing
- 🎯 **High Contrast Mode** - Enhanced contrast for visual accessibility
- ⌨️ **Keyboard Shortcuts** - Quick access to all features via keyboard

### Developer Features
- 🐳 **Docker Support** - Multi-stage Docker build for easy deployment
- 📊 **Structured Logging** - JSON logging for production monitoring
- 🔄 **Auto-Deploy** - Render.com integration with PR previews
- 🧪 **Comprehensive Testing** - Backend tests with pytest (13 passing tests)
- 💾 **Flexible Database** - SQLite for development, PostgreSQL for production with async support
- 🚀 **Redis Caching** - Optional Redis integration for faster repeat translations
- 🔒 **Admin Panel** - Secure admin dashboard for feedback management and analytics

---

## 🚀 Quick Start

### Option 1: Deploy to Render.com (Recommended)

**Fastest way to get your app online:**

1. **Push to GitHub** (if not already done)
2. **Go to [Render.com](https://dashboard.render.com)**
3. **New** → **Blueprint**
4. **Connect your GitHub repo**
5. **Set `GOOGLE_API_KEY`** in environment variables
6. **Deploy!**

Your app will be live in 5-10 minutes with automatic HTTPS, deployments, and PR previews!

📖 **Full Guide:** [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)

---

### Option 2: Local Development

#### Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11+
- **Google Gemini API Key** - [Get one free here](https://makersuite.google.com/app/apikey)

#### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/shravnchandr/ASL-App.git
   cd ASL-App
   ```

2. **Install dependencies**:
   ```bash
   # Frontend
   npm install

   # Backend
   pip install -r requirements.txt
   # Or use uv for faster installs: uv pip install -r requirements.txt
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Google Gemini API key:
   ```env
   GOOGLE_API_KEY=your_actual_api_key_here
   ENVIRONMENT=development
   PORT=8000
   ```

#### Running the Application

**⚠️ IMPORTANT: Run BOTH services simultaneously**

**Terminal 1 - Backend (FastAPI):**
```bash
python app.py
```
✅ Backend starts on http://localhost:8000

**Terminal 2 - Frontend (React + Vite):**
```bash
npm run dev
```
✅ Frontend starts on http://localhost:5173

**Open:** http://localhost:5173

---

### Option 3: Docker

```bash
# Build and run with Docker Compose
docker-compose up

# Or build manually
docker build -t asl-dictionary .
docker run -p 8000:8000 -e GOOGLE_API_KEY=your_key asl-dictionary
```

Visit: http://localhost:8000

---

## 🔑 Getting Your API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Get API Key" or "Create API Key"
4. Copy the generated key
5. In the app, click the key icon (🔑) in the header
6. Paste your API key and click "Save"

The API key is **free** and includes a generous free tier. Your key is stored only in your browser's local storage.

---

## 🛠️ Tech Stack

### Frontend
- **React 18.3** - UI library
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool with HMR
- **Material 3 Design** - Design system
- **Axios** - HTTP client
- **jsPDF & html2canvas** - PDF generation

### Backend
- **FastAPI** - Modern Python web framework
- **Python 3.11+** - Programming language
- **Google Gemini AI** - LLM for ASL translation
- **LangGraph** - Agentic workflow orchestration
- **SQLAlchemy** - ORM with async support
- **SQLite/PostgreSQL** - Database (SQLite for dev, PostgreSQL for production)
- **Redis** - Optional caching layer for improved performance
- **pytest** - Testing framework with async support

### DevOps
- **Docker** - Containerization
- **Render.com** - Cloud hosting with auto-deploy
- **GitHub Actions** - CI/CD ready
- **ESLint** - Code linting
- **Terser** - Production minification

---

## 📦 Production Optimizations

This app is production-ready with:

- ✅ **Security Headers** - CSP, HSTS, X-Frame-Options, XSS Protection
- ✅ **Code Minification** - Terser minification with console removal
- ✅ **Code Splitting** - Separate vendor and API bundles
- ✅ **Gzip Compression** - ~270KB total bundle size
- ✅ **Rate Limiting** - 100 requests/minute in production
- ✅ **Error Handling** - Comprehensive error handling and logging
- ✅ **Health Checks** - `/health` endpoint for monitoring
- ✅ **Docker Optimized** - Multi-stage builds for small images

**Bundle Size:**
```
dist/index.html            0.80 kB │ gzip:   0.43 kB
dist/assets/index.css     61.24 kB │ gzip:   9.53 kB
dist/assets/purify.js     22.58 kB │ gzip:   8.47 kB
dist/assets/api.js        35.79 kB │ gzip:  14.00 kB
dist/assets/vendor.js    139.10 kB │ gzip:  44.89 kB
dist/assets/index.js     633.40 kB │ gzip: 182.31 kB
Total (gzipped):        ~260 kB
```

---

## 📚 Documentation

- **[RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)** - Complete Render.com deployment guide
- **[PRODUCTION_READY.md](./PRODUCTION_READY.md)** - Production checklist and security report
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - General deployment options (Railway, Fly.io, etc.)
- **[SOCIAL_MEDIA_TEMPLATES.md](./SOCIAL_MEDIA_TEMPLATES.md)** - Marketing templates for social media

## 🔧 Advanced Features

### Admin Dashboard
Access the admin panel at `/admin` or add `?admin=true` to your URL. Features include:
- View all feedback submissions
- Filter by rating (thumbs up/down) and category
- View detailed analytics and statistics
- Secure password authentication
- Real-time feedback management

Set the `ADMIN_PASSWORD` environment variable to enable admin access.

### Redis Caching
Enable Redis caching for faster repeat translations:
1. Set `REDIS_URL` environment variable (e.g., `redis://localhost:6379`)
2. Optionally configure `CACHE_TTL` (default: 3600 seconds)
3. Translations are automatically cached and retrieved

Benefits:
- Instant responses for previously translated phrases
- Reduced API costs
- Better user experience

### PostgreSQL Database
For production deployments, use PostgreSQL instead of SQLite:
1. Set `DATABASE_URL` environment variable
2. The app automatically uses `postgresql+asyncpg://` driver
3. All async operations supported

Example: `DATABASE_URL=postgres://user:pass@host:5432/dbname`

### PDF Export
Users can export translation results to PDF with a single click:
- Professional formatting with header and date
- Includes all sign details and descriptions
- Multi-page support for long translations
- Optimized for printing and archiving

---

## 🆘 Troubleshooting

### Backend Not Connecting
**Error:** `ECONNREFUSED` when trying to translate

**Solution:**
1. Ensure backend is running on http://localhost:8000
   ```bash
   python app.py
   ```
2. Check backend logs for errors
3. Verify port 8000 is not in use by another service

### API Key Issues
**Error:** Translation fails even with API key

**Solutions:**
1. Verify your API key is correct (no extra spaces)
2. Check that Gemini API is enabled at [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Ensure you haven't exceeded free tier quota
4. Try regenerating a new API key
5. Clear browser cache and re-enter the key

### CORS Errors in Production
**Error:** CORS policy blocking requests

**Solution:**
1. Update `CORS_ORIGINS` environment variable with your domain
2. Or edit `config.py` to add your production URL
3. Redeploy the application

### Build Fails
**Error:** TypeScript or build errors

**Solution:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Try building
npm run build
```

### Docker Issues
**Error:** Container fails to start

**Solution:**
1. Ensure `GOOGLE_API_KEY` is set in environment
2. Check logs: `docker logs <container_id>`
3. Verify ports are available: `docker ps`

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Google Gemini** - AI-powered ASL translation
- **Material 3** - Beautiful design system
- **FastAPI** - Modern Python web framework
- **React Team** - Excellent UI library
- **LangGraph** - Agentic workflow orchestration

---

## 📧 Contact & Support

- **Issues:** [GitHub Issues](https://github.com/shravnchandr/ASL-App/issues)
- **Discussions:** [GitHub Discussions](https://github.com/shravnchandr/ASL-App/discussions)

---

**Built with ❤️ for the ASL community**
