def parse_details_page(url, log, timeout, browser, domain):
    """Parse the details page of an Amazon book."""
    from calibre.utils.cleantext import clean_ascii_chars
    from calibre.ebooks.chardet import xml_to_unicode
    import html5lib
    from lxml.html import tostring

    log('Getting details from:', url)
    try:
        raw = browser.open_novisit(url, timeout=timeout).read().strip()
    except Exception as e:
        if callable(getattr(e, 'getcode', None)) and e.getcode() == 404:
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
    except:
        msg = 'Failed to parse amazon details page: %r' % url
        log.exception(msg)
        return
    if domain == 'jp':
        for a in root.xpath('//a[@href]'):
            if 'black-curtain-redirect.html' in a.get('href'):
                url = 'https://amazon.co.jp' + a.get('href')
                log('Black curtain redirect found, following')
                return parse_details_page(url, log, timeout, browser, domain)

    errmsg = root.xpath('//*[@id="errorMessage"]')
    if errmsg:
        msg = 'Failed to parse amazon details page: %r' % url
        msg += tostring(errmsg, method='text', encoding=unicode).strip()
        log.error(msg)
        return

    from css_selectors import Select
    selector = Select(root)
    return oraw, root, selector


def _get_book_url(self, identifiers):
    """Get the URL of a book from its identifiers."""
    domain, asin = self.get_domain_and_asin(identifiers)
    if domain and asin:
        url = None
        r = self.referrer_for_domain(domain)
        if r is not None:
            url = r + 'dp/' + asin
        if url:
            idtype = 'amazon' if domain == 'com' else 'amazon_' + domain
            return domain, idtype, asin, url


def get_book_url(self, identifiers):
    """Get the URL of a book from its identifiers."""
    ans = self._get_book_url(identifiers)
    if ans is not None:
        return ans[1:]


def _parse_title(root):
    """Parse the title of a book from its HTML."""
    h1 = root.xpath('//h1[@id="title"]')
    if h1:
        h1 = h1[0]
        for child in h1.xpath('./*[contains(@class, "a-color-secondary")]'):
            h1.remove(child)
        return tostring(h1, encoding=unicode, method='text').strip()
    tdiv = root.xpath('//h1[contains(@class, "parseasinTitle")]')[0]
    actual_title = tdiv.xpath('descendant::*[@id="btAsinTitle"]')
    if actual_title:
        title = tostring(actual_title[0], encoding=unicode, method='text').strip()
    else:
        title = tostring(tdiv, encoding=unicode, method='text').strip()
    ans = re.sub(r'[(\[].*[)\]]', '', title).strip()
    if not ans:
        ans = title.rpartition('[')[0].strip()
    return ans


def _parse_authors(root):
    """Parse the authors of a book from its HTML."""
    matches = tuple(root.xpath('//a[@href]/span[@class="a-size-medium a-link-child"]'))
    if not matches:
        matches = tuple(root.xpath('//a[@href]'))
    if matches:
        authors = [tostring(x, encoding=unicode, method='text').strip() for x in matches]
        return [a for a in authors if a]

    x = '//h1[contains(@class, "parseasinTitle")]/following-sibling::span/*[(name()="a" and @href) or (name()="span" and @class="contributorNameTrigger")]'
    aname = root.xpath(x)
    if not aname:
        aname = root.xpath('''
        //h1[contains(@class, "parseasinTitle")]/following-sibling::*[(name()="a" and @href) or (name()="span" and @class="contributorNameTrigger")]
                ''')
    for x in aname:
        x.tail = ''
    authors = [tostring(x, encoding=unicode, method='text').strip() for x in aname]
    authors = [a for a in authors if a]
    return authors


def _parse_rating(root):
    """Parse the rating of a book from its HTML."""
    for x in root.xpath('//div[@id="cpsims-feature" or @id="purchase-sims-feature" or @id="rhf"]'):
        x.getparent().remove(x)

    rating_paths = ('//div[@data-feature-name="averageCustomerReviews" or @id="averageCustomerReviews"]',
                    '//div[@class="jumpBar"]/descendant::span[contains(@class,"asinReviewsSummary")]',
                    '//div[@class="buying"]/descendant::span[contains(@class,"asinReviewsSummary")]',
                    '//span[@class="crAvgStars"]/descendant::span[contains(@class,"asinReviewsSummary")]')
    ratings = None
    for p in rating_paths:
        ratings = root.xpath(p)
        if ratings:
            break
    if ratings:
        for elem in ratings[0].xpath('descendant::*[@title]'):
            t = elem.get('title').strip()
            if self.domain == 'cn':
                m = self.ratings_pat_cn.match(t)
                if m is not None:
                    return float(m.group(1))
            else:
                m = self.ratings_pat.match(t)
                if m is not None:
                    return float(m.group(1)) / float(m.group(3)) * 5


