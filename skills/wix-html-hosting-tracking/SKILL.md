---
name: wix-html-hosting-tracking
description: Host or embed HTML on Wix so Google Ads, GA4 and Google Tag Manager can track everything visitors do inside it, with SEO intact. Use whenever someone wants to upload, publish or host HTML files or landing pages on Wix (one page or several, "as if Wix were a server"), says tracking, conversions, GTM or GA4 do not work or are "blocked" inside a Wix HTML embed, iFrame or filesusr.com, wants clicks, forms, scroll or leads inside embedded code tracked, needs gclid/UTM passed into embedded forms, or asks for Google Ads conversion, enhanced conversion or consent setup for HTML on Wix, even if they never say iframe or skill. Also gives click-by-click browser steps (e.g. for Claude in Chrome) for the Wix editor, Wix dashboard, GTM, GA4 and Google Ads.
---

# Wix HTML hosting with full Google tracking and SEO

## The problem, in one paragraph (tell the user this)

Wix shows pasted HTML through an Embed HTML element, which is an **iframe served from another website**
(`www-yourdomain-com.filesusr.com`). The Google tag on the Wix page cannot see inside it, and a tag
placed inside it runs as a third party: cookies are blocked, the ad click ID (gclid) is out of reach and
the URL is wrong. So tracking looks "blocked". The cure is either to stop using the iframe (host the HTML
as real pages on Wix, Route A) or to bridge it (Route B). Details: `references/why-tracking-breaks.md`.

## Tools this skill uses

- **Wix MCP connector** (`mcp__Wix__*`). Connect it on claude.ai under Settings → Connectors → Wix, or in
  Claude Code with `/plugins install wix`. Follow Wix's rule: call `WixREADME` once before other Wix tools
  (except `ListWixSites`, `UploadImageToWixSite`), and take every endpoint and body from Wix's docs or
  recipes, not memory. On a failed call, fix what the error says and quote its Wix request id.
- **Scripts** (Python 3, standard library): `scripts/prepare_site.py`, `scripts/verify_live.py`.
  Optional: `scripts/browser_check.js` (Node + Playwright).
- **A browser agent or the user** for screens without an API (editor embeds, Custom Code, Marketing
  Integrations, GTM, GA4, Google Ads): `references/browser-runbook.md`. No GTM, GA4 or Google Ads
  connector is assumed; if one is available, use it for the matching step.

## Step 1 — Collect the inputs (ask only for what is missing)

| Need | Why | If unknown |
|---|---|---|
| The HTML (folder, zip, file or pasted code) | input | pasted code → save it to a file first |
| New pages on a (sub)domain, or inside an existing Wix page? | picks the route | see Step 2 defaults |
| Which Wix site | `ListWixSites`; accounts often hold many sites | ask by name when several fit |
| GTM container ID **or** Google tag ID(s) (`G-…`, `AW-…`) | tagging | ask; GTM recommended for marketers |
| Google Ads conversion ID/label(s), lead value and currency | conversions | can be added later (`google-setup.md`) |
| Final public URL, e.g. `https://lp.example.com` | canonical, sitemap | test first on the free Wix URL |
| Where visitors are (EEA/UK/Quebec?) | consent defaults | default: denied there, granted elsewhere |

## Step 2 — Choose the route

| Situation | Route |
|---|---|
| Landing pages for ads, campaigns or SEO; one or several pages; a subdomain like `lp.` is fine | **A — static hosting** (best tracking and SEO) |
| The HTML must live inside an existing Wix page at that page's URL (form, calculator, quiz, widget) | **B1 — embed + bridge listener** |
| Same as B1 but the site already uses Velo, or Meta/TikTok pixels must get the events too | **B2 — Velo page code** |
| Inside an existing page, no iframe at all, technical user, Premium + domain + no Wix ads | **B3 — custom element** (advanced) |
| Needs a Wix store, bookings, members, CMS or Wix Forms | not this skill: `StartHeadlessBuild` |

Default when the request is ambiguous: "upload/host/load several HTML pages" → **A**; "my HTML embed in
Wix does not track" → **B1**, and mention that A tracks better.

## Step 3A — Static hosting (details: `references/route-a-static-hosting.md`)

1. Prepare: `python3 scripts/prepare_site.py <src> --route static --gtm GTM-XXXX --base-url https://lp.example.com --lang en`
   (or `--gtag G-…,AW-…` plus `--conversion generate_lead=AW-…/label:value:CUR`; add
   `--enhanced-conversions --currency CAD` when wanted). It removes old Google snippets, adds Consent Mode
   defaults + the tag + `html-tracker.js`, fixes SEO basics, writes `sitemap.xml`/`robots.txt`, renames
   files to clean URLs and builds `<out>_deploy/` (bundles, `site.zip`, `deploy_curl.sh`, `report.md`).
