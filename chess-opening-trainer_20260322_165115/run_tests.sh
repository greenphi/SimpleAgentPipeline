#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"
EXIT_CODE=0
USE_DOCKER=true

# ─── Detect Docker availability ───────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Docker not found, using native services..."
  USE_DOCKER=false
fi

if [ "$USE_DOCKER" = "true" ]; then
  # ─── Cleanup on exit ──────────────────────────────────────────────────────────
  cleanup() {
    echo ""
    echo "==> Tearing down test infrastructure..."
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans || true
  }
  trap cleanup EXIT

  # ─── Start infrastructure ────────────────────────────────────────────────────
  echo "==> Starting test infrastructure (postgres:5433, redis:6380)..."
  docker compose -f "$COMPOSE_FILE" up -d

  # ─── Wait for Postgres ───────────────────────────────────────────────────────
  echo "==> Waiting for Postgres to be healthy..."
  MAX_RETRIES=30
  RETRIES=0
  until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres -q 2>/dev/null; do
    RETRIES=$((RETRIES + 1))
    if [ $RETRIES -ge $MAX_RETRIES ]; then
      echo "ERROR: Postgres did not become healthy in time."
      exit 1
    fi
    echo "  Waiting... ($RETRIES/$MAX_RETRIES)"
    sleep 2
  done
  echo "  Postgres is ready."

  # ─── Wait for Redis ──────────────────────────────────────────────────────────
  echo "==> Waiting for Redis to be healthy..."
  RETRIES=0
  until docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
    RETRIES=$((RETRIES + 1))
    if [ $RETRIES -ge $MAX_RETRIES ]; then
      echo "ERROR: Redis did not become healthy in time."
      exit 1
    fi
    echo "  Waiting... ($RETRIES/$MAX_RETRIES)"
    sleep 2
  done
  echo "  Redis is ready."
else
  # ─── Verify native services ───────────────────────────────────────────────────
  echo "==> Verifying native Postgres on port 5433..."
  if ! /opt/homebrew/bin/pg_isready -p 5433 -U postgres -q 2>/dev/null; then
    echo "ERROR: Postgres is not running on port 5433."
    exit 1
  fi
  echo "  Postgres is ready."

  echo "==> Verifying native Redis on port 6380..."
  if ! /opt/homebrew/bin/redis-cli -p 6380 ping 2>/dev/null | grep -q PONG; then
    echo "ERROR: Redis is not running on port 6380."
    exit 1
  fi
  echo "  Redis is ready."
fi

# ─── Export test environment variables ──────────────────────────────────────
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/chess_trainer_test"
export TEST_REDIS_URL="redis://localhost:6380"
export NODE_ENV="test"
export PGPASSWORD="postgres"

# ─── Run database migrations ─────────────────────────────────────────────────
echo ""
echo "==> Running database migrations..."
if ! PGPASSWORD=postgres pnpm --filter @chess-trainer/api exec tsx src/db/migrate.ts; then
  echo "ERROR: Migrations failed."
  exit 1
fi
echo "  Migrations complete."

# ─── Run seed script ─────────────────────────────────────────────────────────
echo ""
echo "==> Running seed script..."
if pnpm --filter @chess-trainer/api exec tsx src/db/seed.ts 2>/dev/null; then
  echo "  Seed complete."
else
  echo "  Seed script not found or skipped (not required)."
fi

# ─── Run shared package tests ────────────────────────────────────────────────
echo ""
echo "==> Running @chess-trainer/shared tests..."
if pnpm --filter @chess-trainer/shared test --run; then
  echo "  shared: PASSED"
else
  echo "  shared: FAILED"
  EXIT_CODE=1
fi

# ─── Run API tests ────────────────────────────────────────────────────────────
echo ""
echo "==> Running @chess-trainer/api tests..."
if pnpm --filter @chess-trainer/api test --run; then
  echo "  api: PASSED"
else
  echo "  api: FAILED"
  EXIT_CODE=1
fi

# ─── Run web tests ────────────────────────────────────────────────────────────
echo ""
echo "==> Running @chess-trainer/web tests..."
if pnpm --filter @chess-trainer/web test --run; then
  echo "  web: PASSED"
else
  echo "  web: FAILED"
  EXIT_CODE=1
fi

# ─── Start server for E2E tests ──────────────────────────────────────────────
echo ""
echo "==> Starting server for E2E tests..."
PGPASSWORD=postgres pnpm --filter @chess-trainer/api exec tsx src/server.ts &
SERVER_PID=$!
MAX_RETRIES=30
RETRIES=0
until curl -sf http://localhost:3001/ > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    echo "ERROR: Server did not start in time."
    kill $SERVER_PID 2>/dev/null || true
    EXIT_CODE=1
    break
  fi
  sleep 1
done
if [ $RETRIES -lt $MAX_RETRIES ]; then
  echo "  Server is ready."
fi

# ─── Run E2E tests ────────────────────────────────────────────────────────────
echo ""
echo "==> Running @chess-trainer/e2e tests..."
if pnpm --filter @chess-trainer/e2e test; then
  echo "  e2e: PASSED"
else
  echo "  e2e: FAILED"
  EXIT_CODE=1
fi

# ─── Stop server ──────────────────────────────────────────────────────────────
kill $SERVER_PID 2>/dev/null || true

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "==> All tests PASSED."
else
  echo "==> Some tests FAILED. See output above."
fi

exit $EXIT_CODE
