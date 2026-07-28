def properties_for_id_with_scheme(item_id, prefixes, refines):
    """Return properties for the given item_id, including scheme information."""
    if not item_id:
        return {}
    
    ans = {}
    for elem in refines[item_id]:
        key = elem.get('property')
        if not key:
            continue
        
        val = (elem.text or '').strip()
        if not val:
            continue
        
        scheme = elem.get('scheme') or None
        scheme_ns = None
        if scheme is not None:
            scheme_ns = get_scheme_ns(scheme, prefixes)
            scheme = get_scheme_value(scheme, prefixes)
        
        ans[key] = (scheme_ns, scheme, val)
    
    return ans


def get_scheme_ns(scheme, prefixes):
    """Return the namespace for the given scheme."""
    p, r = scheme.partition(':')[::2]
    if p and r:
        ns = prefixes.get(p)
        if ns:
            return ns
    return None


def get_scheme_value(scheme, prefixes):
    """Return the value for the given scheme."""
    p, r = scheme.partition(':')[::2]
    if p and r:
        return r
    return scheme


def properties_for_id(item_id, refines):
    """Return properties for the given item_id."""
    if not item_id:
        return {}
    
    ans = {}
    for elem in refines[item_id]:
        key = elem.get('property')
        if not key:
            continue
        
        val = (elem.text or '').strip()
        if not val:
            continue
        
        ans[key] = val
    
    return ans


def read_identifiers(root, prefixes, refines):
    """Read identifiers from the given root."""
    ans = defaultdict(list)
    for ident in XPath('./opf:metadata/dc:identifier')(root):
        val = (ident.text or '').strip()
        if val:
            scheme, val = parse_identifier(ident, val, refines)
            if scheme and val:
                ans[scheme].append(val)
    
    return ans


def parse_identifier(ident, val, refines):
    """Parse the identifier and return the scheme and value."""
    idid = ident.get('id')
    refines = refines[idid]
    scheme = None
    lval = val.lower()

    def finalize(scheme, val):
        if not scheme or not val:
            return None, None
        scheme = scheme.lower()
        if scheme in ('http', 'https'):
            return None, None
        if scheme.startswith('isbn'):
            scheme = 'isbn'
        if scheme == 'isbn':
            val = val.split(':')[-1]
            val = check_isbn(val)
            if val is None:
                return None, None
        return scheme, val

    # Try the OPF 2 style opf:scheme attribute, which will be present, for
    # example, in EPUB 3 files that have had their metadata set by an
    # application that only understands EPUB 2.
    scheme = ident.get(OPF('scheme'))
    if scheme and not lval.startswith('urn:'):
        return finalize(scheme, val)

    # Technically, we should be looking for refines that define the scheme, but
    # the IDioticPF created such a bad spec that they got their own
    # examples wrong, so I cannot be bothered doing this.
    # http://www.idpf.org/epub/301/spec/epub-publications-errata/

    # Parse the value for the scheme
    if lval.startswith('urn:'):
        val = val[4:]

    prefix, rest = val.partition(':')[::2]
    return finalize(prefix, rest)


def set_identifiers(root, prefixes, refines, new_identifiers, force_identifiers=False):
    """Set identifiers for the given root."""
    uid = root.get('unique-identifier')
    package_identifier = None
    for ident in XPath('./opf:metadata/dc:identifier')(root):
        if uid is not None and uid == ident.get('id'):
            package_identifier = ident
            continue
        val = (ident.text or '').strip()
        if not val:
            ident.getparent().remove(ident)
            continue
        scheme, val = parse_identifier(ident, val, refines)
        if not scheme or not val or force_identifiers or scheme in new_identifiers:
            remove_element(ident, refines)
            continue
    metadata = XPath('./opf:metadata')(root)[0]
    for scheme, val in new_identifiers.iteritems():
        ident = metadata.makeelement(DC('identifier'))
        ident.text = '%s:%s' % (scheme, val)
        if package_identifier is None:
            metadata.append(ident)
        else:
            p = package_identifier.getparent()
            p.insert(p.index(package_identifier), ident)


