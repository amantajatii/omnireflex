#!/usr/bin/env bash
# Build the frontend locally, stage frontend + indexer, sync to the VPS, restart.
set -euo pipefail

HOST="${DEPLOY_HOST:-vps}"
DOMAIN="${DEPLOY_DOMAIN:-reflex.43-157-202-28.sslip.io}"
REMOTE_DIR="${DEPLOY_DIR:-reflex}"
if [[ ! "$REMOTE_DIR" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "DEPLOY_DIR must be a plain directory name under the remote home" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$ROOT/deploy/.stage"

echo "› building frontend for https://$DOMAIN"
(cd "$ROOT/frontend" && NEXT_PUBLIC_INDEXER_URL="https://$DOMAIN/indexer" npm run build)

echo "› staging"
rm -rf "$STAGE"
mkdir -p "$STAGE/frontend/app/.next" "$STAGE/indexer/records"
cp -R "$ROOT/frontend/.next/standalone/." "$STAGE/frontend/app/"
cp -R "$ROOT/frontend/.next/static" "$STAGE/frontend/app/.next/static"
if [ -d "$ROOT/frontend/public" ]; then cp -R "$ROOT/frontend/public" "$STAGE/frontend/app/public"; fi
# Host-specific image binaries (built on macOS); the app does not use next/image.
rm -rf "$STAGE/frontend/app/node_modules/@img" "$STAGE/frontend/app/node_modules/sharp"
cp "$ROOT/deploy/frontend.Dockerfile" "$STAGE/frontend/Dockerfile"

cp "$ROOT/indexer/package.json" "$ROOT/indexer/package-lock.json" \
  "$ROOT/indexer/Dockerfile" "$ROOT/indexer/.dockerignore" "$STAGE/indexer/"
cp -R "$ROOT/indexer/src" "$STAGE/indexer/src"
for id in 1301 84532 5318007; do
  cp "$ROOT/contracts/deployments/$id.json" "$STAGE/indexer/records/"
done
cp "$ROOT/deploy/compose.yaml" "$STAGE/compose.yaml"

echo "› syncing to $HOST:$REMOTE_DIR"
rsync -az --delete "$STAGE/" "$HOST:$REMOTE_DIR/"

echo "› restarting containers"
ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null"

echo "› done: https://$DOMAIN"
