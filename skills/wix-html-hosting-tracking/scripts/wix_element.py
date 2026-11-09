"""Element route of prepare_site.py: turn one HTML page into a Wix custom element.

The element renders the page inside the Wix page itself (no iframe), with the page's CSS scoped to the element
so it cannot restyle the rest of the Wix site, the page's scripts run in order in page scope, fonts and
structured data injected in <head>, and html-tracker scoped to the element. Called by prepare_site.py with the
prepare_site module as `ps` (for its shared helpers).
"""
import json
import os
import re
import sys
from urllib.parse import urlparse


# ---------------------------------------------------------------------------- CSS scoping
def _strip_css_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def _css_blocks(css):
    """Top-level CSS items as (prelude, body_or_None). Strings and nested braces are respected."""
    out, i, n = [], 0, len(css)
    while i < n:
        while i < n and css[i] in ' \t\r\n':
            i += 1
        if i >= n:
            break
        j, quote_ch = i, None
        while j < n:
            c = css[j]
            if quote_ch:
                if c == '\\':
                    j += 1
                elif c == quote_ch:
                    quote_ch = None
            elif c in '"\'':
                quote_ch = c
            elif c in '{;':
                break
            j += 1
        if j >= n:
            break
        if css[j] == ';':  # statement at-rule (@import, @charset, @layer a, b;)
            out.append((css[i:j + 1].strip(), None))
            i = j + 1
            continue
        prelude, depth, k, quote_ch = css[i:j].strip(), 1, j + 1, None
        while k < n and depth:
            c = css[k]
            if quote_ch:
                if c == '\\':
                    k += 1
                elif c == quote_ch:
                    quote_ch = None
            elif c in '"\'':
                quote_ch = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            k += 1
        out.append((prelude, css[j + 1:k - 1]))
        i = k
    return out


def _split_selectors(prelude):
    parts, depth, cur = [], 0, []
    for c in prelude:
        if c in '([':
            depth += 1
        elif c in ')]':
            depth -= 1
        if c == ',' and depth == 0:
            parts.append(''.join(cur))
            cur = []
        else:
            cur.append(c)
    parts.append(''.join(cur))
    return [p.strip() for p in parts if p.strip()]


QUALIFIERS = re.compile(r'^((?:[.#][\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(?:\([^)]*\))?)*)(.*)$', re.S)


def scope_selector(sel, tag, body='[data-html-body]'):
    m = re.match(r'^(:root|html|body)(?![\w-])(.*)$', sel, re.S)
    if not m:
        return '%s %s' % (tag, sel)
    quals, tail = QUALIFIERS.match(m.group(2)).groups()
    if not quals:  # bare :root / html / body (maybe with descendants): the element plays that role
        return tag + tail if tail.strip() else tag
    return '%s %s%s%s' % (tag, body, quals, tail)  # html.fx .x -> TAG [data-html-body].fx .x (state is mirrored)


def scope_css(css, tag, body='[data-html-body]'):
    """Prefix every selector with the element's tag. Returns (scoped_css, imported_stylesheet_urls)."""
    imports, out = [], []
    for prelude, block in _css_blocks(_strip_css_comments(css)):
        if block is None:
            if prelude.lower().startswith('@import'):
                url = re.search(r"url\(\s*['\"]?([^'\")]+)|['\"]([^'\"]+)['\"]", prelude)
                if url:
                    imports.append(url.group(1) or url.group(2))
            else:
                out.append(prelude)
            continue
        low = prelude.lower()
        if low.startswith(('@media', '@supports', '@container', '@layer', '@document')):
            inner, inner_imports = scope_css(block, tag, body)
            imports += inner_imports
            out.append('%s{%s}' % (prelude, inner))
        elif low.startswith('@'):  # @keyframes, @font-face, @property, @page: global as written
            out.append('%s{%s}' % (prelude, block))
        else:
            out.append('%s{%s}' % (', '.join(scope_selector(x, tag, body) for x in _split_selectors(prelude)), block))
    return '\n'.join(out), imports