def _parse_comments(root, raw):
    """Parse the comments of a book from its HTML."""
    ans = ''
    ns = tuple(root.xpath('#bookDescription_feature_div noscript'))
    if ns:
        ns = ns[0]
        if len(ns) == 0 and ns.text:
            import html5lib
            ns = html5lib.parseFragment('<div>%s</div>' % (ns.text), treebuilder='lxml', namespaceHTMLElements=False)[0]
        else:
            ns.tag = 'div'
        ans = _render_comments(ns)
    else:
        desc = root.xpath('//div[@id="ps-content"]/div[@class="content"]')
        if desc:
            ans = _render_comments(desc[0])

    desc = root.xpath('//div[@id="productDescription"]/*[@class="content"]')
    if desc:
        ans += _render_comments(desc[0])
    else:
        m = re.search(b'var\s+iframeContent\s*=\s*"([^"]+)"', raw)
        if m is not None:
            try:
                text = unquote(m.group(1)).decode('utf-8')
                nr = html5lib.parse(text, treebuilder='lxml', namespaceHTMLElements=False)
                desc = nr.xpath('//div[@id="productDescription"]/*[@class="content"]')
                if desc:
                    ans += _render_comments(desc[0])
            except Exception as e:
                self.log.warn('Parsing of obfuscated product description failed with error: %s' % as_unicode(e))

    return ans


def _render_comments(desc):
    """Render the comments of a book from its HTML."""
    from calibre.library.comments import sanitize_comments_html

    for c in desc.xpath('descendant::noscript'):
        c.getparent().remove(c)
    for c in desc.xpath('descendant::*[@class="seeAll" or @class="emptyClear" or @id="collapsePS" or @id="expandPS"]'):
        c.getparent().remove(c)
    for b in desc.xpath('descendant::b[@style]'):
        s = b.get('style', '')
        if 'color' in s:
            b.tag = 'span'
            del b.attrib['style']

    for a in desc.xpath('descendant::a[@href]'):
        del a.attrib['href']
        a.tag = 'span'
    desc = tostring(desc, method='html', encoding=unicode).strip()

    desc = desc.replace('\ufffd', "'")
    desc = re.sub(r'<([a-zA-Z0-9]+)\s[^>]+>', r'<\1>', desc)
    desc = re.sub(r'(?s)<em>--This text ref.*?</em>', '', desc)
    desc = re.sub(r'(?s)<!--.*?-->', '', desc)
    return sanitize_comments_html(desc)


def _parse_series(root):
    """Parse the series of a book from its HTML."""
    ans = (None, None)

    series = root.xpath('//div[@data-feature-name="seriesTitle"]')
    if series:
        series = series[0]
        spans = series.xpath('./span')
        if spans:
            raw = tostring(spans[0], encoding=unicode, method='text', with_tail=False).strip()
            m = re.search('\s+([0-9.]+)$', raw.strip())
            if m is not None:
                series_index = float(m.group(1))
                s = series.xpath('./a[@id="series-page-link"]')
                if s:
                    series = tostring(s[0], encoding=unicode, method='text', with_tail=False).strip()
                    if series:
                        ans = (series, series_index)
    if ans == (None, None):
        for span in root.xpath('//div[@id="aboutEbooksSection"]//li/span'):
            text = (span.text or '').strip()
            m = re.match('Book\s+([0-9.]+)', text)
            if m is not None:
                series_index = float(m.group(1))
                a = span.xpath('./a[@href]')
                if a:
                    series = tostring(a[0], encoding=unicode, method='text', with_tail=False).strip()
                    if series:
                        ans = (series, series_index)
    if ans == (None, None):
        for b in root.xpath('//div[@id="reviewFeatureGroup"]/span/b'):
            text = (b.text or '').strip()
            m = re.match('Book\s+([0-9.]+)', text)
            if m is not None:
                series_index = float(m.group(1))
                a = b.getparent().xpath('./a[@href]')
                if a:
                    series = tostring(a[0], encoding=unicode, method='text', with_tail=False).partition('(')[0].strip()
                    if series:
                        ans = series, series_index

    if ans == (None, None):
        desc = root.xpath('//div[@id="ps-content"]/div[@class="buying"]')
        if desc:
            raw = tostring(desc[0], method='text', encoding=unicode)
            raw = re.sub(r'\s+', ' ', raw)
            match = self.series_pat.search(raw)
            if match is not None:
                s, i = match.group('series'), float(match.group('index'))
                if s:
                    ans = (s, i)
    if ans[0]:
        ans = (re.sub(r'\s+Series$', '', ans[0]).strip(), ans[1])
        ans = (re.sub(r'\(.+?\s+Series\)$', '', ans[0]).strip(), ans[1])
    return ans


