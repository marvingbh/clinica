#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# new-feature.sh — Create an isolated feature branch with its own database
#
# Usage: bash scripts/new-feature.sh <branch-name>
# Example: bash scripts/new-feature.sh payment-reminders
#
# What it does:
#   1. Creates a git worktree at ../clinica-<branch-name>
#   2. Creates a new Postgres database in the existing Docker container
#   3. Restores the latest production data into it
#   4. Updates .env in the worktree to point to the new database
#   5. Runs prisma generate in the worktree
# =============================================================================

# Add Homebrew libpq to PATH (provides pg_dump on macOS)
if [ -d "/opt/homebrew/opt/libpq/bin" ]; then
  export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
fi

BRANCH_NAME=${1:-}
if [ -z "$BRANCH_NAME" ]; then
  echo "Usage: bash scripts/new-feature.sh <branch-name>"
  echo "Example: bash scripts/new-feature.sh payment-reminders"
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="$(dirname "$REPO_ROOT")/clinica-${BRANCH_NAME}"
DB_NAME="clinica_${BRANCH_NAME//-/_}"
CONTAINER=clinica_db
LOCAL_USER=${POSTGRES_USER:-clinica}
DUMP_FILE=/tmp/clinica_prod.dump

# Read prod URL from .env
PROD_URL=$(grep '^DATABASE_URL_PROD=' "$REPO_ROOT/.env" | cut -d= -f2-)
if [ -z "$PROD_URL" ]; then
  echo "ERROR: DATABASE_URL_PROD not found in .env"
  exit 1
fi

echo "=== Feature Branch Setup ==="
echo "  Branch:    $BRANCH_NAME"
echo "  Worktree:  $WORKTREE_DIR"
echo "  Database:  $DB_NAME"
echo ""

# 1. Create git worktree
echo "[1/6] Creating git worktree..."
if [ -d "$WORKTREE_DIR" ]; then
  echo "  Worktree already exists at $WORKTREE_DIR"
else
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" main
  echo "  Created worktree and branch '$BRANCH_NAME'"
fi

# 2. Ensure Docker is running
echo "[2/6] Starting Docker Postgres..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up -d --wait

# 3. Create new database
echo "[3/6] Creating database '$DB_NAME'..."
docker exec "$CONTAINER" psql -U "$LOCAL_USER" -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 && {
  echo "  Database already exists, dropping and recreating..."
  docker exec "$CONTAINER" dropdb -U "$LOCAL_USER" "$DB_NAME"
}
docker exec "$CONTAINER" createdb -U "$LOCAL_USER" "$DB_NAME"
docker exec "$CONTAINER" psql -U "$LOCAL_USER" -d "$DB_NAME" \
  -c 'CREATE EXTENSION IF NOT EXISTS unaccent;'

# 4. Dump production and restore
echo "[4/6] Restoring production data..."
pg_dump "$PROD_URL" --no-owner --no-acl -Fc -f "$DUMP_FILE"
docker cp "$DUMP_FILE" "$CONTAINER":/tmp/clinica_prod.dump
docker exec "$CONTAINER" pg_restore -U "$LOCAL_USER" -d "$DB_NAME" \
  --no-owner --no-acl /tmp/clinica_prod.dump || true
rm -f "$DUMP_FILE"

# 5. Update .env in the worktree
echo "[5/6] Updating .env..."
cp "$REPO_ROOT/.env" "$WORKTREE_DIR/.env"
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://${LOCAL_USER}:clinica_dev@localhost:5432/${DB_NAME}|" "$WORKTREE_DIR/.env"
else
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://${LOCAL_USER}:clinica_dev@localhost:5432/${DB_NAME}|" "$WORKTREE_DIR/.env"
fi

# 6. Install dependencies and generate Prisma client
echo "[6/6] Installing dependencies and generating Prisma client..."
cd "$WORKTREE_DIR"
npm install --force 2>/dev/null
npx prisma generate

echo ""
echo "=== Done! ==="
echo ""
echo "  cd $WORKTREE_DIR"
echo ""
echo "  Database: $DB_NAME (on existing Docker container)"
echo "  Branch:   $BRANCH_NAME"
echo ""
echo "  To start dev server:  npm run dev"
echo "  To apply migrations:  npx prisma db push"