def css_names(css):
    """Class names and data-* attributes used in selectors (html/body state to mirror onto the wrapper)."""
    classes, data = set(), set()
    for prelude, block in _css_blocks(_strip_css_comments(css)):
        if block is None:
            continue
        if prelude.startswith('@'):
            if prelude.lower().startswith(('@media', '@supports', '@container', '@layer')):
                c2, d2 = css_names(block)
                classes |= c2
                data |= d2
            continue
        classes |= set(re.findall(r'\.(-?[A-Za-z_][\w-]*)', prelude))
        data |= set(re.findall(r'\[(data-[\w-]+)', prelude))
    return classes, data


# ----------------------------------------------------------------------------- SEO helpers
def seo_markup(body_html):
    """Text-only version of the visible content, for the custom element's seoMarkup."""
    t = re.sub(r'<(script|style|noscript|svg|template|form|button)\b.*?</\1>', ' ', body_html, flags=re.S | re.I)
    t = re.sub(r'<(?!/?(?:h[1-6]|p|ul|ol|li|a|strong|em|b|i|br|dl|dt|dd|blockquote)\b)[^>]+>', ' ', t, flags=re.I)
    t = re.sub(r'<a\b[^>]*?(href="[^"]*")[^>]*>', r'<a \1>', t, flags=re.I)
    t = re.sub(r'<(h[1-6]|p|ul|ol|li|strong|em|b|i|dl|dt|dd|blockquote)\b[^>]*>', r'<\1>', t, flags=re.I)
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\s*\n\s*', '\n', t)
    t = re.sub(r'<(p|li|h[1-6])>\s*</\1>', '', t)
    return t.strip()


def seo_settings_md(an, json_ld):
    meta, canon = an.meta, (an.canonical or '').rstrip('/')
    slug = urlparse(canon).path.strip('/').split('/')[-1] if canon else ''
    cell = lambda v: str(v).replace('|', '\\|')
    lines = ['# Wix page settings for this custom element', '',
             'Wix renders the page <head>, so set these on the Wix page (Pages > the page > SEO Basics / Advanced SEO / '
             'Social Share), or with the Wix MCP SEO tags recipe once the page exists.', '',
             '| Setting | Value |', '|---|---|',
             '| Page URL slug | `%s` |' % (slug or '(choose one)'),
             '| SEO title | %s |' % cell(an.title or '(write one)'),
             '| Meta description | %s |' % cell(meta.get('description') or '(write one)'),
             '| Robots | %s |' % cell(meta.get('robots') or 'index, follow'),
             '| Canonical | %s |' % ('leave the Wix default, which is %s' % canon if canon else 'Wix default (the page URL)'),
             '| Social title (og:title) | %s |' % cell(meta.get('og:title') or an.title or ''),
             '| Social description | %s |' % cell(meta.get('og:description') or meta.get('description') or ''),
             '| Social image (og:image) | %s |' % cell(meta.get('og:image') or '(choose one)'), '']
    if json_ld:
        lines += ['## Structured data', '',
                  'Advanced SEO > Structured Data Markup: add the JSON-LD from `structured-data.json`. The element also injects '
                  'it in the browser when the page has none, but markup in the page settings reaches every crawler.', '']
    lines += ['## Language', '', 'Page language: `%s`' % (an.html_lang or 'site default'), '']
    return '\n'.join(lines)


def og_image_line(url):
    m = re.search(r'static\.wixstatic\.com/media/([^/?#]+)', url or '')
    if m:  # already in the site's media: pick it, no upload
        return 'choose the file %s in the Media Manager (Site Files; it is already on the site)' % m.group(1)
    return ('download this image and upload it: %s' % url) if url else '(skip)'


