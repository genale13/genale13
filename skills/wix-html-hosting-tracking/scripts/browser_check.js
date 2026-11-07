#!/usr/bin/env node
/*
 * In-browser tracking check with Playwright (Chromium).
 * Loads a page (Wix static page, or a Wix editor page with an Embed HTML iframe), scrolls through it,
 * optionally clicks something, then reports:
 *   - html-tracker events logged in every frame (page + iframes) and whether the iframe got the
 *     parent's attribution context (gclid / UTM)
 *   - dataLayer pushes on the top page (GTM events and gtag() commands)
 *   - Google hits the page tried to send (GA4 /g/collect event names, Google Ads pings)
 * Google hits are captured and answered locally (HTTP 204) by default, so a test does not pollute your
 * reports; pass --allow-send to let them through (then use GA4 DebugView / Tag Assistant).
 * --submit fills the first form (or the one matching a selector, in any frame) with test data, submits
 * it, captures where it would go (nothing is delivered) and checks that no email leaks into a URL.
 *
 * Usage:
 *   node browser_check.js "https://lp.example.com/?utm_source=qa&utm_medium=test" [--click "a.cta"]
 *        [--click-frame] [--submit ["form#quote"]] [--wait 8000] [--allow-send] [--json out.json]
 * Requires the playwright package (npm i playwright, or a preinstalled copy) and Chromium.
 */
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('playwright is not installed: npm i playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
if (!url) { console.error('usage: node browser_check.js <url> [--click selector] [--wait ms] [--allow-send] [--json file]'); process.exit(2); }
const WAIT = +val('--wait', 8000); // GA4 batches hits for a few seconds
const TEST_EMAIL = 'qa.tracker+test@example.com';
const GOOGLE = /(^|\.)(google-analytics\.com|analytics\.google\.com|googleadservices\.com|doubleclick\.net)$|^www\.google\.[a-z.]+$/;

function hitInfo(req) {
  const u = new URL(req.url());
  const out = { host: u.hostname, path: u.pathname, events: [] };
  const collect = (qs) => { const p = new URLSearchParams(qs); const en = p.get('en'); if (en) out.events.push(en); if (p.get('tid')) out.tid = p.get('tid'); };
  if (/\/g\/collect/.test(u.pathname)) {
    collect(u.search);
    const body = req.postData() || '';
    body.split(/\r?\n/).forEach((line) => line && collect(line));
  } else if (/pagead|conversion|ccm/.test(u.pathname)) {
    out.events.push('ads:' + u.pathname.split('/').slice(0, 4).join('/'));
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const hits = [];
  const consoleErrors = [];
  let submitted = false;
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  const formPosts = [];
  let startUrl = null;
  await page.route('**/*', (route) => {
    const req = route.request();
    let host = '';
    try { host = new URL(req.url()).hostname; } catch (e) {}
    if (GOOGLE.test(host) && !/googletagmanager\.com$/.test(host)) {
      hits.push(hitInfo(req));
      // answer locally instead of aborting: an aborted hit makes gtag retry and double count
      return flag('--allow-send') ? route.continue() : route.fulfill({ status: 204, body: '' });
    }
    if (submitted && req.method() !== 'GET') { // JS form handlers (fetch/XHR): capture, never deliver test leads
      formPosts.push({ method: req.method(), url: req.url(), body: (req.postData() || '').slice(0, 500), via: 'script' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.continue();
  });

  startUrl = url;
  if (flag('--submit')) { // stop the real submission in every frame, but let html-tracker see the submit event first
    await page.context().addInitScript(() => {
      window.__bcSubmits = [];
      window.addEventListener('submit', (e) => {
        const f = e.target;
        if (!f || f.tagName !== 'FORM') return;
        try {
          const method = (f.getAttribute('method') || 'get').toUpperCase();
          const qs = new URLSearchParams(new FormData(f)).toString();
          const action = f.action || location.href;
          window.__bcSubmits.push({ method, url: method === 'GET' ? action.split('?')[0] + '?' + qs : action, body: method === 'GET' ? '' : qs.slice(0, 500), via: 'form' });
        } catch (x) { /* ignore */ }
        e.preventDefault();
      }, true);
    });
  }
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  // scroll the page in steps so visibility-based events fire
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(250); }
  for (const f of page.frames()) { // embeds that scroll internally
    if (f === page.mainFrame()) continue;
    try { await f.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); } catch (e) {}
  }
  const sel = val('--click', null);
  if (sel) {
    const frames = flag('--click-frame') ? page.frames().filter((f) => f !== page.mainFrame()) : [page.mainFrame()];
    for (const f of frames) {
      const el = await f.$(sel);
      if (el) { await el.click({ noWaitAfter: true }).catch(() => {}); break; }
    }
  }
  if (flag('--submit')) {
    const formSel = (() => { const v = val('--submit', null); return v && !/^--/.test(v) && !/^https?:/.test(v) ? v : 'form'; })();
    for (const f of page.frames()) {
      const form = await f.$(formSel);
      if (!form) continue;
      await f.evaluate(({ el, email }) => {
        el.querySelectorAll('input, textarea, select').forEach((i) => {
          const t = (i.type || '').toLowerCase();
          if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(t)) return;
          if (t === 'checkbox' || t === 'radio') { if (i.required) i.checked = true; return; }
          if (i.tagName === 'SELECT') { if (i.options.length > 1) i.selectedIndex = 1; i.dispatchEvent(new Event('change', { bubbles: true })); return; }
          i.focus();
          i.value = t === 'email' || /mail|courriel|correo/i.test(i.name) ? email : t === 'tel' || /phone|tel/i.test(i.name) ? '+1 514 555 0100'
            : t === 'number' ? '1' : t === 'date' ? '2030-01-15' : t === 'url' ? 'https://example.com' : 'QA test';
          i.dispatchEvent(new Event('input', { bubbles: true }));
          i.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }, { el: form, email: TEST_EMAIL });
      await f.waitForTimeout(400);
      submitted = true;
      await f.evaluate((el) => (el.requestSubmit ? el.requestSubmit() : el.submit()), form).catch(() => {});
      break;
    }
    if (!submitted) console.log('--submit: no form matched ' + formSel);
  }
  await page.waitForTimeout(WAIT);

  const frames = [];
  for (const f of page.frames()) {
    try {
      const info = await f.evaluate(() => (window.htmlTracker ? {
        mode: window.htmlTracker.mode, version: window.htmlTracker.version,
        events: window.htmlTracker.log.map((e) => e.name), context: window.htmlTracker.context(),
      } : null));
      if (info) frames.push(Object.assign({ url: f.url().slice(0, 120), top: f === page.mainFrame() }, info));
    } catch (e) { /* detached frame */ }
  }
  const dataLayer = await page.evaluate(() => (window.dataLayer || []).map((e) => {
    try {
      if (Object.prototype.toString.call(e) === '[object Arguments]') return { gtag: Array.from(e).slice(0, 2).map(String) };
      return { event: e && e.event, source: e && e.event_source };
    } catch (x) { return {}; }
  }));
  const containers = await page.evaluate(() => Object.keys(window.google_tag_manager || {}).filter((k) => /^(GTM|G|AW|GT)-/.test(k)));
  for (const f of page.frames()) {
    try { formPosts.push(...(await f.evaluate(() => window.__bcSubmits || []))); } catch (e) { /* detached */ }
  }
  await browser.close();

  const report = { url, containers, frames, dataLayer, hits, consoleErrors, formPosts };
  console.log('Google containers loaded: ' + (containers.join(', ') || 'none'));
  frames.forEach((f) => {
    console.log(`\nhtml-tracker ${f.version} in ${f.top ? 'TOP page' : 'iframe'} (${f.mode} mode) ${f.url}`);
    console.log('  events: ' + (f.events.join(', ') || 'none'));
    if (!f.top) console.log('  context from parent: ' + JSON.stringify(f.context));
  });
  if (!frames.length) console.log('\nhtml-tracker not found in any frame');
  const dlEvents = dataLayer.filter((e) => e.event && !/^gtm\./.test(e.event)).map((e) => e.event + (e.source ? '(' + e.source + ')' : ''));
  const gtagEvents = dataLayer.filter((e) => e.gtag && e.gtag[0] === 'event').map((e) => e.gtag[1]);
  console.log('\ndataLayer events (GTM style): ' + (dlEvents.join(', ') || 'none'));
  console.log('gtag("event") commands: ' + (gtagEvents.join(', ') || 'none'));
  console.log(`\nGoogle hits ${flag('--allow-send') ? 'sent' : 'captured (answered locally, not sent)'}: ${hits.length}`);
  hits.forEach((h) => console.log(`  ${h.host}${h.path} ${h.tid || ''} ${h.events.join(', ')}`));
  if (submitted) {
    console.log('\nform submission captured: ' + (formPosts.length ? '' : 'none (handled by JavaScript or blocked by validation)'));
    formPosts.forEach((p) => console.log(`  ${p.method} ${p.url.slice(0, 160)} (${p.via})`));
    const leak = formPosts.some((p) => p.method === 'GET' && decodeURIComponent(p.url).includes(TEST_EMAIL));
    if (leak) console.log('WARN the form sends the email in the URL (GET): use method="post"; GA4 page URLs would contain it');
    const leads = frames.reduce((n, f) => n + f.events.filter((e) => e === 'generate_lead').length, 0);
    console.log(leads ? `generate_lead fired ${leads}x` : 'WARN no generate_lead after submit (form not detected as a lead form? see data-lead)');
  }
  const pii = hits.some((h) => JSON.stringify(h).includes('qa.tracker'));
  if (pii) console.log('FAIL the test email appears in a Google hit (personal data sent to Google)');
  if (containers.length && !hits.length && !flag('--allow-send')) {
    console.log('WARN a Google container loaded but sent NO hits: the GTM container may be empty or unpublished, '
      + 'consent may be denied, or tags fire on other triggers. Check it in GTM Preview / Tag Assistant.');
  }
  if (consoleErrors.length) console.log('\nconsole errors:\n  ' + consoleErrors.slice(0, 10).join('\n  '));
  const out = val('--json', null);
  if (out) require('fs').writeFileSync(out, JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
