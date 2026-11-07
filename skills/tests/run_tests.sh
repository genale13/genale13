#!/usr/bin/env bash
# Maintainer test: prepare the fixture with both routes, then run the browser end-to-end test.
# Needs python3, node and the playwright package with Chromium.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$HERE/../wix-html-hosting-tracking"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$HERE/fixture/src" "$WORK/src"
cd "$WORK"
python3 "$SKILL/scripts/prepare_site.py" src --route static --out site-static --gtm GTM-NEW1234 \
  --base-url https://lp.testflorist.example --lang en --enhanced-conversions --currency CAD --lead-value 40 > /dev/null
python3 "$SKILL/scripts/prepare_site.py" src/index.html --route embed --out site-embed --gtag G-NEW12345,AW-123456789 \
  --conversion generate_lead=AW-123456789/AbCdEfGh123:40:CAD --parent-origin http://127.0.0.1:8201 \
  --listener-allow-origin http://localhost:8202 --enhanced-conversions --embed-id spring-quote > /dev/null
node --check "$SKILL/assets/html-tracker.js"
node "$HERE/e2e_test.js" "$WORK"
