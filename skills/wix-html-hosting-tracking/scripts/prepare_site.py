#!/usr/bin/env python3
"""Prepare HTML for Wix with full Google Ads / GA4 / GTM tracking and SEO basics.

Routes:
  static   The HTML becomes its own Wix-hosted static site (first-party pages, best tracking/SEO).
          Injects consent defaults + GTM or Google tag + html-tracker (direct mode), fixes SEO
          basics, writes sitemap.xml / robots.txt and the upload artifacts for Wix.
  embed   The HTML is pasted into a Wix "Embed HTML" element (an iframe on *.filesusr.com).
          Produces a self-contained snippet with html-tracker in bridge mode (existing Google
          tags removed) plus the configured parent listener for Wix Custom Code.
  listener Only the Wix-side listener + a paste-ready browser-agent prompt (embeds already prepared).
  element  One page becomes a Wix custom element: rendered inside a Wix page with no iframe, CSS scoped,
           scripts run in page scope, html-tracker scoped to the element (needs Premium + domain + no ads).

Standard library only. Run with -h for options. Examples:
  python3 prepare_site.py ./landing --route static --gtm GTM-ABC1234 --base-url https://lp.example.com
  python3 prepare_site.py ./form.html --route embed --parent-origin https://www.example.com --gtag G-ABC123
"""
import argparse
import base64
import datetime
import html
import json
import os
import re
import shutil
import sys
import zipfile
from html.parser import HTMLParser
from urllib.parse import quote, unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
TRACKER_FILE = 'html-tracker.js'

# File types Wix static hosting accepts (dev.wix.com ... /what-you-can-upload).
ALLOWED_EXT = set('''html htm css js mjs cjs jsx map png jpg jpeg gif svg webp ico avif bmp heic heif tiff
mp4 webm ogv mp3 wav ogg m4a woff woff2 ttf otf eot json xml txt md pdf csv yaml geojson glb gltf bin'''.split())
TEXT_EXT = set('html htm css js mjs cjs jsx map svg json xml txt md csv yaml geojson gltf'.split())
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.idea', '.vscode'}
WIX_LIMIT_BYTES = 20 * 1024 * 1024
WIX_LIMIT_FILES = 5000

# Regions where consent starts as "denied": EEA + UK + Switzerland + Quebec (Law 25). Not legal advice.
EU_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
              'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH', 'CA-QC']

ID_GTM = re.compile(r'^GTM-[A-Z0-9]{4,12}$')
ID_GTAG = re.compile(r'^(G|AW|GT|DC)-[A-Z0-9]{4,15}$')
SEND_TO = re.compile(r'^AW-\d{6,14}/[A-Za-z0-9_-]{4,40}$')


# --------------------------------------------------------------------------- analysis
class Analyzer(HTMLParser):
    """Collects what the SEO/tag checks need. Never modifies anything."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_lang = None
        self.has_html = self.has_head = self.has_body = False
        self.title = None
        self._in_title = False
        self._in_h1 = 0
        self.h1 = []
        self.meta = {}           # lowercase name/property -> content
        self.charset = False
        self.canonical = None
        self.imgs_no_alt = 0
        self.imgs = []
        self.links = []          # hrefs of <a>
        self.scripts = []        # src of <script>
        self.styles = []         # href of <link rel=stylesheet>
        self.icons = []
        self._h1_buf = []
        self.forms = []          # {'id', 'action', 'method', 'contact'}
        self._form = None
        self.anchors = []        # (href, text)
        self._a = None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or '') for k, v in attrs}
        if tag == 'html':
            self.has_html = True
            self.html_lang = a.get('lang') or None
        elif tag == 'head':
            self.has_head = True
        elif tag == 'body':
            self.has_body = True
        elif tag == 'title' and self.title is None:
            self._in_title = True
            self.title = ''
        elif tag == 'h1':
            self._in_h1 += 1
            self._h1_buf = []
        elif tag == 'meta':
            if 'charset' in a or a.get('http-equiv', '').lower() == 'content-type':
                self.charset = True
            key = (a.get('name') or a.get('property') or '').lower()
            if key:
                self.meta.setdefault(key, a.get('content', ''))
        elif tag == 'link':
            rel = a.get('rel', '').lower().split()
            if 'canonical' in rel:
                self.canonical = a.get('href', '')
            if 'stylesheet' in rel and a.get('href'):
                self.styles.append(a['href'])
            if 'icon' in rel and a.get('href'):
                self.icons.append(a['href'])
        elif tag == 'img':
            self.imgs.append(a.get('src', ''))
            if 'alt' not in a:
                self.imgs_no_alt += 1
        elif tag == 'a' and a.get('href') is not None:
            self.links.append(a['href'])
            self._a = [a['href'], []]
        elif tag == 'script' and a.get('src'):
            self.scripts.append(a['src'])
        if tag == 'form':
            self._form = {'id': a.get('id') or a.get('name') or 'form_%d' % (len(self.forms) + 1),
                          'action': a.get('action'), 'method': (a.get('method') or 'get').lower(), 'contact': False}
            self.forms.append(self._form)
        elif tag in ('input', 'textarea') and self._form is not None:
            kind = a.get('type', '').lower()
            if kind in ('email', 'tel') or re.search(r'mail|phone|tel[eé]?f|courriel|correo', a.get('name', '') + ' ' + a.get('id', ''), re.I):
                self._form['contact'] = True

    def handle_endtag(self, tag):
        if tag == 'form':
            self._form = None
        elif tag == 'a' and self._a is not None:
            self.anchors.append((self._a[0], re.sub(r'\s+', ' ', ''.join(self._a[1])).strip()))
            self._a = None
        if tag == 'title':
            self._in_title = False
        elif tag == 'h1' and self._in_h1:
            self._in_h1 -= 1
            self.h1.append(re.sub(r'\s+', ' ', ''.join(self._h1_buf)).strip())

    def handle_data(self, data):
        if self._a is not None:
            self._a[1].append(data)
        if self._in_title:
            self.title += data
        if self._in_h1:
            self._h1_buf.append(data)


def analyze(text):
    an = Analyzer()
    try:
        an.feed(text)
        an.close()
    except Exception:  # malformed HTML: keep what we got
        pass
    if an.title is not None:
        an.title = re.sub(r'\s+', ' ', an.title).strip()
    return an


def form_and_privacy_checks(an, pw, enhanced, route, text=''):
    """Warn about lead forms that lose the lead or leak contact data, and a missing privacy link."""
    lead_forms = [f for f in an.forms if f['contact']]
    js_submit = bool(re.search(r'''addEventListener\(\s*["']submit["']''', text) and 'preventDefault' in text)
    where = {'static': 'the page', 'embed': 'the iframe', 'element': 'the Wix page'}.get(route, 'the page')
    for f in lead_forms:
        action = (f['action'] or '').strip()
        if (not action or action == '#' or action.lower().startswith('javascript:')) and not js_submit:
            pw('form "%s" has no action and no script handles its submit: a normal submit reloads %s with the answers '
               'in the URL, so the lead is lost and the email lands in page URLs sent to GA4. Post it to a form backend '
               '(CRM, HubSpot, Formspree...) with method="post", or submit it with JavaScript and call htmlTracker.lead() '
               'on success%s' % (f['id'], where, ' (static hosting cannot receive form posts)' if route == 'static' else ''))
        elif f['method'] != 'post' and action and action != '#' and not js_submit:
            pw('form "%s" uses GET: the email/phone typed by the visitor goes into the destination URL; use method="post"' % f['id'])
    privacy = re.compile(r'privacy|privacidad|privacit|confidentialit|politique|datenschutz|aviso legal|terms', re.I)
    if (lead_forms or enhanced) and not any(privacy.search((h or '') + ' ' + t) for h, t in an.anchors):
        pw('no link to a privacy policy on a page that collects contact details (needed for Google Ads enhanced '
           'conversions, GDPR and Quebec Law 25)')


# ------------------------------------------------------------------ google tag removal
GTM_INLINE = re.compile(r'(?:<!--\s*Google Tag Manager\s*-->\s*)?<script\b[^>]*>\s*(?:<!--)?\s*\(function\s*\(\s*w\s*,\s*d\s*,\s*s\s*,\s*l\s*,\s*i\s*\)'
                        r'\s*\{(?:(?!</script>).){0,600}?googletagmanager\.com/gtm\.js(?:(?!</script>).){0,400}?\}\s*\)\s*\(\s*window\s*,\s*document\s*,'
                        r'\s*[\'"]script[\'"]\s*,\s*[\'"]\w+[\'"]\s*,\s*[\'"]GTM-[A-Z0-9]+[\'"]\s*\)\s*;?\s*(?:-->)?\s*</script>'
                        r'(?:\s*<!--\s*End Google Tag Manager\s*-->)?', re.I | re.S)
OWN_GTM_LOADER = re.compile(r'googletagmanager\.com/gtm\.js', re.I)
GTM_NOSCRIPT = re.compile(r'(?:<!--\s*Google Tag Manager \(noscript\)\s*-->\s*)?<noscript>\s*<iframe[^>]*googletagmanager\.com/ns\.html'
                          r'[^>]*>\s*</iframe>\s*</noscript>(?:\s*<!--\s*End Google Tag Manager \(noscript\)\s*-->)?', re.I | re.S)
GTAG_LOADER = re.compile(r'(?:<!--\s*Global site tag[^>]*-->\s*|<!--\s*Google tag \(gtag\.js\)\s*-->\s*)?'
                         r'<script\b[^>]*\bsrc=["\']https?://www\.googletagmanager\.com/gtag/js\?id=[^"\']+["\'][^>]*>\s*</script>', re.I | re.S)
INLINE_SCRIPT = re.compile(r'<script\b([^>]*)>(.*?)</script>', re.I | re.S)
TAG_IDS = re.compile(r'\b(GTM-[A-Z0-9]{4,12}|G-[A-Z0-9]{4,15}|AW-\d{6,14}|GT-[A-Z0-9]{4,15}|DC-\d{4,14})\b')


def _strip_calls(code, fname):
    """Remove every fname(...) call (balanced parentheses, string aware)."""
    out, i, n = [], 0, len(code)
    pat = re.compile(r'\b' + re.escape(fname) + r'\s*\(')
    while i < n:
        m = pat.search(code, i)
        if not m:
            out.append(code[i:])
            break
        out.append(code[i:m.start()])
        j, depth, quote_ch = m.end(), 1, None
        while j < n and depth:
            ch = code[j]
            if quote_ch:
                if ch == '\\':
                    j += 1
                elif ch == quote_ch:
                    quote_ch = None
            elif ch in '\'"`':
                quote_ch = ch
            elif ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
            j += 1
        i = j
    return ''.join(out)


def is_pure_gtag(code):
    if 'gtag' not in code and 'dataLayer' not in code:
        return False
    c = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
    c = re.sub(r'(^|[^:])//[^\n]*', r'\1', c)
    c = re.sub(r'function\s+gtag\s*\(\s*\)\s*\{\s*(window\.)?dataLayer\.push\(\s*arguments\s*\)\s*;?\s*\}', '', c)
    c = re.sub(r'(var|let|const)?\s*(window\.)?dataLayer\s*=\s*(window\.)?dataLayer\s*\|\|\s*\[\s*\]', '', c)
    c = _strip_calls(c, 'gtag')
    return re.sub(r'[\s;]', '', c) == ''


def strip_google_tags(text):
    """Remove GTM / gtag.js snippets. Returns (new_text, removed_descriptions, ids_found)."""
    ids = sorted(set(TAG_IDS.findall(text)))
    removed = []
    for rx, label in ((GTM_INLINE, 'GTM loader'), (GTM_NOSCRIPT, 'GTM noscript'), (GTAG_LOADER, 'gtag.js loader')):
        text, n = rx.subn('', text)
        if n:
            removed.append('%s x%d' % (label, n))

    def inline(m):
        attrs, body = m.group(1), m.group(2)
        if 'src=' in attrs.lower() or not is_pure_gtag(body):
            return m.group(0)
        removed.append('inline gtag()/dataLayer setup')
        return ''
    text = INLINE_SCRIPT.sub(inline, text)
    leftovers = [m.group(0)[:80] for m in INLINE_SCRIPT.finditer(text)
                 if re.search(r"gtag\(\s*['\"](config|event)", m.group(2))]
    if any(OWN_GTM_LOADER.search(m.group(2)) for m in INLINE_SCRIPT.finditer(text)):
        leftovers.append('a page script loads GTM itself (gtm.js); keep its GTM ID empty so GTM is not loaded twice')
    return text, removed, ids, leftovers


INLINE_HANDLER = re.compile(r'\s+(on[a-z]+)\s*=\s*(["\'])((?:(?!\2).)*)\2', re.I | re.S)


def strip_inline_tracking_handlers(text):
    """Remove on*="gtag(...)" style attributes that only call tracking code. Returns (text, stripped, mixed)."""
    stripped, mixed = [], []

    def fix(m):
        code = html.unescape(m.group(3))
        if not re.search(r'\b(gtag|fbq|ttq|dataLayer)\b', code):
            return m.group(0)
        rest = code
        for fn in ('gtag', 'fbq', 'ttq', 'window.dataLayer.push', 'dataLayer.push'):
            rest = _strip_calls(rest, fn)
        if re.sub(r'[\s;]|return\s+true', '', rest) == '':
            stripped.append(m.group(0).strip())
            return ''
        mixed.append(m.group(0).strip())
        return m.group(0)
    return INLINE_HANDLER.sub(fix, text), stripped, mixed


def page_own_events(text):
    """What the page's own scripts already send: (sends_generate_lead, relay_filter_key)."""
    code = ' '.join(m.group(2) for m in INLINE_SCRIPT.finditer(text) if 'ld+json' not in m.group(1).lower())
    lead = bool(re.search(r"""['"]generate_lead['"]""", code))
    key = re.search(r'\{\s*event\s*:\s*[A-Za-z_$][\w$.]*\s*,\s*([A-Za-z_][\w]*)\s*:', code)
    return lead, (key.group(1) if key and 'dataLayer' in code else '')


