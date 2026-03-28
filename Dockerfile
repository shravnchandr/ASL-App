# Multi-stage Docker build for ASL Dictionary
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src ./src
COPY public ./public
COPY index.html ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./

# Set NODE_ENV to production for optimizations
ENV NODE_ENV=production

# Build frontend with production optimizations
RUN npm run build

# Stage 2: Python runtime with FastAPI
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python application
COPY app.py ./
COPY config.py ./
COPY logger.py ./
COPY database.py ./
COPY auth.py ./
COPY cache.py ./
COPY python_code ./python_code

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/dist ./dist

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8000

# Health check (using curl instead of requests library)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