def _parse_tags(root):
    """Parse the tags of a book from its HTML."""
    ans = []
    exclude_tokens = {'kindle', 'a-z'}
    exclude = {'special features', 'by authors', 'authors & illustrators', 'books', 'new; used & rental textbooks'}
    seen = set()
    for li in root.xpath(self.tags_xpath):
        for i, a in enumerate(li.iterdescendants('a')):
            if i > 0:
                raw = (a.text or '').strip().replace(',', ';')
                lraw = icu_lower(raw)
                tokens = frozenset(lraw.split())
                if raw and lraw not in exclude and not tokens.intersection(exclude_tokens) and lraw not in seen:
                    ans.append(raw)
                    seen.add(lraw)
    return ans


def _parse_cover(root, raw=b""):
    """Parse the cover of a book from its HTML."""
    import json
    imgpat = re.compile(r"""'imageGalleryData'\s*:\s*(\[\s*{.+})""")
    for script in root.xpath('//script'):
        m = imgpat.search(script.text or '')
        if m is not None:
            try:
                return json.loads(m.group(1))[0]['mainUrl']
            except Exception:
                continue

    def clean_img_src(src):
        parts = src.split('/')
        if len(parts) > 3:
            bn = parts[-1]
            sparts = bn.split('_')
            if len(sparts) > 2:
                bn = re.sub(r'\.\.jpg$', '.jpg', (sparts[0] + sparts[-1]))
                return ('/'.join(parts[:-1])) + '/' + bn

    imgpat2 = re.compile(r'var imageSrc = "([^"]+)"')
    for script in root.xpath('//script'):
        m = imgpat2.search(script.text or '')
        if m is not None:
            src = m.group(1)
            url = clean_img_src(src)
            if url:
                return url

    imgs = root.xpath('//img[(@id="prodImage" or @id="original-main-image" or @id="main-image" or @id="main-image-nonjs") and @src]')
    if not imgs:
        imgs = (root.xpath('//div[@class="main-image-inner-wrapper"]/img[@src]') or
                root.xpath('//div[@id="main-image-container" or @id="ebooks-main-image-container"]//img[@src]') or
                root.xpath('//div[@id="mainImageContainer"]//img[@data-a-dynamic-image]'))
        for img in imgs:
            try:
                idata = json.loads(img.get('data-a-dynamic-image'))
            except Exception:
                imgs = ()
            else:
                mwidth = 0
                try:
                    url = None
                    for iurl, (width, height) in idata.iteritems():
                        if width > mwidth:
                            mwidth = width
                            url = iurl
                    return url
                except Exception:
                    pass

    for img in imgs:
        src = img.get('src')
        if 'data:' in src:
            continue
        if 'loading-' in src:
            js_img = re.search(br'"largeImage":"(https?://[^"]+)"', raw)
            if js_img:
                src = js_img.group(1).decode('utf-8')
        if ('/no-image-avail' not in src and 'loading-' not in src and '/no-img-sm' not in src):
            self.log('Found image: %s' % src)
            url = clean_img_src(src)
            if url:
                return url


def _parse_new_details(root, mi, non_hero):
    """Parse the new details of a book from its HTML."""
    table = non_hero.xpath('descendant::table')[0]
    for tr in table.xpath('descendant::tr'):
        cells = tr.xpath('descendant::td')
        if len(cells) == 2:
            name = tostring(cells[0], encoding=unicode, method='text').strip()
            val = tostring(cells[1], encoding=unicode, method='text').strip()
            if not val:
                continue
            if name in self.language_names:
                ans = self.lang_map.get(val, None)
                if not ans:
                    ans = canonicalize_lang(val)
                if ans:
                    mi.language = ans
            elif name in self.publisher_names:
                pub = val.partition(';')[0].partition('(')[0].strip()
                if pub:
                    mi.publisher = pub
                date = val.rpartition('(')[-1].replace(')', '').strip()
                try:
                    from calibre.utils.date import parse_only_date
                    date = self.delocalize_datestr(date)
                    mi.pubdate = parse_only_date(date, assume_utc=True)
                except:
                    self.log.exception('Failed to parse pubdate: %s' % val)
            elif name in {'ISBN', 'ISBN-10', 'ISBN-13'}:
                ans = check_isbn(val)
                if ans:
                    self.isbn = mi.isbn = ans


