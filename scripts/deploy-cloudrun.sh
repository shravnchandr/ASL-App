#!/usr/bin/env bash
# Build this repo with Cloud Build and deploy it to Cloud Run.
#
#   PROJECT_ID=my-project scripts/deploy-cloudrun.sh
#
# Optional: REGION (default us-central1), SERVICE (default asl-app).
# One-time setup (secrets, APIs, permissions) is in README.md under "Hosting on Cloud Run".
#
# Sized to stay inside the free tiers: scales to zero when idle, and at most one
# container, because the per-minute rate limit, admin lockout and translation
# cache live in the container's memory.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-asl-app}"

# 169.254.0.0/16 is where Cloud Run's front end connects from; X-Forwarded-For is
# only believed from there (and the usual private ranges). Uses @ as the list
# separator because the JSON value contains commas.
ENV_VARS="^@^ENVIRONMENT=production"
ENV_VARS+="@RATE_LIMIT=100/minute"
ENV_VARS+="@TRUSTED_PROXY_HOPS=1"
ENV_VARS+='@TRUSTED_PROXY_NETWORKS=["169.254.0.0/16","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16","127.0.0.0/8","::1/128","fc00::/7"]'
ENV_VARS+="@LOG_FORMAT=json"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60 \
  --set-env-vars "$ENV_VARS" \
  --set-secrets "GOOGLE_API_KEY=google-api-key:latest,DATABASE_URL=database-url:latest,ADMIN_PASSWORD=admin-password:latest,IP_HASH_SALT=ip-hash-salt:latest"