2. Read `report.md`. Fix missing titles/descriptions in the source (write good ones yourself: title 50–60
   chars with the keyword first, description 140–160 chars with the offer), re-run.
3. New site: `StartDeployWebsite` → follow the guide → provision with `ExecuteWixAPI` → keep `metaSiteId`.
   Existing site: reuse its ID.
4. Upload: `UploadHeadlessWebsiteFiles` with `files` = the exact text of each `bundle-NN.txt`; or
   `deploy_curl.sh` with a Wix CLI token; or the user drops `site.zip` at wix.com/headless/drop.
5. Do **not** connect GA/GTM in that site's Marketing Integrations (the HTML already has the tag).
6. Verify (Step 5), then connect the subdomain (Premium plan on that site; the *Assign Domain* recipe asks
   the user before writing), re-run step 1 with the final `--base-url` if it changed, upload, verify again.

## Step 3B — Inside a Wix page (details: `references/route-b-editor-embed.md`)

1. Prepare: `python3 scripts/prepare_site.py <file.html> --route embed --parent-origin https://www.example.com --gtag G-…,AW-… --conversion generate_lead=AW-…/label --enhanced-conversions`
   (`--gtm GTM-…` when the site uses GTM). Output: `<name>.embed.html`, `wix-parent-listener.html`
   (configured), `velo-page-code.js`, `report.md`.
2. On the Wix site (runbook T1–T5): Premium + domain check; connect **one** of Google Tag / GTM in
   Marketing Integrations; paste the listener once in Custom Code (All pages, Body – end, Code Type
   Analytics); paste each `.embed.html` into its Embed HTML element; ask, then publish.
3. Put the page's key text in native Wix text too; iframe text does not count for the page's SEO.

## Step 4 — Google side (details: `references/google-setup.md`)

GA4: Form interactions off for Route A, custom dimensions, `generate_lead` as key event. Google Ads: import
the GA4 key event **or** use the Ads conversion tag (never both for one conversion), enhanced conversions,
offline imports with the gclid in hidden fields. GTM: the variables/trigger/tags recipe. Consent: defaults
already in Route A pages; Wix banner for Route B.

## Step 5 — Verify before calling it done

- `python3 scripts/verify_live.py https://<host> --pages / <other paths> --gtm GTM-XXXX --from-sitemap`
  must show no FAIL lines.
- `node scripts/browser_check.js "https://<host>/<page>?utm_source=qa&utm_medium=test"` lists tracker
  events per frame and the Google hits (blocked by default). For Route B, run it on the Wix page and check
  that the iframe shows `bridge` mode and received the parent context.
- Then Tag Assistant and GA4 DebugView (`google-setup.md` §5). If you could not run a check, say so.

## Step 6 — Report to the user

Keep it short and concrete: the live URL and dashboard link (Route A), what was changed (from
`report.md`), what was verified and how, what the user still has to do (domain, Google Ads/GA4 screens,
publishing), and the events they will now see. Mention any **check:** item you could not fix.

## Guardrails

- **Authority:** a request to publish or upload authorizes creating the static site and uploading. Ask
  first before connecting or moving a domain, buying a plan or domain, deleting files or sites, publishing
  the Wix editor site, or publishing a GTM container.
- **One tag, one place:** never load the same GA4/GTM twice (HTML + Marketing Integrations, or GTM + gtag
  sending the same events). `verify_live.py` flags duplicates.
- **Privacy:** never add personal data to event parameters; enhanced conversions only through the tracker's
  hashing; tell the user consent defaults are a sensible start, not legal advice.
- **The user's content:** keep their HTML; every change the script makes is listed in `report.md`. Do not
  invent business facts for SEO text; ask or use what the page says.
- Free Wix sites cannot use Marketing Integrations, Custom Code or custom domains; say so early.

## Files

- `scripts/prepare_site.py` — prepare HTML for Route A (`--route static`) or B (`--route embed`); `-h` for all options.
- `scripts/verify_live.py` — HTTP checks of a published site (tags, consent order, SEO files, 404s).
- `scripts/browser_check.js` — Playwright check of events, dataLayer and Google hits.
- `assets/html-tracker.js` — the tracker (direct and bridge modes). Options/events: `references/event-reference.md`.
- `assets/wix-parent-listener.html` — Custom Code listener for Route B1 (prepare_site writes a configured copy).
- `assets/velo-page-code.js` — Route B2.
- `references/` — why-tracking-breaks, route-a-static-hosting, route-b-editor-embed, google-setup,
  event-reference, browser-runbook.
