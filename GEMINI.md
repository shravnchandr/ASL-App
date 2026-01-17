# ASL Dictionary Web Application

## Project Overview

This project is a modern, production-ready web application that translates English phrases into detailed American Sign Language (ASL) descriptions. It utilizes Google Gemini AI via LangGraph for accurate and context-aware translations. The application features a responsive Material 3 design, feedback collection, and administrative tools.

## Tech Stack

### Frontend
*   **Framework**: React 18.3+
*   **Language**: TypeScript 5.9+
*   **Build Tool**: Vite 7
*   **Styling**: Material 3 Design System, CSS Variables
*   **State Management**: React Context (AppContext, ThemeContext)
*   **HTTP Client**: Axios

### Backend
*   **Framework**: FastAPI (Python 3.11+)
*   **AI/LLM**: Google Gemini API via LangGraph
*   **Database**: SQLAlchemy (Async) with SQLite (Dev) or PostgreSQL (Prod)
*   **Caching**: Redis (Optional)
*   **Testing**: pytest (Async)

### DevOps & Infrastructure
*   **Containerization**: Docker, Docker Compose
*   **Hosting**: Render.com (Deployment configurations present)
*   **CI/CD**: GitHub Actions (`.github/workflows/test.yml`)

## Key Files & Directories

*   `app.py`: Main entry point for the FastAPI backend. Configures middleware, routes, and startup/shutdown logic.
*   `src/`: Source code for the React frontend.
    *   `src/components/`: Reusable UI components (SignCard, SearchBar, etc.).
    *   `src/pages/`: Application pages.
    *   `src/services/`: API integration services.
    *   `src/App.tsx`: Main frontend application component.
*   `python_code/`: Contains the core ASL translation logic using LangGraph (`asl_dict_langgraph.py`).
*   `tests/`: Backend test suite using `pytest`.
*   `config.py`: Configuration management using Pydantic settings.
*   `database.py`: Database models and connection logic.
*   `auth.py`: Authentication utilities (Admin password verification).
*   `docker-compose.yml`: Docker services definition for local development.

## Development Workflow

### Prerequisites
*   Node.js 20+
*   Python 3.11+
*   Google Gemini API Key

### Setup

1.  **Environment Variables**: Copy `.env.example` to `.env` and populate `GOOGLE_API_KEY`.
    ```bash
    cp .env.example .env
    ```

2.  **Install Dependencies**:
    ```bash
    # Frontend
    npm install

    # Backend
    pip install -r requirements.txt
    ```

### Running the Application

*   **Backend (FastAPI)**:
    ```bash
    python app.py
    ```
    Runs on `http://localhost:8000`.

*   **Frontend (Vite)**:
    ```bash
    npm run dev
    ```
    Runs on `http://localhost:5173`.

*   **Docker**:
    ```bash
    docker-compose up
    ```

### Testing & Quality

*   **Backend Tests**:
    ```bash
    pytest
    ```
    Configuration in `pytest.ini`.

*   **Frontend Linting**:
    ```bash
    npm run lint
    ```
    Configuration in `eslint.config.js`.

*   **Build**:
    ```bash
    npm run build
    ```
    Produces production assets in `dist/`.

## Important Notes

*   **Hybrid Architecture**: In production, the FastAPI backend serves the compiled React frontend static files. In development, run them separately for HMR (Hot Module Replacement).
*   **Security**: The application implements rate limiting (`slowapi`), security headers (CSP, HSTS), and admin password protection for sensitive endpoints.
*   **Database**: Uses async SQLAlchemy. Ensure async drivers (e.g., `asyncpg`) are used for PostgreSQL.