def read_title(root, prefixes, refines):
    """Read the title from the given root."""
    main_title = find_main_title(root, refines)
    return None if main_title is None else main_title.text.strip()


def find_main_title(root, refines, remove_blanks=False):
    """Find the main title in the given root."""
    first_title = main_title = None
    for title in XPath('./opf:metadata/dc:title')(root):
        if not title.text or not title.text.strip():
            if remove_blanks:
                remove_element(title, refines)
            continue
        if first_title is None:
            first_title = title
        props = properties_for_id(title.get('id'), refines)
        if props.get('title-type') == 'main':
            main_title = title
            break
    else:
        main_title = first_title
    return main_title


def set_title(root, prefixes, refines, title, title_sort=None):
    """Set the title for the given root."""
    main_title = find_main_title(root, refines, remove_blanks=True)
    if main_title is None:
        m = XPath('./opf:metadata')(root)[0]
        main_title = m.makeelement('dc:title')
        m.insert(0, main_title)
    main_title.text = title or None
    ts = [refdef('file-as', title_sort)] if title_sort else ()
    set_refines(main_title, refines, refdef('title-type', 'main'), *ts)
    for m in XPath('./opf:metadata/opf:meta[@name="calibre:title_sort"]')(root):
        remove_element(m, refines)


def read_languages(root, prefixes, refines):
    """Read languages from the given root."""
    ans = []
    for lang in XPath('./opf:metadata/dc:language')(root):
        val = canonicalize_lang((lang.text or '').strip())
        if val and val not in ans and val != 'und':
            ans.append(val)
    return uniq(ans)


def set_languages(root, prefixes, refines, languages):
    """Set languages for the given root."""
    opf_languages = []
    for lang in XPath('./opf:metadata/dc:language')(root):
        remove_element(lang, refines)
        val = (lang.text or '').strip()
        if val:
            opf_languages.append(val)
    languages = filter(lambda x: x and x != 'und', normalize_languages(opf_languages, languages))
    if not languages:
        # EPUB spec says dc:language is required
        languages = ['und']
    metadata = XPath('./opf:metadata')(root)[0]
    for lang in uniq(languages):
        l = metadata.makeelement(DC('language'))
        l.text = lang
        metadata.append(l)


def read_authors(root, prefixes, refines):
    """Read authors from the given root."""
    roled_authors, unroled_authors = [], []

    def author(item, props, val):
        aus = None
        file_as = props.get('file-as')
        if file_as:
            aus = file_as[-1]
        else:
            aus = item.get(OPF('file-as')) or None
        return Author(normalize_whitespace(val), normalize_whitespace(aus))

    for item in XPath('./opf:metadata/dc:creator')(root):
        val = (item.text or '').strip()
        if val:
            props = properties_for_id_with_scheme(item.get('id'), prefixes, refines)
            role = props.get('role')
            opf_role = item.get(OPF('role'))
            if role:
                if is_relators_role(props, 'aut'):
                    roled_authors.append(author(item, props, val))
            elif opf_role:
                if opf_role.lower() == 'aut':
                    roled_authors.append(author(item, props, val))
            else:
                unroled_authors.append(author(item, props, val))

    return uniq(roled_authors or unroled_authors)


def set_authors(root, prefixes, refines, authors):
    """Set authors for the given root."""
    ensure_prefix(root, prefixes, 'marc')
    for item in XPath('./opf:metadata/dc:creator')(root):
        props = properties_for_id_with_scheme(item.get('id'), prefixes, refines)
        opf_role = item.get(OPF('role'))
        if (opf_role and opf_role.lower() != 'aut') or (props.get('role') and not is_relators_role(props, 'aut')):
            continue
        remove_element(item, refines)
    metadata = XPath('./opf:metadata')(root)[0]
    for author in authors:
        if author.name:
            a = metadata.makeelement(DC('creator'))
            aid = ensure_id(a)
            a.text = author.name
            metadata.append(a)
            m = metadata.makeelement(OPF('meta'), attrib={'refines':'#'+aid, 'property':'role', 'scheme':'marc:relators'})
            m.text = 'aut'
            metadata.append(m)
            if author.sort:
                m = metadata.makeelement(OPF('meta'), attrib={'refines':'#'+aid, 'property':'file-as'})
                m.text = author.sort
                metadata.append(m)