def _parse_isbn(pd):
    """Parse the ISBN of a book from its HTML."""
    items = pd.xpath('descendant::*[starts-with(text(), "ISBN")]')
    if not items:
        items = pd.xpath('descendant::b[contains(text(), "ISBN:")]')
    for x in reversed(items):
        if x.tail:
            ans = check_isbn(x.tail.strip())
            if ans:
                return ans


def _parse_publisher(pd):
    """Parse the publisher of a book from its HTML."""
    for x in reversed(pd.xpath(self.publisher_xpath)):
        if x.tail:
            ans = x.tail.partition(';')[0]
            return ans.partition('(')[0].strip()


def _parse_pubdate(pd):
    """Parse the publication date of a book from its HTML."""
    for x in reversed(pd.xpath(self.publisher_xpath)):
        if x.tail:
            from calibre.utils.date import parse_only_date
            ans = x.tail
            date = ans.rpartition('(')[-1].replace(')', '').strip()
            date = self.delocalize_datestr(date)
            return parse_only_date(date, assume_utc=True)


def _parse_language(pd):
    """Parse the language of a book from its HTML."""
    for x in reversed(pd.xpath(self.language_xpath)):
        if x.tail:
            raw = x.tail.strip().partition(',')[0].strip()
            ans = self.lang_map.get(raw, None)
            if ans:
                return ans
            ans = canonicalize_lang(ans)
            if ans:
                return ans


