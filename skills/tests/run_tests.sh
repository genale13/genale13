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

# Route B3 (custom element): build the element fixture, then check it on a simulated Wix page (offline: no Google
# downloads). It must pass, and two broken copies (a style that escapes, a doubled lead) must fail.
python3 "$SKILL/scripts/prepare_site.py" "$HERE/fixture/element/landing.html" --route element --out site-element \
  --gtag G-NEW12345,AW-123456789 --tag-name test-landing --site-name "Test Florist" > /dev/null
SIM=(node "$SKILL/scripts/simulate_element.js" --tag test-landing --site https://www.testflorist.example --path /spring-flowers
     --gtag G-NEW12345,AW-123456789 --submit --offline --wait 2500)
"${SIM[@]}" --element site-element/test-landing.js
{ cat site-element/test-landing.js; echo ";document.head.insertAdjacentHTML('beforeend','<style>p{letter-spacing:3px}</style>');"; } > leak.js
sed 's/"autoLead": false/"autoLead": true/' site-element/test-landing.js > double.js
for neg in leak:"changed the Wix page's own styles" double:"generate_lead sent 2 times"; do
  if out="$("${SIM[@]}" --element "${neg%%:*}.js")"; then echo "FAIL negative test ${neg%%:*} passed"; exit 1; fi
  grep -q "${neg#*:}" <<<"$out" || { echo "FAIL negative test ${neg%%:*}: expected '${neg#*:}'"; echo "$out"; exit 1; }
  echo "PASS negative test ${neg%%:*} is caught"
done
echo "ELEMENT ROUTE PASSED"
