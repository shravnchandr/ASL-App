# 🤟 ASL Learning Assistant

A production-ready web app for learning American Sign Language — AI-powered sign breakdowns, animated demonstrations, and live camera recognition.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3+-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Note:** This is a study tool that generates AI-powered text descriptions. Always verify signs with video tutorials and practice with fluent signers for accurate learning.

![Home page showing Sign of the Day, lesson plan, and streak card](docs/screenshots/Home_Page.png)

---

## What it does

Type any English phrase and get a complete ASL breakdown: grammar-reordered gloss, plain-English signing instructions, animated demonstrations, and links to video resources. Browse the full sign library at `/dictionary` — 100 verified signs with category filters, A–Z sidebar, and live animation previews. A built-in learning module with spaced repetition and live camera recognition round out the app. The app is not hosted at the moment: run it locally with your own Gemini API key (see Quick Start), or host it yourself (see Hosting on Cloud Run).

---

## Key Features

**ASL Grammar Engine** — A two-agent Gemini pipeline applies 11 documented ASL grammar rules (Time-Topic-Comment structure, topicalization, wh-question formation, negation, conditionals, verb directionality, classifiers, and number conventions). A gloss bar shows the English → ASL reordering visually on every result.

**Verified Knowledge Base** — 100 signs (A-Z, 0–9, 12 months, 52 common signs) are backed by descriptions sourced from Lifeprint/ASLU. Each sign card shows a **Verified** or **AI generated** badge so you always know the source. Exact matches are looked up directly; synonyms can be resolved via optional semantic similarity search.

**Deterministic Fingerspelling** — Proper nouns are detected through a 3-layer pipeline (Grammar Agent gloss conventions → KB context injection → Python post-processing), not LLM output. Multi-word proper nouns like "New York City" collapse into a single fingerspelled token with a letter-by-letter breakdown on the sign card.

**100 Animated Signs** — MediaPipe landmark-based stick figure animations for the full alphabet, numbers, months, and common vocabulary. A sticky SentenceAnimator plays all signs in sequence with word chip progress indicators. The **Sign Dictionary** (`/dictionary`) lets you browse all 100 signs by category — including derived filters for Greetings (8), Family (5), and Verified only (100) — with an A–Z sidebar and live animation previews on click.

**SM-2 Spaced Repetition** — The learning module schedules signs for review using the SM-2 algorithm (ease factor, interval, repetitions). Ten progressive levels unlock at 80% mastery, with four exercise types ranging from multiple-choice to free recall and live camera practice. Sessions auto-save to localStorage so you can resume mid-session after navigating away — the level card shows "Resume session" when an incomplete session exists.

**Live Camera Recognition** — A TensorFlow.js classifier (95.5% accuracy, 36 classes: A–Z + 0–9) runs entirely in-browser via MediaPipe Hands (Tasks Vision API v0.10.32). Hold a sign for 1 second to add it to a spelled word — no server round-trip.

**Phrase Mode (experimental)** — The camera page's Phrases switch reads continuous signing: MediaPipe pose, hand and face landmarks feed a 250-sign CTC model running in the browser with ONNX Runtime Web. Each sign is shown with the model's score and runners-up, and low scores are marked "Not sure". Two models can be compared from a Model control (the default `phrases05` and the newer `phrases07`). This is an early research model trained on stitched single-sign clips and is not yet validated on real signing; attempts can be saved as landmark-only JSON (never video) for evaluation.

**Production Infrastructure** — Gemini context caching reduces grammar prompt token costs by ~73%. Dual-layer caching (Redis + in-memory LRU) handles repeat translations. PWA with Service Worker: the app shell, sign data and, after one online visit to each camera mode, the recognition models work offline (translation always needs the network). Rate limiting, security headers, and privacy-preserving analytics with IP hashing.

---

## Screenshots

| Home | Translate | Learn | Camera |
|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/Home_Page.png" width="220" alt="Home page with Sign of the Day, lesson plan, and streak"> | <img src="docs/screenshots/Translation_Results.gif" width="220" alt="Translate results showing ASL gloss order, verified sign cards, and sentence animation"> | <img src="docs/screenshots/Learn_Page.gif" width="220" alt="Sign-to-word exercise with animated sign playing and multiple choice answers"> | <img src="docs/screenshots/Camera_Page.png" width="220" alt="Live camera recognizing the letter O with MediaPipe landmark overlay"> |

---

## Quick Start

### Prerequisites

