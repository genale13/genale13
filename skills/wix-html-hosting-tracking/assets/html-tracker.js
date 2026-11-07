/*! html-tracker v1.0.0 | behaviour tracking for HTML hosted on, or embedded in, Wix.
 *
 * DIRECT mode (the page is served first-party, e.g. Wix static hosting on your own domain):
 *   events go straight into this page's dataLayer (GTM) or gtag (Google tag).
 * BRIDGE mode (the page runs inside a Wix "Embed HTML" iframe on *.filesusr.com):
 *   events are posted to the parent Wix page, where wix-parent-listener forwards them to
 *   GTM / the Google tag with the parent's first-party cookies, gclid and page URL.
 *
 * Privacy: never reads or sends form field values. Emails and phone numbers are only used for
 * Google Ads enhanced conversions when enabled, and only as SHA-256 hashes.
 *
 * Configure BEFORE this script loads:
 *   window.HTML_TRACKER_CONFIG = { mode: 'auto', output: 'gtm', embedId: 'spring-lp', ... };
 * See references/event-reference.md for every option and event.
 */
(function (w, d) {
  'use strict';
  if (w.htmlTracker && w.htmlTracker.version) return; // already loaded on this page

  var VERSION = '1.0.0';
  var NS = 'wixhtml';
  var C = w.HTML_TRACKER_CONFIG || {};
  function opt(k, def) { return C[k] === undefined || C[k] === null ? def : C[k]; }

  var IN_FRAME = (function () { try { return w.self !== w.top; } catch (e) { return true; } })();
  var MODE = opt('mode', 'auto');
  if (MODE !== 'direct' && MODE !== 'bridge') MODE = IN_FRAME ? 'bridge' : 'direct';
  var OUTPUT = opt('output', 'gtm') === 'gtag' ? 'gtag' : 'gtm';
  var EMBED_ID = clip(String(opt('embedId', MODE === 'bridge' ? 'html_embed' : '')), 100);
  var DEBUG = !!opt('debug', false) || /[?&#]tracker_debug=1/.test(location.href);
  var MAX_EVENTS = +opt('maxEvents', 300);
  var CONVERSIONS = opt('conversions', {});
  var EC = !!opt('enhancedConversions', false);
  var ROOT_SEL = String(opt('root', '') || ''); // CSS selector: only track inside this element (custom elements, sections)
  var LOG = [];
  var sent = 0;
  var ctx = {};

  var KNOWN = ['embed_id', 'embed_title', 'embed_view', 'click_text', 'click_url', 'click_id', 'click_classes',
    'click_element', 'section', 'link_url', 'link_domain', 'link_text', 'contact_method', 'file_name',
    'file_extension', 'percent_scrolled', 'engaged_seconds', 'form_id', 'form_name', 'form_destination',
    'form_length', 'last_field', 'lead_source', 'value', 'currency', 'transaction_id', 'video_title',
    'video_provider', 'video_percent', 'video_duration', 'media_type', 'element_name', 'copy_type',
    'copy_length', 'error_message', 'error_source', 'event_source', 'user_data'];
  var ATTR_KEYS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'utm_source', 'utm_medium',
    'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
  var DOWNLOAD_EXT = /^(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|gz|mp3|wav|mp4|mov|avi|key|pages|numbers|epub|dmg|exe|apk)$/i;

  /* ---------------------------------------------------------------- utilities */
  function clip(s, n) { s = s == null ? '' : String(s); return s.length > n ? s.slice(0, n) : s; }
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
    }
    return t;
  }
  function dbg() {
    if (!DEBUG || !w.console) return;
    try { console.log.apply(console, ['[html-tracker]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function redact(s) {
    return String(s)
      .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[email]')
      .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]');
  }
  function textOf(el) {
    if (!el) return '';
    var t = el.tagName === 'INPUT' ? (el.value || '') : (el.innerText || el.textContent || '');
    if (!/\S/.test(t)) {
      t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (!t && el.querySelector) { var img = el.querySelector('img[alt]'); if (img) t = img.getAttribute('alt'); }
    }
    return redact(clip(t.replace(/\s+/g, ' ').trim(), 100));
  }
  function parseUrl(href) { try { return new URL(href, location.href); } catch (e) { return null; } }
  function cleanUrl(u) { return u ? clip(u.origin + u.pathname, 100) : ''; }
  function parseQuery(search) {
    var out = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeSafe(i < 0 ? pair : pair.slice(0, i)).toLowerCase();
      var v = i < 0 ? '' : decodeSafe(pair.slice(i + 1));
      if (k && !(k in out)) out[k] = v;
    });
    return out;
  }
  function decodeSafe(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }
  function rootDomain(host) {
    var p = String(host || '').split('.');
    if (p.length <= 2) return host;
    var cc = p[p.length - 1].length === 2 && p[p.length - 2].length <= 3; // co.uk, com.au, com.co ...
    return p.slice(cc ? -3 : -2).join('.');
  }
  function sectionOf(el) {
    var n = el, hops = 0;
    while (n && n.nodeType === 1 && n !== d.body && hops++ < 40) {
      var ds = n.getAttribute('data-section');
      if (ds) return clip(ds, 100);
      if (/^(SECTION|HEADER|FOOTER|NAV|MAIN|ASIDE|ARTICLE|FORM|DIALOG)$/.test(n.tagName)) {
        if (n.id) return clip(n.tagName.toLowerCase() + '#' + n.id, 100);
        var h = n.querySelector('h1,h2,h3');
        return h ? textOf(h) : n.tagName.toLowerCase();
      }
      n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
    }
    return '';
  }
  function eventPath(e) {
    if (e.composedPath) { try { var p = e.composedPath(); if (p && p.length) return p; } catch (x) {} }
    var out = [], n = e.target;
    while (n) { out.push(n); n = n.parentNode; }
    return out;
  }
  function sanitize(src) {
    var out = {}, n = 0;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var key = String(k).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
      if (!/^[a-z]/.test(key)) continue;
      var v = src[k];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'number') { if (!isFinite(v)) continue; }
      else if (typeof v === 'boolean') v = v ? 'true' : 'false';
      else if (typeof v === 'object') continue;
      else v = clip(String(v).replace(/\s+/g, ' ').trim(), 100);
      if (v === '') continue;
      out[key] = v;
      if (++n >= 24) break;
    }
    return out;
  }
  var store = {
    get: function (k) { try { return JSON.parse(w.sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { w.sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function gclCookie(name) {
    var m = d.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    if (!m) return '';
    var parts = decodeSafe(m[1]).split('.');
    return parts.length > 2 ? parts.slice(2).join('.') : '';
  }
  function rootEl() { if (!ROOT_SEL) return null; try { return d.querySelector(ROOT_SEL); } catch (e) { return null; } }
  function inScope(node) {
    if (!ROOT_SEL) return true;
    var r = rootEl();
    if (!r || !node) return false;
    if (node.length !== undefined && typeof node !== 'string' && !node.nodeType) return [].indexOf.call(node, r) > -1; // event path
    return r === node || r.contains(node);
  }

  /* ------------------------------------------------------- bridge handshake */
  var PARENT_ORIGIN = null, TOP_ORIGIN = null, linked = false, pending = [], gaveUp = false;
  if (MODE === 'bridge') {
    var allowed = [].concat(opt('parentOrigins', opt('parentOrigin', [])) || []).filter(Boolean);
    var seen = null, seenTop = null;
    try {
      var ao = location.ancestorOrigins;
      if (ao && ao.length) { seen = ao[0]; seenTop = ao[ao.length - 1]; }
    } catch (e) {}
    if (!seen && d.referrer) { var ru = parseUrl(d.referrer); if (ru) seen = ru.origin; }
    if (allowed.length) {
      if (seen && allowed.indexOf(seen) > -1) PARENT_ORIGIN = seen;
      else if (!seen && allowed.length === 1) PARENT_ORIGIN = allowed[0];
    } else {
      PARENT_ORIGIN = seen;
    }
    TOP_ORIGIN = seenTop && (!allowed.length || allowed.indexOf(seenTop) > -1) ? seenTop : null;
    dbg('bridge mode; parent origin =', PARENT_ORIGIN || '(unknown, using *)');
  }

  function post(msg) {
    msg.ns = NS; msg.v = 1; msg.embedId = EMBED_ID;
    var targets = [[w.parent, PARENT_ORIGIN]];
    try { if (w.top && w.top !== w.parent) targets.push([w.top, TOP_ORIGIN]); } catch (e) {}
    for (var i = 0; i < targets.length; i++) {
      var origin = targets[i][1] || '*';
      var m = msg;
      if (origin === '*' && m.userData) { m = assign({}, msg); delete m.userData; } // never broadcast hashed PII
      try { targets[i][0].postMessage(m, origin); } catch (e) { dbg('postMessage failed', e); }
    }
  }
  function hello() { if (!linked) post({ type: 'hello', title: clip(d.title, 100) }); }

  w.addEventListener('message', function (e) {
    var m = e.data;
    if (MODE !== 'bridge' || !m || typeof m !== 'object' || m.ns !== NS || m.type !== 'context') return;
    var fromParent = false;
    try { fromParent = e.source === w.parent || e.source === w.top; } catch (x) {}
    if (PARENT_ORIGIN && e.origin !== PARENT_ORIGIN && e.origin !== TOP_ORIGIN && !fromParent) return;
    var first = !linked;
    linked = true;
    applyContext(m.context || {});
    if (first) { dbg('linked to parent listener; flushing', pending.length, 'events'); flush(); }
  });
  function flush() { var q = pending.splice(0); for (var i = 0; i < q.length; i++) post(q[i]); }

  /* ---------------------------------------------------------------- delivery */
  function track(name, params, userData) {
    name = String(name || '');
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name)) { dbg('invalid event name', name); return; }
    if (sent >= MAX_EVENTS) return;
    sent++;
    var p = sanitize(params || {});
    if (EMBED_ID) p.embed_id = EMBED_ID;
    if (MODE === 'direct') p.event_source = 'html_page'; // the Wix-page listener sets html_embed for bridge events
    if (MODE === 'bridge' && location.hash && location.hash.length > 1) p.embed_view = clip(location.hash, 100);
    var ud = userData && typeof userData === 'object' ? assign({}, userData) : null;
    LOG.push({ t: Date.now(), name: name, params: p, userData: ud ? Object.keys(ud) : undefined });
    if (LOG.length > 100) LOG.shift();
    dbg(name, p);
    if (MODE === 'bridge') {
      var msg = { type: 'event', name: name, params: p };
      if (ud) msg.userData = ud;
      if (linked || gaveUp) post(msg); else pending.push(msg);
    } else {
      deliver(name, p, ud);
    }
  }

  function deliver(name, p, ud) {
    var dl = (w.dataLayer = w.dataLayer || []);
    if (OUTPUT === 'gtag') {
      var g = typeof w.gtag === 'function' ? w.gtag : function () { dl.push(arguments); };
      if (ud) g('set', 'user_data', ud);
      g('event', name, p);
      if (CONVERSIONS && CONVERSIONS[name]) fireConversions(g, CONVERSIONS[name], p);
    } else {
      var o = {};
      for (var i = 0; i < KNOWN.length; i++) o[KNOWN[i]] = undefined; // clear values left by earlier events
      for (var k in p) o[k] = p[k];
      if (ud) o.user_data = ud;
      o.event = name;
      dl.push(o);
    }
  }

  function fireConversions(g, conv, p) {
    var list = Object.prototype.toString.call(conv) === '[object Array]' ? conv : [conv];
    for (var i = 0; i < list.length; i++) {
      var c = typeof list[i] === 'string' ? { send_to: list[i] } : list[i];
      if (!c || !c.send_to) continue;
      var cp = { send_to: c.send_to };
      var v = p.value != null ? p.value : c.value;
      if (v != null && v !== '' && !isNaN(+v)) { cp.value = +v; cp.currency = p.currency || c.currency || opt('currency', 'USD'); }
      if (p.transaction_id) cp.transaction_id = p.transaction_id;
      g('event', 'conversion', cp);
    }
  }

  /* --------------------------------------------- attribution + hidden fields */
  function refOrigin() { var u = parseUrl(d.referrer); return u && u.origin !== location.origin ? u.origin : ''; }
  function localContext() {
    var q = parseQuery(location.search), c = {};
    for (var i = 0; i < ATTR_KEYS.length; i++) if (q[ATTR_KEYS[i]]) c[ATTR_KEYS[i]] = clip(q[ATTR_KEYS[i]], 300);
    if (MODE === 'direct') {
      // gclid / gbraid only from the URL or Google's own consent-aware cookies; UTMs persisted per session.
      if (!c.gclid) { var g = gclCookie('_gcl_aw'); if (g) c.gclid = g; }
      if (!c.gbraid) { var gb = gclCookie('_gcl_gb'); if (gb) c.gbraid = gb; }
      var hasUtm = false;
      for (var k in c) if (/^utm_/.test(k)) hasUtm = true;
      var saved = store.get('wixhtml_attrib') || {};
      if (hasUtm) {
        saved = { landing_page: location.pathname, referrer_url: refOrigin() };
        for (var k2 in c) if (/^utm_/.test(k2)) saved[k2] = c[k2];
        store.set('wixhtml_attrib', saved);
      }
      for (var k3 in saved) if (!c[k3]) c[k3] = saved[k3];
      c.landing_page = c.landing_page || location.pathname;
      c.referrer_url = c.referrer_url || refOrigin();
      c.page_url = location.origin + location.pathname;
    }
    return c;
  }
  function applyContext(c) {
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k) && c[k] != null && c[k] !== '') ctx[k] = clip(c[k], 500);
    if (opt('fillHiddenFields', true)) fillHidden();
  }
  function fillHidden() {
    var inputs = d.querySelectorAll('input[type="hidden"],input[data-fill]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = (el.getAttribute('data-fill') || el.getAttribute('name') || el.id || '').toLowerCase();
      if (key && ctx[key] && !el.value) el.value = ctx[key];
    }
  }
  function siteHost() {
    if (MODE === 'bridge') {
      var u = parseUrl(ctx.page_url || PARENT_ORIGIN || '');
      return u ? u.hostname : '';
    }
    return location.hostname;
  }

  /* ------------------------------------------------------------------ clicks */
  function isClickable(n) {
    var t = n.tagName;
    if (t === 'A') return n.hasAttribute('href');
    if (t === 'BUTTON' || t === 'SUMMARY') return true;
    if (t === 'INPUT') return /^(submit|button|image|reset)$/i.test(n.type || '');
    var role = n.getAttribute && n.getAttribute('role');
    return role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem';
  }
  function ctaParams(el) {
    var link = el.tagName === 'A' ? parseUrl(el.href) : null;
    return {
      click_text: textOf(el),
      click_id: clip(el.id || '', 100),
      click_classes: clip((typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 3).join(' '), 100),
      click_element: el.tagName.toLowerCase(),
      click_url: link ? cleanUrl(link) : '',
      section: sectionOf(el)
    };
  }
  function customParams(el) {
    var p = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf('data-track-') === 0 && a.name !== 'data-track-view') {
        p[a.name.slice(11).replace(/-/g, '_')] = redact(a.value);
      }
    }
    return p;
  }
  function trackLink(a) {
    var raw = a.getAttribute('href') || '';
    if (/^\s*(#|javascript:)/i.test(raw)) { track('cta_click', ctaParams(a)); return; }
    var u = parseUrl(a.href);
    if (!u) return;
    var base = { link_text: textOf(a), section: sectionOf(a) };
    var proto = u.protocol;
    if (proto === 'tel:') return track('contact_click', assign(base, { contact_method: 'phone' }));
    if (proto === 'mailto:') return track('contact_click', assign(base, { contact_method: 'email' }));
    if (proto === 'sms:') return track('contact_click', assign(base, { contact_method: 'sms' }));
    if (proto === 'whatsapp:' || /(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i.test(u.hostname)) {
      return track('contact_click', assign(base, { contact_method: 'whatsapp' }));
    }
    if (proto !== 'http:' && proto !== 'https:') return;
    var file = u.pathname.split('/').pop() || '';
    var ext = (file.match(/\.([a-z0-9]{2,5})$/i) || [])[1];
    if (ext && DOWNLOAD_EXT.test(ext)) {
      return track('download_click', assign(base, { file_name: clip(file, 100), file_extension: ext.toLowerCase(), link_url: cleanUrl(u) }));
    }
    var host = siteHost();
    var internal = u.hostname === location.hostname || (host && rootDomain(u.hostname) === rootDomain(host));
    if (!internal) return track('outbound_click', assign(base, { link_url: cleanUrl(u), link_domain: u.hostname }));
    track('link_click', assign(base, { link_url: cleanUrl(u) }));
  }
  var rage = { el: null, n: 0, t: 0, fired: [] };
  function rageCheck(el) {
    var now = Date.now();
    if (rage.el === el && now - rage.t < 800) rage.n++; else { rage.el = el; rage.n = 1; }
    rage.t = now;
    if (rage.n === 3 && rage.fired.indexOf(el) < 0) {
      rage.fired.push(el);
      track('rage_click', { click_text: textOf(el), click_element: (el.tagName || '').toLowerCase(), section: sectionOf(el) });
    }
  }
  function onClick(e) {
    var path = eventPath(e), target = null, custom = null;
    if (!inScope(path)) return;
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!n || n.nodeType !== 1) continue;
      if (!custom && n.hasAttribute('data-track')) custom = n;
      if (!target && isClickable(n)) target = n;
      if (n === d.body || n === d.documentElement) break;
    }
    var el = target || custom || (path[0] && path[0].nodeType === 1 ? path[0] : null);
    if (el) rageCheck(el);
    if (custom) {
      var name = custom.getAttribute('data-track');
      var p = assign(ctaParams(target || custom), customParams(custom));
      track(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name) ? name : 'cta_click', p);
      return;
    }
    if (!target) return;
    if (target.tagName === 'A') trackLink(target);
    else track('cta_click', ctaParams(target));
  }

  /* ------------------------------------------------------------------- forms */
  var forms = [], hashCache = {};
  function isField(el) {
    return !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(hidden|submit|button|reset|image)$/i.test(el.type || '');
  }
  function formRec(f) {
    for (var i = 0; i < forms.length; i++) if (forms[i].f === f) return forms[i];
    var idx = Array.prototype.indexOf.call(d.forms, f);
    var r = {
      f: f, started: false, submitted: false, submittedAt: 0, viewed: false, last: '',
      id: clip(f.getAttribute('id') || f.getAttribute('name') || f.getAttribute('data-form-name') || ('form_' + (idx + 1)), 100)
    };
    forms.push(r);
    return r;
  }
  function formParams(r) {
    var f = r.f, n = 0, els = f.elements || [];
    for (var i = 0; i < els.length; i++) if (isField(els[i])) n++;
    var action = f.getAttribute('action');
    return {
      form_id: r.id,
      form_name: clip(f.getAttribute('data-form-name') || f.getAttribute('name') || f.getAttribute('aria-label') || '', 100),
      form_destination: action ? cleanUrl(parseUrl(f.action)) : '',
      form_length: n
    };
  }
  function fieldName(el) {
    return clip(el.getAttribute('name') || el.id || el.getAttribute('aria-label') || el.type || el.tagName.toLowerCase(), 40);
  }
  function isLead(f) {
    var flag = f.getAttribute('data-lead');
    if (flag === 'false') return false;
    if (flag !== null) return true;
    var sel = opt('leadFormSelector', '');
    if (sel) { try { return f.matches(sel); } catch (e) { return false; } }
    return !!f.querySelector('input[type="email"],input[type="tel"],input[autocomplete="email"],input[autocomplete="tel"],' +
      'input[name*="mail" i],input[name*="phone" i],input[name*="tel" i]');
  }
  function isEmailField(el) {
    return el.type === 'email' || /email/i.test(el.getAttribute('autocomplete') || '') ||
      /e-?mail|courriel|correo/i.test((el.getAttribute('name') || '') + ' ' + (el.id || ''));
  }
  function isPhoneField(el) {
    return el.type === 'tel' || /^tel/i.test(el.getAttribute('autocomplete') || '') ||
      /phone|^tel|mobile|cell|telefono|t[ée]l[ée]phone/i.test((el.getAttribute('name') || '') + ' ' + (el.id || ''));
  }
  function normEmail(v) {
    v = String(v || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return '';
    var p = v.split('@');
    if (p[1] === 'gmail.com' || p[1] === 'googlemail.com') p[0] = p[0].replace(/\./g, '');
    return p.join('@');
  }
  function normPhone(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    var plus = s.charAt(0) === '+';
    var digits = s.replace(/\D/g, '');
    if (!plus && digits.indexOf('00') === 0) { digits = digits.slice(2); plus = true; }
    if (!plus) {
      var cc = String(opt('defaultCountryCode', '1')).replace(/\D/g, '') || '1';
      var hasCc = cc === '1' ? (digits.length === 11 && digits.charAt(0) === '1') : digits.indexOf(cc) === 0 && digits.length > 10;
      if (!hasCc) digits = cc + digits.replace(/^0+/, '');
    }
    return digits.length >= 8 && digits.length <= 15 ? '+' + digits : '';
  }
  function sha256(str, cb) {
    if (hashCache[str]) { cb(hashCache[str]); return; }
    try {
      if (!(w.crypto && w.crypto.subtle && w.TextEncoder)) { cb(null); return; }
      w.crypto.subtle.digest('SHA-256', new w.TextEncoder().encode(str)).then(function (buf) {
        var a = new Uint8Array(buf), s = '';
        for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
        hashCache[str] = s;
        cb(s);
      }, function () { cb(null); });
    } catch (e) { cb(null); }
  }
  function userFields(f) {
    var out = { email: '', phone: '' }, els = f.elements || [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!isField(el) || !el.value) continue;
      if (!out.email && isEmailField(el)) out.email = normEmail(el.value);
      else if (!out.phone && isPhoneField(el)) out.phone = normPhone(el.value);
    }
    return out;
  }
  function hashUserData(raw, cb) {
    var ud = {}, done = false, jobs = [];
    var email = raw.email ? normEmail(raw.email) : '', phone = raw.phone ? normPhone(raw.phone) : '';
    if (email) jobs.push(['sha256_email_address', email]);
    if (phone) jobs.push(['sha256_phone_number', phone]);
    var todo = jobs.length; // count every job BEFORE starting: cached hashes call back synchronously
    function finish() { if (done) return; done = true; cb(ud.sha256_email_address || ud.sha256_phone_number ? assign({}, ud) : null); }
    if (!todo) { finish(); return; }
    jobs.forEach(function (j) { sha256(j[1], function (h) { if (h) ud[j[0]] = h; if (--todo === 0) finish(); }); });
    setTimeout(finish, 600);
  }
  function onFocusIn(e) {
    var el = e.target;
    if (!isField(el) || !el.form || !inScope(el.form)) return;
    var r = formRec(el.form);
    r.last = fieldName(el);
    if (!r.started) { r.started = true; track('form_start', formParams(r)); }
  }
  function onChange(e) {
    var el = e.target;
    if (!isField(el) || !el.form || !inScope(el.form)) return;
    formRec(el.form).last = fieldName(el);
    if (EC && el.value) { // pre-hash so the hash is ready synchronously at submit time
      if (isEmailField(el)) { var ne = normEmail(el.value); if (ne) sha256(ne, function () {}); }
      else if (isPhoneField(el)) { var np = normPhone(el.value); if (np) sha256(np, function () {}); }
    }
  }
  function onSubmit(e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM' || !inScope(f)) return;
    var r = formRec(f), now = Date.now();
    if (r.submitted && now - r.submittedAt < 2000) return; // double-submit guard
    r.submitted = true; r.submittedAt = now;
    var p = formParams(r);
    track('form_submit', p);
    if (!isLead(f)) return;
    var lp = assign({}, p, { lead_source: MODE === 'bridge' ? 'html_embed_form' : 'html_form' });
    var val = f.getAttribute('data-lead-value');
    if (val === null || val === '') val = opt('leadValue', null);
    if (val !== null && val !== '' && !isNaN(+val)) {
      lp.value = +val;
      lp.currency = f.getAttribute('data-lead-currency') || opt('currency', 'USD');
    }
    if (!EC) { track('generate_lead', lp); return; }
    hashUserData(userFields(f), function (ud) { track('generate_lead', lp, ud); });
  }
  function onPageHide() {
    for (var i = 0; i < forms.length; i++) {
      var r = forms[i];
      if (r.started && !r.submitted) {
        r.submitted = true; // report once
        track('form_abandon', assign(formParams(r), { last_field: r.last }));
      }
    }
  }

  /* ------------------------------------------------------ visibility helpers */
  var HAS_IO = 'IntersectionObserver' in w;
  function onceVisible(el, ratio, fn) {
    if (!HAS_IO) return false;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting && entries[i].intersectionRatio >= ratio * 0.99) { io.disconnect(); fn(); return; }
      }
    }, { threshold: [ratio] });
    io.observe(el);
    return true;
  }
  function setupViews() {
    var scope = rootEl() || d;
    if (ROOT_SEL && scope === d) return;
    var els = scope.querySelectorAll('[data-track-view]');
    for (var i = 0; i < els.length; i++) (function (el) {
      onceVisible(el, 0.5, function () {
        track('element_view', { element_name: clip(el.getAttribute('data-track-view') || el.id || el.tagName.toLowerCase(), 100), section: sectionOf(el) });
      });
    })(els[i]);
    for (var j = 0; j < d.forms.length; j++) (function (f) {
      if (!inScope(f)) return;
      var r = formRec(f);
      onceVisible(f, 0.5, function () { if (!r.viewed) { r.viewed = true; track('form_view', formParams(r)); } });
    })(d.forms[j]);
  }

  /* ------------------------------------------------------------ scroll depth */
  function setupScroll() {
    var marks = [].concat(opt('scrollThresholds', [25, 50, 75, 90, 100]));
    if (!marks.length || !d.body) return;
    var root = rootEl();
    if (ROOT_SEL && !root) return;
    if (!HAS_IO) { // fallback: classic scroll position (direct mode only measures this document)
      if (root) return;
      var done = {};
      var check = function () {
        var h = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight);
        var pct = h ? ((w.pageYOffset || d.documentElement.scrollTop) + w.innerHeight) / h * 100 : 100;
        for (var i = 0; i < marks.length; i++) if (pct >= marks[i] && !done[marks[i]]) { done[marks[i]] = 1; track('scroll_depth', { percent_scrolled: marks[i] }); }
      };
      w.addEventListener('scroll', check, { passive: true }); check();
      return;
    }
    // Sentinels at N% of the document height. IntersectionObserver measures them against the
    // top-level viewport, so this works inside a cross-origin iframe scrolled by the parent page too.
    var box = d.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.setAttribute('data-html-tracker', 'scroll');
    box.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:0;margin:0;padding:0;border:0;pointer-events:none;opacity:0;';
    var sentinels = [];
    for (var i = 0; i < marks.length; i++) {
      var s = d.createElement('div');
      s.style.cssText = 'position:absolute;left:0;width:1px;height:1px;';
      s.setAttribute('data-pct', marks[i]);
      box.appendChild(s);
      sentinels.push(s);
    }
    if (root) {
      try { if (w.getComputedStyle(root).position === 'static') root.style.position = 'relative'; } catch (e) {}
      root.appendChild(box);
    } else {
      d.body.appendChild(box);
    }
    function layout() {
      box.style.display = 'none';
      var h = root ? Math.max(root.scrollHeight, root.offsetHeight)
        : Math.max(d.documentElement.scrollHeight, d.body.scrollHeight, d.documentElement.offsetHeight);
      box.style.display = '';
      for (var i = 0; i < sentinels.length; i++) {
        var pct = +sentinels[i].getAttribute('data-pct');
        sentinels[i].style.top = Math.max(0, Math.min(h - 2, Math.round(h * pct / 100) - 2)) + 'px';
      }
    }
    layout();
    w.addEventListener('load', layout);
    setTimeout(layout, 1500); setTimeout(layout, 5000);
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        io.unobserve(entries[i].target);
        track('scroll_depth', { percent_scrolled: +entries[i].target.getAttribute('data-pct') });
      }
    });
    for (var j = 0; j < sentinels.length; j++) io.observe(sentinels[j]);
  }

  /* --------------------------------------------------------- engagement time */
  function setupEngagement() {
    var marks = [].concat(opt('timeThresholds', [10, 30, 60, 120, 300])).sort(function (a, b) { return a - b; });
    if (!marks.length) return;
    var root = rootEl();
    if (ROOT_SEL && !root) return;
    var watch = IN_FRAME || !!root; // only count time while the embed / scoped element is on screen
    var idx = 0, active = 0, lastAct = Date.now(), inView = !watch;
    var bump = function () { lastAct = Date.now(); };
    ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'wheel', 'pointerdown'].forEach(function (ev) {
      d.addEventListener(ev, bump, { passive: true, capture: true });
    });
    if (watch && HAS_IO && (root || d.body)) {
      new IntersectionObserver(function (en) { inView = en[en.length - 1].isIntersecting; }).observe(root || d.body);
    } else if (watch) { inView = true; }
    var timer = setInterval(function () {
      var visible = !d.visibilityState || d.visibilityState === 'visible';
      var recent = IN_FRAME || Date.now() - lastAct < 60000;
      if (!(visible && inView && recent)) return;
      active++;
      while (idx < marks.length && active >= marks[idx]) { track('engaged_time', { engaged_seconds: marks[idx] }); idx++; }
      if (idx >= marks.length) clearInterval(timer);
    }, 1000);
  }

  /* ------------------------------------------------------------------- media */
  function onMedia(e) {
    var v = e.target;
    if (!v || !/^(VIDEO|AUDIO)$/.test(v.tagName) || !inScope(v)) return;
    var s = v.__htmlTracker || (v.__htmlTracker = { started: false, marks: {} });
    var src = v.currentSrc || v.getAttribute('src') || '';
    var p = {
      video_title: clip(v.getAttribute('title') || v.getAttribute('aria-label') || src.split('/').pop().split('?')[0], 100),
      video_provider: 'html5',
      media_type: v.tagName.toLowerCase(),
      video_duration: isFinite(v.duration) ? Math.round(v.duration) : undefined
    };
    if (e.type === 'play' && !s.started) { s.started = true; track('video_start', p); }
    else if (e.type === 'timeupdate' && v.duration && isFinite(v.duration)) {
      var pct = v.currentTime / v.duration * 100, ms = [10, 25, 50, 75, 90];
      for (var i = 0; i < ms.length; i++) if (pct >= ms[i] && !s.marks[ms[i]]) { s.marks[ms[i]] = 1; track('video_progress', assign({}, p, { video_percent: ms[i] })); }
    } else if (e.type === 'ended' && !s.ended) { s.ended = true; track('video_complete', assign({}, p, { video_percent: 100 })); }
  }

  /* -------------------------------------------------------------------- misc */
  function onCopy() {
    var sel = '';
    try { sel = String(w.getSelection ? w.getSelection() : ''); } catch (e) {}
    if (!sel || !/\S/.test(sel)) return;
    var t = sel.trim();
    var type = /\S+@\S+\.\S+/.test(t) && t.length < 80 ? 'email'
      : (/\+?\d[\d\s().-]{6,}\d/.test(t) && t.length < 40 ? 'phone' : 'text');
    var node = null;
    try { node = w.getSelection().anchorNode; node = node && node.nodeType === 1 ? node : node && node.parentElement; } catch (e) {}
    if (ROOT_SEL && !inScope(node)) return;
    track('text_copy', { copy_type: type, copy_length: t.length, section: node ? sectionOf(node) : '' });
  }
  var errors = 0;
  function onError(e) {
    if (++errors > 5) return;
    var src = parseUrl(e.filename || '');
    track('js_error', { error_message: redact(clip(e.message || 'error', 100)), error_source: (src ? cleanUrl(src) : '') + ':' + (e.lineno || 0) });
  }

  /* --------------------------------------------------------------- public API */
  var api = {
    version: VERSION,
    mode: MODE,
    log: LOG,
    /** htmlTracker.track('quote_requested', { plan: 'pro' }) */
    track: function (name, params) { track(name, params || {}); },
    /** For AJAX forms: htmlTracker.lead({ form_id: 'quote', value: 50, currency: 'CAD' }, { email: '...', phone: '...' }) */
    lead: function (params, raw) {
      var p = assign({ lead_source: MODE === 'bridge' ? 'html_embed_form' : 'html_form' }, params || {});
      if (EC && raw) hashUserData(raw, function (ud) { track('generate_lead', p, ud); });
      else track('generate_lead', p);
    },
    context: function () { return assign({}, ctx); }
  };
  w.htmlTracker = api;
  var queued = w.htmlTrackerQueue;
  w.htmlTrackerQueue = { push: function (c) { if (c && api[c[0]]) api[c[0]].apply(api, [].slice.call(c, 1)); } };

  /* -------------------------------------------------------------------- init */
  function init() {
    applyContext(localContext());
    d.addEventListener('click', onClick, true);
    d.addEventListener('focusin', onFocusIn, true);
    d.addEventListener('change', onChange, true);
    d.addEventListener('submit', onSubmit, true);
    d.addEventListener('copy', onCopy, true);
    ['play', 'timeupdate', 'ended'].forEach(function (t) { d.addEventListener(t, onMedia, true); });
    w.addEventListener('pagehide', onPageHide);
    if (opt('trackErrors', false)) w.addEventListener('error', onError);
    if (MODE === 'bridge') {
      track('embed_view', { embed_title: clip(d.title, 100) });
      hello();
      [700, 1500, 3000, 6000].forEach(function (ms) { setTimeout(hello, ms); });
      setTimeout(function () { // no listener answered: send directly so nothing is held forever
        if (!linked) { gaveUp = true; dbg('no parent listener answered; sending without handshake'); flush(); }
      }, +opt('handshakeTimeout', 10000));
    }
    setupScroll();
    setupEngagement();
    setupViews();
    setTimeout(fillHidden, 1500); // forms rendered late by other scripts
    if (queued && queued.length) for (var i = 0; i < queued.length; i++) w.htmlTrackerQueue.push(queued[i]);
    dbg('ready', { version: VERSION, mode: MODE, output: OUTPUT, embedId: EMBED_ID });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})(window, document);
