_link_attrs = set(html.defs.link_attrs) | {XLINK('href'), 'poster'}


def _get_tag_name(el):
    """Return the lower‑case local name of an element's tag."""
    try:
        return barename(el.tag).lower()
    except Exception:
        return None


def _handle_object_tag(el):
    """Yield links found in an <object> element."""
    attribs = el.attrib
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
        archive = attribs['archive']
        for match in _archive_re.finditer(archive):
            value = match.group(0)
            if codebase is not None:
                value = urljoin(codebase, value)
            yield (el, 'archive', value, match.start())


def _handle_element_links(el):
    """Yield links from attributes of a non‑object element."""
    attribs = el.attrib
    for attr in attribs:
        if attr in _link_attrs:
            yield (el, attr, attribs[attr], 0)


def _handle_css_links(el, tag):
    """Yield links found in style elements or style attributes."""
    if tag == 'style' and el.text:
        text = el.text
        for match in _css_url_re.finditer(text):
            yield (el, None, match.group(1), match.start(1))
        for match in _css_import_re.finditer(text):
            yield (el, None, match.group(1), match.start(1))
    if 'style' in el.attrib:
        style = el.attrib['style']
        for match in _css_url_re.finditer(style):
            yield (el, 'style', match.group(1), match.start(1))


def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    for el in root.iter():
        tag = _get_tag_name(el)
        if tag is None:
            continue

        if tag == 'object':
            for link in _handle_object_tag(el):
                yield link
        else:
            for link in _handle_element_links(el):
                yield link

        if not find_links_in_css:
            continue

        for link in _handle_css_links(el, tag):
            yield link