def agent_prompt(args, tag, an, own_frame=False):
    """Self-contained: a browser agent (e.g. Claude in Chrome) has none of the output files, so values are inline."""
    site = args.site_name or 'the Wix site the user names'
    url = args.element_url or '<https URL of %s.js>' % tag
    canon = (an.canonical or '').rstrip('/')
    slug = urlparse(canon).path.strip('/').split('/')[-1] if canon else ''
    name = slug.replace('-', ' ').capitalize() if slug else (an.title or tag)[:40]
    meta = an.meta
    site_id = getattr(args, 'site_id', None)
    open_line = ('STEP 1 - Open https://manage.wix.com/dashboard/%s and click Edit Site.\n  ' % site_id if site_id
                 else 'STEP 1 - Open the site in the Wix Editor. ')
    layout = ('  Layouts tab: "No Header & Footer" (the page has its own header and footer; avoids a double header).'
              if own_frame else '  Layouts tab: Standard (keep the site header and footer).')
    lines = [
        'TASK FOR A BROWSER AGENT: add a custom-element page to the Wix site "%s".' % site, '',
        'RULES',
        '- The user signs in; never type passwords or 2FA codes. Ask before publishing, buying or deleting anything.',
        '- Paste values exactly (paste, never type key by key). Change nothing else. The editor may be in another language.',
        '- Stop and report if the site is on a Free plan, has no connected domain, or shows Wix ads: custom elements need',
        '  a Premium plan, a connected domain and no ads.', '',
        open_line + 'Pages & Menu -> + Add Page -> blank page named',
        '  "%s". Then on that page: ... (More Actions) -> Settings:' % name,
        layout,
        '  SEO Basics:',
        '    URL slug: %s' % (slug or '(ask the user)'),
        '    Title tag: %s' % (an.title or '(ask the user)'),
        '    Meta description: %s' % (meta.get('description') or '(ask the user)'),
        '    Let search engines index this page: on. Keep the default canonical.',
    ]
    if meta.get('og:image') or meta.get('og:title'):
        lines += ['  Social Share:',
                  '    Title: %s' % (meta.get('og:title') or an.title or ''),
                  '    Description: %s' % (meta.get('og:description') or meta.get('description') or ''),
                  '    Image: ' + og_image_line(meta.get('og:image', ''))]
    lines += [
        'STEP 2 - On that page: Add Elements -> Embed Code -> Custom Element -> Choose Source -> Server URL:',
        '  %s' % url,
        '  Tag Name: %s' % tag,
        'STEP 3 - Drag the element to the top-left of the page and widen it to the full page width shown in the editor',
        '  (custom elements have no Stretch button: on the live site the element spans the browser width by itself).',
        '  Remove other elements on the page. Height does not matter: on the live site the element and its box grow',
        '  with the content. Mobile editor: the element is at the top and as wide as the mobile page.',
        'STEP 4 - Preview (the element shows inside a frame in preview and may look small or cut: that is normal; the',
        '  live page renders it in the page). Do NOT publish: tell the user it is ready to publish.', '',
        'REPORT FORMAT', '- Page created (name, slug, layout): ...', '- Custom element source / tag: ...',
        '- Preview OK?: ...', '- Needs the user: ...', '']
    return '\n'.join(lines)


