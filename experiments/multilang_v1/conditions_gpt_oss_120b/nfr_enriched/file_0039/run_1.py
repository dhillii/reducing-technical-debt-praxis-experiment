def _iter_object_links(el, attribs):
    """Yield links found in <object> elements, handling codebase."""
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


def _iter_attribute_links(el, attribs):
    """Yield links from generic attributes defined in _link_attrs."""
    for attr in attribs:
        if attr in _link_attrs:
            yield (el, attr, attribs[attr], 0)


def _iter_css_links_in_style(el):
    """Yield URLs found inside <style> element text."""
    for match in _css_url_re.finditer(el.text):
        yield (el, None, match.group(1), match.start(1))
    for match in _css_import_re.finditer(el.text):
        yield (el, None, match.group(1), match.start(1))


def _iter_css_links_in_style_attr(el, style):
    """Yield URLs found inside a style attribute."""
    for match in _css_url_re.finditer(style):
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
            for link in _iter_object_links(el, attribs):
                yield link
        else:
            for link in _iter_attribute_links(el, attribs):
                yield link

        if not find_links_in_css:
            continue
        if tag == 'style' and el.text:
            for link in _iter_css_links_in_style(el):
                yield link
        if 'style' in attribs:
            for link in _iter_css_links_in_style_attr(el, attribs['style']):
                yield link