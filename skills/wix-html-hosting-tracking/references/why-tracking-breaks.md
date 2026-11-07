# Why tracking "is blocked" when HTML is embedded in Wix

Use this to explain the problem to the user in plain words, and to diagnose a site.

## The mechanism

Wix shows custom HTML through the **Embed HTML / Embed code** element, and Wix's own docs say
those elements are iFrames ("The HTML and URL elements in our editor are iFrames" — Help Center,
*Wix Editor: Embedding a Site or a Widget*). Velo's docs add that the HTML component "creates a
sandboxed environment (an iframe) that doesn't have direct access to the other elements on your page".

The code you paste is served from a **different website**: an address like
`https://www-yourdomain-com.filesusr.com/html/<id>.html` (your domain with dots turned into dashes, on
`filesusr.com`). Wix generates this host for embeds. To the browser, your page and your HTML are two
unrelated sites stacked on top of each other.

## What that breaks

| Symptom the user sees | Cause |
|---|---|
| GTM / GA4 on the Wix page records nothing that happens inside the HTML (clicks, forms, scroll) | The page cannot look inside a cross-origin iframe. GTM click and form triggers only see the page. |
| A Google tag pasted inside the HTML records little or junk | It runs as a **third-party** frame: `_ga` / `_gcl_*` cookies are partitioned or blocked (Safari ITP, Firefox ETP, Chrome settings, ad blockers), and `page_location` is the `filesusr.com` URL, not your page. |
| Google Ads conversions from the HTML are not attributed to ads | The ad click ID (`gclid`) is in the Wix page URL and in the `_gcl_aw` cookie on *your* domain. The iframe sees neither. |
| GA4 shows `filesusr.com` as a referrer/hostname, sessions split, journeys break | Different hostname; navigation inside the iframe looks like another site. |
| The embed only loads after a cookie choice (or never) | In the newer editors each embed has a *Cookies and similar technologies* category; Wix's consent banner holds non-essential categories until the visitor agrees. |
| GA/GTM added through **Custom Code** "doesn't work" | Wix says tracking scripts (GA, GTM, Meta, TikTok) do not work through Custom Code; connect them in **Marketing Integrations** instead. |
| Nothing works on a free site | Marketing Integrations, Custom Code, Event Manager and custom elements need a **Premium plan and a connected domain**. |
| A Custom Code snippet vanished | Wix deletes Custom Code snippets when the site gets a different domain; connect the final domain first. |
| A snippet that used to work is blocked | Since December 2025 Wix blocks custom code that replaces `fetch`/`XMLHttpRequest`, edits locked globals, reads Wix cookies or passes strings to timers. |
| SEO: the page ranks as "thin" | Text inside an iframe is credited to the `filesusr.com` URL, not to your page. |

## The fixes, in order of tracking quality

1. **Do not use an iframe.** Host the HTML as real pages on Wix static hosting (Wix Headless upload)
   on your own domain or subdomain. The Google tag runs first-party inside the page: full tracking, full
   SEO, several pages. → `route-a-static-hosting.md`
2. **Keep the iframe but add a bridge.** The HTML reports every interaction to the Wix page with
   `postMessage`; a small listener on the Wix page (Custom Code) sends them through the Google tag / GTM
   that Wix loaded with first-party cookies, the real page URL and the gclid. The listener also passes
   gclid/UTM down into the iframe for hidden form fields. → `route-b-editor-embed.md`
3. **Custom element** (advanced): the code runs inside the page itself on the live site, so the page's
   tags see it natively. → `route-b-editor-embed.md` (section B3)

## Quick diagnosis on a live page

- Right-click the embedded area → *Inspect*: an `<iframe>` whose `src` contains `filesusr.com` confirms
  the iframe case.
- In DevTools Console on the Wix page: `Object.keys(window.google_tag_manager||{})` lists the containers
  Wix loaded (`GTM-…`, `G-…`, `AW-…`). Empty means no integration, or no consent yet.
- Tag Assistant (tagassistant.google.com) on the page URL shows which tags fire and with which consent.