def is_relators_role(props, q):
    """Check if the given props contain the relators role."""
    role = props.get('role')
    if role:
        scheme_ns, scheme, role = role
        return role.lower() == q and (scheme_ns is None or (scheme_ns, scheme) == (reserved_prefixes['marc'], 'relators'))
    return False


def read_book_producers(root, prefixes, refines):
    """Read book producers from the given root."""
    ans = []
    for item in XPath('./opf:metadata/dc:contributor')(root):
        val = (item.text or '').strip()
        if val:
            props = properties_for_id_with_scheme(item.get('id'), prefixes, refines)
            role = props.get('role')
            opf_role = item.get(OPF('role'))
            if role:
                if is_relators_role(props, 'bkp'):
                    ans.append(normalize_whitespace(val))
            elif opf_role and opf_role.lower() == 'bkp':
                ans.append(normalize_whitespace(val))
    return ans


def set_book_producers(root, prefixes, refines, producers):
    """Set book producers for the given root."""
    for item in XPath('./opf:metadata/dc:contributor')(root):
        props = properties_for_id_with_scheme(item.get('id'), prefixes, refines)
        opf_role = item.get(OPF('role'))
        if (opf_role and opf_role.lower() != 'bkp') or (props.get('role') and not is_relators_role(props, 'bkp')):
            continue
        remove_element(item, refines)
    metadata = XPath('./opf:metadata')(root)[0]
    for bkp in producers:
        if bkp:
            a = metadata.makeelement(DC('contributor'))
            aid = ensure_id(a)
            a.text = bkp
            metadata.append(a)
            m = metadata.makeelement(OPF('meta'), attrib={'refines':'#'+aid, 'property':'role', 'scheme':'marc:relators'})
            m.text = 'bkp'
            metadata.append(m)


def read_pubdate(root, prefixes, refines):
    """Read the publication date from the given root."""
    for date in XPath('./opf:metadata/dc:date')(root):
        val = (date.text or '').strip()
        if val:
            try:
                return parse_date(val)
            except Exception:
                continue


def set_pubdate(root, prefixes, refines, val):
    """Set the publication date for the given root."""
    for date in XPath('./opf:metadata/dc:date')(root):
        remove_element(date, refines)
    if not is_date_undefined(val):
        val = isoformat(val)
        m = XPath('./opf:metadata')(root)[0]
        d = m.makeelement(DC('date'))
        d.text = val
        m.append(d)


def parse_date(raw, is_w3cdtf=False):
    """Parse the given date string."""
    raw = raw.strip()
    if is_w3cdtf:
        ans = parse_iso8601(raw, assume_utc=True)
        if 'T' not in raw and ' ' not in raw:
            ans = fix_only_date(ans)
    else:
        ans = parse_date_(raw, assume_utc=True)
        if ' ' not in raw and 'T' not in raw and (ans.hour, ans.minute, ans.second) == (0, 0, 0):
            ans = fix_only_date(ans)
    return ans


def read_timestamp(root, prefixes, refines):
    """Read the timestamp from the given root."""
    pq = '%s:timestamp' % CALIBRE_PREFIX
    sq = '%s:w3cdtf' % reserved_prefixes['dcterms']
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        val = (meta.text or '').strip()
        if val:
            prop = expand_prefix(meta.get('property'), prefixes)
            if prop.lower() == pq:
                scheme = expand_prefix(meta.get('scheme'), prefixes).lower()
                try:
                    return parse_date(val, is_w3cdtf=scheme == sq)
                except Exception:
                    continue
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:timestamp"]')(root):
        val = meta.get('content')
        if val:
            try:
                return parse_date(val, is_w3cdtf=True)
            except Exception:
                continue


