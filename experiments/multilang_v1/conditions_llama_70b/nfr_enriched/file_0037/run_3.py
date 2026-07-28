def properties_for_id_with_scheme(item_id, prefixes, refines):
    """Get properties for an item id with scheme."""
    ans = {}
    if item_id:
        for elem in refines[item_id]:
            key = elem.get('property')
            if key:
                val = (elem.text or '').strip()
                if val:
                    scheme = elem.get('scheme') or None
                    scheme_ns = None
                    if scheme is not None:
                        p, r = scheme.partition(':')[::2]
                        if p and r:
                            ns = prefixes.get(p)
                            if ns:
                                scheme_ns = ns
                                scheme = r
                    ans[key] = (scheme_ns, scheme, val)
    return ans


def _get_scheme_ns(scheme, prefixes):
    """Get scheme namespace."""
    if scheme is not None:
        p, r = scheme.partition(':')[::2]
        if p and r:
            ns = prefixes.get(p)
            if ns:
                return ns, r
    return None, scheme


def _parse_property(elem, prefixes):
    """Parse property."""
    key = elem.get('property')
    if key:
        val = (elem.text or '').strip()
        if val:
            scheme = elem.get('scheme') or None
            scheme_ns, scheme = _get_scheme_ns(scheme, prefixes)
            return key, (scheme_ns, scheme, val)
    return None, None


def properties_for_id_with_scheme(item_id, prefixes, refines):
    """Get properties for an item id with scheme."""
    ans = {}
    if item_id:
        for elem in refines[item_id]:
            key, val = _parse_property(elem, prefixes)
            if key and val:
                ans[key] = val
    return ans


def _get_property_value(refines, item_id, key):
    """Get property value."""
    for elem in refines[item_id]:
        prop_key = elem.get('property')
        if prop_key == key:
            return (elem.text or '').strip()
    return None


def _get_property_scheme(refines, item_id, key):
    """Get property scheme."""
    for elem in refines[item_id]:
        prop_key = elem.get('property')
        if prop_key == key:
            scheme = elem.get('scheme') or None
            return _get_scheme_ns(scheme, {})
    return None, None


def properties_for_id(item_id, refines):
    """Get properties for an item id."""
    ans = {}
    if item_id:
        for elem in refines[item_id]:
            key = elem.get('property')
            if key:
                val = (elem.text or '').strip()
                if val:
                    ans[key] = val
    return ans


def _get_property(refines, item_id, key):
    """Get property."""
    for elem in refines[item_id]:
        prop_key = elem.get('property')
        if prop_key == key:
            return elem
    return None


def _remove_property(refines, elem):
    """Remove property."""
    remove_refines(elem, refines)
    elem.getparent().remove(elem)


def _set_property(root, prefixes, refines, item_id, key, val):
    """Set property."""
    elem = _get_property(refines, item_id, key)
    if elem:
        _remove_property(refines, elem)
    m = root.makeelement(OPF('meta'))
    m.set('refines', '#' + item_id)
    m.set('property', key)
    m.text = val.strip()
    p = root.getparent()
    p.insert(p.index(root) + 1, m)


def _set_property_with_scheme(root, prefixes, refines, item_id, key, val, scheme):
    """Set property with scheme."""
    elem = _get_property(refines, item_id, key)
    if elem:
        _remove_property(refines, elem)
    m = root.makeelement(OPF('meta'))
    m.set('refines', '#' + item_id)
    m.set('property', key)
    m.text = val.strip()
    if scheme:
        m.set('scheme', scheme)
    p = root.getparent()
    p.insert(p.index(root) + 1, m)


def set_refines(elem, existing_refines, *new_refines):
    """Set refines."""
    eid = ensure_id(elem)
    remove_refines(elem, existing_refines)
    for ref in reversed(new_refines):
        prop, val, scheme = ref
        r = elem.makeelement(OPF('meta'))
        r.set('refines', '#' + eid)
        r.set('property', prop)
        r.text = val.strip()
        if scheme:
            r.set('scheme', scheme)
        p = elem.getparent()
        p.insert(p.index(elem) + 1, r)