class Worker(Thread):
    def __init__(self, url, result_queue, browser, log, relevance, domain, plugin, timeout=20, testing=False, preparsed_root=None, cover_url_processor=None, filter_result=None):
        Thread.__init__(self)
        self.cover_url_processor = cover_url_processor
        self.preparsed_root = preparsed_root
        self.daemon = True
        self.testing = testing
        self.url, self.result_queue = url, result_queue
        self.log, self.timeout = log, timeout
        self.filter_result = filter_result or (lambda x, log: True)
        self.relevance, self.plugin = relevance, plugin
        self.browser = browser
        self.cover_url = self.amazon_id = self.isbn = None
        self.domain = domain
        from lxml.html import tostring
        self.tostring = tostring

        months = {
            'de': {
                1: ['jän', 'januar'],
                2: ['februar'],
                3: ['märz'],
                5: ['mai'],
                6: ['juni'],
                7: ['juli'],
                10: ['okt', 'oktober'],
                12: ['dez', 'dezember']
            },
            'it': {
                1: ['gennaio', 'enn'],
                2: ['febbraio', 'febbr'],
                3: ['marzo'],
                4: ['aprile'],
                5: ['maggio', 'magg'],
                6: ['giugno'],
                7: ['luglio'],
                8: ['agosto', 'ag'],
                9: ['settembre', 'sett'],
                10: ['ottobre', 'ott'],
                11: ['novembre'],
                12: ['dicembre', 'dic'],
            },
            'fr': {
                1: ['janv'],
                2: ['févr'],
                3: ['mars'],
                4: ['avril'],
                5: ['mai'],
                6: ['juin'],
                7: ['juil'],
                8: ['août'],
                9: ['sept'],
                12: ['déc'],
            },
            'br': {
                1: ['janeiro'],
                2: ['fevereiro'],
                3: ['março'],
                4: ['abril'],
                5: ['maio'],
                6: ['junho'],
                7: ['julho'],
                8: ['agosto'],
                9: ['setembro'],
                10: ['outubro'],
                11: ['novembro'],
                12: ['dezembro'],
            },
            'es': {
                1: ['enero'],
                2: ['febrero'],
                3: ['marzo'],
                4: ['abril'],
                5: ['mayo'],
                6: ['junio'],
                7: ['julio'],
                8: ['agosto'],
                9: ['septiembre', 'setiembre'],
                10: ['octubre'],
                11: ['noviembre'],
                12: ['diciembre'],
            },
            'jp': {
                1: [u'1月'],
                2: [u'2月'],
                3: [u'3月'],
                4: [u'4月'],
                5: [u'5月'],
                6: [u'6月'],
                7: [u'7月'],
                8: [u'8月'],
                9: [u'9月'],
                10: [u'10月'],
                11: [u'11月'],
                12: [u'12月'],
            },
            'nl': {
                1: ['januari'], 2: ['februari'], 3: ['maart'], 5: ['mei'], 6: ['juni'], 7: ['juli'], 8: ['augustus'], 10: ['oktober'],
            }

        }
        self.english_months = [None, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        self.months = months.get(self.domain, {})

        self.pd_xpath = '''
            //h2[text()="Product Details" or \
                 text()="Produktinformation" or \
                 text()="Dettagli prodotto" or \
                 text()="Product details" or \
                 text()="Détails sur le produit" or \
                 text()="Detalles del producto" or \
                 text()="Detalhes do produto" or \
                 text()="Productgegevens" or \
                 text()="基本信息" or \
                 starts-with(text(), "登録情報")]/../div[@class="content"]
            '''
        self.publisher_xpath = '''
            descendant::*[starts-with(text(), "Publisher:") or \
                    starts-with(text(), "Verlag:") or \
                    starts-with(text(), "Editore:") or \
                    starts-with(text(), "Editeur") or \
                    starts-with(text(), "Editor:") or \
                    starts-with(text(), "Editora:") or \
                    starts-with(text(), "Uitgever:") or \
                    starts-with(text(), "出版社:")]
            '''
        self.publisher_names = {'Publisher', 'Uitgever', 'Verlag',
                                'Editore', 'Editeur', 'Editor', 'Editora', '出版社'}

        self.language_xpath =    '''
            descendant::*[
                starts-with(text(), "Language:") \
                or text() = "Language" \
                or text() = "Sprache:" \
                or text() = "Lingua:" \
                or text() = "Idioma:" \
                or starts-with(text(), "Langue") \
                or starts-with(text(), "言語") \
                or starts-with(text(), "语种")
                ]
            '''
        self.language_names = {'Language', 'Sprache',
                               'Lingua', 'Idioma', 'Langue', '言語', 'Taal', '语种'}

        self.tags_xpath = '''
            descendant::h2[
                text() = "Look for Similar Items by Category" or
                text() = "Ähnliche Artikel finden" or
                text() = "Buscar productos similares por categoría" or
                text() = "Ricerca articoli simili per categoria" or
                text() = "Rechercher des articles similaires par rubrique" or
                text() = "Procure por itens similares por categoria" or
                text() = "関連商品を探す"
            ]/../descendant::ul/li
        '''

        self.ratings_pat = re.compile(
            r'([0-9.]+) ?(out of|von|van|su|étoiles sur|つ星のうち|de un máximo de|de) ([\d\.]+)( (stars|Sternen|stelle|estrellas|estrelas|sterren)){0,1}')
        self.ratings_pat_cn = re.compile('平均([0-9.]+)')

        lm = {
            'eng': ('English', 'Englisch', 'Engels'),
            'fra': ('French', 'Français'),
            'ita': ('Italian', 'Italiano'),
            'deu': ('German', 'Deutsch'),
            'spa': ('Spanish', 'Espa\xf1ol', 'Espaniol'),
            'jpn': ('Japanese', u'日本語'),
            'por': ('Portuguese', 'Português'),
            'nld': ('Dutch', 'Nederlands',),
            'chs': ('Chinese', u'中文', u'简体中文'),
        }
        self.lang_map = {}
        for code, names in lm.iteritems():
            for name in names:
                self.lang_map[name] = code

        self.series_pat = re.compile(
            r'''
                \|\s*              # Prefix
                (Series)\s*:\s*    # Series declaration
                (?P<series>.+?)\s+  # The series name
                \((Book)\s*    # Book declaration
                (?P<index>[0-9.]+) # Series index
                \s*\)
                ''', re.X)

    def delocalize_datestr(self, raw):
        if self.domain == 'cn':
            return raw.replace('年', '-').replace('月', '-').replace('日', '')
        if not self.months:
            return raw
        ans = raw.lower()
        for i, vals in self.months.iteritems():
            for x in vals:
                ans = ans.replace(x, self.english_months[i])
        ans = ans.replace(' de ', ' ')
        return ans

    def run(self):
        try:
            self.get_details()
        except:
            self.log.exception('get_details failed for url: %r' % self.url)

    def get_details(self):
        if self.preparsed_root is None:
            raw, root, selector = parse_details_page(self.url, self.log, self.timeout, self.browser, self.domain)
        else:
            raw, root, selector = self.preparsed_root

        from css_selectors import Select
        self.selector = Select(root)
        self.parse_details(raw, root)

    def parse_details(self, raw, root):
        asin = parse_asin(root, self.log, self.url)
        if not asin and root.xpath('//form[@action="/errors/validateCaptcha"]'):
            raise CaptchaError('Amazon returned a CAPTCHA page, probably because you downloaded too many books. Wait for some time and try again.')
        if self.testing:
            import tempfile
            import uuid
            with tempfile.NamedTemporaryFile(prefix=(asin or str(uuid.uuid4())) + '_',
                                             suffix='.html', delete=False) as f:
                f.write(raw)
            print ('Downloaded html for', asin, 'saved in', f.name)

        try:
            title = _parse_title(root)
        except:
            self.log.exception('Error parsing title for url: %r' % self.url)
            title = None

        try:
            authors = _parse_authors(root)
        except:
            self.log.exception('Error parsing authors for url: %r' % self.url)
            authors = []

        if not title or not authors or not asin:
            self.log.error('Could not find title/authors/asin for %r' % self.url)
            self.log.error('ASIN: %r Title: %r Authors: %r' % (asin, title, authors))
            return

        mi = Metadata(title, authors)
        idtype = 'amazon' if self.domain == 'com' else 'amazon_' + self.domain
        mi.set_identifier(idtype, asin)
        self.amazon_id = asin

        try:
            mi.rating = _parse_rating(root)
        except:
            self.log.exception('Error parsing ratings for url: %r' % self.url)

        try:
            mi.comments = _parse_comments(root, raw)
        except:
            self.log.exception('Error parsing comments for url: %r' % self.url)

        try:
            series, series_index = _parse_series(root)
            if series:
                mi.series, mi.series_index = series, series_index
            elif self.testing:
                mi.series, mi.series_index = 'Dummy series for testing', 1
        except:
            self.log.exception('Error parsing series for url: %r' % self.url)

        try:
            mi.tags = _parse_tags(root)
        except:
            self.log.exception('Error parsing tags for url: %r' % self.url)

        try:
            self.cover_url = _parse_cover(root, raw)
        except:
            self.log.exception('Error parsing cover for url: %r' % self.url)
        if self.cover_url_processor is not None and self.cover_url.startswith('/'):
            self.cover_url = self.cover_url_processor(self.cover_url)
        mi.has_cover = bool(self.cover_url)

        non_hero = tuple(self.selector('div#bookDetails_container_div div#nonHeroSection'))
        if non_hero:
            try:
                _parse_new_details(root, mi, non_hero[0])
            except:
                self.log.exception('Failed to parse new-style book details section')
        else:
            pd = root.xpath(self.pd_xpath)
            if pd:
                pd = pd[0]

                try:
                    isbn = _parse_isbn(pd)
                    if isbn:
                        self.isbn = mi.isbn = isbn
                except:
                    self.log.exception('Error parsing ISBN for url: %r' % self.url)

                try:
                    mi.publisher = _parse_publisher(pd)
                except:
                    self.log.exception('Error parsing publisher for url: %r' % self.url)

                try:
                    mi.pubdate = _parse_pubdate(pd)
                except:
                    self.log.exception('Error parsing publish date for url: %r' % self.url)

                try:
                    lang = _parse_language(pd)
                    if lang:
                        mi.language = lang
                except:
                    self.log.exception('Error parsing language for url: %r' % self.url)

            else:
                self.log.warning('Failed to find product description for url: %r' % self.url)

        mi.source_relevance = self.relevance

        if self.amazon_id:
            if self.isbn:
                self.plugin.cache_isbn_to_identifier(self.isbn, self.amazon_id)
            if self.cover_url:
                self.plugin.cache_identifier_to_cover_url(self.amazon_id, self.cover_url)

        self.plugin.clean_downloaded_metadata(mi)

        if self.filter_result(mi, self.log):
            self.result_queue.put(mi)

    def totext(self, elem):
        return self.tostring(elem, encoding=unicode, method='text').strip()


class Amazon(Source):
    # ... rest of the class remains the same ...