def set_timestamp(root, prefixes, refines, val):
    """Set the timestamp for the given root."""
    ensure_prefix(root, prefixes, 'calibre', CALIBRE_PREFIX)
    ensure_prefix(root, prefixes, 'dcterms')
    pq = '%s:timestamp' % CALIBRE_PREFIX
    for meta in XPath('./opf:metadata/opf:meta')(root):
        prop = expand_prefix(meta.get('property'), prefixes)
        if prop.lower() == pq or meta.get('name') == 'calibre:timestamp':
            remove_element(meta, refines)
    if not is_date_undefined(val):
        val = isoformat(val)
        m = XPath('./opf:metadata')(root)[0]
        d = m.makeelement(OPF('meta'), attrib={'property':'calibre:timestamp', 'scheme':'dcterms:W3CDTF'})
        d.text = val
        m.append(d)


def read_last_modified(root, prefixes, refines):
    """Read the last modified date from the given root."""
    pq = '%s:modified' % reserved_prefixes['dcterms']
    sq = '%s:w3cdtf' % reserved_prefixes['dcterms']
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        val = (meta.text or '').strip()
        if val:
            prop = expand_prefix(meta.get('property'), prefixes)
            if prop.lower() == pq:
                scheme = expand_prefix(meta.get('scheme'), prefixes).lower()
                try:
                    return parse_date(val, is_w3cdtf=scheme == sq)
                except Exception:
                    continue


def read_comments(root, prefixes, refines):
    """Read comments from the given root."""
    ans = ''
    for dc in XPath('./opf:metadata/dc:description')(root):
        if dc.text:
            ans += '\n' + dc.text.strip()
    return ans.strip()


def set_comments(root, prefixes, refines, val):
    """Set comments for the given root."""
    for dc in XPath('./opf:metadata/dc:description')(root):
        remove_element(dc, refines)
    m = XPath('./opf:metadata')(root)[0]
    if val:
        val = val.strip()
        if val:
            c = m.makeelement(DC('description'))
            c.text = val
            m.append(c)


def read_publisher(root, prefixes, refines):
    """Read the publisher from the given root."""
    for dc in XPath('./opf:metadata/dc:publisher')(root):
        if dc.text:
            return dc.text


def set_publisher(root, prefixes, refines, val):
    """Set the publisher for the given root."""
    for dc in XPath('./opf:metadata/dc:publisher')(root):
        remove_element(dc, refines)
    m = XPath('./opf:metadata')(root)[0]
    if val:
        val = val.strip()
        if val:
            c = m.makeelement(DC('publisher'))
            c.text = normalize_whitespace(val)
            m.append(c)


def read_tags(root, prefixes, refines):
    """Read tags from the given root."""
    ans = []
    for dc in XPath('./opf:metadata/dc:subject')(root):
        if dc.text:
            ans.extend(map(normalize_whitespace, dc.text.split(',')))
    return uniq(filter(None, ans))


def set_tags(root, prefixes, refines, val):
    """Set tags for the given root."""
    for dc in XPath('./opf:metadata/dc:subject')(root):
        remove_element(dc, refines)
    m = XPath('./opf:metadata')(root)[0]
    if val:
        val = uniq(filter(None, val))
        for x in val:
            c = m.makeelement(DC('subject'))
            c.text = normalize_whitespace(x)
            if c.text:
                m.append(c)


def read_rating(root, prefixes, refines):
    """Read the rating from the given root."""
    pq = '%s:rating' % CALIBRE_PREFIX
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        val = (meta.text or '').strip()
        if val:
            prop = expand_prefix(meta.get('property'), prefixes)
            if prop.lower() == pq:
                try:
                    return float(val)
                except Exception:
                    continue
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:rating"]')(root):
        val = meta.get('content')
        if val:
            try:
                return float(val)
            except Exception:
                continue


def set_rating(root, prefixes, refines, val):
    """Set the rating for the given root."""
    pq = '%s:rating' % CALIBRE_PREFIX
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:rating"]')(root):
        remove_element(meta, refines)
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        prop = expand_prefix(meta.get('property'), prefixes)
        if prop.lower() == pq:
            remove_element(meta, refines)
    if val:
        ensure_prefix(root, prefixes, 'calibre', CALIBRE_PREFIX)
        m = XPath('./opf:metadata')(root)[0]
        d = m.makeelement(OPF('meta'), attrib={'property':'calibre:rating'})
        d.text = '%.2g' % val
        m.append(d)


