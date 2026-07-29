_link_attrs = set(html.defs.link_attrs) | {XLINK('href'), 'poster'}


def _get_tag(element):
    """Return the lowercased local name of an element's tag."""
    try:
        return barename(element.tag).lower()
    except Exception:
        return None


def _object_links(element):
    """Yield link tuples for <object> elements."""
    attribs = element.attrib
    codebase = element.get('codebase')
    if codebase:
        yield (element, 'codebase', codebase, 0)
    for attrib in ('classid', 'data'):
        if attrib in attribs:
            value = element.get(attrib)
            if codebase:
                value = urljoin(codebase, value)
            yield (element, attrib, value, 0)
    if 'archive' in attribs:
        archive = attribs['archive']
        for match in _archive_re.finditer(archive):
            value = match.group(0)
            if codebase:
                value = urljoin(codebase, value)
            yield (element, 'archive', value, match.start())


def _other_links(element):
    """Yield link tuples for non-object elements."""
    for attr, val in element.attrib.items():
        if attr in _link_attrs:
            yield (element, attr, val, 0)


def _css_links(element, tag):
    """Yield link tuples found in CSS or style attributes."""
    if tag == 'style' and element.text:
        for match in _css_url_re.finditer(element.text):
            yield (element, None, match.group(1), match.start(1))
        for match in _css_import_re.finditer(element.text):
            yield (element, None, match.group(1), match.start(1))
    style_attr = element.attrib.get('style')
    if style_attr:
        for match in _css_url_re.finditer(style_attr):
            yield (element, 'style', match.group(1), match.start(1))


def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    for el in root.iter():
        tag = _get_tag(el)
        if tag == 'object':
            for link in _object_links(el):
                yield link
        else:
            for link in _other_links(el):
                yield link

        if not find_links_in_css:
            continue
        for link in _css_links(el, tag):
            yield link