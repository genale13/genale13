#!/usr/bin/env node
/*
 * End-to-end test for wix-html-hosting-tracking (maintainers only; not part of the packaged skill).
 *   node e2e_test.js <fixture-dir>
 * <fixture-dir> must contain site-static/ and site-embed/ produced by prepare_site.py from
 * tests/fixture/src (see tests/run_tests.sh). Google endpoints are stubbed, nothing leaves the machine.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.argv[2] || '.');
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function serve(dir, port, host, extra) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (extra && extra[u.pathname]) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(extra[u.pathname]); }
      let p = path.join(dir, decodeURIComponent(u.pathname));
      if (p.endsWith('/')) p = path.join(p, 'index.html');
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        const type = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type }); res.end(data);
      });
    }).listen(port, host, () => resolve(srv));
  });
}

async function stubGoogle(context) {
  await context.route(/googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' }));
}

function dlEvents(entries) { return entries.filter((e) => e && e.event && !/^gtm\./.test(e.event)); }

(async () => {
  const browser = await chromium.launch();

  /* ---------------------------------------------------------------- DIRECT mode */
  const s1 = await serve(path.join(ROOT, 'site-static'), 8101, '127.0.0.1');
  const ctx1 = await browser.newContext();
  await stubGoogle(ctx1);
  await ctx1.addInitScript(() => {
    window.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); }, true);
  });
  const p1 = await ctx1.newPage();
  await p1.goto('http://127.0.0.1:8101/?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=TESTGCLID123');
  await p1.waitForFunction(() => window.htmlTracker && window.htmlTracker.mode);
  ok(await p1.evaluate(() => window.htmlTracker.mode) === 'direct', 'static page runs html-tracker in direct mode');
  const hidden = await p1.evaluate(() => ({
    gclid: document.querySelector('input[name=gclid]').value,
    src: document.querySelector('input[name=utm_source]').value,
    camp: document.querySelector('input[name=utm_campaign]').value }));
  ok(hidden.gclid === 'TESTGCLID123' && hidden.src === 'google' && hidden.camp === 'spring', 'hidden form fields filled from URL (gclid/utm)');
  for (const sel of ['#cta', '#call', '#mail', '#wa', '#pdf', '#ig', 'nav a[href="about/"]', '#toggle']) {
    await p1.click(sel); await p1.waitForTimeout(150);
  }
  await p1.click('#cta'); await p1.click('#cta'); await p1.click('#cta');
  for (let y = 0; y <= 5000; y += 400) { await p1.evaluate((v) => window.scrollTo(0, v), y); await p1.waitForTimeout(120); }
  await p1.click('input[name=name]');
  await p1.fill('input[name=name]', 'Ana');
  await p1.fill('input[name=email]', ' Ana.Maria@Gmail.com ');
  await p1.fill('input[name=phone]', '(514) 555-0199');
  await p1.click('input[name=name]'); // blur the phone field so "change" fires
  await p1.waitForTimeout(300);
  await p1.click('#send');
  await p1.evaluate(() => {
    const r = document.createRange(); r.selectNodeContents(document.querySelector('#call'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new ClipboardEvent('copy', { bubbles: true }));
  });
  await p1.waitForTimeout(11500); // engaged_time 10s
  const dl1 = await p1.evaluate(() => (window.dataLayer || []).map((e) => {
    if (Object.prototype.toString.call(e) === '[object Arguments]') return { gtag: Array.from(e) };
    return JSON.parse(JSON.stringify(e));
  }));
  const ev1 = dlEvents(dl1);
  const names1 = ev1.map((e) => e.event);
  const find = (n, pred) => ev1.find((e) => e.event === n && (!pred || pred(e)));
  ok(!!find('cta_click', (e) => e.click_text === 'Order now' && e.section === 'section#hero'), 'cta_click with text and section');
  ok(!!find('contact_click', (e) => e.contact_method === 'phone'), 'tel: link -> contact_click phone');
  ok(!!find('contact_click', (e) => e.contact_method === 'email' && !/@/.test(e.link_text)), 'mailto: -> contact_click email, address redacted from text');
  ok(!!find('contact_click', (e) => e.contact_method === 'whatsapp'), 'wa.me -> contact_click whatsapp');
  ok(!!find('download_click', (e) => e.file_extension === 'pdf'), 'pdf link -> download_click');
  ok(!!find('outbound_click', (e) => e.link_domain === 'www.instagram.com'), 'external link -> outbound_click');
  ok(!!find('link_click', (e) => /\/about\/$/.test(e.link_url)), 'internal link -> link_click');
  ok(!!find('pricing_toggle', (e) => e.plan === 'pro'), 'data-track custom event with data-track-* params');
  ok(!!find('rage_click'), 'rage_click after 3 fast clicks');
  ok([25, 50, 75, 90, 100].every((p) => find('scroll_depth', (e) => e.percent_scrolled === p)), 'scroll_depth 25/50/75/90/100');
  ok(!!find('element_view', (e) => e.element_name === 'pricing_table'), 'element_view for data-track-view');
  ok(!!find('form_view', (e) => e.form_id === 'quote'), 'form_view');
  ok(!!find('form_start', (e) => e.form_id === 'quote'), 'form_start');
  ok(!!find('form_submit', (e) => e.form_id === 'quote' && /forms\.example\.net/.test(e.form_destination)), 'form_submit with destination');
  const lead = find('generate_lead');
  ok(!!lead && lead.value === 40 && lead.currency === 'CAD', 'generate_lead with value 40 CAD');
  ok(!!lead && lead.user_data && lead.user_data.sha256_email_address === sha('anamaria@gmail.com'), 'enhanced conversions: email normalized (gmail dots) + SHA-256');
  ok(!!lead && lead.user_data && lead.user_data.sha256_phone_number === sha('+15145550199'), 'enhanced conversions: phone E.164 + SHA-256');
  ok(!JSON.stringify(ev1).includes('Ana.Maria') && !JSON.stringify(ev1).toLowerCase().includes('anamaria@'), 'no raw email anywhere in dataLayer');
  ok(!!find('text_copy', (e) => e.copy_type === 'phone'), 'text_copy detects a copied phone number');
  ok(!!find('engaged_time', (e) => e.engaged_seconds === 10), 'engaged_time 10s');
  const reset = await p1.evaluate(() => {
    const o = (window.dataLayer || []).find((e) => e && e.event === 'download_click');
    return !!o && Object.prototype.hasOwnProperty.call(o, 'contact_method') && o.contact_method === undefined;
  });
  ok(reset, 'GTM params reset between events (download_click clears contact_method)');
  const consentFirst = dl1.findIndex((e) => e.gtag && e.gtag[0] === 'consent');
  const gtmStart = dl1.findIndex((e) => e.event === 'gtm.js');
  ok(consentFirst > -1 && consentFirst < gtmStart, 'consent defaults pushed before GTM starts');
  ok(dl1.filter((e) => e.event === 'gtm.js').length === 1, 'exactly one GTM container start (old GTM removed)');
  console.log('      direct events:', [...new Set(names1)].join(', '));
  await ctx1.close(); s1.close();

  /* ---------------------------------------------------------------- BRIDGE mode */
  const listener = fs.readFileSync(path.join(ROOT, 'site-embed', 'wix-parent-listener.html'), 'utf8');
  const parentHtml = `<!doctype html><html><head><title>Wix page</title>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-NEW12345');</script>
</head><body><h1>Wix page</h1><div style="height:1400px">spacer</div>
<iframe id="embed" src="http://localhost:8202/index.embed.html" style="width:100%;height:1600px;border:0"></iframe>
<iframe id="evil" src="http://127.0.0.1:8203/evil.html" style="width:10px;height:10px"></iframe>
${listener}</body></html>`;
  const evil = `<!doctype html><script>setTimeout(function(){parent.postMessage({ns:'wixhtml',v:1,type:'event',embedId:'evil',name:'generate_lead',params:{form_id:'forged'}},'*');parent.postMessage({ns:'wixhtml',v:1,type:'hello'},'*');},300);
window.addEventListener('message',function(e){ if(e.data&&e.data.type==='context') document.title='LEAKED'; });</script>`;
  const sp = await serve(path.join(ROOT, 'site-embed'), 8201, '127.0.0.1', { '/parent.html': parentHtml });
  const sc = await serve(path.join(ROOT, 'site-embed'), 8202, 'localhost');
  const se = await serve(path.join(ROOT, 'site-embed'), 8203, '127.0.0.1', { '/evil.html': evil });
  const ctx2 = await browser.newContext();
  await stubGoogle(ctx2);
  await ctx2.addInitScript(() => {
    window.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); }, true);
    window.addEventListener('submit', (e) => e.preventDefault(), true);
  });
  const p2 = await ctx2.newPage();
  await p2.goto('http://127.0.0.1:8201/parent.html?gclid=PARENTGCLID&utm_source=google&utm_medium=cpc&utm_campaign=bridge');
  const child = await (await p2.waitForSelector('#embed')).contentFrame();
  await child.waitForFunction(() => window.htmlTracker && window.htmlTracker.context().gclid, null, { timeout: 15000 });
  ok(await child.evaluate(() => window.htmlTracker.mode) === 'bridge', 'embedded page runs html-tracker in bridge mode');
  const ch = await child.evaluate(() => ({ g: document.querySelector('input[name=gclid]').value, c: document.querySelector('input[name=utm_campaign]').value }));
  ok(ch.g === 'PARENTGCLID' && ch.c === 'bridge', 'iframe hidden fields filled with the PARENT page gclid/utm');
  await p2.waitForTimeout(800);
  const scrollBefore = await child.evaluate(() => window.htmlTracker.log.filter((e) => e.name === 'scroll_depth').length);
  ok(scrollBefore === 0, 'no scroll_depth while the embed is below the fold');
  for (let y = 0; y <= 4000; y += 300) { await p2.evaluate((v) => window.scrollTo(0, v), y); await p2.waitForTimeout(120); }
  for (const sel of ['#cta', '#call', '#ig']) { await child.click(sel); await child.waitForTimeout(150); }
  await child.click('input[name=name]');
  await child.fill('input[name=email]', 'buyer@example.com');
  await child.fill('input[name=phone]', '+1 514 555 0100');
  await child.click('input[name=name]');
  await child.waitForTimeout(300);
  await child.click('#send');
  await p2.waitForTimeout(1500);
  const dl2 = await p2.evaluate(() => (window.dataLayer || []).map((e) =>
    Object.prototype.toString.call(e) === '[object Arguments]' ? { gtag: JSON.parse(JSON.stringify(Array.from(e))) } : JSON.parse(JSON.stringify(e))));
  const gt = dl2.filter((e) => e.gtag);
  const evs = gt.filter((e) => e.gtag[0] === 'event').map((e) => ({ name: e.gtag[1], p: e.gtag[2] || {} }));
  const has = (n, pred) => evs.some((e) => e.name === n && (!pred || pred(e.p)));
  ok(has('embed_view', (p) => p.embed_id === 'spring-quote' && p.event_source === 'html_embed'), 'parent sends embed_view from the iframe (gtag mode)');
  ok(has('scroll_depth', (p) => p.percent_scrolled === 25), 'scroll_depth fires once the parent scrolls the embed into view');
  ok(has('cta_click', (p) => p.click_text === 'Order now'), 'cta_click forwarded to parent');
  ok(has('contact_click', (p) => p.contact_method === 'phone'), 'contact_click forwarded to parent');
  ok(has('outbound_click', (p) => p.link_domain === 'www.instagram.com'), 'outbound_click forwarded');
  ok(has('form_submit', (p) => p.form_id === 'quote'), 'form_submit forwarded');
  ok(has('generate_lead', (p) => p.lead_source === 'html_embed_form'), 'generate_lead forwarded');
  const conv = evs.find((e) => e.name === 'conversion');
  ok(conv && conv.p.send_to === 'AW-123456789/AbCdEfGh123' && conv.p.value === 40 && conv.p.currency === 'CAD', 'Google Ads conversion fired with send_to/value/currency');
  const ud = gt.find((e) => e.gtag[0] === 'set' && e.gtag[1] === 'user_data');
  ok(ud && ud.gtag[2].sha256_email_address === sha('buyer@example.com') && ud.gtag[2].sha256_phone_number === sha('+15145550100'),
    'enhanced conversions user_data (hashed) set before the conversion');
  ok(!has('generate_lead', (p) => p.form_id === 'forged'), 'forged event from a foreign iframe origin is ignored');
  const evilFrame = p2.frames().find((f) => f.url().includes('8203'));
  ok(evilFrame && (await evilFrame.evaluate(() => document.title)) !== 'LEAKED', 'foreign iframe does not receive gclid/utm context');
  ok(!JSON.stringify(dl2).includes('buyer@example.com'), 'no raw email reaches the parent dataLayer');
  console.log('      bridge events:', [...new Set(evs.map((e) => e.name))].join(', '));
  await ctx2.close(); sp.close(); sc.close(); se.close();

  /* ------------------------------- BRIDGE mode, listener 'auto' with GTM loading late */
  const autoListener = listener.replace(/"mode":\s*"gtag"/, '"mode": "auto"');
  ok(autoListener !== listener, 'listener config block can be rewritten (mode -> auto)');
  const parent3 = `<!doctype html><html><head><title>Wix page GTM</title></head><body>
<iframe id="embed" src="http://localhost:8202/index.embed.html" style="width:100%;height:1600px;border:0"></iframe>
<script>setTimeout(function(){ window.google_tag_manager = { 'GTM-LATE123': {} }; window.dataLayer = window.dataLayer || []; }, 2500);</script>
${autoListener}</body></html>`;
  const sp3 = await serve(path.join(ROOT, 'site-embed'), 8201, '127.0.0.1', { '/parent.html': parent3 });
  const sc3 = await serve(path.join(ROOT, 'site-embed'), 8202, 'localhost');
  const ctx3 = await browser.newContext();
  await stubGoogle(ctx3);
  const p3 = await ctx3.newPage();
  await p3.goto('http://127.0.0.1:8201/parent.html');
  const child3 = await (await p3.waitForSelector('#embed')).contentFrame();
  await child3.waitForFunction(() => window.htmlTracker);
  await child3.click('#cta');
  await p3.waitForTimeout(800);
  const early = await p3.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'cta_click').length);
  ok(early === 0, 'auto mode waits while no Google tag/GTM is loaded (nothing pushed yet)');
  await p3.waitForTimeout(3000);
  const late = await p3.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event).map((e) => ({ event: e.event, src: e.event_source, text: e.click_text })));
  ok(late.some((e) => e.event === 'cta_click' && e.src === 'html_embed' && e.text === 'Order now'), 'queued events delivered as GTM dataLayer events once GTM appears');
  ok(late.some((e) => e.event === 'embed_view'), 'embed_view delivered to GTM');
  await ctx3.close(); sp3.close(); sc3.close();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
