# Route B — keep the HTML inside an existing Wix page (Editor, Studio or Harmony)

Use when the HTML must sit inside a page of an existing Wix site (same URL as the rest of the site), e.g. a
calculator, quiz, quote form or widget. The HTML stays in an iframe; the tracker bridges it to the page.

## Before anything: plan, domain, order

- `GetSiteContext` (Wix MCP) shows the plan and URL. Marketing Integrations, Custom Code and custom
  elements need a **Premium plan and a connected domain**; a `*.wixsite.com` / `*.wixstudio.com` URL or
  "Plan: Free" means blocked. Tell the user first; upgrading and connecting a domain are their decisions.
- Connect the **final** domain before adding Custom Code: Wix's Custom Code FAQ says snippets are tied to the
  domain and are **deleted** when the site gets a different domain. Re-check Custom Code after any domain change.
- The site must be published; Custom Code and Marketing Integrations are dashboard settings, no editor
  publish is needed for them. Embed changes in the editor do need a Publish.

## B1. Embed HTML + Custom Code listener (default)

### Prepare

```bash
python3 scripts/prepare_site.py ./quote-form.html --route embed \
  --parent-origin https://www.example.com \
  --gtag G-XXXXXXX,AW-123456789 --conversion generate_lead=AW-123456789/AbC123:25:CAD \
  --site-name "Example" --site-id <metaSiteId> --embed-id quote-form
```

- `--gtm GTM-XXXX` instead of `--gtag` when the site uses GTM (then the Ads conversion tags are built in GTM).
  The IDs only configure the listener's mode; nothing is injected into the iframe, and only the first ID matters.
- `--parent-origin` = the site's primary address (scheme + host). It pins where the iframe may send events and
  is required for sending hashed email/phone (enhanced conversions, `--enhanced-conversions`).
- Values: `:25:CAD` in `--conversion` is the Google Ads value; `--lead-value 25 --currency CAD` also puts the
  value on GA4's `generate_lead` (and then wins for Ads too).
- Output: `<name>.embed.html` per page (self-contained: local CSS/JS and small images inlined, Google tags that
  cannot work in the iframe removed, inline `onclick="gtag(...)"`-style handlers removed, tracker added in
  bridge mode), `wix-parent-listener.html` (configured), `browser-agent-prompt.txt` (paste-ready instructions
  with the code), `report.md`. `--velo` also writes `velo-page-code.js` (B2).
- Wix side only (embeds already prepared, or the user just wants the listener):
  `prepare_site.py --route listener --gtm GTM-XXXX --site-name "Example"` (no HTML needed).
- The listener relays events **only** from embeds that contain html-tracker. Third-party widgets pasted as
  they are will not report anything.
- Fix the report's **check:** items in a copy of the source and re-run. Typical: relative links break inside the
  iframe (use full `https://` URLs); large images belong on Wix Media; forms need a real destination and a
  privacy-policy link (see Route A §Forms: a plain form counts the lead at submit, before captcha or server
  confirmation; for confirmed leads submit with JavaScript and call `htmlTracker.lead()` on success).

### Check it before installing

```bash
node scripts/simulate_embed.js --embed out/quote-form.embed.html --listener out/wix-parent-listener.html \
  --site https://www.example.com --path /contact --gtag G-XXXXXXX,AW-123456789 --submit
```

It serves a simulated Wix page on the real hostname with the embed on the matching `filesusr.com` host, loads
Google's real library (or `--offline`), and reports: bridge mode, handshake + gclid/UTM context, events
forwarded, the Ads conversion command and ping (label, value, gclid), GA4 hits carrying the Wix URL, where the
form would post, and that no raw email reaches Google. `--late 12000` simulates a listener that loads after a
cookie banner; `--no-listener` simulates refused cookies (nothing must be sent).

### Install on the Wix site (once per site)

1. **Marketing Integrations** (dashboard): connect **one** of *Google Tag* (G-/AW-/GT- ID) **or** *Google Tag
   Manager*. Wix warns against both. In Google's tag settings add the Google Ads account (AW-) as a destination
   of that Google tag: the conversion call (`send_to: 'AW-…/label'`) works either way, but with the destination
   linked Google stores the ad click on every landing page, so a conversion on a later page keeps its gclid.
