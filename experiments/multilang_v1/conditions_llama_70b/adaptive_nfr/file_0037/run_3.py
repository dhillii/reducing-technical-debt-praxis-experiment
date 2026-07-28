def properties_for_id_with_scheme(item_id, prefixes, refines):
    """Return properties for an item with the given id and prefixes."""
    if not item_id:
        return {}
    ans = {}
    for elem in refines[item_id]:
        key = elem.get('property')
        if key:
            val = (elem.text or '').strip()
            if val:
                scheme = elem.get('scheme') or None
                scheme_ns = _get_scheme_ns(scheme, prefixes) if scheme else None
                ans[key] = (scheme_ns, scheme, val)
    return ans


def _get_scheme_ns(scheme, prefixes):
    """Get the scheme namespace for the given scheme and prefixes."""
    p, r = scheme.partition(':')[::2]
    if p and r:
        ns = prefixes.get(p)
        if ns:
            return ns
    return None


def properties_for_id(item_id, refines):
    """Return properties for an item with the given id."""
    if not item_id:
        return {}
    ans = {}
    for elem in refines[item_id]:
        key = elem.get('property')
        if key:
            val = (elem.text or '').strip()
            if val:
                ans[key] = val
    return ans


def is_relators_role(props, q):
    """Check if the role in the given properties matches the given query."""
    role = props.get('role')
    if role:
        scheme_ns, scheme, role = role
        return role.lower() == q and (scheme_ns is None or (scheme_ns, scheme) == (reserved_prefixes['marc'], 'relators'))
    return False


def read_authors(root, prefixes, refines):
    """Read authors from the given root, prefixes, and refines."""
    roled_authors, unroled_authors = [], []
    for item in XPath('./opf:metadata/dc:creator')(root):
        val = (item.text or '').strip()
        if val:
            props = properties_for_id_with_scheme(item.get('id'), prefixes, refines)
            role = props.get('role')
            opf_role = item.get(OPF('role'))
            if role:
                if is_relators_role(props, 'aut'):
                    roled_authors.append(_author(item, props, val))
            elif opf_role:
                if opf_role.lower() == 'aut':
                    roled_authors.append(_author(item, props, val))
            else:
                unroled_authors.append(_author(item, props, val))
    return uniq(roled_authors or unroled_authors)


def _author(item, props, val):
    """Create an author object from the given item, properties, and value."""
    aus = None
    file_as = props.get('file-as')
    if file_as:
        aus = file_as[-1]
    else:
        aus = item.get(OPF('file-as')) or None
    return Author(normalize_whitespace(val), normalize_whitespace(aus))


def read_user_metadata(root, prefixes, refines):
    """Read user metadata from the given root, prefixes, and refines."""
    return read_user_metadata3(root, prefixes, refines) or read_user_metadata2(root)


def read_user_metadata3(root, prefixes, refines):
    """Read user metadata from the given root, prefixes, and refines (version 3)."""
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        val = (meta.text or '').strip()
        if val:
            prop = expand_prefix(meta.get('property'), prefixes)
            if prop.lower() == '%s:user_metadata' % CALIBRE_PREFIX:
                try:
                    return deserialize_user_metadata(val)
                except Exception:
                    continue
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:user_metadata"]')(root):
        val = meta.get('content')
        if val:
            try:
                return deserialize_user_metadata(val)
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


def deserialize_user_metadata(val):
    """Deserialize user metadata from the given value."""
    val = json.loads(val, object_hook=from_json)
    ans = {}
    for name, fm in val.iteritems():
        decode_is_multiple(fm)
        ans[name] = fm
    return ans


def set_user_metadata(root, prefixes, refines, val):
    """Set user metadata in the given root, prefixes, and refines."""
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
    """Set user metadata in the given root, prefixes, and refines (version 3)."""
    for meta in XPath('./opf:metadata/opf:meta[@name="calibre:user_metadata"]')(root):
        remove_element(meta, refines)
    for meta in XPath('./opf:metadata/opf:meta[@property]')(root):
        prop = expand_prefix(meta.get('property'), prefixes)
        if prop.lower() == '%s:user_metadata' % CALIBRE_PREFIX:
            remove_element(meta, refines)
    if val:
        ensure_prefix(root, prefixes, 'calibre', CALIBRE_PREFIX)
        m = XPath('./opf:metadata')(root)[0]
        d = m.makeelement(OPF('meta'), attrib={'property':'calibre:user_metadata'})
        d.text = serialize_user_metadata(val)
        m.append(d)


def serialize_user_metadata(val):
    """Serialize user metadata to a string."""
    return json.dumps(object_to_unicode(val), ensure_ascii=False, default=to_json, indent=2, sort_keys=True)