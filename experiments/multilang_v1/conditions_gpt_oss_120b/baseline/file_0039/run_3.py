def _iter_object_links(el):
    codebase = el.get('codebase')
    if codebase:
        yield (el, 'codebase', codebase, 0)
    for attrib in ('classid', 'data'):
        value = el.get(attrib)
        if value is not None:
            if codebase:
                value = urljoin(codebase, value)
            yield (el, attrib, value, 0)
    archive = el.get('archive')
    if archive:
        for match in _archive_re.finditer(archive):
            value = match.group(0)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, 'archive', value, match.start())


def _iter_attr_links(el):
    for attr, value in el.attrib.items():
        if attr in _link_attrs:
            yield (el, attr, value, 0)


def _iter_css_links(el, tag):
    if tag == 'style' and el.text:
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
            yield from _iter_object_links(el)
        else:
            yield from _iter_attr_links(el)

        if find_links_in_css:
            yield from _iter_css_links(el, tag)