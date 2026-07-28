_link_attrs = set(html.defs.link_attrs) | {XLINK('href'), 'poster'}

def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    def get_object_links(el):
        codebase = None
        if 'codebase' in el.attrib:
            codebase = el.get('codebase')
            yield (el, 'codebase', codebase, 0)
        for attrib in 'classid', 'data':
            if attrib in el.attrib:
                value = el.get(attrib)
                if codebase is not None:
                    value = urljoin(codebase, value)
                yield (el, attrib, value, 0)
        if 'archive' in el.attrib:
            for match in _archive_re.finditer(el.get('archive')):
                value = match.group(0)
                if codebase is not None:
                    value = urljoin(codebase, value)
                yield (el, 'archive', value, match.start())

    def get_style_links(el):
        if el.text:
            for match in _css_url_re.finditer(el.text):
                yield (el, None, match.group(1), match.start(1))
            for match in _css_import_re.finditer(el.text):
                yield (el, None, match.group(1), match.start(1))

    def get_attribute_links(el):
        for attr in el.attrib:
            if attr in _link_attrs:
                yield (el, attr, el.attrib[attr], 0)

    def get_css_links(el):
        if 'style' in el.attrib:
            for match in _css_url_re.finditer(el.attrib['style']):
                yield (el, 'style', match.group(1), match.start(1))

    for el in root.iter():
        attribs = el.attrib
        try:
            tag = barename(el.tag).lower()
        except Exception:
            continue

        if tag == 'object':
            yield from get_object_links(el)
        yield from get_attribute_links(el)

        if not find_links_in_css:
            continue
        if tag == 'style' and el.text:
            yield from get_style_links(el)
        yield from get_css_links(el)