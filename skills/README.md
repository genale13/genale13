# Skills

## wix-html-hosting-tracking

Lets Claude put your own HTML on Wix so **Google Ads, GA4 and Google Tag Manager can track everything
inside it**, with SEO intact. It covers:

- **Route A — Wix as a web server:** upload one or many HTML pages as a Wix-hosted static site on your own
  (sub)domain. The pages carry the Google tag themselves (first-party): every click, scroll, form and lead
  is tracked and the pages are fully indexable.
- **Route B — HTML inside an existing Wix page:** keeps the Embed HTML element but adds a tracker that
  sends every interaction to the Wix page, where a small Custom Code listener forwards it to your Google tag
  or GTM with the page's own cookies and gclid (this is why tracking "was blocked" before: the embed is an
  iframe on another domain, `filesusr.com`).
- **Browser runbook:** exact click paths for a browser agent such as Claude in Chrome (Wix editor, Wix
  dashboard, GTM, GA4, Google Ads) for the steps that have no API, plus a generated `browser-agent-prompt.txt`
  with the code to paste.
- **Checks:** `verify_live.py` (published static site), `browser_check.js` (events, Google hits, form
  submission in a real browser) and `simulate_embed.js` (a simulated Wix page to test an embed before
  installing anything).

What it tracks: CTA, link, outbound, phone/email/WhatsApp and download clicks, custom `data-track`
events, rage clicks, scroll depth, engaged time, element views, form view/start/submit/abandon,
`generate_lead` with value, HTML5 video, copies of phone/email, plus Google Ads conversions, enhanced
conversions (SHA-256 hashed email/phone), gclid/UTM in hidden form fields, and Consent Mode v2 defaults.

### Install

- **claude.ai / Claude desktop:** upload `dist/wix-html-hosting-tracking.skill` under
  Settings → Capabilities → Skills (or open the `.skill` file and click *Save skill*).
- **Claude Code:** unzip `dist/wix-html-hosting-tracking.skill` into `~/.claude/skills/` (all projects) or
  `.claude/skills/` in a project. Copying the source folder works too; leave out its `evals/` folder (test
  prompts and graders, not needed to use the skill).
- Connect the **Wix** connector so Claude can upload and manage sites (claude.ai → Settings → Connectors →
  Wix; Claude Code: `/plugins install wix`).

Then just ask, e.g. *"Host these 3 landing pages on Wix at lp.mydomain.com with GTM-XXXX"* or *"My HTML
embed on my Wix site doesn't track Google Ads conversions, fix it"*.

### Develop / test

```bash
cd skills/tests && ./run_tests.sh   # needs python3, node and the playwright package with Chromium
```

The end-to-end test prepares `tests/fixture/src` with both routes and checks 47 behaviours in Chromium
(events, GTM/gtag output, cross-origin bridge, late listener after consent, hidden fields, hashing,
forged-message rejection).
`wix-html-hosting-tracking/evals/` holds the skill-creator test prompts (`claude plugin eval .` runs them).
