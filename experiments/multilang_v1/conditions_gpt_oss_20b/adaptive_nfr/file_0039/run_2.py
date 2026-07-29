_link_attrs = set(html.defs.link_attrs) | {XLINK('href'), 'poster'}


def _object_links(el, attribs):
    """Yield link tuples for an <object> element."""
    codebase = el.get('codebase')
    if codebase:
        yield (el, 'codebase', codebase, 0)
    for attrib in ('classid', 'data'):
        if attrib in attribs:
            value = el.get(attrib)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, attrib, value, 0)
    if 'archive' in attribs:
        for match in _archive_re.finditer(attribs['archive']):
            value = match.group(0)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, 'archive', value, match.start())


def _css_links(el, tag, attribs):
    """Yield link tuples found in CSS text or style attributes."""
    if tag == 'style' and el.text:
        for match in _css_url_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
        for match in _css_import_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
    if 'style' in attribs:
        for match in _css_url_re.finditer(attribs['style']):
            yield (el, 'style', match.group(1), match.start(1))


def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    for el in root.iter():
        attribs = el.attrib
        try:
            tag = barename(el.tag).lower()
        except Exception:
            continue

        if tag == 'object':
            yield from _object_links(el, attribs)
        else:
            for attr in attribs:
                if attr in _link_attrs:
                    yield (el, attr, attribs[attr], 0)

        if not find_links_in_css:
            continue
        yield from _css_links(el, tag, attribs)