# ------------------------------------------------------------------------ snippets
def consent_snippet(default, regions, wix_bridge):
    lines = ['<!-- html-tracker: Google consent defaults (must run before any Google tag) -->', '<script>',
             'window.dataLayer = window.dataLayer || [];',
             'function gtag(){dataLayer.push(arguments);}']
    if regions and default == 'granted':
        lines.append("gtag('consent', 'default', {ad_storage: 'denied', ad_user_data: 'denied', "
                     "ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500, "
                     "region: %s});" % json.dumps(regions))
    lines.append("gtag('consent', 'default', {ad_storage: '%s', ad_user_data: '%s', ad_personalization: '%s', "
                 "analytics_storage: '%s', wait_for_update: 500});" % ((default,) * 4))
    lines.append("gtag('set', 'ads_data_redaction', true);")
    lines.append("gtag('set', 'url_passthrough', true);")
    if wix_bridge:
        lines += [
            '(function () { // Wix cookie banner -> Google Consent Mode, once the visitor has chosen',
            '  function apply(p) {',
            '    if (!p || p.defaultPolicy) return;',
            "    var c = p.policy || {}, ad = c.advertising ? 'granted' : 'denied';",
            "    gtag('consent', 'update', {analytics_storage: c.analytics ? 'granted' : 'denied', ad_storage: ad, "
            "ad_user_data: ad, ad_personalization: (c.advertising && c.dataToThirdParty) ? 'granted' : 'denied'});",
            '  }',
            '  function hook() {',
            '    var m = window.consentPolicyManager; if (!m) return;',
            '    try { apply(m.getCurrentConsentPolicy()); } catch (e) {}',
            "    try { if (typeof m.onConsentPolicyChanged === 'function') m.onConsentPolicyChanged(function () "
            "{ try { apply(m.getCurrentConsentPolicy()); } catch (e) {} }); } catch (e) {}",
            '  }',
            "  if (window.consentPolicyManager) hook(); else window.addEventListener('consentPolicyManagerReady', hook, {once: true});",
            '})();']
    lines.append('</script>')
    return '\n'.join(lines)


def gtm_head(gtm):
    return ('<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({\'gtm.start\':\n'
            'new Date().getTime(),event:\'gtm.js\'});var f=d.getElementsByTagName(s)[0],\n'
            'j=d.createElement(s),dl=l!=\'dataLayer\'?\'&l=\'+l:\'\';j.async=true;j.src=\n'
            '\'https://www.googletagmanager.com/gtm.js?id=\'+i+dl;f.parentNode.insertBefore(j,f);\n'
            '})(window,document,\'script\',\'dataLayer\',\'%s\');</script>\n<!-- End Google Tag Manager -->' % gtm)


