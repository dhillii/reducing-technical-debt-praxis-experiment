import os, re, logging
from collections import defaultdict
from itertools import count
from urlparse import urldefrag, urlparse, urlunparse, urljoin
from urllib import unquote

from lxml import etree, html
from calibre.constants import filesystem_encoding, __version__
from calibre.translations.dynamic import translate
from calibre.ebooks.chardet import xml_to_unicode
from calibre.ebooks.conversion.preprocess import CSSPreProcessor
from calibre import (isbytestring, as_unicode, get_types_map)
from calibre.ebooks.oeb.parse_utils import (barename, XHTML_NS, RECOVER_PARSER,
        namespace, XHTML, parse_html, NotHTML)
from calibre.utils.cleantext import clean_xml_chars
from calibre.utils.short_uuid import uuid4

XML_NS       = 'http://www.w3.org/XML/1998/namespace'
OEB_DOC_NS   = 'http://openebook.org/namespaces/oeb-document/1.0/'
OPF1_NS      = 'http://openebook.org/namespaces/oeb-package/1.0/'
OPF2_NS      = 'http://www.idpf.org/2007/opf'
OPF_NSES     = set([OPF1_NS, OPF2_NS])
DC09_NS      = 'http://purl.org/metadata/dublin_core'
DC10_NS      = 'http://purl.org/dc/elements/1.0/'
DC11_NS      = 'http://purl.org/dc/elements/1.1/'
DC_NSES      = set([DC09_NS, DC10_NS, DC11_NS])
XSI_NS       = 'http://www.w3.org/2001/XMLSchema-instance'
DCTERMS_NS   = 'http://purl.org/dc/terms/'
NCX_NS       = 'http://www.daisy.org/z3986/2005/ncx/'
SVG_NS       = 'http://www.w3.org/2000/svg'
XLINK_NS     = 'http://www.w3.org/1999/xlink'
CALIBRE_NS   = 'http://calibre.kovidgoyal.net/2009/metadata'
RE_NS        = 'http://exslt.org/regular-expressions'
MBP_NS       = 'http://www.mobipocket.com'
EPUB_NS      = 'http://www.idpf.org/2007/ops'

XPNSMAP      = {'h': XHTML_NS, 'o1': OPF1_NS, 'o2': OPF2_NS,
                'd09': DC09_NS, 'd10': DC10_NS, 'd11': DC11_NS,
                'xsi': XSI_NS, 'dt': DCTERMS_NS, 'ncx': NCX_NS,
                'svg': SVG_NS, 'xl': XLINK_NS, 're': RE_NS,
                'mbp': MBP_NS, 'calibre': CALIBRE_NS, 'epub':EPUB_NS}

OPF1_NSMAP   = {'dc': DC11_NS, 'oebpackage': OPF1_NS}
OPF2_NSMAP   = {'opf': OPF2_NS, 'dc': DC11_NS, 'dcterms': DCTERMS_NS,
                'xsi': XSI_NS, 'calibre': CALIBRE_NS}

def XML(name):
    return '{%s}%s' % (XML_NS, name)

def OPF(name):
    return '{%s}%s' % (OPF2_NS, name)

def DC(name):
    return '{%s}%s' % (DC11_NS, name)

def XSI(name):
    return '{%s}%s' % (XSI_NS, name)

def DCTERMS(name):
    return '{%s}%s' % (DCTERMS_NS, name)

def NCX(name):
    return '{%s}%s' % (NCX_NS, name)

def SVG(name):
    return '{%s}%s' % (SVG_NS, name)

def XLINK(name):
    return '{%s}%s' % (XLINK_NS, name)

def CALIBRE(name):
    return '{%s}%s' % (CALIBRE_NS, name)

_css_url_re = re.compile(r'url\s*\([\'"]{0,1}(.*?)[\'"]{0,1}\)', re.I)
_css_import_re = re.compile(r'@import "(.*?)"')
_archive_re = re.compile(r'[^ ]+')

self_closing_bad_tags = {'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b',
'bdo', 'blockquote', 'body', 'button', 'cite', 'code', 'dd', 'del', 'details',
'dfn', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer',
'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'i', 'ins', 'kbd',
'label', 'legend', 'li', 'map', 'mark', 'meter', 'nav', 'ol', 'output', 'p',
'pre', 'progress', 'q', 'rp', 'rt', 'samp', 'section', 'select', 'small',
'span', 'strong', 'sub', 'summary', 'sup', 'textarea', 'time', 'ul', 'var',
'video', 'title', 'script', 'style'}

_self_closing_pat = re.compile(
    r'<(?P<tag>%s)(?=[\s/])(?P<arg>[^>]*)/>'%('|'.join(self_closing_bad_tags)),
    re.IGNORECASE)

def close_self_closing_tags(raw):
    return _self_closing_pat.sub(r'<\g<tag>\g<arg>></\g<tag>>', raw)