- Node.js 20+, Python 3.11+
- [Google Gemini API key](https://makersuite.google.com/app/apikey) (free tier available)

### Local Development

```bash
# Install dependencies
npm install
pip install -r requirements.txt   # or: uv sync (also installs the test tools)

# Configure environment
cp .env.example .env
# Add GOOGLE_API_KEY to .env
```

Run both services simultaneously:

```bash
# Terminal 1 — Backend
python app.py          # http://localhost:8000

# Terminal 2 — Frontend
npm run dev            # http://localhost:5173
```

Open http://localhost:5173.

### Docker

```bash
docker-compose up
# or
docker build -t asl-guide . && docker run -p 8000:8000 -e GOOGLE_API_KEY=your_key asl-guide
```

### Hosting on Cloud Run (free tier)

The planned setup is Google Cloud Run for the app and a free Neon Postgres database. Cloud Run scales to zero and has a monthly free allowance (2 million requests, 180,000 vCPU-seconds); Neon's free plan holds 0.5 GB and sleeps when idle. The app's data is small: feedback, 90 days of analytics, and the daily free-translation counter.

A database outside the container is required: Cloud Run starts fresh containers, so with SQLite the daily translation limit would reset every time.

**1. Database (Neon).** Create a project in the region nearest your Cloud Run region and copy the **direct** connection string (the host without `-pooler`). Paste it as given: the app converts Neon's `sslmode`/`channel_binding` parameters for its driver. Check it:

```bash
DATABASE_URL='postgresql://...' uv run python scripts/check_database.py
```

This creates the tables, runs every query the app makes, and removes its own test rows.

**2. Google Cloud, one time.** A project with billing enabled is needed even for the free tier; set a budget alert.

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

printf '%s' 'GEMINI_KEY'         | gcloud secrets create google-api-key --data-file=-
printf '%s' 'NEON_URL'           | gcloud secrets create database-url   --data-file=-
printf '%s' 'ADMIN_PASSWORD'     | gcloud secrets create admin-password --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create ip-hash-salt  --data-file=-

# Let the service read them (Cloud Run runs as the default compute service account)
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

**3. Deploy** (also for every later update):

```bash
PROJECT_ID=PROJECT_ID scripts/deploy-cloudrun.sh
```

It builds the Dockerfile with Cloud Build and runs at most one container (the per-minute rate limit, admin lockout and translation cache are kept in memory).

**4. Check after the first deploy.**
- `https://<service-url>/health` responds.
- The logs (`gcloud run services logs read asl-app --region us-central1`) do **not** show `Ignoring X-Forwarded-For from untrusted peer`. If they do, every visitor shares one rate limit and one daily quota: add the address it names to `TRUSTED_PROXY_NETWORKS` in the script.
- Translate once on Wi-Fi and once on mobile data: `/api/rate-limit` should count each separately.

Each deploy stores an image in Artifact Registry (`cloud-run-source-deploy`), whose free storage is 0.5 GB: delete old images there now and then.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18.3, TypeScript 5.9, Vite 7, custom Calm design system |
| Backend | FastAPI, Python 3.11+, Google Gemini 2.5 Flash |
| Browser ML | TensorFlow.js, MediaPipe Tasks Vision (hands, pose, face), ONNX Runtime Web |
| Database | SQLAlchemy async, SQLite (dev) / PostgreSQL (prod) |
| Caching | Redis (optional) + in-memory LRU fallback |
| Deployment | Docker, PWA (Service Worker + Web Manifest) |
| Testing | Vitest (162 frontend tests), pytest (114 backend tests) |

---

## Architecture

The backend uses a two-agent Gemini pipeline: a **Grammar Agent** reorders English input into ASL gloss applying 11 documented rules, then a **Translation Agent** generates sign descriptions grounded by a verified knowledge base. Results are cached at two layers (Redis + in-memory LRU). The Grammar Agent's 1,300-token system prompt is uploaded to Gemini's context cache at startup, reducing per-request input token costs by ~73%.

Full architecture, AI pipeline internals, and development guide: [CLAUDE.md](./CLAUDE.md)

Detailed docs:
- [Caching](docs/caching.md) — Translation caching, Redis setup, Gemini context cache
- [Admin Dashboard](docs/admin.md) — Analytics, feedback management, access
- [Production](docs/production.md) — Bundle sizes, optimizations, PostgreSQL, deployment notes
- [Troubleshooting](docs/troubleshooting.md) — Common issues and fixes

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch and open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE)

---

## Acknowledgments

- **Bill Vicars / Lifeprint (ASLU)** — ASL education reference used for the verified sign knowledge base
- **Google Gemini** — AI-powered translation pipeline
- **Phrase-model training data** — [PopSign ASL v1.0](https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/) (Starner et al., 2023, Georgia Tech and Deaf Professional Arts Network; [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), Google's [ASL Signs](https://www.kaggle.com/competitions/asl-signs/data) and [WLASL](https://dxli94.github.io/WLASL/) (Li et al., 2020). The data was processed into landmarks and the model is not endorsed by the dataset creators; full credits and changes are in [ATTRIBUTION.md](public/models/sign-phrases/ATTRIBUTION.md)
- **Custom Calm design system** — warm off-white, ocean accent, inspired by Apple Translate / Linear / Notion
- **FastAPI & React** — Core frameworks

---

*Built with ❤️ for the ASL community*
