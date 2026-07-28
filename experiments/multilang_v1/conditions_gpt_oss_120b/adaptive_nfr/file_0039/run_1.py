def _iter_object_links(el):
    """
    Yield link information for <object> elements.
    """
    codebase = el.get('codebase')
    if codebase:
        yield (el, 'codebase', codebase, 0)
    for attrib in ('classid', 'data'):
        if attrib in el.attrib:
            value = el.get(attrib)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, attrib, value, 0)
    if 'archive' in el.attrib:
        for match in _archive_re.finditer(el.get('archive')):
            value = match.group(0)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, 'archive', value, match.start())


def _iter_generic_links(el):
    """
    Yield link information for elements that are not <object>.
    """
    for attr, val in el.attrib.items():
        if attr in _link_attrs:
            yield (el, attr, val, 0)


def _iter_style_text_links(el):
    """
    Yield link information from the text content of <style> elements.
    """
    if el.text:
        for match in _css_url_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
        for match in _css_import_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))


def _iter_style_attribute_links(el):
    """
    Yield link information from the 'style' attribute of any element.
    """
    style = el.attrib.get('style')
    if style:
        for match in _css_url_re.finditer(style):
            yield (el, 'style', match.group(1), match.start(1))


def iterlinks(root, find_links_in_css=True):
    """
    Iterate over all links in an OEB Document.

    :param root: A valid lxml.etree element.
    :param find_links_in_css: If True, also extract links from CSS content.
    """
    assert etree.iselement(root)

    for el in root.iter():
        try:
            tag = barename(el.tag).lower()
        except Exception:
            continue

        if tag == 'object':
            for link in _iter_object_links(el):
                yield link
        else:
            for link in _iter_generic_links(el):
                yield link

        if not find_links_in_css:
            continue

        if tag == 'style':
            for link in _iter_style_text_links(el):
                yield link

        for link in _iter_style_attribute_links(el):
            yield link