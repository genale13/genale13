#!/usr/bin/env node
/*
 * Route B check BEFORE anything is installed on Wix: simulate the published Wix page locally.
 *
 *   https://<your site>/<path>                         -> simulated Wix page: the Google tag or GTM (as Marketing
 *                                                         Integrations loads it) + your wix-parent-listener.html
 *   https://<your-site-with-dashes>.filesusr.com/html/  -> your .embed.html in an iframe, exactly as Wix serves it
 *
 * Playwright answers both hostnames itself; nothing is published. By default Google's real gtag.js / gtm.js load,
 * and every Google hit (GA4, Google Ads) is captured and answered locally, so nothing reaches your reports.
 * Form posts after --submit are captured too (no test lead reaches your CRM or form service).
 *
 * usage:
 *   node simulate_embed.js --embed out/quote.embed.html --listener out/wix-parent-listener.html \
 *        --site https://www.example.com [--path /contact] [--gtag G-XXXX,AW-123] | [--gtm GTM-XXXX]
 *        [--submit] [--late 12000] [--no-listener] [--offline] [--wait 8000] [--json result.json]
 *   --late MS      inject the listener MS after load (Custom Code "Analytic" loading after cookie consent)
 *   --no-listener  visitor refused cookies: nothing should be sent
 *   --offline      do not download Google libraries (stub them); checks the bridge only, no Google hits
 */