2. **Custom Code** (dashboard → Settings → *Development & integrations* → Custom Code; older dashboards:
   *Advanced Settings → Custom Code*) → **+ Add Custom Code**: paste the whole `wix-parent-listener.html`; name it
   `html-tracker listener`; **All pages**, load on each new page; **Place code in: Body – end**; tab **Code
   Type**: **Analytic** (Wix's label; Essential is the default and loads before consent); **Apply**.
3. **Each embed** (editor): select the Embed HTML element → Enter Code / Settings → replace the code with the
   `.embed.html` content → Apply. In the Harmony editor set *Cookies and similar technologies* to the honest
   category of the HTML itself. Give the element enough height: iframes are not responsive and do not grow.
4. **Publish** the editor (ask first).

Click paths per editor: `browser-runbook.md` (T1–T5). `browser-agent-prompt.txt` packages them, with stop
conditions and read-back checks, for Claude in Chrome.

### How it behaves

- Inside the iframe the tracker records embed view, clicks (CTA, internal, outbound, phone, email, WhatsApp,
  downloads, custom `data-track`), rage clicks, scroll depth (measured against the visitor's real screen, so it
  works while the *Wix page* scrolls), engaged time while the embed is on screen, form view/start/submit/abandon,
  `generate_lead`, HTML5 video, element views and copies of emails/phone numbers.
- Events stay inside the iframe until the listener answers. The iframe keeps saying hello for up to 2 minutes,
  and the listener announces itself to the embeds when it loads, so a listener that loads after cookie consent
  still receives everything; with no consent, nothing ever leaves the iframe.
- The listener accepts messages only from Wix embed hosts (`*.filesusr.com`) and `--listener-allow-origin`
  values, validates and trims every value, and sends with the page's Google tag (`gtag('event', …)` plus Ads
  conversions and hashed `user_data`) or as GTM `dataLayer` events (`event_source: html_embed`). In `auto` mode it
  waits up to 2 minutes for a Google tag/GTM to load and drops the events if none ever does. Only frames on your
  own page can message it, and all Embed HTML on a site is served from that site's own `filesusr.com` host.
- It answers with the page URL, gclid/gbraid/wbraid (from the URL, the session while advertising consent is
  given, or Google's `_gcl_*` cookies) and UTMs (remembered for the session). The iframe writes them into hidden
  inputs named `gclid`, `gbraid`, `wbraid`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
  `utm_content`, `fbclid`, `msclkid`, `page_url`, `landing_page`, `referrer_url` (or `data-fill="<key>"`).
- Compatible with Wix's December 2025 frontend-security rules: no `fetch`/`XMLHttpRequest` replacement, no
  changes to locked globals, no Wix cookies (only Google's `_gcl_*`), callback timers only, cross-origin
  `postMessage` between iframe and page (the pattern Wix recommends). Keep it that way when editing the code.

### Same thing with your own hosted page

Hosting the HTML with Route A (`https://lp.example.com/quote/`) and showing it with **Embed a site** works the
same way: prepare it with `--route static` for its own visits, and generate the listener with
`--route listener --listener-allow-origin https://lp.example.com` (the tracker detects that it is framed and
switches to bridge mode).

## B2. Velo page code instead of Custom Code

`velo-page-code.js` (`--velo`) receives the same messages with `$w('#id').onMessage` and reports them through
Wix's analytics pipeline (`analytics.trackEvent('CustomEvent', …)` and `'Lead'`), which forwards to every tool in
Marketing Integrations (Google tag, GTM, Meta Pixel & CAPI…). Use it when the site already uses Velo or when
Meta/TikTok must receive the events too. Use **either** B1 **or** B2 on a page, never both. It does not send
gclid/UTM into the iframe, and Wix decides the event names each tool receives, so check GA4 DebugView once.

## B3. Custom element (advanced: no iframe on the live site)

Wix custom elements are web components. On the live site the element runs inside the page itself (Wix renders
it in an iframe only in the editor and preview), so the page's GTM click/form triggers can see it.
Requirements: Premium plan, connected domain and Wix ads removed. Wix: Add Elements → Embed Code → **Custom
Element** → Choose Source (**Velo File** recommended, or a Server URL over HTTPS) → Tag Name.

How to build one from the HTML:
1. Write a JS file that defines the element and renders the HTML into the **light DOM** (no `attachShadow`, so
   tracking and forms keep working): `customElements.define('quote-form', class extends HTMLElement {
   connectedCallback() { if (this._done) return; this._done = true; this.innerHTML = `...`; } })`.
2. Prefix the HTML's CSS selectors with the tag name (`quote-form .btn {}`) so they do not restyle the rest of
   the Wix page; drop `html`/`body` rules.
3. Re-create `<script>` tags with `document.createElement('script')` (scripts in `innerHTML` do not run) and
   remember `DOMContentLoaded` has already fired.
4. Load html-tracker inside it with `window.HTML_TRACKER_CONFIG = { mode: 'direct', output: 'gtm' (or 'gtag'),
   root: 'quote-form', embedId: 'quote-form' }`; `root` limits tracking to the element so the rest of the page is
   not double counted.
5. SEO: set the element's `seoMarkup` in Velo with the same text the element shows (Wix warns that different
   content is cloaking); without it only JavaScript crawlers such as Google see the content.

Test on a duplicate page first; custom elements can change page height and layout.

## SEO for Route B

Search engines credit iframe content to the `filesusr.com` file, not to your page. Put the page's title,
headings and key paragraphs in native Wix text elements and use the embed for the interactive part only. Set
the page's SEO title/description in Wix (Pages → SEO basics, or the SEO tags recipe through the MCP).
