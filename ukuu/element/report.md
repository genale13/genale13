# Wix HTML preparation report

- Route: **element**
- Source: `/home/user/genale13/ukuu/coaching-profesional-online.html`
- Output: `/home/user/genale13/ukuu/element`
- Google IDs found in the original HTML: GTM-ABC1234

## ukuu-coaching-profesional.js
- changed: the page sends its own generate_lead: html-tracker will not send a second one
- changed: the page's own dataLayer events (marked "landing_version") are sent through the Google tag
- changed: built custom element <ukuu-coaching-profesional> (278 KB): scoped CSS, 2 script(s), 1 structured-data block(s), html-tracker (direct, gtag, root=ukuu-coaching-profesional)
- **check:** a page script loads GTM itself (gtm.js); keep its GTM ID empty so GTM is not loaded twice
- **check:** no link to a privacy policy on a page that collects contact details (needed for Google Ads enhanced conversions, GDPR and Quebec Law 25)
- **check:** unfilled placeholders: {{GTM_ID}}, {{URL_APPS_SCRIPT}}
- **check:** the page uses position:fixed (sticky bars, floating buttons): check them on the live Wix page, where Wix containers can change how fixed elements are placed

## Next steps
1. Host ukuu-coaching-profesional.js on HTTPS: e.g. commit it to a public GitHub repo and use https://cdn.jsdelivr.net/gh/<user>/<repo>@<commit>/<path>, or Wix static hosting.
2. Wix editor (or browser-agent-prompt.txt): new page, Add Elements > Embed Code > Custom Element > Choose Source > Server URL = that URL, Tag Name = ukuu-coaching-profesional; stretch to full width; set the page SEO from seo-settings.md; publish.
3. Optional: velo-seo-markup.js in the page code gives crawlers without JavaScript the same text.
4. Tracking runs inside the Wix page: keep ONE Google tag or GTM in Marketing Integrations; no Custom Code listener needed.
