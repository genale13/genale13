# html-tracker reference (events, options, attributes)

`assets/html-tracker.js`, v1.0.0. Plain JavaScript, no dependencies, about 30 KB unminified.

## Events

Names follow GA4 rules (≤ 40 characters, values ≤ 100 characters, ≤ 25 parameters). Every event carries
`event_source`: `html_page` (direct mode) or `html_embed` (added by the Wix-page listener in bridge mode),
plus `embed_id` when one is set (always in bridge mode). One GTM trigger on `event_source` matching
`^html_` therefore catches every tracker event.

| Event | When | Parameters |
|---|---|---|
| `embed_view` | bridge only: the embedded HTML loaded | `embed_title` |
| `cta_click` | click on a button, `role=button`, submit input, in-page `#` link | `click_text`, `click_id`, `click_classes`, `click_element`, `click_url`, `section` |
| `link_click` | link to the same site (root domain of the page; in bridge mode, of the Wix page) | `link_url`, `link_text`, `section` |
| `outbound_click` | link to another domain | `link_url`, `link_domain`, `link_text`, `section` |
| `contact_click` | `tel:`, `mailto:`, `sms:`, WhatsApp (`wa.me`, `whatsapp.com`, `whatsapp:`) | `contact_method` (phone/email/sms/whatsapp), `link_text`, `section` |
| `download_click` | link to pdf, doc(x), xls(x), ppt(x), csv, zip, mp3, mp4, … | `file_name`, `file_extension`, `link_url`, `link_text`, `section` |
| *custom name* | click on/inside an element with `data-track="name"` | the CTA parameters + every `data-track-*` attribute |
| `rage_click` | 3 fast clicks on the same element | `click_text`, `click_element`, `section` |
| `scroll_depth` | 25/50/75/90/100 % of the content has been on screen | `percent_scrolled` |
| `engaged_time` | 10/30/60/120/300 s of visible, active time (bridge: while the embed is on screen) | `engaged_seconds` |
| `element_view` | ≥ 50 % of an element with `data-track-view` visible | `element_name`, `section` |
| `form_view` | ≥ 50 % of a form visible | `form_id`, `form_name`, `form_destination`, `form_length` |
| `form_start` | first focus in a form field | same as form_view |
| `form_submit` | form submit event | same as form_view |
| `form_abandon` | page closed after `form_start` without submit | same + `last_field` (field name, never its value) |
| `generate_lead` | submit of a lead form (has an email/phone field, `data-lead`, or matches `leadFormSelector`) | form params + `lead_source`, `value`, `currency`; hashed `user_data` when enhanced conversions are on |
| `video_start` / `video_progress` / `video_complete` | HTML5 `<video>`/`<audio>` (10/25/50/75/90 %) | `video_title`, `video_provider` (html5), `media_type`, `video_duration`, `video_percent` |
| `text_copy` | visitor copies text | `copy_type` (email/phone/text), `copy_length`, `section` (never the text) |
| `js_error` | only with `trackErrors: true` | `error_message`, `error_source` |

Privacy built in: no form values are read except email/phone for enhanced conversions, which are
normalised and SHA-256 hashed in the browser; emails and long numbers in texts are replaced by `[email]` /
`[number]`; URLs are sent without query strings. Do not add custom parameters that contain personal data:
GA4 forbids it.

## Configuration — `window.HTML_TRACKER_CONFIG` (set before the script)