def read_series(root, prefixes, refines):
    """Read the series from the given root."""
    series_index = 1.0
    for meta in XPath('./opf:metadata/opf:meta[@property="belongs-to-collection" and @id]')(root):
        val = (meta.text or '').strip()
        if val:
            props = properties_for_id(meta.get('id'), refines)
            if props.get('collection-type') == 'series':
                try:
                    series_index = float(props.get('group-position').strip())
                except Exception:
                    pass
                return normalize_whitespace(val), series_index
    for si in XPath('./opf:metadata/opf:meta[@name="calibre:series_index"]/@content')(root):
        try:
            series_index = float(si)
            break
        except:
            pass
    for s in XPath('./opf:metadata/opf:meta[@name="calibre:series"]/@content')(root):
        s = normalize_whitespace(s)
        if s:
            return s, series_index
    return None, series_index


def set_series(root, prefixes, refines, series, series_index):
    """Set the series for the given root."""
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:series" or @name="calibre:series_index"]')(root):
        remove_element(meta, refines)
    for meta in XPath('./opf:metadata/opf:meta[@property="belongs-to-collection"]')(root):
        remove_element(meta, refines)
    m = XPath('./opf:metadata')(root)[0]
    if series:
        d = m.makeelement(OPF('meta'), attrib={'property':'belongs-to-collection'})
        d.text = series
        m.append(d)
        set_refines(d, refines, refdef('collection-type', 'series'), refdef('group-position', '%.2g' % series_index))


def read_user_metadata(root, prefixes, refines):
    """Read user metadata from the given root."""
    return read_user_metadata3(root, prefixes, refines) or read_user_metadata2(root)


def read_user_metadata3(root, prefixes, refines):
    """Read user metadata from the given root (version 3)."""
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        val = (meta.text or '').strip()
        if val:
            prop = expand_prefix(meta.get('property'), prefixes)
            if prop.lower() == '%s:user_metadata' % CALIBRE_PREFIX:
                try:
                    ans = json.loads(val, object_hook=from_json)
                    decode_is_multiple(ans)
                    return ans
                except Exception:
                    continue
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:user_metadata"]')(root):
        val = meta.get('content')
        if val:
            try:
                ans = json.loads(val, object_hook=from_json)
                decode_is_multiple(ans)
                return ans
            except Exception:
                continue


def read_user_metadata2(root):
    """Read user metadata from the given root (version 2)."""
    ans = {}
    for meta in XPath('./opf:metadata/opf:meta[starts-with(@name, "calibre:user_metadata:")]')(root):
        name = meta.get('name')
        name = ':'.join(name.split(':')[2:])
        if not name or not name.startswith('#'):
            continue
        fm = meta.get('content')
        try:
            fm = json.loads(fm, object_hook=from_json)
            decode_is_multiple(fm)
            ans[name] = fm
        except Exception:
            prints('Failed to read user metadata:', name)
            import traceback
            traceback.print_exc()
            continue
    return ans


def set_user_metadata(root, prefixes, refines, val):
    """Set user metadata for the given root."""
    for meta in XPath('./opf:metadata/opf:meta[starts-with(@name, "calibre:user_metadata:")]')(root):
        remove_element(meta, refines)
    if val:
        nval = {}
        for name, fm in val.items():
            fm = fm.copy()
            encode_is_multiple(fm)
            nval[name] = fm
        set_user_metadata3(root, prefixes, refines, nval)


def set_user_metadata3(root, prefixes, refines, val):
    """Set user metadata for the given root (version 3)."""
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:user_metadata"]')(root):
        remove_element(meta, refines)
    if val:
        ensure_prefix(root, prefixes, 'calibre', CALIBRE_PREFIX)
        m = XPath('./opf:metadata')(root)[0]
        d = m.makeelement(OPF('meta'), attrib={'property':'calibre:user_metadata'})
        d.text = json.dumps(object_to_unicode(val), ensure_ascii=False, default=to_json, indent=2, sort_keys=True)
        m.append(d)


