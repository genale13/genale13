# Route A — host the HTML on Wix as real pages (static hosting)

Best tracking and SEO. Wix serves your files unchanged on a global CDN with SSL, as a
**Wix Headless site** in the user's account. Several pages, folders, CSS, JS and images are fine: it
behaves like a plain web server.

Sources (re-read when a call fails, Wix changes these): Wix MCP `StartDeployWebsite` (returns the live
guide), recipe *Upload a Website or HTML Files*
(https://dev.wix.com/docs/api-reference/account-level/sites/skills/upload-a-website-or-html-files),
*What You Can Upload* and *Load Site Scripts* in the Wix Headless docs.

## Facts that shape the plan

- **Limits:** 20 MB per file, 20 MB in total, 5,000 files. Accepted types: html/htm, css, js/mjs/cjs/jsx/map,
  png/jpg/jpeg/gif/svg/webp/ico/avif/bmp, mp4/webm/ogv, mp3/wav/ogg/m4a, woff/woff2/ttf/otf/eot,
  json/xml/txt/md, pdf/csv/yaml, geojson, glb/gltf/bin. Anything else (e.g. `.py`, `.php`) is rejected.
  Static only: no PHP, no server code. A later edit through Wix's patch helper keeps at most 2,000 files.
- **Entry:** an HTML file at the top level; with several top-level HTML files one must be `index.html`.
- **What Wix adds:** every uploaded site loads Wix's *site script*: Wix Analytics page views, the project's
  cookie-consent policy, the dashboard favicon/SEO tags (in the browser, only where the page lacks its own
  tag), custom code marked Essential, **and Google Analytics / GTM if they are connected in that site's
  Marketing Integrations**. So: the Google tag goes in the HTML (`prepare_site.py`) **or** in Marketing
  Integrations, never both.
- **Consent:** a new headless site's default consent policy grants every category until the owner sets a
  stricter one, and Wix's site script shows a banner only when the project's policy requires one (it shows none
  by default; Wix Analytics follows that policy). `prepare_site.py` adds Google Consent Mode v2 defaults that
  start *denied* in the EEA, UK, Switzerland and Quebec (`--consent-regions`), and turns a Wix banner choice into
  a Consent Mode update once the visitor chooses. Without any banner, visitors in those regions can never say
  yes: Google then only gets cookieless pings (modelled conversions). If they are a real audience, either set a
  restrictive policy/banner for the project (Wix *Update Consent Policy* API and cookie-banner settings; check
  on the live site that the banner appears) or use your own consent platform through GTM and run
  `prepare_site.py --no-consent`.
- **SEO:** Wix does not create `robots.txt` or `sitemap.xml` for uploaded sites and does not render SEO tags
  into the HTML. `prepare_site.py` writes all of them into the files (title, description warnings, canonical,
  Open Graph, sitemap, robots).
- **Address:** the site goes live on a free `*.wix-site-host.com` URL. For ads, connect your own domain or a
  subdomain such as `lp.yourdomain.com`; that needs a **Premium plan on this site**. A domain serves one site
  at a time, so the pages cannot live under `www.yourdomain.com/...` while the editor site keeps `www`; use a
  subdomain. Cookies on `lp.` and `www.` are shared at the root domain, so GA4 sees one visitor.

## Steps

### 1. Prepare the files

```bash
python3 scripts/prepare_site.py ./landing --route static \
  --gtm GTM-XXXXXXX \
  --base-url https://lp.example.com --lang en \
  --enhanced-conversions --currency CAD
```

- Use `--gtag G-XXXXXXX,AW-123456789` instead of `--gtm` when the user has no GTM. Add
  `--conversion generate_lead=AW-123456789/AbC123:0:CAD` (repeatable) to fire Google Ads conversions
  directly; with GTM the conversion tags are built in GTM instead.
- A single HTML file or a folder both work. File names with spaces/capitals are renamed to clean slugs and
  links are rewritten. With several top-level pages and no `index.html`, pass `--index home.html`.
- Old Google snippets in the HTML are removed when new IDs are given (so nothing fires twice).
- Read `<out>_deploy/report.md` and fix every **check:** item that matters: write real titles (50–60
  characters, keyword first) and meta descriptions (140–160 characters) into the source, then re-run. Do not
  leave the auto title taken from the H1 if it is weak.
- No final domain yet? Run without `--base-url` to test on the free URL, then re-run with it before ads go live.

Outputs: `<out>/` (the site), `<out>_deploy/site.zip`, `bundle-NN.txt` (MCP upload text), `deploy_curl.sh`,
`report.md`.

### 2. Create the site (new sites only)

Call `StartDeployWebsite` first; it returns Wix's current guide (follow it if it differs from below). The
guide's provision call, run with `ExecuteWixAPI` at account scope, looks like this (Nov 2026):

```javascript
async function run() {
  return wix.request({ scope: 'account', method: 'POST',
    url: 'https://www.wixapis.com/headless-business-setup/v1/headless-business/provision',
    body: { origin: 'agent', agent: 'claude-code/cli/<model>',   // client/surface/model, 'unknown' for a part you cannot tell
      newMetasite: { namingStrategy: { metaSiteName: 'Spring LP - Example' } },   // max 40 chars, no seedOptions for static pages
      synchronousSteps: ['SET_METASITE_NAME', 'CONFIGURE_HEADLESS_APP'] } });
}
// result.data: { metaSiteId, appId }  -> metaSiteId is the siteId for every later call
```

Updating a site deployed earlier? Reuse its ID (list headless sites with the `HEADLESS` namespace filter as
the recipe shows). Never create a second site for an update.

### 3. Upload — pick the first route that works

1. **Wix MCP (connected in Claude):** `UploadHeadlessWebsiteFiles` with `siteId` = metaSiteId and `files` =
   the exact contents of `bundle-01.txt` (then `bundle-02.txt`… each in its own call). The first upload must
   contain `index.html`. Later edits: send only the changed files; `deletePaths` removes files;
   `replaceAll: true` makes the site exactly the files sent. Each call ≤ 10 MB. Copy the bundle text
   exactly; do not retype or summarise it. Binaries larger than the inline limit are listed in
   `report.json → not_in_bundles`; use route 2 or 3 for those (or put large images on Wix Media with
   `UploadImageToWixSite` and reference the returned `static.wixstatic.com` URL). Clients that can attach
   files (ChatGPT, Codex) may pass `site.zip` as an attachment instead; Claude passes the text bundle.
2. **Shell + Wix CLI token (binary-safe, whole site):** `npx @wix/cli@latest login` (browser approval, once),
   `export ACCESS_TOKEN=$(npx @wix/cli@latest token)` (valid 15 minutes), `export META_SITE_ID=...`, then
   `bash <out>_deploy/deploy_curl.sh`. A raw drop replaces every file on the site with the ones sent.
3. **Drop page (no tools):** the user drags `site.zip` (or the folder) onto https://www.wix.com/headless/drop
   for a new site (it goes live at once; the user signs in to keep it), or in the site's dashboard: **Edit
   Frontend → Update Site** card → Drop for an existing one (Wix Headless docs, *Upload a Static Site*).
   Uploading there replaces the whole site.

### 4. Verify on the live URL

```bash
python3 scripts/verify_live.py https://<live-host> --pages / /about/ --gtm GTM-XXXXXXX --from-sitemap --preflight
node scripts/browser_check.js "https://<live-host>/?utm_source=qa&utm_medium=test" --submit
```

`--preflight` is for the free URL or a local copy (python3 -m http.server in `<out>/`): the canonical and
sitemap URLs already point at the final domain, so host mismatches are reported as INFO. Drop it once the
real domain is live.

`verify_live.py` checks robots/sitemap, real 404s, `/folder/` vs `/folder/index.html`, one copy of each tag,
consent before the tag, canonical, noindex and CSP. `browser_check.js` loads the page in Chromium and lists
the tracker events, dataLayer pushes and the Google hits (answered locally, so tests don't pollute data);
`--submit` fills and submits the first form, shows where it would post (nothing is delivered) and flags emails
in URLs. "A container loaded but sent NO hits" usually means the GTM container is empty or unpublished.
If `/about/` does not serve `about/index.html`, re-run `prepare_site.py` with `--explicit-index` and re-upload.

### 5. Connect the domain

Needs a Premium plan **on this site** (Wix will not assign a domain to a free site). With the Wix MCP follow
the *Assign Domain* recipe (it reads state, makes an offer, and only writes after the user's explicit yes); a
subdomain of a domain already in the account goes through *Domain Search, Purchase and Connect* §A3.1.
Manually: Wix **Domains → Add an Existing Domain → Connect a domain you already own →** pick the site →
enter `lp.example.com` → *I own this primary domain*, then add the CNAME records shown if the root domain is
not on Wix name servers. Propagation can take up to 48 hours. Then re-run step 1 with the final `--base-url`
if it changed, upload, and verify again on the real domain. Submit `https://lp.example.com/sitemap.xml` in
Google Search Console.

### 6. Report back

Give the live URL, the dashboard link `https://manage.wix.com/dashboard/<metaSiteId>`, what was changed
(from `report.md`), what was verified, and the next Google-side steps (`google-setup.md`).

## Forms on a static site

A static host stores nothing: a form without a real `action` reloads the page with the answers in the URL
(lead lost, email inside GA4 page URLs). `prepare_site.py` warns about forms with no action or with GET. Options:

- post to a form backend with `method="post"`: the CRM's form endpoint (HubSpot, Salesforce…), Formspree,
  Basin, Getform… The hidden `gclid`/`utm_*` fields travel with the lead for offline conversion imports;
- submit with JavaScript (`fetch`) and call `htmlTracker.lead({...}, {email, phone})` only after the backend
  confirms, so `generate_lead` counts real leads (a plain form counts at submit, before captcha/server checks);
- leads stored in Wix (Wix Forms, contacts, automations): a Wix Headless build (`StartHeadlessBuild`).

Also link a privacy policy from every page that collects contact details (the script warns).

## Several pages and several clients

- One site can hold many landing pages: `index.html`, `spring/index.html`, `quote/index.html`… Link them with
  normal relative links. Re-run `prepare_site.py` on the whole folder after edits, then upload the changed
  files only.
- One static site per brand/client domain (`lp.client-a.com`, `lp.client-b.com`), each with its own tag IDs.
- Wix business features (store, bookings, forms stored in Wix, members, CMS) are not static pages: that is
  `StartHeadlessBuild` (the Wix headless kit), not this route.
