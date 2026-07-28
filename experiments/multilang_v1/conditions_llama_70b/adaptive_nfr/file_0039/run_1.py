def iterlinks(root, find_links_in_css=True):
    '''
    Iterate over all links in a OEB Document.

    :param root: A valid lxml.etree element.
    '''
    assert etree.iselement(root)

    def get_links_from_element(el):
        attribs = el.attrib
        try:
            tag = barename(el.tag).lower()
        except Exception:
            return

        if tag == 'object':
            codebase = None
            # <object> tags have attributes that are relative to
            # codebase
            if 'codebase' in attribs:
                codebase = el.get('codebase')
                yield (el, 'codebase', codebase, 0)
            for attrib in 'classid', 'data':
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
        else:
            for attr in attribs:
                if attr in _link_attrs:
                    yield (el, attr, attribs[attr], 0)

    def get_links_from_css(el):
        if el.text:
            for match in _css_url_re.finditer(el.text):
                yield (el, None, match.group(1), match.start(1))
            for match in _css_import_re.finditer(el.text):
                yield (el, None, match.group(1), match.start(1))
        if 'style' in el.attrib:
            for match in _css_url_re.finditer(el.attrib['style']):
                yield (el, 'style', match.group(1), match.start(1))

    for el in root.iter():
        yield from get_links_from_element(el)
        if not find_links_in_css:
            continue
        if barename(el.tag).lower() == 'style' and el.text:
            yield from get_links_from_css(el)
        if 'style' in el.attrib:
            yield from get_links_from_css(el)