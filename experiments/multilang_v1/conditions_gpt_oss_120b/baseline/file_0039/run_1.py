_link_attrs = set(html.defs.link_attrs) | {XLINK('href'), 'poster'}

def _object_links(el, attribs):
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
        for match in _archive_re.finditer(el.get('archive')):
            value = match.group(0)
            if codebase:
                value = urljoin(codebase, value)
            yield (el, 'archive', value, match.start())

def _attribute_links(el, attribs):
    for attr, val in attribs.items():
        if attr in _link_attrs:
            yield (el, attr, val, 0)

def _css_links(el, attribs):
    if el.text:
        for match in _css_url_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
        for match in _css_import_re.finditer(el.text):
            yield (el, None, match.group(1), match.start(1))
    style = attribs.get('style')
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
        attribs = el.attrib

        if tag == 'object':
            for link in _object_links(el, attribs):
                yield link
        else:
            for link in _attribute_links(el, attribs):
                yield link

        if not find_links_in_css:
            continue
        if tag == 'style':
            for link in _css_links(el, attribs):
                yield link
        elif 'style' in attribs:
            for link in _css_links(el, attribs):
                yield link