def gtm_body(gtm):
    return ('<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=%s" '
            'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n'
            '<!-- End Google Tag Manager (noscript) -->' % gtm)


def gtag_head(ids, enhanced):
    out = ['<!-- Google tag (gtag.js) -->',
           '<script async src="https://www.googletagmanager.com/gtag/js?id=%s"></script>' % ids[0],
           '<script>', 'window.dataLayer = window.dataLayer || [];', 'function gtag(){dataLayer.push(arguments);}',
           "gtag('js', new Date());"]
    for i in ids:
        if i.startswith('AW-') and enhanced:
            out.append("gtag('config', '%s', {allow_enhanced_conversions: true});" % i)
        else:
            out.append("gtag('config', '%s');" % i)
    out.append('</script>')
    return '\n'.join(out)


def tracker_config_js(cfg):
    return 'window.HTML_TRACKER_CONFIG = %s;' % json.dumps(cfg, indent=2, ensure_ascii=False)


def read_asset(name):
    with open(os.path.join(ASSETS, name), encoding='utf-8') as fh:
        return fh.read()


# ------------------------------------------------------------------------ injection
def insert_after_open(text, tag, snippet):
    m = re.search(r'<%s\b[^>]*>' % tag, text, re.I)
    if not m:
        return None
    return text[:m.end()] + '\n' + snippet + '\n' + text[m.end():]


def insert_before_close(text, tag, snippet):
    idx = [m.start() for m in re.finditer(r'</%s\s*>' % tag, text, re.I)]
    if not idx:
        return None
    i = idx[-1]
    return text[:i] + snippet + '\n' + text[i:]


def ensure_head(text):
    if re.search(r'<head\b', text, re.I):
        return text
    m = re.search(r'<html\b[^>]*>', text, re.I)
    if m:
        return text[:m.end()] + '\n<head>\n</head>\n' + text[m.end():]
    m = re.search(r'<!doctype[^>]*>', text, re.I)
    if m:
        return text[:m.end()] + '\n<head>\n</head>\n' + text[m.end():]
    return '<head>\n</head>\n' + text


def add_to_head_start(text, snippet):
    text = ensure_head(text)
    return insert_after_open(text, 'head', snippet)


def add_to_head_end(text, snippet):
    text = ensure_head(text)
    r = insert_before_close(text, 'head', snippet)
    return r if r is not None else add_to_head_start(text, snippet)


def add_to_body_start(text, snippet):
    r = insert_after_open(text, 'body', snippet)
    if r is not None:
        return r
    m = re.search(r'</head\s*>', text, re.I)
    return text[:m.end()] + '\n' + snippet + '\n' + text[m.end():] if m else snippet + '\n' + text


def add_to_body_end(text, snippet):
    for tag in ('body', 'html'):
        r = insert_before_close(text, tag, snippet)
        if r is not None:
            return r
    return text + '\n' + snippet + '\n'


def set_html_lang(text, lang):
    m = re.search(r'<html\b([^>]*)>', text, re.I)
    if not m:
        return re.sub(r'(<!doctype[^>]*>)', r'\1\n<html lang="%s">' % lang, text, count=1, flags=re.I) \
            if re.search(r'<!doctype', text, re.I) else text
    if re.search(r'\blang\s*=', m.group(1), re.I):
        return text
    return text[:m.start()] + '<html lang="%s"%s>' % (lang, m.group(1)) + text[m.end():]


# --------------------------------------------------------------------- site helpers
def slugify_name(name):
    base, ext = os.path.splitext(name)
    s = unquote(base).strip().lower()
    s = re.sub(r'[^\w\s-]', '', s, flags=re.U)
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'-{2,}', '-', s).strip('-') or 'page'
    s = s.encode('ascii', 'ignore').decode() or 'page'
    return s + ext.lower()


def needs_slug(path):
    return any(re.search(r'[\sA-Z%&?#+,;\'"()]', part) for part in path.split('/'))


def url_path_for(rel, explicit_index=False):
    rel = rel.replace(os.sep, '/')
    if not explicit_index:
        if rel in ('index.html', 'index.htm'):
            return '/'
        for suffix in ('/index.html', '/index.htm'):
            if rel.endswith(suffix):
                return '/' + rel[:-len(suffix)] + '/'
    return '/' + quote(rel)


def collect_files(src):
    files = []
    if os.path.isfile(src):
        return [os.path.basename(src)], os.path.dirname(os.path.abspath(src))
    for root, dirs, names in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith('.'))
        for n in sorted(names):
            if n.startswith('.'):
                continue
            files.append(os.path.relpath(os.path.join(root, n), src).replace(os.sep, '/'))
    return files, os.path.abspath(src)


def local_ref(ref):
    """True when ref points at a file inside the site (not http, data:, mailto:, #...)."""
    if not ref or ref.startswith(('#', 'data:', 'mailto:', 'tel:', 'sms:', 'javascript:', '//')):
        return False
    return not urlparse(ref).scheme


def resolve_ref(page_rel, ref):
    """Site-relative path that a local href/src points to (without query/hash)."""
    p = urlparse(ref)
    path = unquote(p.path)
    if not path:
        return None
    if path.startswith('/'):
        target = path.lstrip('/')
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(page_rel), path)).replace(os.sep, '/')
        if path.endswith('/') and target != '.':
            target += '/'
    if target.startswith('..'):
        return None
    return '' if target in ('.', './') else target


def exists_variant(files_set, target):
    if target in ('', '/'):
        return 'index.html' in files_set or 'index.htm' in files_set
    if target in files_set:
        return True
    t = target.rstrip('/')
    return any(c in files_set for c in (t, t + '.html', t + '/index.html', t + '/index.htm'))


# ---------------------------------------------------------------------------- main
def build_tracker_cfg(args, route, output, embed_id):
    cfg = {'mode': 'bridge' if route == 'embed' else 'direct'}
    if route == 'static':
        cfg['output'] = output
    if embed_id:
        cfg['embedId'] = embed_id
    if args.parent_origin:
        cfg['parentOrigins'] = args.parent_origin
    if args.lead_selector:
        cfg['leadFormSelector'] = args.lead_selector
    if args.lead_value is not None:
        cfg['leadValue'] = args.lead_value
    if args.currency:
        cfg['currency'] = args.currency
    if args.enhanced_conversions:
        cfg['enhancedConversions'] = True
        cfg['defaultCountryCode'] = args.country_code
    if args.root:
        cfg['root'] = args.root
    if args.track_errors:
        cfg['trackErrors'] = True
    if args.debug:
        cfg['debug'] = True
    if route == 'static' and output == 'gtag' and args.conversions:
        cfg['conversions'] = args.conversions
    return cfg