def read_raster_cover(root, prefixes, refines):
    """Read the raster cover from the given root."""
    def get_href(item):
        mt = item.get('media-type')
        if mt and 'xml' not in mt and 'html' not in mt:
            href = item.get('href')
            if href:
                return href

    for item in items_with_property(root, 'cover-image', prefixes):
        href = get_href(item)
        if href:
            return href

    for item_id in XPath('./opf:metadata/opf:meta[@name="cover"]/@content')(root):
        for item in XPath('./opf:manifest/opf:item[@id and @href and @media-type]')(root):
            if item.get('id') == item_id:
                href = get_href(item)
                if href:
                    return href


def ensure_is_only_raster_cover(root, prefixes, refines, raster_cover_item_href):
    """Ensure that the given root has only one raster cover."""
    for item in XPath('./opf:metadata/opf:meta[@name="cover"]')(root):
        remove_element(item, refines)
    for item in items_with_property(root, 'cover-image', prefixes):
        prop = normalize_whitespace(item.get('properties').replace('cover-image', ''))
        if prop:
            item.set('properties', prop)
        else:
            del item.attrib['properties']
    for item in XPath('./opf:manifest/opf:item')(root):
        if item.get('href') == raster_cover_item_href:
            item.set('properties', normalize_whitespace((item.get('properties') or '') + ' cover-image'))


def read_metadata(root, ver=None, return_extra_data=False):
    """Read metadata from the given root."""
    ans = Metadata(_('Unknown'), [_('Unknown')])
    prefixes, refines = read_prefixes(root), read_refines(root)
    identifiers = read_identifiers(root, prefixes, refines)
    ids = {}
    for key, vals in identifiers.iteritems():
        if key == 'calibre':
            ans.application_id = vals[0]
        elif key == 'uuid':
            ans.uuid = vals[0]
        else:
            ids[key] = vals[0]
    ans.set_identifiers(ids)
    ans.title = read_title(root, prefixes, refines) or ans.title
    ans.title_sort = read_title_sort(root, prefixes, refines) or ans.title_sort
    ans.languages = read_languages(root, prefixes, refines) or ans.languages
    auts, aus = [], []
    for a in read_authors(root, prefixes, refines):
        auts.append(a.name), aus.append(a.sort)
    ans.authors = auts or ans.authors
    ans.author_sort = authors_to_string(aus) or ans.author_sort
    bkp = read_book_producers(root, prefixes, refines)
    if bkp:
        if bkp[0]:
            ans.book_producer = bkp[0]
    pd = read_pubdate(root, prefixes, refines)
    if not is_date_undefined(pd):
        ans.pubdate = pd
    ts = read_timestamp(root, prefixes, refines)
    if not is_date_undefined(ts):
        ans.timestamp = ts
    lm = read_last_modified(root, prefixes, refines)
    if not is_date_undefined(lm):
        ans.last_modified = lm
    ans.comments = read_comments(root, prefixes, refines) or ans.comments
    ans.publisher = read_publisher(root, prefixes, refines) or ans.publisher
    ans.tags = read_tags(root, prefixes, refines) or ans.tags
    ans.rating = read_rating(root, prefixes, refines) or ans.rating
    s, si = read_series(root, prefixes, refines)
    if s:
        ans.series, ans.series_index = s, si
    ans.author_link_map = read_author_link_map(root, prefixes, refines) or ans.author_link_map
    ans.user_categories = read_user_categories(root, prefixes, refines) or ans.user_categories
    for name, fm in (read_user_metadata(root, prefixes, refines) or {}).iteritems():
        ans.set_user_metadata(name, fm)
    if return_extra_data:
        ans = ans, ver, read_raster_cover(root, prefixes, refines), first_spine_item(root, prefixes, refines)
    return ans


