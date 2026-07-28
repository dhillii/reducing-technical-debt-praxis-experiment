def parse_details_page(url, log, timeout, browser, domain):
    from calibre.utils.cleantext import clean_ascii_chars
    from calibre.ebooks.chardet import xml_to_unicode
    import html5lib
    from lxml.html import tostring
    log('Getting details from:', url)
    try:
        raw = browser.open_novisit(url, timeout=timeout).read().strip()
    except Exception as e:
        if hasattr(e, 'getcode') and e.getcode() == 404:
            log.error('URL malformed: %r' % url)
            return
        if isinstance(e.args[0], socket.timeout):
            log.error('Details page timed out. Try again later.')
        else:
            log.exception('Failed to make details query: %r' % url)
        return

    oraw = raw
    if 'amazon.com.br' in url:
        raw = raw.decode('utf-8')
    raw = xml_to_unicode(raw, strip_encoding_pats=True, resolve_entities=True)[0]
    if '<title>404 - ' in raw:
        log.error('URL malformed: %r' % url)
        return

    try:
        root = html5lib.parse(clean_ascii_chars(raw), treebuilder='lxml', namespaceHTMLElements=False)
    except Exception as e:
        log.exception('Failed to parse amazon details page: %r' % url)
        return

    if domain == 'jp':
        for a in root.xpath('//a[@href]'):
            if 'black-curtain-redirect.html' in a.get('href'):
                url = 'https://amazon.co.jp' + a.get('href')
                log('Black curtain redirect found, following')
                return parse_details_page(url, log, timeout, browser, domain)

    errmsg = root.xpath('//*[@id="errorMessage"]')
    if errmsg:
        log.error('Failed to parse amazon details page: %r' % url + tostring(errmsg, method='text', encoding=unicode).strip())
        return

    from css_selectors import Select
    selector = Select(root)
    return oraw, root, selector