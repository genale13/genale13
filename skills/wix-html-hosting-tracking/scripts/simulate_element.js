#!/usr/bin/env node
/*
 * Route B3 check BEFORE the custom element goes on Wix: a simulated Wix page on your real hostname (header, native
 * text, button and form, footer, and the site's Google tag or GTM as Marketing Integrations loads it), with the
 * <tag>.js from `prepare_site.py --route element` added the way Wix adds a custom element.
 *
 * Checks: the element renders; the Wix page's own styles do not change (CSS leaks); structured data and fonts;
 * html-tracker runs in direct mode and ignores the Wix parts of the page; a form submission (--submit) gives ONE
 * generate_lead; Google hits (captured and answered locally: nothing reaches your reports, no test lead reaches
 * your CRM); a Wix page change and back (Wix is a single-page app: the element is created again and must not run
 * the page scripts twice).
 *
 * usage:
 *   node simulate_element.js --element out/<tag>.js --site https://www.example.com [--path /landing]
 *        [--gtag G-XXXX,AW-123] | [--gtm GTM-XXXX] [--submit] [--offline] [--wait 6000]
 *        [--screenshot shot.png] [--full] [--json result.json] [--tag <tag>]
 *   --offline   do not download Google libraries (stub them): checks the element only, no Google hits
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
const file = val('--element');
if (!file) { console.error('need --element <tag>.js (made by prepare_site.py --route element)'); process.exit(2); }
const JS = fs.readFileSync(file, 'utf8');
const TAG = val('--tag', (JS.match(/^\/\*!\s*<([a-z][a-z0-9._]*-[a-z0-9._-]*)>/) || [])[1]);
if (!TAG) { console.error('could not read the tag name from the file header; pass --tag <tag>'); process.exit(2); }
const SITE = new URL(val('--site', 'https://www.example.com')).origin;
const PATH = val('--path', '/landing');
const GTAG = (val('--gtag', '') || '').split(',').map((x) => x.trim()).filter(Boolean);
const GTM = val('--gtm', '');
const WAIT = +val('--wait', 6000);
const OFFLINE = flag('--offline');
const TEST_EMAIL = 'qa.tracker+sim@example.com';
const TEST_PHONE = '+34 600 000 000';
const GCLID = 'SIM-GCLID-123';
const EL_URL = `${SITE}/_sim_element/${TAG}.js`;
const GOOGLE_HIT = /(^|\.)(google-analytics\.com|analytics\.google\.com|googleadservices\.com|doubleclick\.net)$|^www\.google\.[a-z.]+$/;
// Wix-native parts of the simulated page whose computed styles must not change when the element arrives
const NATIVE = ['html', 'body', '#SITE_HEADER', '#SITE_HEADER h2', '#wix-nav', '#wix-native', '#wix-native h3', '#wix-native p',
  '#wix-native ul', '#wix-native li', '#wix-native a', '#wix-btn', '#wix-input', '#wix-img', '#SITE_FOOTER', '#wix-foot'];
const PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color', 'background-color', 'background-image',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius', 'box-sizing', 'display', 'position',
  'text-transform', 'text-align', 'letter-spacing', 'text-decoration-line', 'list-style-type', 'opacity', 'visibility',
  'transform', 'filter', 'scroll-behavior', 'cursor', 'outline-style', 'box-shadow'];
const NOT_CLICKS = /^(scroll_depth|engaged_time|element_view|form_view|form_abandon|video_|embed_view|page_view)/;

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
// Few explicit styles on purpose: a page rule that escapes the element (button{}, p{}, *{}) shows up as a change.
const wixPage = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Simulated Wix page</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="wix-sim-css">body{margin:0;font-family:Arial,sans-serif;color:rgb(17,17,17);background:rgb(250,250,250)}
#SITE_HEADER{display:block;height:80px;background:rgb(255,255,255);font-family:Georgia,serif;color:rgb(20,40,60)}
#SITE_HEADER h2{margin:0;padding:20px 24px 4px}
#SITE_FOOTER{display:block;min-height:120px;background:rgb(34,34,34);color:rgb(238,238,238)}</style>
${tagLoader()}</head><body>
<header id="SITE_HEADER"><h2>Simulated Wix header</h2><a id="wix-nav" href="/other-page">Other page</a></header>
<main id="PAGES_CONTAINER">
<section id="wix-native"><h3>Native Wix text</h3><p>Paragraph with a <a href="/contact">link</a>.</p><ul><li>item</li></ul>
<button id="wix-btn" type="button">Wix button</button><form id="wix-form" onsubmit="return false"><input id="wix-input" name="newsletter_email" type="email"></form>
<img id="wix-img" alt="" width="10" height="10" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></section>
<section id="el-section"><div id="el-slot"></div></section>
</main>
<footer id="SITE_FOOTER"><p id="wix-foot">Simulated Wix footer</p></footer>
</body></html>`;

function snapshot([sels, props]) {
  const out = {};
  sels.forEach((s) => {
    const el = document.querySelector(s);
    if (!el) return;
    const cs = getComputedStyle(el);
    out[s] = {};
    props.forEach((p) => { out[s][p] = cs.getPropertyValue(p); });
  });
  return out;
}
function hitInfo(req) {
  const u = new URL(req.url());
  const out = { host: u.hostname, path: u.pathname, events: [], params: {}, raw: decodeURIComponent(req.url()) + ' ' + (req.postData() || '') };
  const take = (qs) => { const p = new URLSearchParams(qs); if (p.get('en')) out.events.push(p.get('en')); ['tid', 'dl', 'label', 'value', 'currency_code', 'gclaw'].forEach((k) => { if (p.get(k)) out.params[k] = p.get(k); }); };
  take(u.search);
  if (/\/g\/collect/.test(u.pathname)) (req.postData() || '').split(/\r?\n/).forEach((l) => l && take(l));
  return out;
}
const pickCta = ([tag, index]) => { // a visible in-page link or button inside the element, outside forms
  const wrap = document.querySelector(tag + ' > [data-html-body]');
  if (!wrap) return null;
  const all = Array.from(wrap.querySelectorAll('a[href^="#"], button:not([type=submit]), [role=button], [data-track]'));
  const ok = (el) => { // on screen horizontally (skip links and off-screen helpers are not CTAs)
    const r = el.getBoundingClientRect();
    return !el.closest('form') && r.width > 4 && r.height > 4 && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
  };
  const i = index === null ? all.findIndex(ok) : index;
  if (i < 0 || !all[i]) return null;
  all[i].setAttribute('data-sim-cta', '');
  return { index: i, text: (all[i].textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) };
};
const dlNames = () => {
  const isArgs = (e) => Object.prototype.toString.call(e) === '[object Arguments]';
  return (window.dataLayer || []).map((e) => (isArgs(e) ? (e[0] === 'event' ? 'gtag:' + e[1] : null) : e && e.event && !/^gtm\./.test(e.event) ? 'push:' + e.event : null)).filter(Boolean);
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const hits = [], posts = [], errors = [], pageErrors = [], misses = [];
  let submitted = false;
  await context.addInitScript(() => {
    // runs after the page's own handlers (bubble phase on window): links may not leave the simulated page,
    // native form submits are recorded and stopped; in-page #anchors keep working
    window.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (a && !e.defaultPrevented && (a.getAttribute('href') || '').charAt(0) !== '#') e.preventDefault();
    });
    window.__simSubmits = [];
    window.addEventListener('submit', (e) => {
      const f = e.target;
      window.__simSubmits.push({ form: f.id || f.getAttribute('name') || '', method: (f.getAttribute('method') || 'get').toUpperCase(), action: f.getAttribute('action') || '', script: e.defaultPrevented });
      if (!e.defaultPrevented) e.preventDefault();
    });
  });
  await context.route('**/*', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.url() === EL_URL) return route.fulfill({ status: 200, contentType: 'application/javascript', body: JS });
    if (u.origin === SITE) {
      if (req.resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html', body: wixPage() });
      if (!/favicon/.test(u.pathname)) misses.push(u.pathname);
      return route.fulfill({ status: 404, body: '' });
    }
    if (GOOGLE_HIT.test(u.hostname)) { hits.push(hitInfo(req)); return route.fulfill({ status: 204, body: '' }); }
    if (/googletagmanager\.com$/.test(u.hostname) && OFFLINE) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (submitted && req.method() !== 'GET') { posts.push(`${req.method()} ${req.url().slice(0, 120)}`); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    return route.continue();
  });
  const page = await context.newPage();
  context.on('page', (p) => { if (p !== page) p.close().catch(() => {}); }); // links opening a new tab
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 180)));
  // global listeners added by the page's own scripts (not the Google tag or widgets), to see if they run twice
  const cdp = await context.newCDPSession(page);
  const scriptUrl = {};
  cdp.on('Debugger.scriptParsed', (e) => { scriptUrl[e.scriptId] = e.url || ''; });
  await cdp.send('Debugger.enable');
  const listenerCount = async () => {
    const out = {};
    for (const expr of ['window', 'document']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      listeners.forEach((l) => {
        const u = scriptUrl[l.scriptId] || '';
        if (u && !u.startsWith(SITE)) return;
        const k = `${expr}:${l.type}`;
        out[k] = (out[k] || 0) + 1;
      });
    }
    return out;
  };

  let fails = 0;
  const say = (level, msg) => { console.log(`${level.padEnd(4)} ${msg}`); if (level === 'FAIL') fails++; };
  const sleep = (ms) => page.waitForTimeout(ms);
  console.log(`Simulated Wix page ${SITE}${PATH} with <${TAG}> (${Math.round(JS.length / 1024)} KB)${OFFLINE ? ' (offline)' : ''}\n`);

  await page.goto(`${SITE}${PATH}?gclid=${GCLID}&utm_source=google&utm_medium=cpc&utm_campaign=simulation`, { waitUntil: 'load', timeout: 60000 });
  await sleep(800);
  const before = await page.evaluate(snapshot, [NATIVE, PROPS]);
  // Wix creates the element on the page and loads the script from the Server URL
  await page.evaluate(([tag, url]) => {
    document.getElementById('el-slot').appendChild(document.createElement(tag));
    const s = document.createElement('script'); s.src = url; document.head.appendChild(s);
  }, [TAG, EL_URL]);
  const rendered = await page.waitForSelector(`${TAG} > [data-html-body]`, { timeout: 20000 }).then(() => true, () => false);
  if (!rendered) {
    say('FAIL', `<${TAG}> did not render (wrong tag name, or the script failed: ${pageErrors.concat(errors).slice(0, 2).join(' | ') || 'no error shown'})`);
    await browser.close();
    process.exit(1);
  }
  await sleep(2500);
  const after = await page.evaluate(snapshot, [NATIVE, PROPS]);
  const leaks = [];
  Object.keys(before).forEach((s) => PROPS.forEach((p) => {
    if (after[s] && before[s][p] !== after[s][p]) leaks.push(`${s} ${p}: ${before[s][p]} -> ${after[s][p]}`);
  }));
  say(leaks.length ? 'FAIL' : 'OK', leaks.length ? `the element changed the Wix page's own styles: ${leaks.slice(0, 6).join('; ')}${leaks.length > 6 ? ' ...' : ''}`
    : 'Wix header, text, button, form, image and footer keep their styles (no CSS leak)');

  // scroll through like a visitor (lazy images, reveal animations, scroll depth)
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= total; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await sleep(100); }
  await sleep(1000);
  const info = await page.evaluate((tag) => {
    const host = document.querySelector(tag);
    const wrap = host.querySelector(':scope > [data-html-body]');
    const imgs = Array.from(wrap.querySelectorAll('img'));
    return {
      text: wrap.innerText.trim().length,
      h1: Array.from(wrap.querySelectorAll('h1')).map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 90)),
      height: Math.round(host.getBoundingClientRect().height),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)).map((i) => (i.currentSrc || i.src).slice(0, 100)),
      ld: Array.from(document.querySelectorAll('head script[type="application/ld+json"]')).map((s) => {
        try { const j = JSON.parse(s.textContent); return [].concat(j['@graph'] || j).map((x) => x['@type']).join('+'); } catch (e) { return 'INVALID JSON'; }
      }),
      fonts: Array.from(document.querySelectorAll('head link[rel=stylesheet]')).length,
      css: !!document.getElementById(tag + '-css'),
      tracker: window.htmlTracker ? window.htmlTracker.mode : null,
      log: window.htmlTracker ? window.htmlTracker.log.map((e) => e.name) : [],
      htmlClasses: document.documentElement.className,
    };
  }, TAG);
  say(info.text > 50 ? 'OK' : 'FAIL', `content rendered: ${info.text} characters, element height ${info.height}px${info.h1.length ? `, h1 "${info.h1[0]}"` : ''}`);
  if (info.h1.length !== 1) say('WARN', `${info.h1.length} <h1> in the element: a page needs exactly one (the Wix page itself should have none)`);
  say(info.css ? 'OK' : 'FAIL', `scoped stylesheet in <head>${info.fonts ? `, ${info.fonts} font/stylesheet link(s)` : ''}`);
  if (info.ld.length) say(info.ld.includes('INVALID JSON') ? 'FAIL' : 'OK', `structured data in <head>: ${info.ld.join(', ')}`);
  if (info.broken.length) say('WARN', `images that did not load: ${info.broken.slice(0, 4).join(', ')}`);
  if (misses.length) say('WARN', `relative URLs requested from the Wix site (they 404 on Wix): ${[...new Set(misses)].slice(0, 5).join(', ')}`);
  say(info.tracker === 'direct' ? 'OK' : 'FAIL', `html-tracker ${info.tracker ? `runs in ${info.tracker} mode inside the Wix page` : 'is not running (built without a tracker?)'}`);
  const scroll = info.log.filter((n) => n === 'scroll_depth').length;
  say(scroll ? 'OK' : 'INFO', `scroll_depth events while scrolling the element: ${scroll}`);

  // the Wix parts of the page must not be tracked by the element's tracker
  const n0 = info.log.length;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#wix-nav').catch(() => {});
  await page.click('#wix-btn').catch(() => {});
  await page.click('#wix-input').catch(() => {});
  await page.keyboard.type('x');
  await sleep(500);
  const wixEvents = (await page.evaluate((n) => window.htmlTracker.log.slice(n).map((e) => e.name), n0)).filter((n) => !NOT_CLICKS.test(n));
  say(wixEvents.length ? 'FAIL' : 'OK', wixEvents.length ? `clicks/forms on the Wix page were tracked by the element: ${wixEvents.join(', ')}` : 'clicks and forms outside the element are ignored by its tracker');

  // a click inside the element; repeated after a Wix page change to catch scripts that run twice
  const clickDelta = async (cta) => {
    const a = await page.evaluate(dlNames);
    await page.locator(`${TAG} [data-sim-cta]`).first().click({ noWaitAfter: true, timeout: 5000 })
      .catch((e) => console.log(`     (click on "${cta.text}" failed: ${String(e.message || e).split('\n')[0].slice(0, 100)})`));
    await sleep(1200);
    const b = await page.evaluate(dlNames);
    await page.evaluate(() => window.scrollTo(0, 0));
    return b.slice(a.length).filter((n) => !NOT_CLICKS.test(n.split(':')[1])).sort();
  };
  const cta = await page.evaluate(pickCta, [TAG, null]);
  let firstClick = null;
  if (cta) {
    firstClick = await clickDelta(cta);
    say(firstClick.length ? 'OK' : 'INFO', `click on "${cta.text}" inside the element -> ${firstClick.join(', ') || 'no event (only links, buttons and data-track elements are tracked)'}`);
  } else say('INFO', 'no in-page link or button outside forms to click inside the element');

  // form submission
  let leads = null;
  if (flag('--submit')) {
    const formSel = await page.evaluate((tag) => {
      const forms = Array.from(document.querySelectorAll(tag + ' form'));
      const f = forms.find((x) => x.querySelector('input[type=email], input[type=tel], input[name*=mail i], input[name*=phone i], input[name*=tel i]')) || forms[0];
      if (!f) return null;
      if (!f.id) f.id = 'sim-form';
      return '#' + CSS.escape(f.id);
    }, TAG);
    if (!formSel) say('INFO', '--submit: no form inside the element');
    else {
      const startNames = await page.evaluate(dlNames);
      await page.locator(formSel).scrollIntoViewIfNeeded().catch(() => {});
      await page.evaluate(([sel, email, phone]) => {
        const f = document.querySelector(sel), seen = {};
        const fire = (i, t) => i.dispatchEvent(new Event(t, { bubbles: true }));
        f.querySelectorAll('input, textarea, select').forEach((i) => {
          const t = (i.type || '').toLowerCase();
          if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(t) || i.disabled || i.readOnly) return;
          const r = i.getBoundingClientRect(); // anti-spam honeypots: off-screen, aria-hidden or tabindex=-1 (a visitor never fills them)
          if (i.tabIndex < 0 || i.closest('[aria-hidden="true"]') || (i.getClientRects().length && (r.right <= 0 || r.bottom < -500 || (r.width <= 1 && r.height <= 1 && t !== 'checkbox' && t !== 'radio')))) return;
          if (t === 'checkbox' || t === 'radio') { // tick required boxes and one choice per group, like a visitor
            const g = i.name || i.id;
            if ((i.required || !seen[g]) && !i.checked) i.click();
            seen[g] = true;
            return;
          }
          i.focus();
          if (i.tagName === 'SELECT') {
            if (!i.value) { const k = Array.from(i.options).findIndex((o, n) => n > 0 && !o.disabled && o.value); if (k > 0) i.selectedIndex = k; }
          } else if (!i.value) {
            const n = `${i.name} ${i.id} ${i.autocomplete || ''}`.toLowerCase();
            i.value = t === 'email' || /mail|correo|courriel/.test(n) ? email
              : t === 'tel' || /phone|tel|whatsapp|movil|celular/.test(n) ? phone
                : t === 'number' ? (i.min || '1') : t === 'date' ? '2030-01-15' : t === 'url' ? 'https://example.com'
                  : i.tagName === 'TEXTAREA' ? 'QA simulation message' : 'QA Simulation';
          }
          fire(i, 'input'); fire(i, 'change'); i.blur();
        });
      }, [formSel, TEST_EMAIL, TEST_PHONE]);
      await sleep(400);
      submitted = true;
      const btn = page.locator(`${formSel} [type=submit], ${formSel} button:not([type])`).first();
      if (await btn.isVisible().catch(() => false)) await btn.click({ noWaitAfter: true }).catch(() => {});
      else await page.evaluate((sel) => { const f = document.querySelector(sel); if (f.requestSubmit) f.requestSubmit(); else f.submit(); }, formSel);
      await sleep(WAIT);
      const st = await page.evaluate((sel) => ({
        invalid: Array.from(document.querySelectorAll(sel + ' :invalid')).map((i) => i.name || i.id).slice(0, 5),
        submits: window.__simSubmits.slice(0),
      }), formSel);
      const fresh = (await page.evaluate(dlNames)).slice(startNames.length);
      const viaGtag = fresh.filter((n) => n === 'gtag:generate_lead').length;
      const viaPush = fresh.filter((n) => n === 'push:generate_lead').length;
      leads = GTM && !GTAG.length ? viaPush : viaGtag;
      st.submits.forEach((s) => console.log(`     form submit: #${s.form || '?'} ${s.method}${s.action ? ' -> ' + s.action.slice(0, 80) : ''} (${s.script ? 'handled by the page script' : 'native submit, stopped here'})`));
      if (posts.length) console.log(`     requests after the submit, answered locally: ${posts.slice(0, 4).join(' | ')}${posts.length > 4 ? ` (+${posts.length - 4})` : ''}`);
      console.log(`     events after the submit: ${[...new Set(fresh)].join(', ') || 'none'}`);
      if (leads === 1) say('OK', `generate_lead sent once to the ${GTM && !GTAG.length ? 'GTM dataLayer' : 'Google tag'}${viaPush && !(GTM && !GTAG.length) ? ' (the page\'s own dataLayer push is relayed, not doubled)' : ''}`);
      else if (leads > 1) say('FAIL', `generate_lead sent ${leads} times for one submission (double counting)`);
      else say('WARN', `no generate_lead after submitting${st.invalid.length ? ` (invalid fields: ${st.invalid.join(', ')})` : ''}${st.submits.length ? '' : '; the form did not submit'}`);
    }
  }

  // Wix page change and back: Wix removes the element, then creates a NEW one when the visitor returns
  const listenersBefore = await listenerCount();
  const spa = await page.evaluate(async ([tag, path]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const slot = document.getElementById('el-slot');
    document.querySelector(tag).remove();
    history.pushState({}, '', '/other-page');
    await wait(700);
    const gone = !document.querySelector('[data-html-body]');
    history.pushState({}, '', path);
    slot.appendChild(document.createElement(tag));
    await wait(1500);
    const host = document.querySelector(tag);
    const wrap = host && host.querySelector(':scope > [data-html-body]');
    return { gone, rendered: !!wrap && wrap.innerText.trim().length > 50, wraps: document.querySelectorAll('[data-html-body]').length,
      styles: document.querySelectorAll('#' + CSS.escape(tag + '-css')).length, sentinels: document.querySelectorAll('[data-html-tracker=scroll]').length };
  }, [TAG, PATH]);
  const spaOk = spa.gone && spa.rendered && spa.wraps === 1 && spa.styles === 1;
  say(spaOk ? 'OK' : 'FAIL', `Wix page change and back: ${spa.rendered ? 'content shown again' : 'content MISSING'}, ${spa.wraps} copy of the page, ${spa.styles} stylesheet`);
  const listenersAfter = await listenerCount();
  const added = Object.keys(listenersAfter).filter((k) => listenersAfter[k] > (listenersBefore[k] || 0))
    .map((k) => `${k} +${listenersAfter[k] - (listenersBefore[k] || 0)}`);
  say(added.length ? 'FAIL' : 'OK', added.length ? `the page scripts ran again after the page change (new global listeners: ${added.join(', ')}): events would double`
    : 'the page scripts did not run twice (no new window/document listeners)');
  if (cta && firstClick) {
    const again = await page.evaluate(pickCta, [TAG, cta.index]);
    const second = again ? await clickDelta(again) : [];
    const tally = (list) => list.reduce((m, n) => { m[n] = (m[n] || 0) + 1; return m; }, {});
    const c1 = tally(firstClick), c2 = tally(second);
    const doubled = Object.keys(c2).filter((n) => c1[n] && c2[n] > c1[n]);
    say(doubled.length ? 'FAIL' : 'OK', doubled.length ? `after the page change the same click sends more ${doubled.join(', ')} events: page scripts ran twice`
      : `after the page change the same click sends the same events (${second.join(', ') || 'none'})`);
  }

  // Google hits (answered locally)
  if (!OFFLINE && (GTAG.length || GTM)) {
    const ga = hits.filter((h) => /collect/.test(h.path));
    const ads = hits.filter((h) => /pagead\/conversion|ccm\/collect|1p-conversion/.test(h.path) && h.params.label);
    console.log(`     Google hits captured locally: ${hits.length} (GA4 ${ga.length}, Ads conversion pings ${ads.length})`);
    const gaEvents = [...new Set(ga.flatMap((h) => h.events))];
    if (gaEvents.length) console.log(`     GA4 events: ${gaEvents.join(', ')}`);
    if (leads) say(gaEvents.includes('generate_lead') ? 'OK' : 'WARN', gaEvents.includes('generate_lead') ? 'GA4 received generate_lead through the real Google tag' : 'no GA4 hit with generate_lead (GTM container without a GA4 event tag?)');
    const wrongHost = ga.filter((h) => h.params.dl && !h.params.dl.startsWith(SITE));
    if (ga.length) say(wrongHost.length ? 'FAIL' : 'OK', wrongHost.length ? `GA4 hits report another URL: ${wrongHost[0].params.dl}` : 'GA4 hits report the Wix page URL');
    ads.forEach((h) => say('OK', `Ads conversion ping: label ${h.params.label}, value ${h.params.value || '-'} ${h.params.currency_code || ''}, gclid ${h.params.gclaw ? 'yes' : 'no'}`));
    if (!hits.length) say('WARN', 'no Google hit at all: empty/unpublished GTM container, wrong ID, or consent denied');
  } else if (!GTAG.length && !GTM) say('INFO', 'no --gtag/--gtm given: the simulated Wix page has no Google tag');
  const pii = hits.some((h) => h.raw.includes(TEST_EMAIL) || h.raw.replace(/\D/g, '').includes('600000000'));
  say(pii ? 'FAIL' : 'OK', 'no raw email or phone number in any Google hit');
  if (pageErrors.length) say('WARN', `uncaught script errors: ${pageErrors.slice(0, 3).join(' | ')}`);
  const other = errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  if (other.length) say('INFO', `console errors (often third-party widgets): ${other.slice(0, 3).join(' | ')}`);

  const shot = val('--screenshot', null);
  if (shot) {
    await page.evaluate((tag) => document.querySelector(tag).scrollIntoView(), TAG).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.screenshot({ path: shot, fullPage: flag('--full') });
    console.log(`     screenshot: ${shot}`);
  }
  const out = val('--json', null);
  if (out) fs.writeFileSync(out, JSON.stringify({ tag: TAG, leaks, info, wixEvents, firstClick, leads, spa, hits, posts, errors, pageErrors }, null, 2));
  await browser.close();
  console.log(fails ? `\n${fails} FAIL` : '\nNo FAIL');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