def uuid_id():
    return u'u'+uuid4()

def itercsslinks(raw):
    for match in _css_url_re.finditer(raw):
        yield match.group(1), match.start(1)
    for match in _css_import_re.finditer(raw):
        yield match.group(1), match.start(1)

_link_attrs = set(html.defs.link_attrs) | {XLINK('href'), 'poster'}

def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    def _handle_object(el, attribs):
        codebase = None
        if 'codebase' in attribs:
            codebase = el.get('codebase')
            yield (el, 'codebase', codebase, 0)
        for attrib in ('classid', 'data'):
            if attrib in attribs:
                value = el.get(attrib)
                if codebase is not None:
                    value = urljoin(codebase, value)
                yield (el, attrib, value, 0)
        if 'archive' in attribs:
            for match in _archive_re.finditer(el.get('archive')):
                value = match.group(0)
                if codebase is not None:
                    value = urljoin(codebase, value)
                yield (el, 'archive', value, match.start())

    def _handle_attributes(el, attribs):
        for attr in attribs:
            if attr in _link_attrs:
                yield (el, attr, attribs[attr], 0)

    def _handle_css(el, attribs):
        if not find_links_in_css:
            return
        if barename(el.tag).lower() == 'style' and el.text:
            for match in _css_url_re.finditer(el.text):
                yield (el, None, match.group(1), match.start(1))
            for match in _css_import_re.finditer(el.text):
                yield (el, None, match.group(1), match.start(1))
        if 'style' in attribs:
            for match in _css_url_re.finditer(attribs['style']):
                yield (el, 'style', match.group(1), match.start(1))

    for el in root.iter():
        attribs = el.attrib
        try:
            tag = barename(el.tag).lower()
        except Exception:
            continue

        if tag == 'object':
            yield from _handle_object(el, attribs)
        else:
            yield from _handle_attributes(el, attribs)

        yield from _handle_css(el, attribs)

def make_links_absolute(root, base_url):
    '''
    Make all links in the document absolute, given the
    ``base_url`` for the document (the full URL where the document
    came from)
    '''
    def link_repl(href):
        return urljoin(base_url, href)
    rewrite_links(root, link_repl)

def resolve_base_href(root):
    base_href = None
    basetags = root.xpath('//base[@href]|//h:base[@href]',
            namespaces=XPNSMAP)
    for b in basetags:
        base_href = b.get('href')
        b.drop_tree()
    if not base_href:
        return
    make_links_absolute(root, base_href, resolve_base_href=False)

def rewrite_links(root, link_repl_func, resolve_base_href=False):
    '''
    Rewrite all the links in the document.  For each link
    ``link_repl_func(link)`` will be called, and the return value
    will replace the old link.

    Note that links may not be absolute (unless you first called
    ``make_links_absolute()``), and may be internal (e.g.,
    ``'#anchor'``).  They can also be values like
    ``'mailto:email'`` or ``'javascript:expr'``.

    If the ``link_repl_func`` returns None, the attribute or
    tag text will be removed completely.
    '''
    from cssutils import replaceUrls, log, CSSParser
    log.setLevel(logging.WARN)
    log.raiseExceptions = False

    if resolve_base_href:
        resolve_base_href(root)
    for el, attrib, link, pos in iterlinks(root, find_links_in_css=False):
        new_link = link_repl_func(link.strip())
        if new_link == link:
            continue
        if new_link is None:
            if attrib is None:
                el.text = ''
            else:
                del el.attrib[attrib]
            continue
        if attrib is None:
            new = el.text[:pos] + new_link + el.text[pos+len(link):]
            el.text = new
        else:
            cur = el.attrib[attrib]
            if not pos and len(cur) == len(link):
                el.attrib[attrib] = new_link
            else:
                new = cur[:pos] + new_link + cur[pos+len(link):]
                el.attrib[attrib] = new

    parser = CSSParser(raiseExceptions=False, log=_css_logger,
            fetcher=lambda x:(None, None))
    for el in root.iter(etree.Element):
        try:
            tag = el.tag
        except UnicodeDecodeError:
            continue

        if tag == XHTML('style') and el.text and \
                (_css_url_re.search(el.text) is not None or '@import' in
                        el.text):
            stylesheet = parser.parseString(el.text, validate=False)
            replaceUrls(stylesheet, link_repl_func)
            repl = stylesheet.cssText
            if isbytestring(repl):
                repl = repl.decode('utf-8')
            el.text = '\n'+ clean_xml_chars(repl) + '\n'

        text = el.get('style')
        if text and _css_url_re.search(text) is not None:
            try:
                stext = parser.parseStyle(text, validate=False)
            except Exception:
                continue
            replaceUrls(stext, link_repl_func)
            repl = stext.cssText.replace('\n', ' ').replace('\r',
                    ' ')
            if isbytestring(repl):
                repl = repl.decode('utf-8')
            el.set('style', repl)