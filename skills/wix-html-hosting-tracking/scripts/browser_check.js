#!/usr/bin/env node
/*
 * In-browser tracking check with Playwright (Chromium).
 * Loads a page (Wix static page, or a Wix editor page with an Embed HTML iframe), scrolls through it,
 * optionally clicks something, then reports:
 *   - html-tracker events logged in every frame (page + iframes) and whether the iframe got the
 *     parent's attribution context (gclid / UTM)
 *   - dataLayer pushes on the top page (GTM events and gtag() commands)
 *   - Google hits the page tried to send (GA4 /g/collect event names, Google Ads pings)
 * Google hits are captured and BLOCKED by default so a test does not pollute your reports;
 * pass --allow-send to let them through (then use GA4 DebugView / Tag Assistant).
 *
 * Usage:
 *   node browser_check.js "https://lp.example.com/?utm_source=qa&utm_medium=test" [--click "a.cta"]
 *        [--click-frame] [--wait 6000] [--allow-send] [--json out.json]
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
const WAIT = +val('--wait', 6000);
const GOOGLE = /(^|\.)(google-analytics\.com|analytics\.google\.com|googleadservices\.com|doubleclick\.net)$|^www\.google\.[a-z.]+$/;

function hitInfo(req) {
  const u = new URL(req.url());
  const out = { host: u.hostname, path: u.pathname, events: [] };
  const collect = (qs) => { const p = new URLSearchParams(qs); const en = p.get('en'); if (en) out.events.push(en); if (p.get('tid')) out.tid = p.get('tid'); };
  if (/\/g\/collect/.test(u.pathname)) {
    collect(u.search);
    const body = req.postData() || '';
    body.split('\n').forEach((line) => line && collect(line));
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
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  await page.route('**/*', (route) => {
    let host = '';
    try { host = new URL(route.request().url()).hostname; } catch (e) {}
    if (GOOGLE.test(host) && !/googletagmanager\.com$/.test(host)) {
      hits.push(hitInfo(route.request()));
      return flag('--allow-send') ? route.continue() : route.abort();
    }
    return route.continue();
  });

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
  await browser.close();

  const report = { url, containers, frames, dataLayer, hits, consoleErrors };
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
  console.log(`\nGoogle hits ${flag('--allow-send') ? 'sent' : 'captured and blocked'}: ${hits.length}`);
  hits.forEach((h) => console.log(`  ${h.host}${h.path} ${h.tid || ''} ${h.events.join(', ')}`));
  if (consoleErrors.length) console.log('\nconsole errors:\n  ' + consoleErrors.slice(0, 10).join('\n  '));
  const out = val('--json', null);
  if (out) require('fs').writeFileSync(out, JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