# -------------------------------------------------------------------------------- builder
def prepare_element(ps, args, files, base_dir, out, gtag_ids, report, warn):
    html_files = [f for f in files if f.lower().endswith(('.html', '.htm'))]
    if len(html_files) != 1:
        sys.exit('--route element converts one HTML page; got %d HTML files' % len(html_files))
    f = html_files[0]
    with open(os.path.join(base_dir, f), encoding='utf-8', errors='replace') as fh:
        text = fh.read()
    page = {'file': f, 'changes': [], 'warnings': []}
    pw = page['warnings'].append
    stem = re.sub(r'[^a-z0-9-]+', '-', os.path.splitext(os.path.basename(f))[0].lower()).strip('-') or 'page'
    tag = (args.tag_name or ('html-' + stem)).lower()
    if not re.match(r'^[a-z][a-z0-9._]*-[a-z0-9._-]*$', tag):
        sys.exit('--tag-name must be lowercase, start with a letter and contain a hyphen, e.g. ukuu-landing')

    text, removed, ids, leftovers = ps.strip_google_tags(text)
    report['ids_found_in_html'] += ids
    if removed:
        page['changes'].append('removed Google tag snippets (the Wix site loads its own tags): ' + ', '.join(removed))
    for lo in leftovers:
        pw(lo)
    own_lead, relay_key = ps.page_own_events(text)
    an = ps.analyze(text)
    ps.form_and_privacy_checks(an, pw, args.enhanced_conversions, 'element', text)
    cpath = urlparse(an.canonical or '').path
    if cpath not in ('', '/') and cpath.endswith('/'):
        pw('the canonical URL ends with "/": Wix serves pages without it (/slug/ redirects 301 to /slug); use %s in the '
           'canonical, og:url, hreflang and JSON-LD' % an.canonical.rstrip('/'))
    if re.search(r'\{\{[A-Z_]+\}\}', text):
        pw('unfilled placeholders: %s' % ', '.join(sorted(set(re.findall(r'\{\{[A-Z_]+\}\}', text)))))

    hm = re.search(r'<head\b[^>]*>(.*?)</head>', text, re.S | re.I)
    head = hm.group(1) if hm else ''
    bm = re.search(r'<body\b([^>]*)>(.*)</body>', text, re.S | re.I)
    body_attrs_raw, body = (bm.group(1), bm.group(2)) if bm else ('', text)
    body_attrs = {k.lower(): v for k, v in re.findall(r'([\w:-]+)\s*=\s*"([^"]*)"', body_attrs_raw)}
    css, scripts, json_ld, links = [], [], [], []
    for m in re.finditer(r'<style\b[^>]*>(.*?)</style>', head + body, re.S | re.I):
        css.append(m.group(1))
    for m in re.finditer(r'<link\b([^>]*)>', head, re.I):
        a = dict((k.lower(), v) for k, v in re.findall(r'([\w-]+)\s*=\s*["\']([^"\']*)["\']', m.group(1)))
        rel = a.get('rel', '').lower()
        if a.get('href', '').startswith('https://') and rel in ('stylesheet', 'preconnect', 'preload'):
            links.append({'rel': rel, 'href': a['href'], 'crossorigin': 'crossorigin' in m.group(1).lower(), 'as': a.get('as', '')})
    for m in re.finditer(r'<script\b([^>]*)>(.*?)</script>', head + body, re.S | re.I):
        attrs, code = m.group(1), m.group(2)
        if 'ld+json' in attrs.lower():
            json_ld.append(code.strip())
            continue
        kind = re.search(r'type\s*=\s*["\']([^"\']+)', attrs, re.I)
        if kind and kind.group(1).lower() not in ('text/javascript', 'application/javascript', 'module'):
            continue
        src = re.search(r'src\s*=\s*["\']([^"\']+)', attrs, re.I)
        if src:
            if not src.group(1).startswith('https://'):
                pw('script %s is not an absolute https:// URL; host it and use the full URL' % src.group(1))
                continue
            scripts.append({'src': src.group(1)})
        elif code.strip():
            scripts.append({'code': code})
    body = re.sub(r'<script\b.*?</script>|<noscript\b.*?</noscript>|<style\b.*?</style>', '', body, flags=re.S | re.I)
    own_frame = bool(re.search(r'<header\b', body, re.I) and re.search(r'<footer\b', body, re.I))
    css_text = '\n'.join(css)
    scoped, imports = scope_css(css_text, tag)
    for url in imports:
        links.append({'rel': 'stylesheet', 'href': url, 'crossorigin': False, 'as': ''})
    classes, data_attrs = css_names(css_text)
    base_classes = body_attrs.get('class', '').split()
    mirror = sorted(c for c in classes if c not in base_classes)

    rel = sorted(set(u for u in re.findall(r'''(?:src|href|poster|srcset)\s*=\s*["']([^"'#][^"']*)["']''', body, re.I)
                     + re.findall(r'''url\(\s*["']?([^"')]+)["']?\s*\)''', css_text)
                     if not re.match(r'(https:|mailto:|tel:|sms:|data:|javascript:|//|\{\{)', u.strip(), re.I)))
    if rel:
        pw('relative or http:// URLs resolve against the Wix page and will break: %s%s. Upload the files (Wix Media, '
           'static hosting or the repo) and use absolute https:// URLs' % (', '.join(rel[:8]), ' ...' if len(rel) > 8 else ''))

    output = 'gtm' if args.gtm else 'gtag'
    cfg = ps.build_tracker_cfg(args, 'static', output, args.embed_id or stem)
    cfg['root'] = tag + ' > [data-html-body]'  # the rendered page; it moves with the DOM across Wix page changes
    if own_lead:
        cfg['autoLead'] = False
        page['changes'].append('the page sends its own generate_lead: html-tracker will not send a second one')
    if output == 'gtag' and re.search(r'dataLayer\.push\(', text):
        cfg['relayDataLayer'] = True
        if args.relay_filter or relay_key:
            cfg['relayFilter'] = args.relay_filter or relay_key
            page['changes'].append('the page\'s own dataLayer events (marked "%s") are sent through the Google tag' % cfg['relayFilter'])
        else:
            pw('the page pushes its own dataLayer events but no marker key was found: all are relayed except Wix\'s '
               'Pageview/page_view; check GA4 DebugView for duplicates, or pass --relay-filter KEY')
    tracker = ps.read_asset(ps.TRACKER_FILE)

    j = lambda v: json.dumps(v, ensure_ascii=False)
    element_js = (ELEMENT_TEMPLATE
                  .replace('__TAG_COMMENT__', tag).replace('__SOURCE__', os.path.basename(f))
                  .replace('__TAG__', j(tag)).replace('__BODY_ATTRS__', j(body_attrs))
                  .replace('__BASE_CLASSES__', j(base_classes)).replace('__LINKS__', j(links))
                  .replace('__MIRROR_CLASSES__', j(mirror)).replace('__MIRROR_DATA__', j(sorted(data_attrs)))
                  .replace('__TRACKER_CONFIG__', j(cfg))
                  .replace('__FULL_WIDTH__', j(getattr(args, 'element_width', 'full') == 'full')))
    # large strings last, so no placeholder text inside them can be replaced by accident
    element_js = element_js.replace('__JSON_LD__', j(json_ld)).replace('__SCRIPTS__', j(scripts))
    element_js = element_js.replace('__CSS__', j(scoped)).replace('__HTML__', j(body.strip()))
    element_js = element_js.replace('__TRACKER_SOURCE__', tracker)
    if not args.check_only:
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, tag + '.js'), 'w', encoding='utf-8') as fh:
            fh.write(element_js)
        with open(os.path.join(out, 'structured-data.json'), 'w', encoding='utf-8') as fh:
            fh.write('\n\n'.join(json_ld) + ('\n' if json_ld else ''))
        markup = seo_markup(body)
        with open(os.path.join(out, 'seo-markup.html'), 'w', encoding='utf-8') as fh:
            fh.write(markup + '\n')
        with open(os.path.join(out, 'velo-seo-markup.js'), 'w', encoding='utf-8') as fh:
            fh.write('// Velo page code (optional): server-rendered text for crawlers that do not run JavaScript.\n'
                     '// Give the custom element the ID customElement1 in the editor (Properties), or change it below.\n'
                     '// Keep this text identical to what the element shows (different content is cloaking).\n'
                     "$w.onReady(function () {\n  $w('#customElement1').seoMarkup = %s;\n});\n" % j(markup))
        with open(os.path.join(out, 'seo-settings.md'), 'w', encoding='utf-8') as fh:
            fh.write(seo_settings_md(an, json_ld))
        with open(os.path.join(out, 'browser-agent-prompt.txt'), 'w', encoding='utf-8') as fh:
            fh.write(agent_prompt(args, tag, an, own_frame))
    size = len(element_js.encode('utf-8'))
    page['changes'].append('built custom element <%s> (%d KB): scoped CSS, %d script(s), %d structured-data block(s), '
                           'html-tracker (direct, %s, scoped to the element)' % (tag, size // 1024, len(scripts), len(json_ld), output))
    page['output'] = tag + '.js'
    if re.search(r'position\s*:\s*fixed', css_text):
        pw('the page uses position:fixed (sticky bars, floating buttons): check them on the live Wix page, where '
           'Wix containers can change how fixed elements are placed')
    report['pages'][f] = page
    report['element'] = {'tag': tag, 'file': tag + '.js', 'kb': size // 1024}
    report['next_steps'] = [
        'Host %s.js on HTTPS: e.g. commit it to a public GitHub repo and use https://cdn.jsdelivr.net/gh/<user>/<repo>@<commit>/<path>, '
        'or Wix static hosting.' % tag,
        'Wix editor (or browser-agent-prompt.txt): new page%s, Add Elements > Embed Code > Custom Element > Choose Source > '
        'Server URL = that URL, Tag Name = %s; place it at the top, as wide as the page (it spans the browser width by '
        'itself on the live site); set the page SEO from seo-settings.md; publish.'
        % (' with Settings > Layouts > No Header & Footer (the HTML has its own)' if own_frame else '', tag),
        'Before installing: node scripts/simulate_element.js --element %s.js --site https://<site> --gtag <ids> --submit '
        '(no FAIL). After publishing: browser_check.js on the live page, Tag Assistant, GA4 DebugView.' % tag,
        'Optional: velo-seo-markup.js in the page code gives crawlers without JavaScript the same text.',
        'Tracking runs inside the Wix page: keep ONE Google tag or GTM in Marketing Integrations; no Custom Code listener needed.']


ELEMENT_TEMPLATE = r"""/*! <__TAG_COMMENT__> - Wix custom element generated by wix-html-hosting-tracking (prepare_site.py --route element)
 * from __SOURCE__. Wix editor: Add Elements > Embed Code > Custom Element > Choose Source > Server URL = this file's
 * https URL; Tag Name = __TAG_COMMENT__. Renders the page inside the Wix page (no iframe); CSS scoped to the element. */
(function () {
  'use strict';
  var TAG = __TAG__;
  if (!window.customElements || window.customElements.get(TAG)) return;
  var BODY_ATTRS = __BODY_ATTRS__;
  var BASE_CLASSES = __BASE_CLASSES__;
  var HEAD_LINKS = __LINKS__;
  var MIRROR_CLASSES = __MIRROR_CLASSES__;
  var MIRROR_DATA = __MIRROR_DATA__;
  var TRACKER_CONFIG = __TRACKER_CONFIG__;
  var FULL_WIDTH = __FULL_WIDTH__;
  var JSON_LD = __JSON_LD__;
  var SCRIPTS = __SCRIPTS__;
  var CSS = __CSS__;
  var HTML = __HTML__;

  function startTracker() {
__TRACKER_SOURCE__
  }

  function addHead() {
    HEAD_LINKS.forEach(function (l) {
      var exists = false;
      document.head.querySelectorAll('link').forEach(function (e) { if (e.href === l.href) exists = true; });
      if (exists) return;
      var e = document.createElement('link');
      e.rel = l.rel; e.href = l.href;
      if (l.as) e.as = l.as;
      if (l.crossorigin) e.crossOrigin = 'anonymous';
      document.head.appendChild(e);
    });
    var hasFaq = false;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) { if (/FAQPage/.test(s.textContent)) hasFaq = true; });
    JSON_LD.forEach(function (code, i) {
      var id = TAG + '-ld-' + i;
      if (document.getElementById(id) || (hasFaq && /FAQPage/.test(code))) return;
      var s = document.createElement('script');
      s.type = 'application/ld+json'; s.id = id; s.textContent = code;
      document.head.appendChild(s);
    });
    if (!document.getElementById(TAG + '-css')) {
      var st = document.createElement('style');
      st.id = TAG + '-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
  }

  function mirrorState(wrap) { // html/body classes and data-* that the page CSS relies on, copied onto the wrapper
    var de = document.documentElement, b = document.body;
    MIRROR_CLASSES.forEach(function (c) { wrap.classList.toggle(c, de.classList.contains(c) || b.classList.contains(c)); });
    MIRROR_DATA.forEach(function (a) {
      var v = b.getAttribute(a);
      if (v === null) v = de.getAttribute(a);
      if (v === null) { if (BODY_ATTRS[a] === undefined) wrap.removeAttribute(a); } else wrap.setAttribute(a, v);
    });
  }

  function runScripts(list, i, host) {
    if (i >= list.length) return;
    var it = list[i], s = document.createElement('script');
    if (it.src) {
      var done = false;
      var next = function () { if (!done) { done = true; runScripts(list, i + 1, host); } };
      s.src = it.src; s.async = false; s.onload = next; s.onerror = next;
      host.appendChild(s);
      setTimeout(next, 8000);
    } else {
      s.textContent = it.code; // inline scripts run on insertion, in page scope, in order
      host.appendChild(s);
      runScripts(list, i + 1, host);
    }
  }

  // Width: the Wix Editor cannot stretch a custom element, so on the live site it spans the browser width itself: left
  // edge moved to the window's left edge, width = window width without the scrollbar (Wix clips anything wider).
  var current = null, fitting = false;
  function fit() {
    if (!current || !current.isConnected || !current.parentElement) return;
    // Height: Wix keeps the box at the height drawn in the editor and its mobile site cuts what goes below, so the
    // element and its Wix box (up to the comp-... wrapper) follow the content height.
    var chain = [current], el = current.parentElement, comp = null;
    for (var i = 0; el && i < 5; i++, el = el.parentElement) {
      chain.push(el);
      if (/^comp-/.test(el.id || '')) { comp = el; break; }
    }
    (comp ? chain : [current]).forEach(function (e) { e.style.height = 'auto'; e.style.minHeight = '0px'; });
    if (!FULL_WIDTH) return;
    var vw = document.documentElement.clientWidth;
    var left = current.parentElement.getBoundingClientRect().left;
    current.style.maxWidth = 'none';
    current.style.width = vw + 'px';
    current.style.marginLeft = (-left) + 'px';
  }
  function startFit(host) {
    current = host;
    fit();
    if (fitting) return;
    fitting = true; // one set of listeners for the page load, whatever element instance is current
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(document.body);
    window.addEventListener('load', fit);
  }

  function PageElement() { return Reflect.construct(HTMLElement, [], PageElement); }
  PageElement.prototype = Object.create(HTMLElement.prototype);
  PageElement.prototype.constructor = PageElement;
  Object.setPrototypeOf(PageElement, HTMLElement);
  var built = null; // the rendered page; Wix SPA navigation creates a new element each visit, the DOM is reused
  PageElement.prototype.connectedCallback = function () {
    var host = this;
    host.style.display = 'block';
    addHead();
    if (built) { // back on this page without a reload: move the same DOM in, scripts already ran, nothing doubles
      if (built.parentNode !== host) host.appendChild(built);
      mirrorState(built);
      startFit(host);
      return;
    }
    var wrap = document.createElement('div');
    built = wrap;
    Object.keys(BODY_ATTRS).forEach(function (k) { try { wrap.setAttribute(k, BODY_ATTRS[k]); } catch (e) { /* skip */ } });
    wrap.setAttribute('data-html-body', '');
    BASE_CLASSES.forEach(function (c) { wrap.classList.add(c); });
    wrap.innerHTML = HTML;
    host.appendChild(wrap);
    startFit(host);
    mirrorState(wrap);
    var mo = new MutationObserver(function () { mirrorState(wrap); });
    mo.observe(document.documentElement, { attributes: true });
    mo.observe(document.body, { attributes: true });
    if (TRACKER_CONFIG && !window.htmlTracker) { window.HTML_TRACKER_CONFIG = TRACKER_CONFIG; startTracker(); }
    runScripts(SCRIPTS, 0, host);
  };
  window.customElements.define(TAG, PageElement);
})();
"""