def apply_metadata(root, mi, cover_prefix='', cover_data=None, apply_null=False, update_timestamp=False, force_identifiers=False, add_missing_cover=True):
    """Apply metadata to the given root."""
    prefixes, refines = read_prefixes(root), read_refines(root)
    current_mi = read_metadata(root)
    if apply_null:
        def ok(x):
            return True
    else:
        def ok(x):
            return not mi.is_null(x)
    if ok('identifiers'):
        set_identifiers(root, prefixes, refines, mi.identifiers, force_identifiers=force_identifiers)
    if ok('title'):
        set_title(root, prefixes, refines, mi.title, mi.title_sort)
    if ok('languages'):
        set_languages(root, prefixes, refines, mi.languages)
    if ok('book_producer'):
        set_book_producers(root, prefixes, refines, (mi.book_producer,))
    aus = string_to_authors(mi.author_sort or '')
    authors = []
    for i, aut in enumerate(mi.authors):
        authors.append(Author(aut, aus[i] if i < len(aus) else None))
    if authors or apply_null:
        set_authors(root, prefixes, refines, authors)
    if ok('pubdate'):
        set_pubdate(root, prefixes, refines, mi.pubdate)
    if update_timestamp and mi.timestamp is not None:
        set_timestamp(root, prefixes, refines, mi.timestamp)
    if ok('comments'):
        set_comments(root, prefixes, refines, mi.comments)
    if ok('publisher'):
        set_publisher(root, prefixes, refines, mi.publisher)
    if ok('tags'):
        set_tags(root, prefixes, refines, mi.tags)
    if ok('rating') and mi.rating > 0.1:
        set_rating(root, prefixes, refines, mi.rating)
    if ok('series'):
        set_series(root, prefixes, refines, mi.series, mi.series_index or 1)
    if ok('author_link_map'):
        set_author_link_map(root, prefixes, refines, getattr(mi, 'author_link_map', None))
    if ok('user_categories'):
        set_user_categories(root, prefixes, refines, getattr(mi, 'user_categories', None))
    # We ignore apply_null for the next two to match the behavior with opf2.py
    if mi.application_id:
        set_application_id(root, prefixes, refines, mi.application_id)
    if mi.uuid:
        set_uuid(root, prefixes, refines, mi.uuid)
    new_user_metadata, current_user_metadata = mi.get_all_user_metadata(True), current_mi.get_all_user_metadata(True)
    missing = object()
    for key in tuple(new_user_metadata):
        meta = new_user_metadata.get(key)
        if meta is None:
            if apply_null:
                new_user_metadata[key] = None
            continue
        dt = meta.get('datatype')
        if dt == 'text' and meta.get('is_multiple'):
            val = mi.get(key, [])
            if val or apply_null:
                current_user_metadata[key] = meta
        elif dt in {'int', 'float', 'bool'}:
            val = mi.get(key, missing)
            if val is missing:
                if apply_null:
                    current_user_metadata[key] = meta
            elif apply_null or val is not None:
                current_user_metadata[key] = meta
        elif apply_null or not mi.is_null(key):
            current_user_metadata[key] = meta

    set_user_metadata(root, prefixes, refines, current_user_metadata)
    raster_cover = read_raster_cover(root, prefixes, refines)
    if not raster_cover and cover_data and add_missing_cover:
        if cover_prefix and not cover_prefix.endswith('/'):
            cover_prefix += '/'
        name = cover_prefix + 'cover.jpg'
        i = create_manifest_item(root, name, 'cover')
        if i is not None:
            ensure_is_only_raster_cover(root, prefixes, refines, name)
            raster_cover = name

    pretty_print_opf(root)
    return raster_cover


def set_metadata(stream, mi, cover_prefix='', cover_data=None, apply_null=False, update_timestamp=False, force_identifiers=False, add_missing_cover=True):
    """Set metadata for the given stream."""
    root = parse_opf(stream)
    return apply_metadata(
        root, mi, cover_prefix=cover_prefix, cover_data=cover_data,
        apply_null=apply_null, update_timestamp=update_timestamp,
        force_identifiers=force_identifiers)