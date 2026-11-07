# Browser runbook (Claude in Chrome or any browser agent, or a person)

Some steps have no API: pasting an embed in the Wix editor, Custom Code, Marketing Integrations, GTM, GA4
and Google Ads screens. This runbook lets a browser agent do them. Wix paths come from the Wix Help Center
(2025–2026); labels can change, so match on meaning, not exact pixels.

## Ground rules for the agent

- The user signs in. Never type passwords or 2FA codes; stop and ask the user to sign in.
- **Ask before** anything public or paid: *Publish*, buying a plan or domain, connecting/moving a domain,
  deleting anything, publishing a GTM container. Describe the change, wait for "yes".
- Change only what the task names. Read each value back after saving (screenshot or page text).
- Keep the code exactly as given: paste the whole file content, never retype or "clean up" code.
- End with a short report: what changed, where, and anything that needs the user.

## Hand-off prompt (the user pastes this into the browser agent)

```
Follow the runbook tasks <T…> for the Wix site "<site name>".
IDs: GTM <GTM-…> | Google tag <G-…> | Google Ads <AW-…/label>
Code to paste: (1) listener = <content of wix-parent-listener.html>  (2) embed = <content of x.embed.html>
Ask me before publishing or paying for anything.
```

## Wix tasks

**T1 · Check the plan and domain.** Wix dashboard of the site (manage.wix.com → the site) → look for
*Upgrade* banners (free site) and **Settings → Domains**. Custom Code, Marketing Integrations, Event Manager
and custom elements need a Premium plan and a connected domain. If missing, stop and tell the user.

**T2 · Connect Google tag or GTM (Route B, or a regular Wix site).** Dashboard → **Marketing
Integrations** →
- *Google Tag* → **Connect** → **Add Google Tag ID** → paste `G-…`/`AW-…`/`GT-…` (no spaces) → **Save**; or
- *Google Tag Manager* → **Connect** → **Add Google Tag Manager** → enter `GTM-…` → **Save**.
Only one of the two. Changes reach the live site after publishing.

**T3 · Add the listener (Route B1).** Dashboard → **Settings** → *Development & integrations* → **Custom
Code** → **+ Add Custom Code** → *Code Settings*: paste the whole listener → Name `html-tracker listener` →
*Add Code to Pages*: **All pages**, load on **each new page** → *Place Code in*: **Body – end** → *Code
Type* tab: **Analytics** → **Apply**. If a listener already exists, edit it instead of adding a second one.

**T4 · Add or replace the embed.**
- *Wix Editor:* open the editor → click the existing HTML element (or **Add Elements → Embed Code → Popular
  Embeds → Embed HTML**) → **Enter Code** → replace everything under *Add your code here* with the embed
  code → **Apply** → fill *What's in the embed?* (alt text) → resize so nothing is cut off.
- *Wix Studio:* **Add Elements → Embed & Social → Embed Code** → **Enter Code** → paste → **Apply**.
- *Wix Harmony:* **+ Add → Elements →** hover *More Options* → **Embed** → drag **Embed code** → **Settings**
  (gear) → *Enter HTML embed code*: paste → *Accessible name* → *Cookies and similar technologies*: pick the
  real category of the HTML itself.
- *Velo variant (B2):* Dev Mode on → select the element → *Properties*: ID `htmlTracker` → page code panel:
  paste `velo-page-code.js`.
- Check the mobile view too (embeds may need their own size there).

**T5 · Publish.** Editor → **Publish** (ask first) → **View Site** → confirm the embed shows.

**T6 · Upload a static site without the MCP (Route A).** Open https://www.wix.com/headless/drop → drag the
prepared folder or `site.zip` (a file chooser may need the user) → wait for the live URL → the user signs in
to keep the site. Update later: the site's dashboard → **Edit Frontend** → *Update Site* card → Drop (this
replaces the whole site).

**T7 · Connect a subdomain to the static site (Premium plan on that site).** Wix **Domains** page → **Add
an Existing Domain** → **Connect a domain you already own** → select the static site → **Continue** →
enter e.g. `lp.example.com` → arrow → **I own this primary domain** → if the root domain uses Wix name
servers nothing else is needed; if it is connected by pointing, add the CNAME records shown at the DNS host
(the user may need to do this at their registrar). Ask before confirming.

**T8 · Cookie banner.** Dashboard → privacy/cookie banner settings (Wix Privacy center) → enable the banner
for the regions the user serves (EEA/UK/Quebec at least) → publish. Optional on Route A sites; the injected
Consent Mode defaults already start as denied in those regions.

## Google tasks

**T9 · GTM.** tagmanager.google.com → the container → build the variables, trigger and tags from
`google-setup.md` §3 → **Preview** (enter the site URL; Tag Assistant opens) → click through the page,
confirm tracker events and tags → **Submit → Publish** (ask first).

**T10 · GA4.** analytics.google.com → **Admin** →
- *Data streams* → web stream → *Enhanced measurement* gear → Form interactions **off** (Route A);
- *Custom definitions* → **Create custom dimension** (Event scope) for each parameter in `google-setup.md` §1;
- *Events* / *Key events* → mark `generate_lead` (and `contact_click`) as key events;
- *DebugView* while testing.

**T11 · Google Ads.** ads.google.com → **Goals → Conversions → Summary** → **+ Create conversion
action** → either *Import → Google Analytics 4 properties → Web* (select `generate_lead`), or *Conversions on
a website* → manual action → copy **Conversion ID** and **Label** from *Tag setup*. Enhanced conversions:
**Goals → Conversions → Settings → Enhanced conversions** → on → method as used. Ask before accepting terms.

**T12 · Verify.** tagassistant.google.com → **Add domain** → the page URL → **Connect** → interact (click a
button, scroll, submit a test form) → check each tag fired once, the Consent tab, and in Route B that
`page_location` is the Wix page. Report results to the user.
