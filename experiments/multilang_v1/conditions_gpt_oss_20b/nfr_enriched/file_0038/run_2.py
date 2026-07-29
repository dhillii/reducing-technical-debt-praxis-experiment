#!/usr/bin/env python2
# vim:fileencoding=UTF-8:ts=4:sw=4:sta:et:sts=4:ai
# License: GPLv3 Copyright: 2011, Kovid Goyal <kovid at kovidgoyal.net>
from __future__ import absolute_import, division, print_function, unicode_literals

import re
import socket
import time
from functools import partial
from Queue import Empty, Queue
from threading import Thread
from urlparse import urlparse

from calibre import as_unicode, browser, random_user_agent
from calibre.ebooks.metadata import check_isbn
from calibre.ebooks.metadata.book.base import Metadata
from calibre.ebooks.metadata.sources.base import Option, Source, fixauthors, fixcase
from calibre.utils.localization import canonicalize_lang
from calibre.utils.random_ua import accept_header_for_ua, all_user_agents


class CaptchaError(Exception):
    pass


class SearchFailed(ValueError):
    pass


ua_index = -1


def _fetch_raw(url, log, timeout, browser):
    """Retrieve raw page content, handling errors."""
    try:
        return browser.open_novisit(url, timeout=timeout).read().strip()
    except Exception as e:
        if callable(getattr(e, 'getcode', None)) and e.getcode() == 404:
            log.error('URL malformed: %r' % url)
        else:
            args = getattr(e, 'args', [None])
            if isinstance(args[0], socket.timeout):
                log.error('Details page timed out. Try again later.')
            else:
                log.exception('Failed to make details query: %r' % url)
        return None


def _decode_raw(raw, url):
    """Decode raw page content, handling special cases."""
    if 'amazon.com.br' in url:
        raw = raw.decode('utf-8')
    from calibre.ebooks.chardet import xml_to_unicode
    return xml_to_unicode(raw, strip_encoding_pats=True, resolve_entities=True)[0]


def _is_404(raw, url, log):
    """Check for 404 error in page content."""
    if '<title>404 - ' in raw:
        log.error('URL malformed: %r' % url)
        return True
    return False


def _parse_html(raw, url, log):
    """Parse HTML content into an lxml root."""
    from calibre.utils.cleantext import clean_ascii_chars
    import html5lib
    try:
        return html5lib.parse(clean_ascii_chars(raw), treebuilder='lxml',
                              namespaceHTMLElements=False)
    except Exception:
        log.exception('Failed to parse amazon details page: %r' % url)
        return None


def _find_jp_redirect(root):
    """Find a JP redirect link if present."""
    for a in root.xpath('//a[@href]'):
        href = a.get('href')
        if href and 'black-curtain-redirect.html' in href:
            return 'https://amazon.co.jp' + href
    return None


def _has_error_message(root, url, log):
    """Detect and log an error message in the page."""
    errmsg = root.xpath('//*[@id="errorMessage"]')
    if errmsg:
        msg = 'Failed to parse amazon details page: %r' % url
        from lxml.html import tostring
        msg += tostring(errmsg, method='text', encoding=unicode).strip()
        log.error(msg)
        return True
    return False


def parse_details_page(url, log, timeout, browser, domain):
    """Retrieve and parse an Amazon book details page."""
    log('Getting details from:', url)
    raw = _fetch_raw(url, log, timeout, browser)
    if raw is None:
        return
    oraw = raw
    raw = _decode_raw(raw, url)
    if _is_404(raw, url, log):
        return
    root = _parse_html(raw, url, log)
    if root is None:
        return
    if domain == 'jp':
        redirect_url = _find_jp_redirect(root)
        if redirect_url:
            log('Black curtain redirect found, following')
            return parse_details_page(redirect_url, log, timeout, browser, domain)
    if _has_error_message(root, url, log):
        return
    from css_selectors import Select
    selector = Select(root)
    return oraw, root, selector


def parse_asin(root, log, url):
    try:
        link = root.xpath('//link[@rel="canonical" and @href]')
        for l in link:
            return l.get('href').rpartition('/')[-1]
    except Exception:
        log.exception('Error parsing ASIN for url: %r' % url)