| Option | Default | Meaning |
|---|---|---|
| `mode` | `auto` | `direct` (page served first-party), `bridge` (inside an iframe), `auto` = bridge when framed |
| `output` | `gtm` | direct mode: `gtm` = `dataLayer.push({event: …})`; `gtag` = `gtag('event', …)` |
| `embedId` | — / `html_embed` | label sent as `embed_id` |
| `parentOrigins` | auto-detect | bridge: allowed Wix page origin(s); required for sending hashed user data |
| `conversions` | `{}` | gtag output: `{ generate_lead: 'AW-1/abc' }` or `{ send_to, value, currency }` (or a list) |
| `leadFormSelector` | email/phone heuristic | CSS selector of lead forms |
| `leadValue`, `currency` | — / `USD` | default lead value |
| `enhancedConversions` | `false` | hash email/phone into `user_data` on `generate_lead` |
| `defaultCountryCode` | `1` | for phone numbers typed without `+` |
| `root` | — | CSS selector: track only inside this element (custom elements, a section) |
| `scrollThresholds` | `[25,50,75,90,100]` | |
| `timeThresholds` | `[10,30,60,120,300]` | seconds |
| `fillHiddenFields` | `true` | fill gclid/UTM hidden inputs |
| `trackErrors` | `false` | |
| `maxEvents` | `300` | safety cap per page view |
| `autoLead` | `true` | `false` = do not send `generate_lead` on lead-form submit (the page sends its own) |
| `relayDataLayer` | bridge or gtag output | forward the page's own `dataLayer.push({event: …})` events through the Google tag (direct + gtag) or the bridge; skips `gtm.*`, `Pageview`, `page_view` |
| `relayFilter` | — | relay only pushes that contain this key (e.g. `landing_version`), so other scripts' pushes are ignored |
| `handshakeTimeout` | `120000` | bridge: ms to keep waiting for the Wix-page listener (it may load after cookie consent); events stay inside the iframe until it answers and are dropped after this |
| `debug` | `false` | console logging (also `?tracker_debug=1` in the URL) |

## HTML attributes

| Attribute | Example | Effect |
|---|---|---|
| `data-track` | `<button data-track="quote_open">` | custom event name for clicks on/inside the element |
| `data-track-*` | `data-track-plan="pro"` | extra parameter `plan: "pro"` on that click |
| `data-track-view` | `<section data-track-view="pricing">` | `element_view` when half visible |
| `data-section` | `<div data-section="hero">` | value used for the `section` parameter |
| `data-lead` / `data-lead="false"` | `<form data-lead>` | force a form to count (or not) as a lead |
| `data-lead-value`, `data-lead-currency` | `data-lead-value="50"` | value for that form's `generate_lead` |
| `data-form-name` | `data-form-name="Quote form"` | readable `form_name` |
| `data-fill` | `<input type="hidden" data-fill="gclid">` | fill this input with a context value |

Hidden inputs named `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `utm_source`, `utm_medium`,
`utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `page_url`, `landing_page`, `referrer_url` are filled
automatically when empty.

## JavaScript API

```js
htmlTracker.track('quote_calculated', { plan: 'pro', value: 120, currency: 'CAD' });
htmlTracker.lead({ form_id: 'quote', value: 50, currency: 'CAD' }, { email: emailInput.value, phone: phoneInput.value }); // AJAX forms
htmlTracker.context();  // gclid / utm / page_url known to the tracker
htmlTracker.log;        // last 100 events (for testing)
// before the script loads:
(window.htmlTrackerQueue = window.htmlTrackerQueue || []).push(['track', 'early_event', {}]);
```

Call `htmlTracker.lead(...)` after a successful AJAX submission when the form never fires a normal
`submit` event, or when success must be confirmed by the server first.

## Bridge message protocol

iframe → page: `{ ns: 'wixhtml', v: 1, type: 'hello' | 'event', embedId, name, params, userData? }`
page → iframe: `{ ns: 'wixhtml', v: 1, type: 'context', context: { page_url, page_path, page_title,
landing_page, referrer_url, gclid, gbraid, wbraid, utm_* } }`
`userData` holds only `sha256_email_address` / `sha256_phone_number` (64 hex chars) and is never sent with
target origin `*`. The iframe repeats `hello` (backing off to every 4 s) until a `context` arrives; the listener
also sends `context` to every allowed iframe on the page when it starts, so a late listener links immediately.
