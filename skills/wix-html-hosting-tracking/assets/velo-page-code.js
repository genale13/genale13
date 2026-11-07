// html-tracker — Velo page code (Route B, option 2).
// Alternative to the Custom Code listener (wix-parent-listener.html). Use ONE of the two, never both,
// or every event is counted twice.
//
// When to prefer this: you already use Velo (Dev Mode) on the site, or you want the events to go
// through Wix's own analytics pipeline to EVERY tool connected in Marketing Integrations
// (Google tag, GTM, Meta Pixel & CAPI, TikTok). Wix decides how they appear in each tool, so check
// GA4 DebugView once after publishing. It does not pass gclid/UTM into the iframe; use the
// Custom Code listener when hidden form fields need them.
//
// Setup:
//   1. Editor: turn on Dev Mode (Velo).
//   2. Select each Embed HTML element and set its ID in the Properties panel (e.g. htmlTracker).
//   3. Paste this into that page's code panel, list the IDs below, and publish.
//   If the editor reports that '@wix/site' is missing, add the package from the code panel's
//   package manager (npm), then publish again.
import { analytics } from '@wix/site';

const NS = 'wixhtml';
const EMBED_ELEMENT_IDS = ['#htmlTracker']; // every Embed HTML element on this page that runs html-tracker

$w.onReady(() => {
  EMBED_ELEMENT_IDS.forEach((id) => {
    const embed = $w(id);
    embed.onMessage((event) => {
      const m = event.data;
      if (!m || typeof m !== 'object' || m.ns !== NS) return;
      if (m.type === 'hello') {
        // Acknowledge so the iframe stops queueing and starts sending immediately.
        embed.postMessage({ ns: NS, v: 1, type: 'context', context: {} });
        return;
      }
      if (m.type !== 'event' || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(m.name || '')) return;
      const p = m.params || {};
      const label = String(p.click_text || p.link_text || p.form_id || p.element_name || p.embed_id || '').slice(0, 100);
      if (m.name === 'generate_lead') analytics.trackEvent('Lead');
      analytics.trackEvent('CustomEvent', {
        eventCategory: 'html_embed',
        eventAction: m.name,
        eventLabel: label,
        eventValue: typeof p.value === 'number' ? p.value : undefined,
        ...p,
      });
    });
  });
});
