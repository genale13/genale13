# Google side: GA4, Google Ads, GTM, consent, verification

Google's interfaces move often. The paths below are current as of late 2026; if a label is gone, search the
setting's name in the product's search bar.

## 0. One tag, one place

| Where the HTML lives | Load the Google tag / GTM… | Never also… |
|---|---|---|
| Route A (static site) | in the HTML (`prepare_site.py --gtm` or `--gtag`) | connect GA/GTM in that site's Marketing Integrations |
| Route B (inside a Wix page) | in Wix **Marketing Integrations** (Google Tag **or** GTM) | put a Google tag inside the embed (it is removed by `prepare_site.py`) |

GTM is the better choice for a marketer who wants to add or change conversions later without touching
the HTML. The Google tag (`--gtag`) is simpler: GA4 events and Ads conversions work with no extra setup.

## 1. GA4

1. **Admin → Data collection and modification → Data streams → (web stream) → Enhanced measurement:**
   keep page views and scrolls on; turn **Form interactions off** on Route A pages (the tracker sends cleaner
   `form_start`/`form_submit` with the same names, so leaving it on double counts).
2. **Admin → Data display → Custom definitions → Create custom dimension** (scope *Event*), for the
   parameters you want in reports: `event_source`, `embed_id`, `click_text`, `click_id`, `section`,
   `contact_method`, `element_name`, `lead_source`, `copy_type`, `embed_title`. Optional custom metrics:
   `engaged_seconds`, `form_length`. Already built into GA4 (no setup): `link_url`, `link_domain`,
   `link_text`, `file_name`, `file_extension`, `form_id`, `form_name`, `form_destination`,
   `percent_scrolled`, `video_title`, `video_percent`, `video_provider`. (GA4 allows 50 event-scoped
   custom dimensions per property; data only appears from the day a dimension is created.)
3. **Admin → Data display → Events** (or Key events): mark `generate_lead` as a **key event**; also
   `contact_click` if calls/WhatsApp count as leads. Custom `data-track` events that matter can be marked too.
4. **Cross-domain:** not needed between `lp.example.com` and `www.example.com` (same root domain, cookies are
   shared). Needed only if the journey crosses different domains: Data stream → *Configure tag settings →
   Configure your domains*.
5. **Test:** Admin → Data display → **DebugView** while browsing with Tag Assistant connected, or with
   `?tracker_debug=1` and the GA4 debug extension.

## 2. Google Ads conversions

Pick **one** source per conversion so nothing counts twice:

- **A. Import from GA4 (simplest; works with GTM or the Google tag):** link Ads and GA4 (GA4 Admin → Product
  links → Google Ads links). In Google Ads: **Goals → Conversions → Summary → + Create conversion action →
  Import → Google Analytics 4 properties → Web**, select `generate_lead` (and `contact_click`). Set the
  category (*Submit lead form* / *Contact*), the value, and *Count: One* for leads.
