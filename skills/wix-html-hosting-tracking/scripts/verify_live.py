#!/usr/bin/env python3
"""Check a published Wix static site (or any URL) for tracking + SEO problems. Standard library only.

  python3 verify_live.py https://lp.example.com --pages / /about/ /contact.html --gtm GTM-ABC1234
  python3 verify_live.py https://lp.example.com --from-sitemap --gtag G-ABC123,AW-123456789

Checks per page: HTTP status and redirects, <title>, meta description, canonical, noindex, exactly one
copy of each Google tag, html-tracker present, consent defaults before the tag, Content-Security-Policy
that would block Google. Site-wide: robots.txt, sitemap.xml, real 404s, /folder/ vs /file.html URLs.
Exit code 1 when any FAIL is found. Use --preflight on the free *.wix-site-host.com URL or a local copy, where
canonical/sitemap URLs already point at the final domain. In-browser checks: browser_check.js (Route A) and
simulate_embed.js (Route B, before installing). This script is for Route A sites, not Wix editor pages.
"""
import argparse
import random
import re
import string
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse

UA = 'Mozilla/5.0 (compatible; html-tracker-verify/1.0)'
results = []


def note(level, msg):
    results.append((level, msg))
    print('%-4s %s' % (level, msg))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(url, follow=True, method='GET'):
    handlers = [] if follow else [NoRedirect()]
    opener = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(url, method=method, headers={'User-Agent': UA, 'Accept': 'text/html,*/*'})
    try:
        with opener.open(req, timeout=30) as r:
            body = r.read(3_000_000) if method == 'GET' else b''
            return r.status, r.geturl(), {k.lower(): v for k, v in r.headers.items()}, body.decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        body = e.read(200_000).decode('utf-8', 'replace') if method == 'GET' else ''
        return e.code, url, {k.lower(): v for k, v in (e.headers or {}).items()}, body
    except Exception as e:  # network / TLS
        return 0, url, {}, str(e)


def meta(html, name):
    m = re.search(r'<meta\b[^>]*(?:name|property)\s*=\s*["\']%s["\'][^>]*>' % re.escape(name), html, re.I)
    if not m:
        return None
    c = re.search(r'content\s*=\s*["\']([^"\']*)', m.group(0), re.I)
    return c.group(1) if c else ''


