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
  Claude Code with `/plugins install wix`. Wix's rule: call `WixREADME` once per conversation before other
  Wix tools (except `ListWixSites`, `UploadImageToWixSite`). Its output is ~110K characters and is saved to
  a file: grep that file for what you need instead of reading it all. Then take endpoints and bodies only
  from Wix's docs/recipes (`ReadFullDocsArticle`), never from memory. On a failed call, fix what the error
  says and quote its Wix request id.
- **Scripts** (Python 3, standard library): `scripts/prepare_site.py`, `scripts/verify_live.py`.
  Optional, Node + Playwright: `scripts/browser_check.js`, `scripts/simulate_embed.js`.
- **A browser agent or the user** for screens without an API (editor embeds, Custom Code, Marketing
  Integrations, GTM, GA4, Google Ads): `references/browser-runbook.md`, plus the ready-to-paste
  `browser-agent-prompt.txt` that `prepare_site.py` writes for Route B. No GTM, GA4 or Google Ads connector is
  assumed; if one is available, use it for the matching step.

## Step 1 — Collect the inputs (ask only for what is missing)

| Need | Why | If unknown |
|---|---|---|
| The HTML (folder, zip, file or pasted code) | input | pasted code → save it to a file; Wix-side-only requests need no HTML (`--route listener`) |
| New pages on a (sub)domain, or inside an existing Wix page? | picks the route | see Step 2 defaults |
| The existing Wix site (Route B, or updating a Route A site) | `ListWixSites`, then `GetSiteContext` | ask by name when several fit; a first Route A deploy creates a new site |
| That site's plan and domain | Marketing Integrations, Custom Code, custom elements and custom domains need a **Premium plan and a connected domain** | `GetSiteContext` shows plan + URL; a `*.wixsite.com` URL or "Plan: Free" = blocked, tell the user before anything else |
| GTM container ID **or** Google tag ID(s) (`G-…`, `AW-…`) | tagging | ask; GTM recommended for marketers |
| Google Ads conversion ID/label, value, currency | conversions | can be added later (`google-setup.md`) |
| Enhanced conversions? | more matched conversions | only with the Google Ads setting on, customer-data terms accepted and a privacy-policy link on the page; cannot be verified locally |
| Final public URL, e.g. `https://lp.example.com` | canonical, sitemap | test first on the free Wix URL with `verify_live.py --preflight` |
| Where visitors are (EEA/UK/Quebec?) | consent defaults | default: denied there, granted elsewhere |

Value flags: `--conversion EVENT=AW-…/label:VALUE:CUR` sets the value of the **Google Ads** conversion only;
`--lead-value N --currency CUR` puts a value on the GA4 `generate_lead` event and, when set, overrides the Ads
value too.

## Step 2 — Choose the route

| Situation | Route |
|---|---|
| Landing pages for ads, campaigns or SEO; one or several pages; a subdomain like `lp.` is fine | **A — static hosting** (best tracking and SEO) |
| The HTML must live inside an existing Wix page at that page's URL (form, calculator, quiz, widget) | **B1 — embed + bridge listener** |
| Same as B1 but the site already uses Velo, or Meta/TikTok pixels must get the events too | **B2 — Velo page code** (`--velo`) |
| Inside an existing page, no iframe at all, technical user, Premium + domain + no Wix ads | **B3 — custom element** (advanced) |
| Needs a Wix store, bookings, members, CMS or Wix Forms storing the leads | not this skill: `StartHeadlessBuild` |

Default when the request is ambiguous: "upload/host/load several HTML pages" → **A**; "my HTML embed in
Wix does not track" → **B1**, and mention that A tracks better.

## Step 3A — Static hosting (details: `references/route-a-static-hosting.md`)

1. Work on a **copy** of the user's files. Prepare:
   `python3 scripts/prepare_site.py <src> --route static --gtm GTM-XXXX --base-url https://lp.example.com --lang en`
   (or `--gtag G-…,AW-…` plus `--conversion generate_lead=AW-…/label:value:CUR`). It removes old Google
   snippets, adds Consent Mode defaults + the tag + `html-tracker.js`, fixes SEO basics, writes
   `sitemap.xml`/`robots.txt`, renames files to clean URLs and builds `<out>_deploy/` (bundles, `site.zip`,
   `deploy_curl.sh`, `report.md`).
2. Read `report.md` and fix every **check:** in the copy, then re-run. Rewrite weak titles (50–60 chars,
   keyword first) and descriptions (140–160 chars, offer + call to action) using only facts from the pages or
   the user. Lead forms need a real destination: a static host cannot receive form posts (`route-a` §Forms).
3. New site: `StartDeployWebsite` → follow the guide → provision with `ExecuteWixAPI` → keep `metaSiteId`.
   Existing static site: reuse its ID.
4. Upload: `UploadHeadlessWebsiteFiles` with `files` = the exact text of each `bundle-NN.txt`; or
   `deploy_curl.sh` with a Wix CLI token; or the user drops `site.zip` at wix.com/headless/drop.
5. Do **not** connect GA/GTM in that site's Marketing Integrations (the HTML already has the tag).
6. Verify (Step 5), then connect the subdomain (Premium plan on that site; the *Assign Domain* recipe asks
   the user before writing), re-run step 1 with the final `--base-url` if it changed, upload, verify again.