def parse_conversions(items, currency):
    conv = {}
    for item in items or []:
        if '=' not in item:
            sys.exit('--conversion must look like EVENT=AW-123456789/AbCdEf[:VALUE[:CURRENCY]], got %r' % item)
        event, spec = item.split('=', 1)
        parts = spec.split(':')
        send_to = parts[0]
        if not SEND_TO.match(send_to):
            sys.exit('Conversion target %r is not AW-<digits>/<label>' % send_to)
        c = {'send_to': send_to}
        if len(parts) > 1 and parts[1] != '':
            c['value'] = float(parts[1])
            c['currency'] = parts[2] if len(parts) > 2 else (currency or 'USD')
        conv.setdefault(event.strip(), []).append(c)
    return {k: v[0] if len(v) == 1 else v for k, v in conv.items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', nargs='?', help='folder with the site, or a single .html file (not needed for --route listener)')
    ap.add_argument('--route', choices=['static', 'embed', 'listener', 'element'], required=True,
                    help='static = own Wix static site; embed = Embed HTML snippet + listener; listener = only the Wix-side '
                         'listener and browser prompt; element = Wix custom element rendering the page inside a Wix page (no iframe)')
    ap.add_argument('--out', help='output folder (default: <src>-wix-<route>)')
    g = ap.add_argument_group('Google tags')
    g.add_argument('--gtm', help='Google Tag Manager container ID, GTM-XXXXXXX (recommended)')
    g.add_argument('--gtag', help='comma-separated Google tag IDs (G-..., AW-..., GT-...) when not using GTM')
    g.add_argument('--conversion', action='append', dest='conversion_items', metavar='EVENT=AW-ID/LABEL[:VALUE[:CUR]]',
                   help='Google Ads conversion fired with gtag when EVENT happens (repeatable)')
    g.add_argument('--keep-existing-tags', action='store_true', help='static route: keep Google tags already in the HTML')
    c = ap.add_argument_group('Consent (static route)')
    c.add_argument('--consent-default', choices=['granted', 'denied'], default='granted')
    c.add_argument('--consent-regions', default='eu', help="'eu' (EEA+UK+CH+Quebec), 'none', or comma list of ISO codes")
    c.add_argument('--no-wix-consent-bridge', action='store_true')
    c.add_argument('--no-consent', action='store_true', help='do not add consent defaults (your own CMP sets them)')
    t = ap.add_argument_group('Tracker')
    t.add_argument('--embed-id', help='name shown in reports for this page/embed (embed default: file name)')
    t.add_argument('--parent-origin', action='append', help='embed: origin of the Wix site, e.g. https://www.example.com (repeatable)')
    t.add_argument('--listener-allow-origin', action='append',
                   help='embed: extra iframe origin the listener accepts, e.g. https://lp.example.com used with "Embed a site"')
    t.add_argument('--lead-selector', help='CSS selector of forms whose submit counts as generate_lead')
    t.add_argument('--lead-value', type=float)
    t.add_argument('--currency', help='ISO currency for lead values, e.g. CAD')
    t.add_argument('--enhanced-conversions', action='store_true', help='hash email/phone (SHA-256) for Google Ads enhanced conversions')
    t.add_argument('--country-code', default='1', help='default phone country code for enhanced conversions')
    t.add_argument('--root', help='CSS selector: only track inside this element')
    t.add_argument('--site-name', help='embed/listener: Wix site name for the browser-agent prompt')
    t.add_argument('--site-id', help='embed/listener: Wix site ID (metaSiteId) for direct dashboard links in the prompt')
    t.add_argument('--velo', action='store_true', help='embed/listener: also write velo-page-code.js (use it INSTEAD of the listener)')
    t.add_argument('--tag-name', help='element: custom element tag, lowercase with a hyphen (default html-<file name>)')
    t.add_argument('--element-url', help='element: final https URL of the generated .js, used in the browser-agent prompt')
    t.add_argument('--relay-filter', help="key that marks the page's own dataLayer events to relay (auto-detected when possible)")
    t.add_argument('--track-errors', action='store_true')
    t.add_argument('--debug', action='store_true')
    s = ap.add_argument_group('SEO (static route)')
    s.add_argument('--base-url', help='final public URL, e.g. https://lp.example.com (canonical, sitemap, OG)')
    s.add_argument('--lang', help='set <html lang> where missing, e.g. en, fr, es')
    s.add_argument('--index', help='which top-level HTML file becomes index.html')
    s.add_argument('--no-slugify', action='store_true', help='keep file names with spaces/uppercase as they are')
    s.add_argument('--explicit-index', action='store_true', help='use /folder/index.html instead of /folder/ in canonicals and sitemap')
    o = ap.add_argument_group('Output')
    o.add_argument('--inline-binary-max-kb', type=int, default=48, help='binaries up to this size go into the text bundle as base64')
    o.add_argument('--bundle-max-kb', type=int, default=9000)
    o.add_argument('--check-only', action='store_true', help='report problems without writing anything')
    args = ap.parse_args()

    if args.gtm and args.gtag:
        sys.exit('Use --gtm OR --gtag, not both: loading both double-counts (Wix says the same).')
    if args.gtm and not ID_GTM.match(args.gtm):
        sys.exit('GTM ID should look like GTM-XXXXXXX')
    gtag_ids = [i.strip() for i in (args.gtag or '').split(',') if i.strip()]
    for i in gtag_ids:
        if not ID_GTAG.match(i):
            sys.exit('Google tag ID %r should look like G-XXXX, AW-123456789 or GT-XXXX' % i)
    args.conversions = parse_conversions(args.conversion_items, args.currency)
    if args.base_url:
        args.base_url = args.base_url.rstrip('/')
        if not args.base_url.startswith('https://'):
            sys.exit('--base-url must start with https://')
    origin_rx = re.compile(r'^(https://[^/\s]+|http://(localhost|127\.0\.0\.1)(:\d+)?)$')
    for po in (args.parent_origin or []) + (args.listener_allow_origin or []):
        if not origin_rx.match(po):
            sys.exit('origins must look like https://www.example.com (no path, no trailing slash): %r' % po)
    regions = [] if args.consent_regions == 'none' else (
        EU_REGIONS if args.consent_regions == 'eu' else [r.strip().upper() for r in args.consent_regions.split(',') if r.strip()])

    if args.route == 'listener':
        out = os.path.abspath(args.out or 'wix-listener')
        report = {'route': 'listener', 'source': '(none)', 'output': out, 'pages': {}, 'warnings': [], 'renamed': {},
                  'skipped_files': [], 'removed_tags': {}, 'ids_found_in_html': [], 'next_steps': []}
        write_listener_files(args, gtag_ids, out, report, report['warnings'].append, [])
        finish(args, report, out)
        return
    if not args.src:
        sys.exit('src is required for --route %s' % args.route)
    src = os.path.abspath(args.src)
    if not os.path.exists(src):
        sys.exit('Not found: %s' % src)
    files, base_dir = collect_files(src)
    out = os.path.abspath(args.out or (src.rstrip('/').rsplit('.', 1)[0] if os.path.isfile(src) else src.rstrip('/')) + '-wix-' + args.route)
    report = {'route': args.route, 'source': src, 'output': out, 'pages': {}, 'warnings': [], 'renamed': {},
              'skipped_files': [], 'removed_tags': {}, 'ids_found_in_html': [], 'next_steps': []}
    warn = report['warnings'].append

    if args.route == 'static':
        prepare_static(args, files, base_dir, out, regions, gtag_ids, report, warn)
    elif args.route == 'element':
        import wix_element
        wix_element.prepare_element(sys.modules[__name__], args, files, base_dir, out, gtag_ids, report, warn)
    else:
        prepare_embed(args, files, base_dir, out, gtag_ids, report, warn)
    finish(args, report, out)


def finish(args, report, out):

    report['ids_found_in_html'] = sorted(set(report['ids_found_in_html']))
    if not args.check_only:
        deploy_dir = out + '_deploy' if args.route == 'static' else out
        os.makedirs(deploy_dir, exist_ok=True)
        with open(os.path.join(deploy_dir, 'report.json'), 'w', encoding='utf-8') as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        with open(os.path.join(deploy_dir, 'report.md'), 'w', encoding='utf-8') as fh:
            fh.write(render_report(report))
        print(render_report(report))
        print('\nReport: %s' % os.path.join(deploy_dir, 'report.md'))
    else:
        print(render_report(report))


# --------------------------------------------------------------------- static route
def prepare_static(args, files, base_dir, out, regions, gtag_ids, report, warn):
    kept, skipped = [], []
    repo_docs = re.compile(r'^(readme|license|licence|changelog|contributing|code_of_conduct|security)(\.[a-z]+)?$', re.I)
    for f in files:
        ext = f.rsplit('.', 1)[-1].lower() if '.' in f else ''
        is_doc = repo_docs.match(os.path.basename(f)) and ext in ('md', 'txt', '')
        (kept if ext in ALLOWED_EXT and not is_doc else skipped).append(f)
    report['skipped_files'] = skipped
    if skipped:
        warn('Skipped %d file(s) Wix hosting rejects or that should not be public: %s' % (len(skipped), ', '.join(skipped[:10])))

    # renames: slugs for SEO-friendly URLs, and an index.html at the top level
    rename = {}
    if not args.no_slugify:
        for f in kept:
            if needs_slug(f):
                parts = f.split('/')
                new = '/'.join([slugify_name(p) if needs_slug(p) else p for p in parts[:-1]] + [slugify_name(parts[-1])])
                if new != f:
                    rename[f] = new
    top_html = [f for f in kept if '/' not in f and f.lower().endswith(('.html', '.htm'))]
    has_index = any(rename.get(f, f) in ('index.html', 'index.htm') for f in top_html)
    if not has_index:
        chosen = None
        if args.index:
            chosen = next((f for f in top_html if f == args.index or rename.get(f) == args.index), None)
            if not chosen:
                sys.exit('--index %s is not a top-level HTML file' % args.index)
        elif len(top_html) == 1:
            chosen = top_html[0]
        elif top_html:
            sys.exit('Several top-level HTML files and no index.html. Pick the home page with --index (one of: %s)' % ', '.join(top_html))
        else:
            sys.exit('Wix needs an HTML file at the top level of the site (index.html).')
        rename[chosen] = 'index.html'
    for old, new in rename.items():
        report['renamed'][old] = new
    final = [rename.get(f, f) for f in kept]
    if len(set(final)) != len(final):
        sys.exit('Renaming would make two files share a name; rename them yourself first: %s' % rename)
    final_set = set(final)

    output = 'gtm' if args.gtm else 'gtag'
    any_new_ids = bool(args.gtm or gtag_ids)
    if args.gtm and args.conversions:
        warn('--conversion is ignored with --gtm: create the Google Ads conversion tags in GTM (references/google-setup.md)')
    pages, sitemap_urls, total = [], [], 0
    if not args.check_only:
        if os.path.exists(out):
            shutil.rmtree(out)
        os.makedirs(out)

    for f in kept:
        new = rename.get(f, f)
        src_path = os.path.join(base_dir, f)
        dst_path = os.path.join(out, new)
        if not new.lower().endswith(('.html', '.htm')):
            if not args.check_only:
                os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                if new.lower().endswith('.css') and rename:
                    with open(src_path, encoding='utf-8', errors='replace') as fh:
                        css = fh.read()
                    with open(dst_path, 'w', encoding='utf-8') as fh:
                        fh.write(rewrite_refs(css, f, new, rename))
                else:
                    shutil.copy2(src_path, dst_path)
            total += os.path.getsize(src_path)
            continue

        with open(src_path, encoding='utf-8', errors='replace') as fh:
            text = fh.read()
        page = {'file': new, 'changes': [], 'warnings': []}
        pw = page['warnings'].append
        text = rewrite_refs(text, f, new, rename) if rename else text
        an = analyze(text)

        # existing Google tags
        found_ids = sorted(set(TAG_IDS.findall(text)))
        report['ids_found_in_html'] += found_ids
        has_existing = bool(re.search(r'googletagmanager\.com/(gtm\.js|gtag/js)', text))
        page_output = output
        inject_tags = any_new_ids
        if has_existing and any_new_ids and not args.keep_existing_tags:
            text, removed, _, leftovers = strip_google_tags(text)
            if removed:
                page['changes'].append('removed old Google tags: ' + ', '.join(removed))
                report['removed_tags'][new] = removed
            for lo in leftovers:
                pw('gtag() calls mixed with other code were left in place, check for double counting: %s...' % lo)
        elif has_existing:
            inject_tags = False
            page_output = 'gtm' if 'gtm.js' in text else 'gtag'
            pw('kept the Google tag already in this page (%s); consent defaults are still added first' % ', '.join(found_ids))
        elif not any_new_ids:
            pw('no Google tag on this page and none given (--gtm/--gtag): events will queue in dataLayer but go nowhere')

        # SEO basics
        if not re.match(r'\s*(<!--.*?-->\s*)*<!doctype html', text, re.I | re.S):
            pw('no <!doctype html> at the top: the page renders in quirks mode (add it, then re-check the layout)')
        if not an.charset:
            text = add_to_head_start(text, '<meta charset="utf-8">')
            page['changes'].append('added <meta charset>')
        if 'viewport' not in an.meta:
            text = add_to_head_end(text, '<meta name="viewport" content="width=device-width, initial-scale=1">')
            page['changes'].append('added viewport meta')
        if args.lang and not an.html_lang:
            text = set_html_lang(text, args.lang)
            page['changes'].append('set <html lang="%s">' % args.lang)
        elif not an.html_lang:
            pw('<html> has no lang attribute (pass --lang en|fr|es...)')
        title = an.title
        if not title:
            if an.h1:
                title = an.h1[0][:65]
                text = add_to_head_end(text, '<title>%s</title>' % html.escape(title))
                page['changes'].append('added <title> from the H1 (review it)')
            else:
                pw('missing <title>: write one (50-60 characters, main keyword first)')
        elif len(title) > 65:
            pw('title is %d characters; Google shows about 60, so shorten it (keyword first)' % len(title))
        elif len(title) < 30:
            pw('title is only %d characters ("%s"); aim for 50-60 with the main keyword and the brand' % (len(title), title))
        desc = an.meta.get('description', '')
        if not desc:
            pw('missing meta description: write one (140-160 characters, with the offer and a call to action)')
        elif len(desc) < 70:
            pw('meta description is only %d characters; aim for 140-160 with the offer and a call to action' % len(desc))
        elif len(desc) > 170:
            pw('meta description is %d characters; Google cuts it around 155-160' % len(desc))
        form_and_privacy_checks(an, pw, args.enhanced_conversions, 'static', text)
        robots = an.meta.get('robots', '')
        is_noindex = 'noindex' in robots.lower()
        if is_noindex:
            pw('page has <meta name="robots" content="%s">: it will NOT appear in Google' % robots)
        if len(an.h1) == 0:
            pw('no <h1> heading')
        elif len(an.h1) > 1:
            pw('%d <h1> headings; keep one per page' % len(an.h1))
        if an.imgs_no_alt:
            pw('%d image(s) without alt text' % an.imgs_no_alt)
        url_path = url_path_for(new, args.explicit_index)
        if args.base_url:
            canon = args.base_url + url_path
            if not an.canonical:
                text = add_to_head_end(text, '<link rel="canonical" href="%s">' % canon)
                page['changes'].append('added canonical %s' % canon)
            elif not an.canonical.startswith(args.base_url):
                pw('canonical points to %s (expected %s)' % (an.canonical, canon))
            og = []
            if 'og:title' not in an.meta and title:
                og.append('<meta property="og:title" content="%s">' % html.escape(title, quote=True))
            if 'og:description' not in an.meta and desc:
                og.append('<meta property="og:description" content="%s">' % html.escape(desc, quote=True))
            if 'og:url' not in an.meta:
                og.append('<meta property="og:url" content="%s">' % canon)
            if 'og:type' not in an.meta:
                og.append('<meta property="og:type" content="website">')
            if 'twitter:card' not in an.meta:
                og.append('<meta name="twitter:card" content="%s">' % ('summary_large_image' if 'og:image' in an.meta else 'summary'))
            if og:
                text = add_to_head_end(text, '\n'.join(og))
                page['changes'].append('added %d Open Graph/Twitter tag(s)' % len(og))
            if 'og:image' not in an.meta:
                pw('no og:image (the picture shown when the page is shared)')
            if not is_noindex and not re.match(r'^(404|google[0-9a-f]+)\.html?$', os.path.basename(new)):
                sitemap_urls.append((canon, new))
        # links / mixed content / Wix iframe leftovers
        for href in an.links:
            if local_ref(href):
                tgt = resolve_ref(new, href)
                if tgt is not None and not exists_variant(final_set, tgt):
                    pw('broken internal link: %s' % href)
            elif href.startswith('http://'):
                pw('insecure http:// link: %s' % href[:80])
        for ref in an.imgs + an.scripts + an.styles:
            if ref.startswith('http://'):
                pw('insecure http:// resource (browsers block it on https pages): %s' % ref[:80])
            elif local_ref(ref):
                tgt = resolve_ref(new, ref)
                if tgt and tgt not in final_set:
                    pw('missing local file: %s' % ref)
        if re.search(r'filesusr\.com|wixsite\.com', text):
            pw('still references filesusr.com / wixsite.com URLs; point them to the final domain')

        # tracking
        if not args.no_consent:
            text = add_to_head_start(text, consent_snippet(args.consent_default, regions, not args.no_wix_consent_bridge))
            page['changes'].append('added Consent Mode v2 defaults' + ('' if args.no_wix_consent_bridge else ' + Wix banner bridge'))
        if inject_tags:
            if args.gtm:
                text = insert_after_consent(text, gtm_head(args.gtm))
                text = add_to_body_start(text, gtm_body(args.gtm))
                page['changes'].append('added GTM %s' % args.gtm)
            else:
                text = insert_after_consent(text, gtag_head(gtag_ids, args.enhanced_conversions))
                page['changes'].append('added Google tag %s' % ', '.join(gtag_ids))
        cfg = build_tracker_cfg(args, 'static', page_output, args.embed_id)
        text = add_to_body_end(text, '<script>\n%s\n</script>\n<script src="/%s" defer></script>' % (
            tracker_config_js(cfg), TRACKER_FILE))
        page['changes'].append('added html-tracker (direct mode, %s)' % page_output)
        text = move_charset_first(text)  # <meta charset> must stay the first thing in <head>

        if not args.check_only:
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            with open(dst_path, 'w', encoding='utf-8') as fh:
                fh.write(text)
        total += len(text.encode('utf-8'))
        report['pages'][new] = page
        pages.append(new)

    # tracker file, sitemap, robots
    tracker_src = read_asset(TRACKER_FILE)
    extra = {TRACKER_FILE: tracker_src}
    if args.base_url:
        if 'sitemap.xml' in final_set:
            report['warnings'].append('kept your own sitemap.xml; make sure it lists %s URLs' % args.base_url)
        else:
            today = datetime.date.today().isoformat()
            sitemap_urls.sort(key=lambda x: (x[0].rstrip('/') != args.base_url, x[0]))  # home page first
            items = ''.join('  <url><loc>%s</loc><lastmod>%s</lastmod></url>\n' % (html.escape(u), today) for u, _ in sitemap_urls)
            extra['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % items
        robots_line = 'Sitemap: %s/sitemap.xml' % args.base_url
        if 'robots.txt' in final_set:
            with open(os.path.join(base_dir, next(k for k in kept if rename.get(k, k) == 'robots.txt')), encoding='utf-8', errors='replace') as fh:
                robots = fh.read()
            if re.search(r'^\s*Disallow:\s*/\s*$', robots, re.M | re.I):
                report['warnings'].append('robots.txt contains "Disallow: /" which blocks the whole site')
            if 'sitemap:' not in robots.lower():
                extra['robots.txt'] = robots.rstrip('\n') + '\n' + robots_line + '\n'
        else:
            extra['robots.txt'] = 'User-agent: *\nAllow: /\n\n%s\n' % robots_line
    else:
        report['warnings'].append('no --base-url: canonical, Open Graph URLs, sitemap.xml and robots.txt were not generated. '
                                  'Re-run with the final https:// address once the domain is known.')
    if not args.check_only:
        for name, content in extra.items():
            with open(os.path.join(out, name), 'w', encoding='utf-8') as fh:
                fh.write(content)
    total += sum(len(c.encode('utf-8')) for c in extra.values())
    report['total_bytes'] = total
    report['file_count'] = len(final) + len([k for k in extra if k not in final_set])
    if total > WIX_LIMIT_BYTES:
        report['warnings'].append('site is %.1f MB; Wix static hosting allows 20 MB in total. Move videos/large images to Wix Media.' % (total / 1048576))
    if report['file_count'] > WIX_LIMIT_FILES:
        report['warnings'].append('more than 5,000 files; Wix static hosting allows 5,000')

    if not args.check_only:
        write_deploy_artifacts(args, out, report)
    report['next_steps'] = [
        'Upload: follow references/route-a-static-hosting.md (Wix MCP UploadHeadlessWebsiteFiles with the bundle, '
        'or deploy_curl.sh with a Wix CLI token, or drag site.zip at wix.com/headless/drop).',
        'Do NOT also connect GA4/GTM in that Wix site\'s Marketing Integrations: the pages already carry the tag.',
        'Connect the domain or subdomain (needs a Premium plan on that site), then run scripts/verify_live.py.',
        'Google side: references/google-setup.md (key events, Ads conversions, custom dimensions).']


def move_charset_first(text):
    m = re.search(r'<meta\s+charset=[^>]*>\s*', text, re.I)
    if not m:
        return text
    tag = m.group(0).strip()
    text = text[:m.start()] + text[m.end():]
    return insert_after_open(text, 'head', tag) or text


def insert_after_consent(text, snippet):
    marker = re.search(r'<!-- html-tracker: Google consent defaults.*?</script>', text, re.S)
    if marker:
        return text[:marker.end()] + '\n' + snippet + text[marker.end():]
    return add_to_head_start(text, snippet)


def rewrite_refs(text, old_rel, new_rel, rename):
    """Rewrite href/src/url() references that point to renamed files, from the page's new location."""
    def fix(ref):
        if not local_ref(ref):
            return ref
        p = urlparse(ref)
        target = resolve_ref(old_rel, ref)
        if not target:
            return ref
        new_target = rename.get(target, target)
        if new_target == target and os.path.dirname(old_rel) == os.path.dirname(new_rel):
            return ref
        if p.path.startswith('/'):
            new_path = '/' + new_target
        else:
            new_path = os.path.relpath(new_target, os.path.dirname(new_rel) or '.').replace(os.sep, '/')
        res = quote(new_path, safe='/')
        if p.query:
            res += '?' + p.query
        if p.fragment:
            res += '#' + p.fragment
        return res

    text = re.sub(r'(\b(?:href|src|action|poster)\s*=\s*)(["\'])(.*?)\2',
                  lambda m: m.group(1) + m.group(2) + fix(m.group(3)) + m.group(2), text, flags=re.I | re.S)
    text = re.sub(r'url\(\s*(["\']?)([^)"\']+)\1\s*\)', lambda m: 'url(%s%s%s)' % (m.group(1), fix(m.group(2)), m.group(1)), text)
    return text


def write_deploy_artifacts(args, out, report):
    deploy = out + '_deploy'
    if os.path.exists(deploy):
        shutil.rmtree(deploy)
    os.makedirs(deploy)
    all_files = []
    for root, _, names in os.walk(out):
        for n in sorted(names):
            all_files.append(os.path.relpath(os.path.join(root, n), out).replace(os.sep, '/'))
    all_files.sort(key=lambda p: (p != 'index.html', p))
    # 1) zip for the drop page or a curl drop
    with zipfile.ZipFile(os.path.join(deploy, 'site.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        for f in all_files:
            z.write(os.path.join(out, f), f)
    # 2) text bundles for UploadHeadlessWebsiteFiles (files parameter)
    limit = args.bundle_max_kb * 1024
    bundles, cur, cur_size, too_big = [], [], 0, []
    for f in all_files:
        path = os.path.join(out, f)
        ext = f.rsplit('.', 1)[-1].lower()
        size = os.path.getsize(path)
        if ext in TEXT_EXT:
            with open(path, encoding='utf-8', errors='replace') as fh:
                body = fh.read()
            if re.search(r'^=== FILE: .* ===$', body, re.M):
                too_big.append((f, 'contains a line that looks like a bundle delimiter'))
                continue
            section = '=== FILE: %s ===\n%s%s' % (f, body, '' if body.endswith('\n') else '\n')
        elif size <= args.inline_binary_max_kb * 1024:
            with open(path, 'rb') as fh:
                section = '=== FILE: %s base64 ===\n%s\n' % (f, base64.b64encode(fh.read()).decode())
        else:
            too_big.append((f, '%d KB binary' % (size // 1024)))
            continue
        if cur and cur_size + len(section) > limit:
            bundles.append(cur)
            cur, cur_size = [], 0
        cur.append(section)
        cur_size += len(section)
    if cur:
        bundles.append(cur)
    for i, b in enumerate(bundles, 1):
        with open(os.path.join(deploy, 'bundle-%02d.txt' % i), 'w', encoding='utf-8') as fh:
            fh.write(''.join(b))
    report['bundles'] = ['bundle-%02d.txt' % i for i in range(1, len(bundles) + 1)]
    report['bundle_bytes'] = [sum(len(s) for s in b) for b in bundles]
    report['not_in_bundles'] = [{'file': f, 'why': why} for f, why in too_big]
    if too_big:
        report['warnings'].append('%d file(s) are too large for the MCP text bundle (%s). Upload with deploy_curl.sh '
                                  '(Wix CLI token) or site.zip on the drop page, or move them to Wix Media.'
                                  % (len(too_big), ', '.join(f for f, _ in too_big[:5])))
    # 3) curl drop script (binary-safe, whole site)
    lines = ['#!/usr/bin/env bash', '# Upload the whole site to an existing Wix static site in one request.',
             '# Needs: META_SITE_ID (the site ID) and ACCESS_TOKEN (npx @wix/cli@latest login; then npx @wix/cli@latest token).',
             '# A raw drop REPLACES every file on the site with the files below.',
             'set -euo pipefail', ': "${META_SITE_ID:?set META_SITE_ID}" "${ACCESS_TOKEN:?set ACCESS_TOKEN}"',
             'cd "$(dirname "$0")/%s"' % os.path.relpath(out, deploy).replace(os.sep, '/'),
             'curl -sS -X POST "https://www.wixapis.com/headless-business-setup/v1/headless-business/${META_SITE_ID}/drop?campaign=mcp&agent=${AGENT:-claude-code}" \\',
             '  -H "Authorization: Bearer ${ACCESS_TOKEN}" \\']
    for f in all_files:
        safe = f.replace('"', '\\"')
        lines.append('  -F "files=@%s;filename=%s" \\' % (safe, safe))
    lines.append('  ; echo')
    with open(os.path.join(deploy, 'deploy_curl.sh'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    os.chmod(os.path.join(deploy, 'deploy_curl.sh'), 0o755)
    report['deploy_dir'] = deploy


# ---------------------------------------------------------------------- embed route
def prepare_embed(args, files, base_dir, out, gtag_ids, report, warn):
    html_files = [f for f in files if f.lower().endswith(('.html', '.htm'))]
    if not html_files:
        sys.exit('No .html file found in %s' % base_dir)
    if not args.check_only:
        os.makedirs(out, exist_ok=True)
    tracker = read_asset(TRACKER_FILE).replace('</script', '<\\/script')
    embeds = []
    for f in html_files:
        with open(os.path.join(base_dir, f), encoding='utf-8', errors='replace') as fh:
            text = fh.read()
        page = {'file': f, 'changes': [], 'warnings': []}
        pw = page['warnings'].append
        text, removed, ids, leftovers = strip_google_tags(text)
        report['ids_found_in_html'] += ids
        if removed:
            page['changes'].append('removed Google tags that cannot work inside the Wix iframe: ' + ', '.join(removed))
            report['removed_tags'][f] = removed
        for lo in leftovers:
            pw('gtag() calls mixed with other code were left in place; remove them to avoid a second, broken tag: %s...' % lo)
        text, stripped, mixed = strip_inline_tracking_handlers(text)
        if stripped:
            page['changes'].append('removed %d inline tracking handler(s) (%s): html-tracker reports these clicks/submits '
                                   'and the listener fires the conversion' % (len(stripped), '; '.join(c[:60] for c in stripped[:3])))
        if mixed or leftovers or (removed and re.search(r'\bgtag\s*\(', text)):
            # the Google tag is gone from the iframe: keep leftover gtag() calls from throwing errors
            text = add_to_head_start(text, '<script>window.dataLayer = window.dataLayer || []; '
                                           'window.gtag = window.gtag || function () { dataLayer.push(arguments); };</script>')
            text = move_charset_first(text)
            page['changes'].append('added a no-op gtag() stub so leftover gtag() calls do not throw')
            for call in mixed[:5]:
                pw('inline handler %s mixes tracking with other code; its gtag/fbq part now does nothing. Remove that part '
                   'in a copy of the source and re-run (the click is already tracked)' % call[:90])
        if re.search(r'connect\.facebook\.net|fbq\(|analytics\.tiktok\.com|ttq\.', text):
            pw('other pixels (Meta/TikTok) inside the iframe have the same third-party problem; connect them in Wix '
               'Marketing Integrations instead and let the listener feed them (GTM) or use the Velo option')
        form_and_privacy_checks(analyze(text), pw, args.enhanced_conversions, 'embed', text)
        text, inlined, problems = inline_local_assets(text, f, base_dir, args.inline_binary_max_kb)
        if inlined:
            page['changes'].append('inlined %d local file(s) so the snippet works on filesusr.com' % inlined)
        for p in problems:
            pw(p)
        if re.search(r'\bsrc=["\']http://', text):
            pw('http:// resources are blocked inside Wix (HTTPS only)')
        embed_id = args.embed_id or re.sub(r'[^a-z0-9_-]+', '-', os.path.splitext(os.path.basename(f))[0].lower()).strip('-') or 'html_embed'
        cfg = build_tracker_cfg(args, 'embed', None, embed_id)
        text = add_to_body_end(text, '<script>\n%s\n</script>\n<script>\n%s\n</script>' % (tracker_config_js(cfg), tracker))
        page['changes'].append('added html-tracker (bridge mode, embedId=%s)' % embed_id)
        if not args.parent_origin:
            pw('no --parent-origin given: the tracker will detect the Wix page origin; pin it for enhanced conversions')
        size = len(text.encode('utf-8'))
        if size > 600 * 1024:
            pw('snippet is %d KB; large snippets slow the page. Host big images on Wix Media instead of inlining.' % (size // 1024))
        name = os.path.splitext(os.path.basename(f))[0]
        dst = os.path.join(out, slugify_name(name + '.html').replace('.html', '.embed.html'))
        if not args.check_only:
            with open(dst, 'w', encoding='utf-8') as fh:
                fh.write(text)
        page['output'] = os.path.relpath(dst, out)
        report['pages'][f] = page
        embeds.append((page['output'], text))

    write_listener_files(args, gtag_ids, out, report, warn, embeds)


def write_listener_files(args, gtag_ids, out, report, warn, embeds):
    """Configured Custom Code listener, Velo alternative and a paste-ready browser-agent prompt."""
    listener = read_asset('wix-parent-listener.html')
    mode = 'gtm' if args.gtm else ('gtag' if gtag_ids else 'auto')
    lcfg = {'mode': mode, 'allowedOrigins': args.listener_allow_origin or [], 'allowAnyFilesusr': True,
            'conversions': args.conversions or {}, 'debug': bool(args.debug)}
    listener = re.sub(r'/\*__CONFIG_START__\*/.*?/\*__CONFIG_END__\*/',
                      lambda m: '/*__CONFIG_START__*/' + json.dumps(lcfg, indent=2) + '/*__CONFIG_END__*/', listener, flags=re.S)
    prompt = browser_agent_prompt(args, gtag_ids, mode, listener, embeds)
    if not args.check_only:
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, 'wix-parent-listener.html'), 'w', encoding='utf-8') as fh:
            fh.write(listener)
        with open(os.path.join(out, 'browser-agent-prompt.txt'), 'w', encoding='utf-8') as fh:
            fh.write(prompt)
        if args.velo:
            shutil.copy2(os.path.join(ASSETS, 'velo-page-code.js'), os.path.join(out, 'velo-page-code.js'))
    report['listener_mode'] = mode
    if args.conversions and not gtag_ids and not args.gtm:
        warn('--conversion only works when the Wix site uses the Google tag (pass --gtag with its ID so mode=gtag)')
    if args.gtm and args.conversions:
        warn('with GTM, build the Google Ads conversion tags in GTM (google-setup.md section 3); --conversion is ignored')
    if not args.gtm and not gtag_ids:
        warn('no --gtm/--gtag given: the listener uses mode "auto" (detects GTM or the Google tag at run time)')
    report['next_steps'] = [
        'Check the Wix site first: it needs a Premium plan and a connected domain (Marketing Integrations, Custom Code).',
        'Connect the final domain BEFORE adding Custom Code: Wix deletes Custom Code snippets when the site gets a different domain.',
        'Connect ONE of Google Tag or Google Tag Manager in the site\'s Marketing Integrations.',
        'Paste wix-parent-listener.html once in Settings > Custom Code (All pages, load on each new page, Body - end, '
        'Code Type: Analytic). It only relays events from embeds that contain html-tracker.',
        'Paste each *.embed.html into its Embed HTML element.' + (' velo-page-code.js is an ALTERNATIVE to the listener: use one, never both.' if args.velo else ''),
        'browser-agent-prompt.txt does the dashboard steps above with a browser agent such as Claude in Chrome.',
        'Put the page\'s key text in native Wix text elements too: search engines credit iframe text to filesusr.com.',
        'Publish the editor changes (ask first), then check with Tag Assistant / GA4 DebugView.']


def browser_agent_prompt(args, gtag_ids, mode, listener, embeds):
    site = args.site_name or 'the Wix site the user names'
    sid = args.site_id
    link = (lambda path: ' (direct link: https://www.wix.com/dashboard/%s/%s)' % (sid, path)) if sid else (lambda path: '')
    home = ' (direct link: https://manage.wix.com/dashboard/%s)' % sid if sid else ''
    if args.gtm:
        tag_step = ('Marketing Integrations%s -> card "Google Tag Manager" -> Connect -> Add Google Tag Manager -> enter %s -> Save. '
                    'Leave the "Google Tag" card alone.' % (link('marketing-integration'), args.gtm))
        tag_id = args.gtm
    elif gtag_ids:
        tag_step = ('Marketing Integrations%s -> card "Google Tag" -> Connect -> Add Google Tag ID -> paste %s (no spaces) -> Save. '
                    'Leave the "Google Tag Manager" card alone.' % (link('marketing-integration'), gtag_ids[0]))
        tag_id = gtag_ids[0]
    else:
        tag_step = 'Skip: the user did not give a tag ID. Only report which Google integration is connected, if any.'
        tag_id = 'GTM-/G-'
    lines = [
        'TASK FOR A BROWSER AGENT: set up Google tracking for HTML embeds on the Wix site "%s"%s.' % (site, home),
        '',
        'RULES',
        '- The user signs in. Never type passwords or 2FA codes; if a login page appears, stop and ask the user.',
        '- Ask the user before publishing, buying or upgrading anything, connecting or changing a domain, or deleting anything.',
        '- Paste code exactly as given: use paste (or set the code box value). Never type it key by key: code boxes auto-close',
        '  brackets and quotes. Copy only what is between a START line and its END line, not those lines.',
        '- The dashboard may be in another language: match buttons by meaning and position.',
        '- Change nothing else.',
        '',
        'STOP AND REPORT (do not continue) IF',
        '- the site shows an Upgrade banner / Free plan, or has no connected domain: Marketing Integrations and Custom Code need both;',
        '- a different Google Tag Manager container or Google tag is already connected (report its ID);',
        '- the step would leave BOTH "Google Tag" and "Google Tag Manager" connected;',
        '- Custom Code already contains a snippet named "html-tracker listener" (ask whether to replace it).',
        '',
        'STEP 1 - Check plan and domain: open the site dashboard%s. Note the plan and the connected domain (Settings -> Domains).' % home,
        'STEP 2 - Connect the tag: %s Read the saved ID back.' % tag_step,
        'STEP 3 - Add the listener: Settings%s -> section "Development & integrations" -> Custom Code%s -> + Add Custom Code ->'
        % (link('settings'), link('manage-website/embeds')),
        '  paste the LISTENER code below into the code box -> Name: html-tracker listener -> Add Code to Pages: All pages, load',
        '  code on each new page -> Place Code in: Body - end -> tab "Code Type": Analytic (may read "Analytics") -> Apply.',
        '  Read back: the code starts with "<!--" and the line "html-tracker parent listener", contains "mode": "%s",' % mode,
        '  and ends with "</script>". Fix it if anything is missing.',
    ]
    if embeds:
        lines += ['STEP 4 - Embeds: open the editor. For each embed below, select its Embed HTML element (or add one: Add Elements',
                  '  -> Embed Code -> Embed HTML), click Enter Code, replace ALL existing code with the EMBED code, Apply, and resize',
                  '  it so nothing is cut off. Do NOT publish: tell the user the editor is ready to publish.']
    lines += [
        'STEP %d - Check: on the live site, open DevTools Console and run' % (5 if embeds else 4),
        '  Object.keys(window.google_tag_manager||{})   -> should list %s' % tag_id,
        '  window.__htmlTrackerListener                 -> true (if undefined: consent not given yet, or the code is not live)',
        '  Optional: tagassistant.google.com -> Add domain -> the page URL -> Connect.',
        '',
        'REPORT FORMAT',
        '- Plan and domain: ...',
        '- Tag connected: ... (or why not)',
        '- Custom Code: name / placement / code type / read-back OK?',
    ]
    if embeds:
        lines.append('- Embeds updated: ... (editor not published)')
    lines += ['- Checks: ...', '- Needs the user: ...', '',
              '=== LISTENER CODE START ===', listener.rstrip('\n'), '=== LISTENER CODE END ===']
    for name, code in embeds or []:
        lines += ['', '=== EMBED CODE START: %s ===' % name, code.rstrip('\n'), '=== EMBED CODE END: %s ===' % name]
    return '\n'.join(lines) + '\n'


def inline_local_assets(text, page_rel, base_dir, max_kb):
    """Inline local CSS/JS and small images so the snippet does not depend on relative files."""
    count, problems = 0, []

    def read_local(ref):
        tgt = resolve_ref(page_rel, ref)
        if tgt is None:
            return None, None
        path = os.path.join(base_dir, tgt)
        return (path, tgt) if os.path.isfile(path) else (None, tgt)

    def css_link(m):
        nonlocal count
        tag = m.group(0)
        href = re.search(r'href\s*=\s*["\']([^"\']+)', tag, re.I)
        if not href or not local_ref(href.group(1)):
            return tag
        path, tgt = read_local(href.group(1))
        if not path:
            problems.append('stylesheet not found: %s' % href.group(1))
            return tag
        with open(path, encoding='utf-8', errors='replace') as fh:
            css = fh.read()
        if re.search(r'url\(\s*["\']?(?!data:|https?:|//)[^)"\']+', css):
            problems.append('%s uses relative url(...) assets; host them on Wix Media and use absolute URLs' % tgt)
        count += 1
        return '<style>/* %s */\n%s\n</style>' % (tgt, css.replace('</style', '<\\/style'))
    text = re.sub(r'<link\b[^>]*rel\s*=\s*["\']?stylesheet["\']?[^>]*>', css_link, text, flags=re.I)

    def js_src(m):
        nonlocal count
        attrs = m.group(1)
        src = re.search(r'src\s*=\s*["\']([^"\']+)', attrs, re.I)
        if not src or not local_ref(src.group(1)):
            return m.group(0)
        path, tgt = read_local(src.group(1))
        if not path:
            problems.append('script not found: %s' % src.group(1))
            return m.group(0)
        with open(path, encoding='utf-8', errors='replace') as fh:
            js = fh.read()
        count += 1
        attrs = re.sub(r'\s*src\s*=\s*["\'][^"\']*["\']', '', attrs, flags=re.I)
        return '<script%s>/* %s */\n%s\n</script>' % (attrs, tgt, js.replace('</script', '<\\/script'))
    text = re.sub(r'<script\b([^>]*)>\s*</script>', js_src, text, flags=re.I)

    def img_src(m):
        nonlocal count
        q, ref = m.group(2), m.group(3)
        if not local_ref(ref):
            return m.group(0)
        path, tgt = read_local(ref)
        if not path:
            problems.append('image not found: %s' % ref)
            return m.group(0)
        size = os.path.getsize(path)
        if size > max_kb * 1024:
            problems.append('image %s is %d KB: upload it to Wix Media and use its https://static.wixstatic.com URL' % (tgt, size // 1024))
            return m.group(0)
        ext = tgt.rsplit('.', 1)[-1].lower()
        mime = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'svg': 'image/svg+xml',
                'webp': 'image/webp', 'ico': 'image/x-icon', 'avif': 'image/avif'}.get(ext)
        if not mime:
            problems.append('cannot inline %s; use an absolute URL' % tgt)
            return m.group(0)
        with open(path, 'rb') as fh:
            data = base64.b64encode(fh.read()).decode()
        count += 1
        return '%s%sdata:%s;base64,%s%s' % (m.group(1), q, mime, data, q)
    text = re.sub(r'(<img\b[^>]*?\bsrc\s*=\s*)(["\'])(.*?)\2', img_src, text, flags=re.I | re.S)
    for m in re.finditer(r'<a\b[^>]*href\s*=\s*["\']([^"\'#][^"\']*)["\']', text, re.I):
        if local_ref(m.group(1)):
            problems.append('relative link %s will break inside the iframe; use the full https:// URL' % m.group(1))
    return text, count, problems


# -------------------------------------------------------------------------- report
def render_report(r):
    lines = ['# Wix HTML preparation report', '', '- Route: **%s**' % r['route'], '- Source: `%s`' % r['source'],
             '- Output: `%s`' % r['output']]
    if r.get('deploy_dir'):
        lines.append('- Deploy files: `%s` (site.zip, %s, deploy_curl.sh)' % (r['deploy_dir'], ', '.join(r.get('bundles', [])) or 'no bundle'))
    if r.get('total_bytes') is not None:
        lines.append('- Size: %.1f KB in %d files' % (r['total_bytes'] / 1024, r.get('file_count', 0)))
    if r['ids_found_in_html']:
        lines.append('- Google IDs found in the original HTML: %s' % ', '.join(r['ids_found_in_html']))
    if r['renamed']:
        lines += ['', '## Renamed (clean URLs)'] + ['- `%s` -> `%s`' % kv for kv in r['renamed'].items()]
    if r['warnings']:
        lines += ['', '## Warnings'] + ['- %s' % w for w in r['warnings']]
    for name, p in r['pages'].items():
        lines += ['', '## %s' % (p.get('output') or name)]
        lines += ['- changed: %s' % c for c in p['changes']]
        lines += ['- **check:** %s' % w for w in p['warnings']]
    if r.get('next_steps'):
        lines += ['', '## Next steps'] + ['%d. %s' % (i, s) for i, s in enumerate(r['next_steps'], 1)]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    main()
