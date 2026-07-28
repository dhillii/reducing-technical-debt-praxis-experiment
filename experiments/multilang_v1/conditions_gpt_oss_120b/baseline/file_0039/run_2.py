def _iter_object_links(el):
    attribs = el.attrib
    codebase = attribs.get('codebase')
    if codebase:
        yield (el, 'codebase', codebase, 0)
    for attr in ('classid', 'data'):
        if attr in attribs:
            value = attribs[attr]
            if codebase:
                value = urljoin(codebase, value)
            yield (el, attr, value, 0)
    if 'archive' in attribs:
        for match in _archive_re.finditer(attribs['archive']):
            value = match.group(0)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, 'archive', value, match.start())


def _iter_attr_links(el):
    for attr, val in el.attrib.items():
        if attr in _link_attrs:
            yield (el, attr, val, 0)


def _iter_css_links(el):
    if el.tag == XHTML('style') and el.text:
        for match in _css_url_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
        for match in _css_import_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
    style = el.attrib.get('style')
    if style:
        for match in _css_url_re.finditer(style):
            yield (el, 'style', match.group(1), match.start(1))


def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    for el in root.iter():
        try:
            tag = barename(el.tag).lower()
        except Exception:
            continue

        if tag == 'object':
            for item in _iter_object_links(el):
                yield item
        else:
            for item in _iter_attr_links(el):
                yield item

        if find_links_in_css:
            for item in _iter_css_links(el):
                yield item