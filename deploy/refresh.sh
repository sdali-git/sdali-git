#!/usr/bin/env bash
# Collects the latest exam updates and publishes a fresh build.
# Run by the exam-aim-update systemd timer (Mon/Wed/Fri 1:00 AM IST) as user "examaim".
# Each build goes into its own release folder and the live site is switched
# with an atomic symlink swap, so visitors never see a half-built site.
set -euo pipefail

BASE_DIR="${EXAM_AIM_HOME:-/opt/exam-aim}"
[ -f "$BASE_DIR/exam-aim.env" ] && . "$BASE_DIR/exam-aim.env"
DOMAIN="${DOMAIN:-exam-aim.orbit-group.online}"
APP="$BASE_DIR/app"

export PATH="$BASE_DIR/node/bin:$PATH"
export LIVE_DATA_DIR="$BASE_DIR/live-data"
export PLAYWRIGHT_BROWSERS_PATH="$BASE_DIR/browsers"
export BASE_PATH=/
export SITE_URL="https://$DOMAIN"

exec 9>"$BASE_DIR/.refresh.lock"
flock -n 9 || { echo "Another refresh is already running"; exit 0; }

cd "$APP"
echo "[$(date -Is)] Collecting updates…"
node scripts/update.mjs || echo "Warning: every source failed this run; keeping previous data."

REL="$BASE_DIR/releases/$(date +%Y%m%d-%H%M%S)"
echo "[$(date -Is)] Building into $REL"
OUT_DIR="$REL" node scripts/build.mjs

ln -sfn "$REL" "$BASE_DIR/current.tmp"
mv -Tf "$BASE_DIR/current.tmp" "$BASE_DIR/current"

# Keep the three most recent releases for quick rollback.
ls -1dt "$BASE_DIR"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
echo "[$(date -Is)] Live: $(readlink "$BASE_DIR/current")"
