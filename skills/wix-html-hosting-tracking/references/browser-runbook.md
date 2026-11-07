# Browser runbook (Claude in Chrome or any browser agent, or a person)

Some steps have no API: pasting an embed in the Wix editor, Custom Code, Marketing Integrations, GTM, GA4
and Google Ads screens. This runbook lets a browser agent do them. Wix paths come from the Wix Help Center
(2025–2026); labels change and dashboards may be in another language, so match on meaning, not pixels.

For Route B, `prepare_site.py --route embed|listener` writes `browser-agent-prompt.txt`: these tasks with the
site's direct links, stop conditions, read-back checks, a report format and the code between START/END markers.
The user pastes that file into the browser agent; prefer it over writing a prompt by hand.

## Ground rules for the agent

- The user signs in. Never type passwords or 2FA codes; stop and ask the user to sign in.
- **Ask before** anything public or paid: publishing the editor, buying a plan or domain, connecting/moving a
  domain, deleting anything, publishing a GTM container. Describe the change, wait for "yes".
- Change only what the task names. Read each value back after saving.
- Paste code exactly (paste, or set the field's value); never type it key by key: code boxes auto-close
  brackets and quotes. Copy only what is between a START line and its END line.
- **Stop and report** if: the site is on a Free plan or has no connected domain; a different GTM container or
  Google tag is already connected; the change would leave both *Google Tag* and *Google Tag Manager* connected;
  a snippet named "html-tracker listener" already exists (ask whether to replace it).
- End with a short report: what changed, where, read-back results, and what needs the user.

## Direct links (replace `<id>` with the site ID, the metaSiteId from `GetSiteContext`)

| Page | Link |
|---|---|
| Site dashboard | `https://manage.wix.com/dashboard/<id>` |
| Marketing Integrations | `https://www.wix.com/dashboard/<id>/marketing-integration` |
| Settings | `https://www.wix.com/dashboard/<id>/settings` |
| Custom Code | `https://www.wix.com/dashboard/<id>/manage-website/embeds` |
| Privacy center (cookie banner) | `https://www.wix.com/dashboard/<id>/cookie-consent-settings-app` |
| Account domains | `https://manage.wix.com/account/domains` |

## Order of operations

T1 (plan + domain) → T7 if the final domain is not connected yet → T2 (tag) → T3 (listener) → T4 (embeds) →
T5 (publish, after asking) → T12 (verify). Custom Code is tied to the domain: Wix deletes the snippets when the
site gets a different domain, so redo T3 after any domain change.

## Wix tasks

**T1 · Check the plan and domain.** Site dashboard → look for *Upgrade* banners (free site) and **Settings →
Domains**. Custom Code, Marketing Integrations, Event Manager and custom elements need a Premium plan and a
connected domain. If either is missing, stop and tell the user.

**T2 · Connect Google tag or GTM.** **Marketing Integrations** →
- *Google Tag* → **Connect** → **Add Google Tag ID** → paste `G-…`/`AW-…`/`GT-…` (no spaces) → **Save**; or
- *Google Tag Manager* → **Connect** → **Add Google Tag Manager** → enter `GTM-…` → **Save**.
Only one of the two. This is a dashboard setting: no editor publish is needed (the site must already be published).

**T3 · Add the listener (Route B1).** **Settings** → *Development & integrations* → **Custom Code** (older
dashboards: *Advanced Settings → Custom Code*) → **+ Add Custom Code** → paste the whole listener → Name
`html-tracker listener` → *Add Code to Pages*: **All pages**, load on **each new page** → *Place Code in*:
**Body – end** → tab *Code Type*: **Analytic** (some screens say Analytics) → **Apply**. Read back: it starts
with `<!--` and the line "html-tracker parent listener", contains `"mode": "…"` as expected, and ends with
`</script>`. Edit an existing listener instead of adding a second one.

**T4 · Add or replace the embed.**
- *Wix Editor:* click the existing HTML element (or **Add Elements → Embed Code → Popular Embeds → Embed
  HTML**) → **Enter Code** → replace everything under *Add your code here* with the embed code → **Apply** →
  fill *What's in the embed?* (alt text) → resize so nothing is cut off.
- *Wix Studio:* **Add Elements → Embed & Social → Embed Code** → **Enter Code** → paste → **Apply**.
- *Wix Harmony:* **+ Add → Elements →** hover *More Options* → **Embed** → drag **Embed code** → **Settings**
  (gear) → *Enter HTML embed code*: paste → *Accessible name* → *Cookies and similar technologies*: the real
  category of the HTML itself.
- *Velo variant (B2):* Dev Mode on → select the element → *Properties*: ID `htmlTracker` → page code panel:
  paste `velo-page-code.js` (and do not add the T3 listener).
- Check the mobile view too (embeds may need their own size there).

**T5 · Publish.** Editor → **Publish** (ask first) → **View Site** → confirm the embed shows.

**T6 · Upload a static site without the MCP (Route A).** Open https://www.wix.com/headless/drop → drag the
prepared folder or `site.zip` (a file chooser may need the user). It goes live at once on a public
`*.wix-site-host.com` address; the user signs in to keep the site. Update later: the site's dashboard → **Edit
Frontend** → *Update Site* card → Drop (this replaces the whole site).

**T7 · Connect a (sub)domain (Premium plan on that site).** **Account domains** → **Add an Existing Domain**
→ **Connect a domain you already own** → select the site → **Continue** → enter e.g. `lp.example.com` → arrow →
**I own this primary domain** → if the root domain uses Wix name servers nothing else is needed; if it is
connected by pointing, add the CNAME records shown at the DNS host (often the user's job). Ask before confirming.

**T8 · Cookie banner.** **Privacy center** → enable the banner for the regions the user serves (EEA/UK/Quebec at
least). Needed on Route B sites that serve those regions. On Route A sites Wix shows a banner only when the
project's consent policy requires one: after enabling, open the live site from that region (or a VPN) and
confirm it appears; otherwise use a GTM consent platform (see `google-setup.md` §4).

## Google tasks

**T9 · GTM.** tagmanager.google.com → the container → build the variables, trigger and tags from
`google-setup.md` §3 (on Wix editor sites use Wix's `Pageview` setup for page views) → **Preview** (enter the
site URL; Tag Assistant opens) → click through the page, confirm tracker events and tags → **Submit → Publish**
(ask first).

**T10 · GA4.** analytics.google.com → **Admin** →
- *Data streams* → web stream → *Enhanced measurement* gear → Form interactions **off** (Route A); *Redact data*
  → email on;
- *Custom definitions* → **Create custom dimension** (Event scope) for each parameter in `google-setup.md` §1;
- *Events* / *Key events* → mark `generate_lead` (and `contact_click`) as key events;
- *DebugView* while testing.

**T11 · Google Ads.** ads.google.com → **Goals → Conversions → Summary** → **+ Create conversion action** →
either *Import → Google Analytics 4 properties → Web* (select `generate_lead`), or *Conversions on a website* →
manual action → copy **Conversion ID** and **Label** from *Tag setup*. Enhanced conversions: **Goals →
Conversions → Settings → Enhanced conversions** → on → method as used. Ask before accepting terms.

**T12 · Verify.** On the live page, DevTools Console: `Object.keys(window.google_tag_manager||{})` lists the
connected ID; `window.__htmlTrackerListener` is `true` (undefined = consent not given yet, or the code is not
live). Then tagassistant.google.com → **Add domain** → the page URL → **Connect** → interact (click a button,
scroll, submit a test form) → check each tag fired once, the Consent tab, and on Route B that `page_location`
is the Wix page. Report results to the user.
