def properties_for_id_with_scheme(item_id, prefixes, refines):
    ans = {}
    if item_id:
        for elem in refines[item_id]:
            key = elem.get('property')
            if key:
                val = (elem.text or '').strip()
                if val:
                    scheme = elem.get('scheme') or None
                    scheme_ns = None
                    if scheme:
                        p, r = scheme.partition(':')[::2]
                        if p and r:
                            ns = prefixes.get(p)
                            if ns:
                                scheme_ns = ns
                                scheme = r
                    ans[key] = (scheme_ns, scheme, val)
    return ans