'use strict';
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('playwright is not installed: npm i playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] && !/^--/.test(args[i + 1]) ? args[i + 1] : d; };
const embedFile = val('--embed');
const listenerFile = val('--listener');
if (!embedFile || !listenerFile) { console.error('need --embed <file.embed.html> and --listener <wix-parent-listener.html>'); process.exit(2); }
const SITE = new URL(val('--site', 'https://www.example.com')).origin;
const PATH = val('--path', '/');
const GTAG = (val('--gtag', '') || '').split(',').map((x) => x.trim()).filter(Boolean);
const GTM = val('--gtm', '');
const LATE = +val('--late', 0);
const WAIT = +val('--wait', 8000) + LATE;
const OFFLINE = flag('--offline');
const GCLID = 'SIM-GCLID-123';
const TEST_EMAIL = 'qa.tracker+sim@example.com';
const EMBED_URL = 'https://' + new URL(SITE).hostname.replace(/\./g, '-') + '.filesusr.com/html/sim_embed.html';
const GOOGLE_HIT = /(^|\.)(google-analytics\.com|analytics\.google\.com|googleadservices\.com|doubleclick\.net)$|^www\.google\.[a-z.]+$/;

const embedHtml = fs.readFileSync(embedFile, 'utf8');
const listenerHtml = fs.readFileSync(listenerFile, 'utf8');
const listenerJs = (listenerHtml.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';
let listenerCfg = {};
try { listenerCfg = JSON.parse((listenerHtml.match(/\/\*__CONFIG_START__\*\/([\s\S]*?)\/\*__CONFIG_END__\*\//) || [])[1]); } catch (e) { /* manual edits */ }

function tagLoader() {
  if (GTM) {
    return "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],"
      + "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);"
      + `})(window,document,'script','dataLayer','${GTM}');</script>`;
  }
  if (GTAG.length) {
    return `<script async src="https://www.googletagmanager.com/gtag/js?id=${GTAG[0]}"></script>`
      + "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());"
      + GTAG.map((id) => `gtag('config','${id}');`).join('') + '</script>';
  }
  return '<!-- no Google tag connected -->';
}
function parentHtml() {
  let listener = '';
  if (!flag('--no-listener')) {
    listener = LATE
      ? `<script>setTimeout(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(listenerJs)};document.body.appendChild(s);},${LATE});</script>`
      : listenerHtml;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Simulated Wix page</title>${tagLoader()}</head><body>
<h1>Simulated Wix page</h1><div style="height:1200px">page content above the embed</div>
<iframe id="sim-embed" src="${EMBED_URL}" style="width:100%;height:1800px;border:0" title="embed"></iframe>
${listener}</body></html>`;
}
function hitInfo(req) {
  const u = new URL(req.url());
  const out = { host: u.hostname, path: u.pathname, events: [], params: {} };
  const take = (qs) => { const p = new URLSearchParams(qs); if (p.get('en')) out.events.push(p.get('en')); ['tid', 'dl', 'label', 'value', 'currency_code', 'gclaw', 'url'].forEach((k) => { if (p.get(k)) out.params[k] = p.get(k); }); };
  take(u.search);
  if (/\/g\/collect/.test(u.pathname)) (req.postData() || '').split(/\r?\n/).forEach((l) => l && take(l));
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const hits = [], posts = [], errors = [];
  let submitted = false;
  await context.addInitScript(({ blockSubmit }) => {
    window.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a'); if (a) e.preventDefault(); }, true);
    window.__simSubmits = [];
    if (blockSubmit) {
      window.addEventListener('submit', (e) => {
        const f = e.target;
        try {
          const method = (f.getAttribute('method') || 'get').toUpperCase();
          const qs = new URLSearchParams(new FormData(f)).toString();
          window.__simSubmits.push({ method, url: method === 'GET' ? (f.action || location.href).split('?')[0] + '?' + qs : f.action || location.href, via: 'form' });
        } catch (x) { /* ignore */ }
        e.preventDefault();
      }, true);
    }
  }, { blockSubmit: flag('--submit') });
  await context.route('**/*', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.url().split('?')[0] === EMBED_URL) return route.fulfill({ status: 200, contentType: 'text/html', body: embedHtml });
    if (u.origin === SITE) {
      return req.resourceType() === 'document' ? route.fulfill({ status: 200, contentType: 'text/html', body: parentHtml() }) : route.fulfill({ status: 404, body: '' });
    }
    if (GOOGLE_HIT.test(u.hostname)) { hits.push(hitInfo(req)); return route.fulfill({ status: 204, body: '' }); }
    if (/googletagmanager\.com$/.test(u.hostname) && OFFLINE) {
      const stub = GTM ? `window.google_tag_manager=window.google_tag_manager||{};window.google_tag_manager['${GTM}']={};` : '';
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: stub });
    }
    if (submitted && req.method() !== 'GET') { posts.push({ method: req.method(), url: req.url(), via: 'script' }); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  const sep = PATH.includes('?') ? '&' : '?';
  await page.goto(`${SITE}${PATH}${sep}gclid=${GCLID}&utm_source=google&utm_medium=cpc&utm_campaign=simulation`, { waitUntil: 'load', timeout: 60000 });
  const frame = await (await page.waitForSelector('#sim-embed')).contentFrame();
  await frame.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const scrollBefore = await frame.evaluate(() => (window.htmlTracker ? window.htmlTracker.log.filter((e) => e.name === 'scroll_depth').length : -1));
  for (let y = 0; y <= 4200; y += 300) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(100); }
  const button = await frame.$('button:not([type=submit]), [role=button], a[href]');
  if (button) await button.click({ noWaitAfter: true }).catch(() => {});
  if (flag('--submit')) {
    const form = await frame.$('form');
    if (form) {
      await frame.evaluate(({ el, email }) => {
        el.querySelectorAll('input, textarea, select').forEach((i) => {
          const t = (i.type || '').toLowerCase();
          if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(t)) return;
          if (t === 'checkbox' || t === 'radio') { if (i.required) i.checked = true; return; }
          if (i.tagName === 'SELECT') { if (i.options.length > 1) i.selectedIndex = 1; return; }
          i.focus();
          i.value = t === 'email' || /mail|courriel|correo/i.test(i.name) ? email : t === 'tel' || /phone|tel/i.test(i.name) ? '+1 514 555 0100' : 'QA simulation';
          i.dispatchEvent(new Event('input', { bubbles: true }));
          i.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }, { el: form, email: TEST_EMAIL });
      await frame.waitForTimeout(400);
      submitted = true;
      await frame.evaluate((el) => (el.requestSubmit ? el.requestSubmit() : el.submit()), form).catch(() => {});
    } else console.log('--submit: no form inside the embed');
  }
  await page.waitForTimeout(WAIT);

  const embed = await frame.evaluate(() => (window.htmlTracker ? {
    mode: window.htmlTracker.mode, events: window.htmlTracker.log.map((e) => e.name), context: window.htmlTracker.context(),
    hiddenGclid: (document.querySelector('input[name=gclid],input[data-fill=gclid]') || {}).value || '',
    submits: window.__simSubmits || [],
  } : null)).catch(() => null);
  const parent = await page.evaluate(() => ({
    listener: !!window.__htmlTrackerListener,
    gtagEvents: (window.dataLayer || []).filter((e) => Object.prototype.toString.call(e) === '[object Arguments]' && e[0] === 'event')
      .map((e) => ({ name: e[1], source: e[2] && e[2].event_source, sendTo: e[2] && e[2].send_to, value: e[2] && e[2].value })),
    gtmEvents: (window.dataLayer || []).filter((e) => e && e.event_source === 'html_embed').map((e) => e.event),
    userData: (window.dataLayer || []).some((e) => Object.prototype.toString.call(e) === '[object Arguments]' && e[0] === 'set' && e[1] === 'user_data'),
  }));
  await browser.close();

  let fails = 0;
  const say = (level, msg) => { console.log(`${level.padEnd(4)} ${msg}`); if (level === 'FAIL') fails++; };
  console.log(`Simulated ${SITE}${PATH} with the embed on ${new URL(EMBED_URL).host}${LATE ? `, listener after ${LATE} ms` : ''}${flag('--no-listener') ? ', NO listener' : ''}${OFFLINE ? ' (offline)' : ''}\n`);
  if (!embed) { say('FAIL', 'html-tracker is not running inside the embed (was it prepared with --route embed?)'); process.exit(1); }
  say(embed.mode === 'bridge' ? 'OK' : 'FAIL', `tracker inside the iframe runs in ${embed.mode} mode`);
  console.log(`     iframe events: ${[...new Set(embed.events)].join(', ') || 'none'}`);
  if (scrollBefore === 0) say('OK', 'no scroll_depth while the embed was below the fold');
  const forwarded = parent.gtagEvents.filter((e) => e.source === 'html_embed').map((e) => e.name).concat(parent.gtmEvents);
  if (flag('--no-listener')) {
    say(forwarded.length ? 'FAIL' : 'OK', forwarded.length ? 'events reached the page without a listener?' : 'without the listener (cookies refused) nothing is forwarded');
  } else {
    say(parent.listener ? 'OK' : 'FAIL', 'listener running on the Wix page');
    say(embed.context.gclid === GCLID ? 'OK' : 'FAIL', `iframe received the page context (gclid ${embed.context.gclid || 'missing'}, utm_campaign ${embed.context.utm_campaign || 'missing'})`);
    if (embed.hiddenGclid !== undefined) say(embed.hiddenGclid === GCLID ? 'OK' : 'INFO', `hidden gclid field: ${embed.hiddenGclid || 'not present or empty'}`);
    say(forwarded.length ? 'OK' : 'FAIL', `${forwarded.length} event(s) forwarded to the page's ${GTM ? 'GTM dataLayer' : 'Google tag'}: ${[...new Set(forwarded)].join(', ')}`);
    Object.keys(listenerCfg.conversions || {}).forEach((ev) => {
      if (!embed.events.includes(ev)) { say('INFO', `conversion for ${ev} not tested (event did not happen${flag('--submit') ? '' : '; try --submit'})`); return; }
      const c = parent.gtagEvents.find((e) => e.name === 'conversion');
      say(c ? 'OK' : 'FAIL', c ? `Google Ads conversion issued: send_to ${c.sendTo}, value ${c.value}` : `no Google Ads conversion command after ${ev}`);
    });
  }
  const subs = embed.submits.concat(posts);
  subs.forEach((s) => console.log(`     form would submit: ${s.method} ${s.url.slice(0, 140)} (${s.via})`));
  if (subs.some((s) => s.method === 'GET' && decodeURIComponent(s.url).includes(TEST_EMAIL))) say('WARN', 'the form puts the email in the URL (GET); use method="post"');
  if (!OFFLINE) {
    const ga = hits.filter((h) => /collect/.test(h.path));
    const ads = hits.filter((h) => /pagead\/conversion|ccm\/collect|1p-conversion/.test(h.path) && h.params.label);
    console.log(`     Google hits captured locally: ${hits.length} (GA4 ${ga.length}, Ads conversion pings ${ads.length})`);
    const gaEvents = [...new Set(ga.flatMap((h) => h.events))];
    if (gaEvents.length) console.log(`     GA4 events: ${gaEvents.join(', ')}`);
    const filesusr = ga.some((h) => /filesusr\.com/.test(h.params.dl || ''));
    if (ga.length) say(filesusr ? 'FAIL' : 'OK', filesusr ? 'a GA4 hit reports the filesusr.com URL' : 'GA4 hits report the Wix page URL, not filesusr.com');
    ads.forEach((h) => say('OK', `Ads conversion ping: label ${h.params.label}, value ${h.params.value || '-'} ${h.params.currency_code || ''}, gclid ${h.params.gclaw ? 'yes' : 'no'}`));
    if ((GTAG.length || GTM) && !hits.length && !flag('--no-listener')) say('WARN', 'no Google hit at all: empty/unpublished GTM container, wrong ID, or consent denied');
  }
  say(hits.some((h) => JSON.stringify(h).includes('qa.tracker')) ? 'FAIL' : 'OK', 'no raw email in any Google hit');
  if (parent.userData) say('INFO', 'hashed user_data was set for enhanced conversions (Google Ads must have them turned on)');
  if (errors.length) say('WARN', `console errors: ${errors.slice(0, 3).join(' | ')}`);
  const out = val('--json', null);
  if (out) fs.writeFileSync(out, JSON.stringify({ embed, parent, hits, submits: subs, errors }, null, 2));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
