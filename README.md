# 🤟 ASL Dictionary Web Application

A production-ready web application that translates English phrases into detailed American Sign Language (ASL) descriptions using Google Gemini AI. Built with Material 3 Expressive design featuring an Ocean Blue and Teal color palette.

![ASL Dictionary](https://img.shields.io/badge/Material%203-Expressive-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green)
![React](https://img.shields.io/badge/React-18.3+-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)

---

## ✨ Features

- 🎨 **Material 3 Expressive UI** - Stunning Ocean Blue & Teal design with fluid animations
- 🔤 **ASL Translation** - Detailed sign descriptions including hand shapes, locations, movements, and facial expressions
- 📚 **Search History & Favorites** - Save and quickly access frequently used phrases
- 🔗 **Share & Print** - Share translations via Web Share API or print-optimized views
- 🔑 **Custom API Key** - Use your own free Google Gemini API key
- ♿ **Accessibility** - WCAG AAA compliant with high-contrast mode, text resizing, and full keyboard navigation
- 💾 **Feedback System** - Rate translations and provide feedback stored in SQLite database
- 🌙 **Dark Mode** - Light, Dark, and High Contrast themes
- ⚡ **Production Ready** - Rate limiting, structured logging, Docker support

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11+
- **Google Gemini API Key** - [Get one free here](https://makersuite.google.com/app/apikey)

### Installation

1. **Clone and navigate to the project**:
   ```bash
   cd /Users/shravnchandr/Projects/asl-app
   ```

2. **Install dependencies**:
   ```bash
   # Frontend
   npm install
   
   # Backend (using your existing .venv)
   source .venv/bin/activate
   # Dependencies should already be installed in your .venv
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

### Running the Application

**⚠️ IMPORTANT: You need to run BOTH the backend and frontend!**

#### Terminal 1 - Backend (FastAPI)
```bash
source .venv/bin/activate
python app.py
```
✅ Backend will start on http://localhost:8000

#### Terminal 2 - Frontend (React + Vite)
```bash
npm run dev
```
✅ Frontend will start on http://localhost:5173

**Then visit**: http://localhost:5173

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

## 🆘 Troubleshooting

### Backend not connecting
**Error**: `ECONNREFUSED` when trying to translate

**Solution**: Make sure the backend is running:
```bash
source .venv/bin/activate
python app.py
```

### API key not working
**Error**: Translation fails even with API key

**Solutions**:
1. Verify your API key is correct
2. Check that Gemini API is enabled in Google Cloud Console
3. Ensure you haven't exceeded the free tier quota

---

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full documentation.
