#!/usr/bin/env bash

set -euo pipefail

ENV_NAME="${1:-}"

if [[ -z "${ENV_NAME}" ]]; then
  echo "Usage: deploy/scripts/deploy-env.sh <testing|live>"
  exit 1
fi

case "${ENV_NAME}" in
  testing)
    APP_DIR="${APP_DIR:-/home/sentra-core}"
    BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-${APP_DIR}/.env.testing}"
    INFRA_ENV_FILE="${INFRA_ENV_FILE:-${APP_DIR}/deploy/env/infra.testing.env}"
    COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.testing.yml}"
    PM2_CONFIG="${PM2_CONFIG:-${APP_DIR}/deploy/pm2/ecosystem.testing.config.cjs}"
    ;;
  live)
    APP_DIR="${APP_DIR:-/home/sentra-live}"
    BACKEND_ENV_FILE="${BACKEND_ENV_FILE:-${APP_DIR}/.env.live}"
    INFRA_ENV_FILE="${INFRA_ENV_FILE:-${APP_DIR}/deploy/env/infra.live.env}"
    COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.live.yml}"
    PM2_CONFIG="${PM2_CONFIG:-${APP_DIR}/deploy/pm2/ecosystem.live.config.cjs}"
    ;;
  *)
    echo "Unknown environment: ${ENV_NAME}"
    exit 1
    ;;
esac

if [[ ! -d "${APP_DIR}" ]]; then
  echo "App directory not found: ${APP_DIR}"
  exit 1
fi

if [[ ! -f "${BACKEND_ENV_FILE}" ]]; then
  echo "Missing backend env file: ${BACKEND_ENV_FILE}"
  exit 1
fi

if [[ ! -f "${INFRA_ENV_FILE}" ]]; then
  echo "Missing infra env file: ${INFRA_ENV_FILE}"
  exit 1
fi

cd "${APP_DIR}"

docker compose --env-file "${INFRA_ENV_FILE}" -f "${COMPOSE_FILE}" up -d

npm ci

# Inject Firebase config into service worker (SW can't read NEXT_PUBLIC_* env vars)
node deploy/scripts/generate-firebase-sw.cjs "${ENV_NAME}"

node deploy/scripts/run-with-env.cjs \
  "${BACKEND_ENV_FILE}" \
  npx prisma generate --schema=libs/backend/prisma-client/prisma/schema.prisma
node deploy/scripts/run-with-env.cjs \
  "${BACKEND_ENV_FILE}" \
  npx prisma migrate deploy --schema=libs/backend/prisma-client/prisma/schema.prisma

# Build backends (NestJS → dist/apps/backend/*)
node deploy/scripts/run-with-env.cjs \
  "${BACKEND_ENV_FILE}" \
  npx nx run-many -t build -p core-service,comm-service,pm-service,hrms-service --configuration=production

# Build frontends (Next.js → dist/apps/frontend/*)
# sales-dashboard is built alone with extra heap — it's the largest app and will OOM
# if run concurrently with the others on a memory-constrained server.
NODE_OPTIONS="--max-old-space-size=4096" node deploy/scripts/run-with-env.cjs \
  "${BACKEND_ENV_FILE}" \
  npx nx run sales-dashboard:build:production

node deploy/scripts/run-with-env.cjs \
  "${BACKEND_ENV_FILE}" \
  npx nx run-many -t build -p pm-dashboard,hrms-dashboard --configuration=production

pm2 startOrReload "${PM2_CONFIG}" --update-env
pm2 save

echo "Deployment completed for ${ENV_NAME}"
