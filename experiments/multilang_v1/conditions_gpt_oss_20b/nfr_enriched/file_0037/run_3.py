def _parse_scheme(scheme, prefixes):
    """Return (namespace, scheme) tuple for a scheme string."""
    if not scheme:
        return None, None
    p, r = scheme.partition(':')[::2]
    if not p or not r:
        return None, scheme
    ns = prefixes.get(p)
    if ns:
        return ns, r
    return None, scheme


def properties_for_id_with_scheme(item_id, prefixes, refines):
    """Return a dict mapping property names to (namespace, scheme, value)."""
    ans = {}
    if not item_id:
        return ans
    for elem in refines.get(item_id, []):
        key = elem.get('property')
        if not key:
            continue
        val = (elem.text or '').strip()
        if not val:
            continue
        scheme = elem.get('scheme')
        scheme_ns, scheme = _parse_scheme(scheme, prefixes)
        ans[key] = (scheme_ns, scheme, val)
    return ans