- **B. Google Ads conversion tag (faster attribution, enhanced conversions, value rules):** **Goals →
  Conversions → Summary → + Create conversion action → Conversions on a website** → enter the domain →
  *Add a conversion action manually* → category *Submit lead form* → value → *Count: One* → done → open the
  action → **Tag setup → Use Google Tag Manager** (or *Install the tag yourself*) to read the **Conversion
  ID** (`AW-123456789`) and **Conversion label**. Then:
  - Google tag route: `--conversion generate_lead=AW-123456789/<label>:<value>:<currency>` in
    `prepare_site.py` (static or embed). For Route B the AW- ID must be a destination of the Google tag
    connected in Wix (Google tag settings → *Manage destinations*/*combine*).
  - GTM route: a *Google Ads Conversion Tracking* tag (section 3).
- **Calls:** a separate conversion on `contact_click` with `contact_method = phone` measures click-to-call
  from the site. (Calls from call assets in the ads themselves are configured in Google Ads, not here.)

**Enhanced conversions** (more matched conversions, especially on Safari/iOS): run `prepare_site.py` with
`--enhanced-conversions` (and `--parent-origin` for Route B). In Google Ads: **Goals → Conversions →
Settings → Enhanced conversions → Turn on**, method *Google tag* or *Google Tag Manager*, and choose the
*code / data layer* option. The tracker sends `user_data` with `sha256_email_address` /
`sha256_phone_number`, normalised per Google's rules (lowercase, Gmail dots removed, E.164 phone). The
user must accept the customer data terms in Google Ads, and the privacy policy should say that hashed
contact data is shared with Google.

**Offline / CRM conversions:** forms receive `gclid`, `gbraid`, `wbraid` and UTMs in hidden fields. Store them
with the lead; upload closed sales in **Goals → Conversions → Uploads** (or the CRM's Google Ads
integration). This is often the most valuable signal for Smart Bidding.

## 3. GTM recipe (when `output`/listener mode is `gtm`)

All tracker events arrive as `dataLayer` events whose name is the event (`cta_click`, `generate_lead`…) and
whose parameters are top-level keys (cleared between events).

1. **Variables → User-Defined → New → Data Layer Variable** (version 2), one per parameter you will use:
   `event_source`, `embed_id`, `click_text`, `click_url`, `click_id`, `section`, `link_url`, `link_domain`,
   `link_text`, `contact_method`, `file_name`, `file_extension`, `percent_scrolled`, `engaged_seconds`,
   `form_id`, `form_name`, `form_destination`, `lead_source`, `value`, `currency`, `element_name`,
   `video_title`, `video_percent`, `user_data`. Name them `DLV - <param>`.
2. **Triggers → New → Custom Event**: *Event name* `.*` with **Use regex matching**, *This trigger fires on
   Some Custom Events*: `DLV - event_source` *matches RegEx* `^html_`. Name it `html-tracker - all`.
   Make one more Custom Event trigger `generate_lead` (event name exactly) for conversions.
3. **Tags:**
   - *Google tag* with your `G-` ID on **Initialization – All Pages** (on Wix, connecting GTM in Marketing
     Integrations does not load GA4 by itself; this tag does).
   - *Google Analytics: GA4 Event*: Measurement ID = your `G-` ID, **Event name** `{{Event}}`, **Event
     parameters**: one row per DLV above (`click_text` → `{{DLV - click_text}}`…). Trigger: `html-tracker - all`.
   - *Conversion Linker* on All Pages (needed for Ads conversions through GTM).
   - *Google Ads Conversion Tracking*: Conversion ID + Label, Conversion value `{{DLV - value}}`, Currency code
     `{{DLV - currency}}`; tick **Include user-provided data from your website** → New variable →
     *User-Provided Data* → *Code* → `{{DLV - user_data}}`. Trigger: `generate_lead`.
4. **Preview** (Tag Assistant opens the site), check each event and tag, then **Submit → Publish**.

## 4. Consent

- Route A pages start with Consent Mode v2 **defaults**: denied in the EEA, UK, Switzerland and Quebec
  (`CA-QC`, Law 25), granted elsewhere, with `ads_data_redaction` and `url_passthrough` so ad clicks still
  count without cookies. Change with `--consent-regions` / `--consent-default denied`. This is a sensible
  default, not legal advice: the site owner decides with their privacy counsel.
- To show a banner on a Route A site, enable Wix's cookie banner for that project (Privacy center); the
  injected bridge turns the visitor's choice into `gtag('consent','update')`. With your own CMP (e.g. a GTM
  consent template) use `--no-consent` so defaults are not set twice.
- Route B uses the Wix site's own cookie banner and integrations; mark the listener's Custom Code as
  *Analytics* so it follows the banner.
- In Tag Assistant the **Consent** tab shows the default and update states for each hit.

## 5. Verification checklist (do it after every publish)

- `verify_live.py` and `browser_check.js` (see `route-a-static-hosting.md`) — no FAIL lines.
- Tag Assistant: one GA4 configuration, one GTM container; events `cta_click`, `scroll_depth`,
  `generate_lead` fire with `event_source`; in Route B with the Wix page URL as `page_location`.
- GA4 DebugView: events arrive with parameters; `generate_lead` flagged as key event.
- Google Ads → Goals → Conversions: status moves to *Recording conversions* within ~24 h of the first
  conversion; for enhanced conversions check the action's **Diagnostics** after 48–72 h.
- Submit a test lead with a UTM-tagged URL and confirm the hidden `utm_*`/`gclid` values reach the form's
  destination (CRM/email).