"Prepare but don't publish yet": stop after step 2. Do not provision a site; hand over `site.zip`, the report
and the steps, and say that any upload (even the drop page) goes live at once on a public
`*.wix-site-host.com` address, and that a drop-page site must be kept by signing in.

## Step 3B — Inside a Wix page (details: `references/route-b-editor-embed.md`)

1. Check the site with `GetSiteContext`: Premium plan **and** connected domain, or stop and tell the user.
   The final domain must be connected **before** Custom Code is added (Wix deletes Custom Code snippets when
   a site gets a different domain).
2. Prepare: `python3 scripts/prepare_site.py <file.html> --route embed --parent-origin https://www.example.com --gtag G-…,AW-… --conversion generate_lead=AW-…/label:25:CAD --site-name "<site>" --site-id <metaSiteId>`
   (`--gtm GTM-…` when the site uses GTM; add `--enhanced-conversions` only after the Step 1 check). Output:
   `<name>.embed.html`, `wix-parent-listener.html`, `browser-agent-prompt.txt`, `report.md`. Only the Wix side
   needed (embeds already contain html-tracker)? `--route listener`. The listener relays events **only** from
   embeds that contain html-tracker, so every embed must be prepared this way.
3. Before handing anything over, simulate the published page:
   `node scripts/simulate_embed.js --embed <x.embed.html> --listener <wix-parent-listener.html> --site https://www.example.com --gtag G-… --submit`
   (also `--late 12000` for a cookie banner, `--no-listener` for refused cookies). Fix any FAIL.
4. Install (runbook T1–T5, or give the user `browser-agent-prompt.txt` for Claude in Chrome): connect **one**
   of Google Tag / GTM in Marketing Integrations; paste the listener once in Custom Code (All pages, Body – end,
   Code Type *Analytic*); paste each `.embed.html` into its Embed HTML element; ask, then publish the editor.
5. Put the page's key text in native Wix text too; iframe text does not count for the page's SEO.

## Step 4 — Google side (details: `references/google-setup.md`)

GA4: Form interactions off for Route A, custom dimensions, `generate_lead` as key event, data redaction on.
Google Ads: import the GA4 key event **or** use the Ads conversion tag (never both as primary for one
conversion); add the AW- account as a destination of the Google tag so the ad click is stored on every page;
enhanced conversions; offline imports with the gclid from hidden fields. GTM: the recipe, with Wix's own
page-view setup on editor sites (Wix is a single-page app). Consent: defaults already in Route A pages.

## Step 5 — Verify before calling it done

- Route A: `python3 scripts/verify_live.py https://<host> --pages / <paths> --gtm GTM-XXXX --from-sitemap`
  (`--preflight` before the final domain is live) must show no FAIL; then
  `node scripts/browser_check.js "https://<host>/<page>?utm_source=qa&utm_medium=test" --submit` lists events,
  where the form would post and the Google hits (answered locally, not sent). A warning that a container sent
  no hits usually means an empty or unpublished GTM container.
- Route B: `simulate_embed.js` before installing; after installing, `browser_check.js` on the Wix page (the
  iframe must show `bridge` mode and the parent context) or, in the browser console,
  `Object.keys(window.google_tag_manager||{})` and `window.__htmlTrackerListener`. `verify_live.py` is for
  Route A only.
- Then Tag Assistant and GA4 DebugView (`google-setup.md` §5). If you could not run a check, say so.

## Step 6 — Report to the user

Keep it short and concrete: the live URL and dashboard link (Route A), what was changed (from `report.md`),
what was verified and how, what the user still has to do (plan/domain, Google Ads/GA4 screens, publishing),
and the events they will now see. Mention every **check:** item you could not fix.

## Guardrails

- **Authority:** a request to publish or upload authorizes creating the static site and uploading. Ask
  first before connecting or moving a domain, buying a plan or domain, deleting files or sites, publishing the
  Wix editor site, or publishing a GTM container. Read-only checks (`GetSiteContext`, site lists) need no ask.
- **One tag, one place:** never load the same GA4/GTM twice (HTML + Marketing Integrations, or GTM + gtag
  sending the same events). `verify_live.py` flags duplicates.
- **Privacy:** never add personal data to event parameters; enhanced conversions only through the tracker's
  hashing; GET forms leak emails into URLs (the script warns). Consent defaults are a sensible start, not
  legal advice.
- **The user's content:** work on copies; every change the script makes is listed in `report.md`. Do not
  invent business facts for SEO text.
- Free Wix sites cannot use Marketing Integrations, Custom Code or custom domains; say so early.

## Files

- `scripts/prepare_site.py` — `--route static` (Route A), `--route embed` (Route B), `--route listener` (Wix side only); `-h` for options.
- `scripts/verify_live.py` — HTTP checks of a published Route A site (tags, consent order, SEO files, 404s).
- `scripts/browser_check.js` — Playwright check of a live page: events, dataLayer, Google hits, `--submit` forms.
- `scripts/simulate_embed.js` — Route B: simulated Wix page + embed, before installing anything.
- `assets/html-tracker.js` — the tracker (direct and bridge modes). Options/events: `references/event-reference.md`.
- `assets/wix-parent-listener.html` — Custom Code listener for Route B1 (prepare_site writes a configured copy).
- `assets/velo-page-code.js` — Route B2 (written to the output only with `--velo`).
- `references/` — why-tracking-breaks, route-a-static-hosting, route-b-editor-embed, google-setup,
  event-reference, browser-runbook.
