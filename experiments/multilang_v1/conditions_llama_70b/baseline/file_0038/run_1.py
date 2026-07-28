def parse_details_page(url, log, timeout, browser, domain):
    from calibre.utils.cleantext import clean_ascii_chars
    from calibre.ebooks.chardet import xml_to_unicode
    import html5lib
    from lxml.html import tostring
    log('Getting details from:', url)
    try:
        raw = browser.open_novisit(url, timeout=timeout).read().strip()
    except Exception as e:
        handle_exception(log, e, url)
        return

    raw = preprocess_raw(raw, domain)
    if '<title>404 - ' in raw:
        log.error('URL malformed: %r' % url)
        return

    try:
        root = html5lib.parse(clean_ascii_chars(raw), treebuilder='lxml',
                              namespaceHTMLElements=False)
    except:
        log.exception('Failed to parse amazon details page: %r' % url)
        return
    if domain == 'jp':
        handle_jp_redirect(log, url, root)

    errmsg = root.xpath('//*[@id="errorMessage"]')
    if errmsg:
        log.error('Failed to parse amazon details page: %r' % url)
        log.error(tostring(errmsg, method='text', encoding=unicode).strip())
        return

    from css_selectors import Select
    selector = Select(root)
    return raw, root, selector


def handle_exception(log, e, url):
    if callable(getattr(e, 'getcode', None)) and \
            e.getcode() == 404:
        log.error('URL malformed: %r' % url)
        return
    attr = getattr(e, 'args', [None])
    attr = attr if attr else [None]
    if isinstance(attr[0], socket.timeout):
        msg = 'Details page timed out. Try again later.'
        log.error(msg)
    else:
        msg = 'Failed to make details query: %r' % url
        log.exception(msg)


def preprocess_raw(raw, domain):
    if 'amazon.com.br' in domain:
        raw = raw.decode('utf-8')
    raw = xml_to_unicode(raw, strip_encoding_pats=True,
                         resolve_entities=True)[0]
    return raw


def handle_jp_redirect(log, url, root):
    for a in root.xpath('//a[@href]'):
        if 'black-curtain-redirect.html' in a.get('href'):
            url = 'https://amazon.co.jp' + a.get('href')
            log('Black curtain redirect found, following')
            return parse_details_page(url, log, timeout=20, browser=browser, domain='jp')