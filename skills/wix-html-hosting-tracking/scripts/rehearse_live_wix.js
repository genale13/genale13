#!/usr/bin/env node
/*
 * Route B3 rehearsal on the REAL Wix site, before the custom element is added in the editor: a published page of
 * the same site is opened in a headless browser and, in that browser only, its first section is replaced by the
 * custom element (header and footer hidden with --no-header-footer, like the "No Header & Footer" page layout).
 * Nothing changes on the site. Google hits and Wix statistics pings are answered locally.
 *
 * It measures what simulate_element.js cannot: Wix's own layout. The element must span the browser width (unless
 * built with --element-width box), every part of the content must be reachable by scrolling (the Wix mobile site
 * cuts what goes below the box height), there must be no horizontal scrollbar, and position:fixed parts (sticky
 * bars, WhatsApp buttons) must stay inside the window.
 *
 * usage:
 *   node rehearse_live_wix.js --element out/<tag>.js --page https://www.example.com/any-published-page
 *        [--no-header-footer] [--mobile] [--screenshot shot.png] [--tag <tag>]
 */
'use strict';
const fs = require('fs');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch (e) {
  console.error('playwright is not installed: npm i playwright && npx playwright install chromium');
  process.exit(2);
}
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] && !/^--/.test(args[i + 1]) ? args[i + 1] : d; };
const file = val('--element'), PAGE = val('--page');
if (!file || !PAGE) { console.error('need --element <tag>.js and --page <published page of the Wix site>'); process.exit(2); }
const JS = fs.readFileSync(file, 'utf8');
const TAG = val('--tag', (JS.match(/^\/\*!\s*<([a-z][a-z0-9._]*-[a-z0-9._-]*)>/) || [])[1]);
if (!TAG) { console.error('could not read the tag name from the file header; pass --tag <tag>'); process.exit(2); }
const FULL = /var FULL_WIDTH = true;/.test(JS);
const MOBILE = flag('--mobile');
const QUIET = /(google-analytics\.com|analytics\.google\.com|googleadservices\.com|doubleclick\.net|^www\.google\.|frog\.wix\.com|panorama)/;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext(MOBILE ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } });
  await context.route('**/*', (route) => (QUIET.test(new URL(route.request().url()).hostname)
    ? route.fulfill({ status: 204, body: '' }) : route.continue()));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(PAGE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  const baseErrors = errors.length;
  const setup = await page.evaluate(([tag, hide]) => {
    const pages = document.getElementById('PAGES_CONTAINER') || document.body;
    // a component placed directly in a section (where the custom element will go), not inside a strip or column
    let comp = null;
    for (const c of pages.querySelectorAll('section [id^="comp-"]')) {
      const owner = c.parentElement && c.parentElement.closest('[id^="comp-"]');
      if (owner && owner.tagName === 'SECTION' && !c.querySelector('[id^="comp-"]') && c.getClientRects().length) { comp = c; break; }
    }
    let synthetic = false;
    if (!comp) { // no such component (e.g. only strips and boxes): a section of our own at the top of the page
      const first = pages.querySelector('section');
      if (!first) return { error: 'no section on this page: use another published page of the site' };
      const sec = document.createElement('section');
      sec.id = 'comp-rehearsal-section';
      comp = document.createElement('div');
      comp.id = 'comp-rehearsal';
      comp.style.cssText = 'position:relative;margin:0 auto;';
      sec.appendChild(comp);
      first.parentNode.insertBefore(sec, first);
      synthetic = true;
    }
    const section = comp.closest('section');
    if (hide) ['SITE_HEADER', 'SITE_FOOTER'].forEach((id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    pages.querySelectorAll('section').forEach((s) => { if (s !== section) s.style.display = 'none'; });
    section.querySelectorAll('[id^="comp-"]').forEach((c) => { if (c !== comp && !c.contains(comp) && !comp.contains(c)) c.style.display = 'none'; });
    comp.innerHTML = '';
    comp.style.width = Math.min(980, document.documentElement.clientWidth) + 'px'; // the box drawn in the editor
    comp.appendChild(document.createElement(tag));
    return { comp: comp.id, synthetic };
  }, [TAG, flag('--no-header-footer')]);
  if (setup.error) { console.log('FAIL ' + setup.error); await browser.close(); process.exit(1); }
  await page.addScriptTag({ content: JS });
  const ok = await page.waitForSelector(`${TAG} > [data-html-body]`, { timeout: 20000 }).then(() => true, () => false);
  let fails = 0;
  const say = (level, msg) => { console.log(`${level.padEnd(4)} ${msg}`); if (level === 'FAIL') fails++; };
  console.log(`Rehearsal of <${TAG}> inside ${PAGE} (${MOBILE ? 'phone' : 'desktop 1440px'}, nothing is changed on the site)`);
  console.log(setup.synthetic ? '     (no component sits directly in a section on this page: a section was added at the top; a page with\n'
    + '      an Embed or a text placed directly in a section gives a closer rehearsal)\n' : `     (in place of component ${setup.comp})\n`);
  if (!ok) { say('FAIL', 'the element did not render on the Wix page'); await browser.close(); process.exit(1); }
  await page.waitForTimeout(3000);
  const m = await page.evaluate((tag) => {
    const host = document.querySelector(tag), de = document.documentElement, r = host.getBoundingClientRect();
    const fixed = Array.from(host.querySelectorAll('*')).filter((e) => getComputedStyle(e).position === 'fixed' && e.getClientRects().length)
      .map((e) => { const b = e.getBoundingClientRect(); return { name: String(e.className || e.id || e.tagName).slice(0, 24), top: b.top, left: b.left, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; });
    return { vw: de.clientWidth, vh: innerHeight, left: r.left, width: r.width, height: r.height, top: r.top + scrollY,
      hscroll: de.scrollWidth > de.clientWidth + 1, docHeight: de.scrollHeight, fixed };
  }, TAG);
  if (FULL) say(Math.abs(m.left) <= 1 && Math.abs(m.width - m.vw) <= 1 ? 'OK' : 'FAIL', `element spans the browser width: left ${Math.round(m.left)}px, width ${Math.round(m.width)} of ${m.vw}px`);
  else say('INFO', `box mode: element ${Math.round(m.width)}px wide at ${Math.round(m.left)}px`);
  say(m.hscroll ? 'FAIL' : 'OK', m.hscroll ? 'the page gets a horizontal scrollbar' : 'no horizontal scrollbar');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1200);
  const end = await page.evaluate((tag) => ({ bottom: document.querySelector(tag).getBoundingClientRect().bottom, vh: innerHeight }), TAG);
  const cut = Math.round(end.bottom - end.vh);
  say(cut > 2 ? 'FAIL' : 'OK', cut > 2 ? `the last ${cut}px of the content cannot be reached (Wix cuts the page at the box height)`
    : `all ${Math.round(m.height)}px of content can be scrolled to`);
  m.fixed.filter((f) => f.w > 1 && f.h > 1).forEach((f) => {
    const inside = f.left >= -1 && f.right <= m.vw + 1 && f.top >= -1 && f.bottom <= m.vh + 1;
    say(inside ? 'OK' : 'WARN', `fixed element .${f.name} ${inside ? 'stays inside the window' : 'is partly outside the window'}`);
  });
  const own = errors.slice(baseErrors);
  if (own.length) say('WARN', `script errors after adding the element: ${own.slice(0, 3).join(' | ')}`);
  const shot = val('--screenshot', null);
  if (shot) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot });
    console.log(`     screenshot: ${shot}`);
  }
  await browser.close();
  console.log(fails ? `\n${fails} FAIL` : '\nNo FAIL');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
