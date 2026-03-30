# 🤟 ASL Learning Assistant

A modern, production-ready web application that helps you learn American Sign Language with AI-powered sign breakdowns. Get detailed descriptions of hand shapes, movements, facial expressions, and more to supplement your ASL studies. Built with Material 3 Expressive design featuring an Ocean Blue and Teal color palette.

**Note:** This is a study tool that generates AI-powered text descriptions. Always verify signs with video tutorials and practice with fluent signers for accurate learning.

[![Material 3](https://img.shields.io/badge/Material%203-Expressive-blue)](https://m3.material.io/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3+-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ✨ Features

### Core Functionality
- 🔤 **ASL Sign Breakdowns** - Detailed descriptions with beginner-friendly language: "How to Form Your Hands", "Where to Place Your Hands", "How to Move", "Facial Expressions & Body Language"
- 📖 **Grounded Sign Descriptions** - All 100 signs (alphabet, numbers, months, common vocabulary) are backed by a verified knowledge base sourced from Lifeprint/ASLU. Exact matches are looked up directly; synonyms and near-matches (e.g. "glad" → happy) can be resolved via semantic similarity search using sentence-transformers (opt-in, requires `ENABLE_SEMANTIC_LOOKUP=true`)
- 🔡 **Fingerspelling Guide** - Proper nouns (names, cities, brands) are automatically identified via `fs-` gloss prefix and shown with a collapsible letter-by-letter breakdown directly on the sign card — each letter displays its ASL hand shape description. Detection is deterministic (Python post-processing), not dependent on LLM output
- 🔤 **Advanced ASL Grammar Engine** - Grammar Agent applies 10 documented ASL grammar rules: TTC structure, topicalization, wh-question formation, negation placement, conditionals, verb directionality, aspect, and classifiers
- 🎥 **Video Resource Links** - Direct links to Handspeak, ASL University, and YouTube for each sign to watch proper demonstrations
- 📚 **Search History & Favorites** - Save and quickly access frequently used phrases with browser local storage
- 🔗 **Share, Print & Export** - Share sign breakdowns via Web Share API, print-optimized views, or export to PDF
- 🔑 **Shared API Key** - Try the app immediately with our shared API key (10 free translations/day per IP) - no setup required!
- 💾 **Feedback System** - Rate translations and provide feedback stored in database
- 🎯 **Admin Dashboard** - Password-protected admin panel for managing feedback and viewing analytics
- 📊 **User Analytics** - Privacy-preserving analytics tracking unique users, popular searches, and usage patterns with IP hashing

### Interactive Learning
- 🎓 **Level-Based Learning** - 10 progressive levels with unlock mechanics (80% mastery to advance)
- 🤖 **100 Animated Signs** - MediaPipe landmark-based stick figure animations (26 letters, 10 numbers, 12 months, 52 common signs)
- 📖 **Sign Library** - Browse all available signs with search, category filters, and lazy loading
- 🎮 **Four Exercise Types** - Sign-to-Word (easiest), Word-to-Sign (medium), Recall (hardest), and Camera Practice
- 📈 **Progress Tracking** - XP system, per-sign mastery, level completion, and day streaks
- ⚡ **Playback Controls** - Adjustable animation speed (0.5x, 1x, 1.5x) with play/pause
- 🏆 **Level Progression** - Alphabet → Numbers → Greetings → Family → Feelings → Actions → Questions → Time → Places → Months

### Live Camera Recognition
- 📸 **Real-Time Detection** - Live ASL fingerspelling and number recognition using your camera
- 🤖 **TensorFlow.js Classifier** - Browser-based ML model (95.5% accuracy on 36 classes: A-Z letters + 0-9 numbers)
- 🖐️ **MediaPipe Hands** - Real-time hand landmark detection with visual overlay
- 📝 **Spelling Mode** - Hold a sign for 1 second to add letters and spell words
- 🔊 **Sound Effects** - Optional audio feedback when letters are added
- 📋 **Copy & Speak** - Copy spelled words to clipboard or use text-to-speech
- 📱 **Mobile Support** - Front/back camera switching for phone use
- ♿ **Accessible** - Screen reader announcements, keyboard navigation
- 🎓 **Tutorial** - First-time user onboarding with step-by-step guide
- 📊 **Session Stats** - Track signs recognized and session duration

### User Experience
- 🎨 **Material 3 Expressive UI** - Glassmorphism, colored shadows, gradient accents, and spring physics animations
- 🌙 **Auto Theme** - Automatically follows system preference, or choose Light, Dark, and High Contrast modes
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile (single-column on small phones)
- ⚡ **Fast & Optimized** - Lazy loading, code splitting, memoization, and Redis caching
- 📄 **PDF Export** - Download lightweight (~16KB), professionally formatted PDFs of translation results for offline reference
- 🛡️ **Error Recovery** - React Error Boundary catches crashes with recovery UI

### Security & Privacy
- 🔑 **Custom API Key Support** - Use your own free Google Gemini API key (stored locally)
- 🔒 **Security Headers** - Comprehensive security headers (CSP, HSTS, X-Frame-Options)
- 🧹 **XSS Protection** - DOMPurify sanitization utilities for user content
- 🚫 **No Data Collection** - All data stays in your browser or your own database
- 🛡️ **Rate Limiting** - Built-in API rate limiting to prevent abuse

### Accessibility
- ♿ **WCAG Compliant** - Full keyboard navigation and screen reader support
- 🎯 **Visible Focus Indicators** - Clear focus rings for keyboard navigation
- 👁️ **High Contrast Mode** - Enhanced contrast for visual accessibility
- 🔍 **Text Resizing** - Support for browser zoom and text resizing
- 🔊 **Screen Reader Friendly** - Proper ARIA labels, roles, and live regions
- ⚡ **Reduced Motion** - Respects `prefers-reduced-motion` preference

### Developer Features
- 🐳 **Docker Support** - Multi-stage Docker build for easy deployment
- 📊 **Structured Logging** - JSON logging for production monitoring
- 🔄 **Auto-Deploy** - Render.com integration with PR previews
- 🧪 **Comprehensive Testing** - Backend tests with pytest (28 passing tests, 53% coverage)
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

📖 **API Guide:** See [GEMINI.md](./GEMINI.md) for Google Gemini setup details

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
- **jsPDF** - Lightweight PDF generation
- **TensorFlow.js** - Browser-based ML inference for ASL classification
- **MediaPipe Hands** - Real-time hand landmark detection

### Backend
- **FastAPI** - Modern Python web framework with modular routing (`routes/translate.py`, `routes/feedback.py`, `routes/admin.py`)
- **Python 3.11+** - Programming language
- **Google Gemini AI** - LLM for ASL translation
- **LangGraph** - Agentic workflow orchestration (`python_code/asl/` package: schemas, knowledge base, nodes, graph)
- **sentence-transformers** - Local semantic similarity for knowledge base lookup (all-MiniLM-L6-v2, opt-in via `ENABLE_SEMANTIC_LOOKUP=true`)
- **SQLAlchemy** - Async ORM (`db/` package: engine, models, CRUD modules)
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

**Bundle Size (with code splitting):**
```
dist/index.html                        1.09 kB │ gzip:   0.55 kB
dist/assets/CameraPage.css            15.86 kB │ gzip:   3.19 kB  (lazy)
dist/assets/Admin.css                 20.89 kB │ gzip:   3.40 kB  (lazy)
dist/assets/LearnPage.css             60.63 kB │ gzip:   7.31 kB  (lazy)
dist/assets/index.css                 90.74 kB │ gzip:  14.06 kB
dist/assets/Admin.js                  12.25 kB │ gzip:   3.07 kB  (lazy)
dist/assets/CameraPage.js             17.59 kB │ gzip:   5.24 kB  (lazy)
dist/assets/purify.js                 22.58 kB │ gzip:   8.47 kB
dist/assets/api.js                    35.79 kB │ gzip:  14.00 kB
dist/assets/LearnPage.js              48.57 kB │ gzip:  13.46 kB  (lazy)
dist/assets/vendor.js                139.62 kB │ gzip:  45.02 kB
dist/assets/index.js                 447.68 kB │ gzip: 140.72 kB
dist/assets/predictionBuffer.js    1,004.27 kB │ gzip: 257.86 kB  (lazy, TF.js)
Initial load (gzipped): ~222 kB (Admin, Learn & Camera lazy loaded)
```

---

## 📚 Documentation

- **[GEMINI.md](./GEMINI.md)** - Google Gemini API setup and configuration guide
- **[CLAUDE.md](./CLAUDE.md)** - Development guide for Claude Code (includes Learning Feature architecture)

### Sign Data

The app includes 100 pre-extracted sign animations in `public/sign-data/`:
- **26 alphabet letters** (A-Z fingerspelling)
- **10 numbers** (one through ten)
- **12 months** (January-December)
- **52 common signs** (greetings, family, feelings, actions)

To add more signs, see the "Adding New Signs" section in [CLAUDE.md](./CLAUDE.md).

## 🔧 Advanced Features

### Admin Dashboard
Access the admin panel at `/admin` or add `?admin=true` to your URL. Features include:
- **Feedback Management** - View and manage all user feedback submissions
- **Filter & Search** - Filter by rating (thumbs up/down), type, and category
- **Analytics Dashboard** - View detailed analytics with visualizations:
  - Unique users (today, 7 days, 30 days)
  - Total translations and cache hit rates
  - Popular searches (top 10 queries)
  - Daily active users chart
  - Hourly usage patterns
- **Privacy-Preserving** - All user data is anonymized with IP hashing
- **Secure Access** - Password-protected with admin authentication

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
- **Lightweight files** - ~16KB per PDF using jsPDF text API
- **Professional formatting** - Clean layout with headers, borders, and sign cards
- **Complete content** - All sign details (hand shape, location, movement, non-manual markers)
- **Multi-page support** - Automatic page breaks for long translations
- **Dark, readable text** - High contrast black text on white background
- **Optimized for printing** - Perfect for offline reference and archiving

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
- **Bill Vicars / Lifeprint (ASLU)** - ASL education reference used for the verified sign knowledge base

---

## 📧 Contact & Support

- **Issues:** [GitHub Issues](https://github.com/shravnchandr/ASL-App/issues)
- **Discussions:** [GitHub Discussions](https://github.com/shravnchandr/ASL-App/discussions)

---

**Built with ❤️ for the ASL community**
