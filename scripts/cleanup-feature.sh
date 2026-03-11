#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# cleanup-feature.sh — Remove a feature branch worktree and its database
#
# Usage: bash scripts/cleanup-feature.sh <branch-name>
# Example: bash scripts/cleanup-feature.sh payment-reminders
# =============================================================================

BRANCH_NAME=${1:-}
if [ -z "$BRANCH_NAME" ]; then
  echo "Usage: bash scripts/cleanup-feature.sh <branch-name>"
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="$(dirname "$REPO_ROOT")/clinica-${BRANCH_NAME}"
DB_NAME="clinica_${BRANCH_NAME//-/_}"
CONTAINER=clinica_db
LOCAL_USER=${POSTGRES_USER:-clinica}

echo "=== Cleaning up feature: $BRANCH_NAME ==="

# 1. Remove worktree
if [ -d "$WORKTREE_DIR" ]; then
  echo "[1/3] Removing worktree at $WORKTREE_DIR..."
  git worktree remove "$WORKTREE_DIR" --force
else
  echo "[1/3] Worktree not found (already removed)"
fi

# 2. Drop database
echo "[2/3] Dropping database '$DB_NAME'..."
docker exec "$CONTAINER" dropdb -U "$LOCAL_USER" --if-exists "$DB_NAME" 2>/dev/null || true

# 3. Delete branch (only if merged)
echo "[3/3] Deleting branch '$BRANCH_NAME'..."
git branch -d "$BRANCH_NAME" 2>/dev/null || echo "  Branch not deleted (unmerged or not found). Use 'git branch -D $BRANCH_NAME' to force."

echo ""
echo "=== Cleanup complete ==="