def check_page(base, path, args):
    url = urljoin(base + '/', path.lstrip('/')) if path != '/' else base + '/'
    status, final, headers, html = fetch(url)
    label = path
    if status != 200:
        note('FAIL', '%s -> HTTP %s %s' % (label, status, '' if status else html[:120]))
        return
    if final.rstrip('/') != url.rstrip('/'):
        note('WARN', '%s redirects to %s (link to the final URL; canonical should match it)' % (label, final))
    ctype = headers.get('content-type', '')
    if 'html' not in ctype:
        note('WARN', '%s served as %r, not text/html' % (label, ctype))
    title = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.S)
    if not title or not title.group(1).strip():
        note('FAIL', '%s has no <title>' % label)
    desc = meta(html, 'description')
    if not desc:
        note('WARN', '%s has no meta description' % label)
    robots = meta(html, 'robots') or ''
    if 'noindex' in robots.lower():
        note('FAIL', '%s is noindex (%s)' % (label, robots))
    xrobots = headers.get('x-robots-tag', '')
    if 'noindex' in xrobots.lower():
        note('FAIL', '%s sends X-Robots-Tag: %s' % (label, xrobots))
    canon = re.search(r'<link\b[^>]*rel\s*=\s*["\']canonical["\'][^>]*>', html, re.I)
    if not canon:
        note('WARN', '%s has no canonical link' % label)
    else:
        href = re.search(r'href\s*=\s*["\']([^"\']+)', canon.group(0), re.I)
        if href and href.group(1).rstrip('/') != final.rstrip('/'):
            note('INFO' if args.preflight else 'WARN', '%s canonical is %s but the page lives at %s' % (label, href.group(1), final))
    # Google tags: exactly one loader per container
    # standard snippet passes the ID as the last IIFE argument; some installs use a direct gtm.js?id= URL
    gtm_ids = re.findall(r"['\"]dataLayer['\"]\s*,\s*['\"](GTM-[A-Z0-9]+)['\"]\s*\)", html)
    gtm_ids += re.findall(r'googletagmanager\.com/gtm\.js\?id=(GTM-[A-Z0-9]+)', html)
    gtag_ids = re.findall(r'googletagmanager\.com/gtag/js\?id=([A-Z]{1,3}-[A-Z0-9]+)', html)
    for i in set(gtm_ids):
        if gtm_ids.count(i) > 1:
            note('FAIL', '%s loads %s %d times (double counting)' % (label, i, gtm_ids.count(i)))
    if gtm_ids and gtag_ids:
        note('WARN', '%s loads both GTM (%s) and gtag.js (%s): make sure GA4 is not sent twice' % (label, ', '.join(set(gtm_ids)), ', '.join(set(gtag_ids))))
    if args.gtm and args.gtm not in gtm_ids:
        note('FAIL', '%s: GTM container %s not found in the HTML' % (label, args.gtm))
    for gid in args.gtag_ids:
        if gid not in html:
            note('FAIL', '%s: Google tag %s not found in the HTML' % (label, gid))
    if not gtm_ids and not gtag_ids:
        note('WARN', '%s has no Google tag in its HTML (fine only if Wix injects it from Marketing Integrations)' % label)
    if 'html-tracker' not in html and 'HTML_TRACKER_CONFIG' not in html:
        note('WARN', '%s does not load html-tracker (behaviour events will be missing)' % label)
    cpos = html.find("gtag('consent', 'default'")
    tpos = min([p for p in (html.find('googletagmanager.com/gtm.js'), html.find('googletagmanager.com/gtag/js')) if p >= 0] or [-1])
    if tpos >= 0 and cpos < 0:
        note('WARN', '%s has no Consent Mode defaults (needed for EEA/UK; recommended everywhere)' % label)
    elif tpos >= 0 and cpos > tpos:
        note('FAIL', '%s sets consent defaults AFTER the Google tag loads' % label)
    csp = headers.get('content-security-policy', '')
    if csp and 'googletagmanager.com' not in csp and ('script-src' in csp or 'default-src' in csp):
        note('FAIL', '%s sends a Content-Security-Policy that blocks googletagmanager.com' % label)
    if re.search(r'filesusr\.com', html):
        note('WARN', '%s still references filesusr.com (old Wix embed URLs)' % label)
    if 'wix-site-script' in html:
        note('INFO', '%s includes Wix site-script (Wix analytics/consent/SEO helper)' % label)
    note('OK', '%s -> 200 (%d KB)' % (label, len(html) // 1024))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('base', help='https://your-domain (no trailing path)')
    ap.add_argument('--pages', nargs='*', default=['/'], help='paths to check, e.g. / /about/ /contact.html')
    ap.add_argument('--from-sitemap', action='store_true', help='also check every URL in sitemap.xml (max 50)')
    ap.add_argument('--gtm', help='expected GTM container ID')
    ap.add_argument('--gtag', default='', help='expected Google tag IDs, comma-separated')
    ap.add_argument('--preflight', action='store_true', help='testing before the final domain is live: host mismatches are INFO')
    args = ap.parse_args()
    args.gtag_ids = [i.strip() for i in args.gtag.split(',') if i.strip()]
    base = args.base.rstrip('/')
    host = urlparse(base).hostname or ''
    if host.endswith('.wix-site-host.com'):
        note('WARN', 'checking the free *.wix-site-host.com address: connect your own (sub)domain before sending ad traffic')

    # robots.txt
    st, _, _, robots = fetch(base + '/robots.txt')
    if st != 200:
        note('FAIL', 'robots.txt -> HTTP %s (upload one; Wix does not create it for uploaded sites)' % st)
    else:
        if re.search(r'^\s*Disallow:\s*/\s*$', robots, re.M | re.I):
            note('FAIL', 'robots.txt blocks the whole site (Disallow: /)')
        if 'sitemap:' not in robots.lower():
            note('WARN', 'robots.txt has no Sitemap: line')
        else:
            note('OK', 'robots.txt present with Sitemap line')
    # sitemap.xml
    pages = list(args.pages)
    st, _, _, sm = fetch(base + '/sitemap.xml')
    if st != 200:
        note('FAIL', 'sitemap.xml -> HTTP %s' % st)
    else:
        try:
            root = ET.fromstring(sm.encode('utf-8'))
            locs = [e.text.strip() for e in root.iter() if e.tag.endswith('loc') and e.text]
            foreign = [l for l in locs if urlparse(l).hostname != host]
            note('OK', 'sitemap.xml lists %d URL(s)' % len(locs))
            if foreign:
                note('INFO' if args.preflight else 'FAIL', 'sitemap.xml lists URLs on another host, e.g. %s%s'
                     % (foreign[0], ' (expected before the domain is connected)' if args.preflight else ' (re-run prepare_site.py with the right --base-url)'))
            if args.from_sitemap:
                for l in locs[:50]:
                    p = urlparse(l).path or '/'
                    if p not in pages:
                        pages.append(p)
        except ET.ParseError as e:
            note('FAIL', 'sitemap.xml is not valid XML: %s' % e)
    # real 404s
    junk = '/' + ''.join(random.choice(string.ascii_lowercase) for _ in range(12)) + '-should-404'
    st, _, _, _ = fetch(base + junk)
    if st == 200:
        note('WARN', 'missing pages answer 200 (soft 404). Google may index junk URLs; keep internal links exact.')
    elif st == 404:
        note('OK', 'missing pages return 404')
    else:
        note('INFO', 'missing pages return HTTP %s' % st)
    # folder vs file URL styles, for the first nested page
    for p in pages:
        if p.endswith('/') and p != '/':
            st2, _, _, _ = fetch(base + p + 'index.html')
            st3, _, _, _ = fetch(base + p.rstrip('/'))
            note('INFO', '%s/index.html -> %s, %s (no slash) -> %s' % (p.rstrip('/'), st2, p.rstrip('/'), st3))
            break
    for p in pages:
        check_page(base, p, args)
    fails = [m for lvl, m in results if lvl == 'FAIL']
    print('\n%d FAIL, %d WARN' % (len(fails), len([1 for lvl, _ in results if lvl == 'WARN'])))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
