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
python3 -m http.server 8765 --bind 127.0.0.1 &
HTTP_PID=$!
sleep 1
set +e
node scripts/home-desktop-six-evidence.mjs 2>&1 | tee "$LOG_DIR/final-evidence-HEAD-${HEAD}.log"
EVIDENCE_EXIT=$?
set -e
kill "$HTTP_PID" 2>/dev/null || true
wait "$HTTP_PID" 2>/dev/null || true
mkdir -p /opt/cursor/artifacts/pr27-acceptance
rm -rf /opt/cursor/artifacts/pr27-acceptance/*
cp -a artifacts/home-desktop-six-evidence-out/. /opt/cursor/artifacts/pr27-acceptance/
cp -a artifacts/acceptance-evidence/. /opt/cursor/artifacts/pr27-acceptance/acceptance-evidence/ 2>/dev/null || true
cp -f artifacts/pr27-evidence-bundle.tar.gz /opt/cursor/artifacts/pr27-evidence-bundle.tar.gz 2>/dev/null || true
echo "DONE HEAD=$HEAD evidence_exit=$EVIDENCE_EXIT"
exit "${EVIDENCE_EXIT:-0}"
