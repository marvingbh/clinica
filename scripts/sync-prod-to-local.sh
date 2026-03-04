#!/usr/bin/env bash
set -euo pipefail

# Add Homebrew libpq to PATH (provides pg_dump on macOS)
if [ -d "/opt/homebrew/opt/libpq/bin" ]; then
  export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
fi

# Read prod URL from .env
PROD_URL=$(grep '^DATABASE_URL_PROD=' .env | cut -d= -f2-)
if [ -z "$PROD_URL" ]; then
  echo "ERROR: DATABASE_URL_PROD not found in .env"
  exit 1
fi

LOCAL_USER=${POSTGRES_USER:-clinica}
LOCAL_DB=${POSTGRES_DB:-clinica_dev}
CONTAINER=clinica_db
DUMP_FILE=/tmp/clinica_prod.dump

# 1. Start Docker container
echo "Starting Docker Postgres..."
docker compose up -d --wait

# 2. Dump production
echo "Dumping production database..."
pg_dump "$PROD_URL" --no-owner --no-acl -Fc -f "$DUMP_FILE"

# 3. Drop + recreate local DB
echo "Restoring to local database..."
docker exec "$CONTAINER" dropdb -U "$LOCAL_USER" --if-exists "$LOCAL_DB"
docker exec "$CONTAINER" createdb -U "$LOCAL_USER" "$LOCAL_DB"
docker exec "$CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" \
  -c 'CREATE EXTENSION IF NOT EXISTS unaccent;'

# 4. Restore
docker cp "$DUMP_FILE" "$CONTAINER":/tmp/clinica_prod.dump
docker exec "$CONTAINER" pg_restore -U "$LOCAL_USER" -d "$LOCAL_DB" \
  --no-owner --no-acl /tmp/clinica_prod.dump || true

# 5. Regenerate Prisma client
npx prisma generate

# 6. Cleanup
rm -f "$DUMP_FILE"

echo "Done! Local database synced with production data."
