# Route B — keep the HTML inside an existing Wix page (Editor, Studio or Harmony)

Use when the HTML must sit inside a page of an existing Wix site (same URL as the rest of the site), e.g. a
calculator, quiz, quote form or widget. The HTML stays in an iframe; the tracker bridges it to the page.

Requirements (Wix): Premium plan + connected domain for Marketing Integrations and Custom Code; the site
published. Wix's embeds only show HTTPS content.

## B1. Embed HTML + Custom Code listener (default)

### Prepare

```bash
python3 scripts/prepare_site.py ./quote-form.html --route embed \
  --parent-origin https://www.example.com \
  --gtag G-XXXXXXX,AW-123456789 --conversion generate_lead=AW-123456789/AbC123:0:CAD \
  --enhanced-conversions --embed-id quote-form
```

- `--gtm GTM-XXXX` instead of `--gtag` when the site uses GTM (then conversions are built in GTM).
  The IDs only configure the listener; nothing is injected into the iframe.
- `--parent-origin` = the site's primary address (scheme + host, no path). It lets the iframe send the hashed
  email/phone for enhanced conversions safely; without it those are never sent.
- Output folder: one `<name>.embed.html` per page (self-contained: local CSS/JS and small images inlined,
  broken Google tags removed, tracker added in bridge mode), `wix-parent-listener.html` (configured),
  `velo-page-code.js`, `report.md`.
- Fix the report's **check:** items. Typical ones: relative links (`about.html`) break inside the iframe, so
  use full `https://` URLs; large images must be on Wix Media (absolute `static.wixstatic.com` URLs).

### Install on the Wix site (once per site)

1. **Marketing Integrations** (dashboard): connect **one** of *Google Tag* (a G-/AW-/GT- ID; add the Google
   Ads AW- account as a destination of that Google tag in Google's tag settings) **or** *Google Tag
   Manager*. Wix warns against installing both.
2. **Custom Code** (dashboard → Settings → *Development & integrations* → Custom Code → **+ Add Custom
   Code**): paste the whole `wix-parent-listener.html`; name it "html-tracker listener"; **All pages**, load
   on each new page; **Place code in: Body – end**; in the **Code Type** tab choose **Analytics** (it then
   follows the cookie banner); **Apply**.
3. **Each embed** (editor): select the Embed HTML element → Enter Code / Settings → replace the code with
   the `.embed.html` content → Apply. In the Harmony editor set *Cookies and similar technologies* to the
   honest category of the HTML itself (e.g. Essential/Functional for a plain form or calculator). Give the
   element enough height: iframes are not responsive and do not grow.
4. **Publish** the site.

Exact click paths per editor: `browser-runbook.md` (tasks T3–T5).

### How it behaves

- Inside the iframe the tracker records: embed view, clicks (CTA, internal, outbound, phone, email,
  WhatsApp, downloads, custom `data-track`), rage clicks, scroll depth (measured against the visitor's real
  screen, so it works while the *Wix page* scrolls), engaged time while the embed is on screen, form
  view/start/submit/abandon, `generate_lead`, HTML5 video, element views, copies of emails/phone numbers.
- Events are queued until the listener answers (handshake), then posted to the Wix page. The listener
  accepts only Wix embed origins (`*.filesusr.com`) and any `--listener-allow-origin`, validates and trims
  every value, and sends with the Google tag (`gtag('event', …)` + Ads conversions) or as GTM `dataLayer`
  events (`event_source: html_embed`). In `auto` mode it waits up to 2 minutes for a Google tag/GTM to load
  (e.g. after consent) and drops events if none ever loads.
- The listener answers the handshake with the page URL, gclid/gbraid/wbraid (from the URL or Google's own
  `_gcl_*` cookies) and UTMs (remembered for the session). The iframe writes them into hidden inputs named
  `gclid`, `gbraid`, `wbraid`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`,
  `fbclid`, `msclkid`, `page_url`, `landing_page`, `referrer_url` (or any input with `data-fill="<key>"`), so
  a form posting to a CRM keeps the ad click for offline conversion imports.

### Same thing with your own hosted page

Hosting the HTML with Route A (`https://lp.example.com/quote/`) and showing it with **Embed a site** works
the same way: prepare it with `--route static` for its own visits, and for the embedded view generate the
listener with `--listener-allow-origin https://lp.example.com` (the tracker auto-detects that it is framed
and switches to bridge mode).

## B2. Velo page code instead of Custom Code

`velo-page-code.js` receives the same messages with `$w('#id').onMessage` and reports them through Wix's
analytics pipeline (`analytics.trackEvent('CustomEvent', …)` and `'Lead'`), which forwards to every tool in
Marketing Integrations (Google tag, GTM, Meta Pixel & CAPI…). Use it when the site already uses Velo or
when Meta/TikTok must receive the events too. Use **either** B1 **or** B2 on a page. It does not send
gclid/UTM into the iframe; Wix decides the event names each tool receives, so check GA4 DebugView once.

## B3. Custom element (advanced: no iframe on the live site)

Wix custom elements are web components. On the live site the element runs inside the page itself (Wix
renders it in an iframe only in the editor and preview), so the page's GTM click/form triggers can see it.
Requirements: Premium plan, connected domain and Wix ads removed. Wix: Add Elements → Embed Code →
**Custom Element** → Choose Source (**Velo File** recommended, or a Server URL over HTTPS) → Tag Name.

How to build one from the HTML:
1. Write a JS file that defines the element and renders the HTML into the **light DOM** (no
   `attachShadow`, so tracking and forms keep working): `customElements.define('quote-form', class extends
   HTMLElement { connectedCallback() { if (this._done) return; this._done = true; this.innerHTML = `...`; } })`.
2. Prefix the HTML's CSS selectors with the tag name (`quote-form .btn {}`) so they do not restyle the
   rest of the Wix page; drop `html`/`body` rules.
3. Re-create `<script>` tags with `document.createElement('script')` (scripts in `innerHTML` do not run) and
   remember `DOMContentLoaded` has already fired.
4. Load html-tracker inside it with `window.HTML_TRACKER_CONFIG = { mode: 'direct', output: 'gtm' (or
   'gtag'), root: 'quote-form', embedId: 'quote-form' }`; `root` limits tracking to the element so the rest
   of the page is not double counted.
5. SEO: set the element's `seoMarkup` in Velo with the same text the element shows (Wix warns that
   different content is cloaking); without it only JavaScript crawlers such as Google see the content.

Test on a duplicate page first; custom elements can change page height and layout.

## SEO for Route B

Search engines credit iframe content to the `filesusr.com` file, not to your page. Put the page's title,
headings and key paragraphs in native Wix text elements and use the embed for the interactive part only.
Set the page's SEO title/description in Wix (Pages → SEO basics, or the SEO tags recipe through the MCP).
