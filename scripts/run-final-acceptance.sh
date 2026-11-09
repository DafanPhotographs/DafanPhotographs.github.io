#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
HEAD=$(git rev-parse HEAD)
BASE=4d06538ff3247d29713ddb4dc3e78ca655ee34dd
echo "HEAD=$HEAD BASE=$BASE"
git merge-base --is-ancestor "$BASE" "$HEAD"
mkdir -p /opt/cursor/artifacts/logs
LOG_DIR=/opt/cursor/artifacts/logs
npx playwright test tests/home-desktop-six-percent.spec.js -g guards --workers=1 --reporter=line 2>&1 | tee "$LOG_DIR/final-guards-HEAD-${HEAD}.log"
npx playwright test tests/home-desktop-six-percent.spec.js --workers=1 --reporter=line 2>&1 | tee "$LOG_DIR/final-six-percent-HEAD-${HEAD}.log"
npx playwright test --workers=1 --reporter=line 2>&1 | tee "$LOG_DIR/final-full-regression-HEAD-${HEAD}.log"
node scripts/home-desktop-six-evidence.mjs 2>&1 | tee "$LOG_DIR/final-evidence-HEAD-${HEAD}.log"
mkdir -p /opt/cursor/artifacts/pr27-acceptance
rm -rf /opt/cursor/artifacts/pr27-acceptance/*
cp -a artifacts/home-desktop-six-evidence-out/. /opt/cursor/artifacts/pr27-acceptance/
cp -a artifacts/acceptance-evidence/. /opt/cursor/artifacts/pr27-acceptance/acceptance-evidence/ 2>/dev/null || true
echo "DONE HEAD=$HEAD"
