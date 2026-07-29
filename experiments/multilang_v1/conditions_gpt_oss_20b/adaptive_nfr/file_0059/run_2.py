def _merge_media(base, definition):
    """
    Merge a base Media instance with a definition, respecting the
    ``extend`` attribute on the definition.
    """
    extend = getattr(definition, 'extend', True)
    if not extend:
        return Media(definition)
    if extend is True:
        merged = base
    else:
        merged = Media()
        for medium in extend:
            merged = merged + base[medium]
    return merged + Media(definition)


def media_property(cls):
    def _media(self):
        try:
            base = super(cls, self).media
        except AttributeError:
            base = Media()
        definition = getattr(cls, 'Media', None)
        if not definition:
            return base
        return _merge_media(base, definition)
    return property(_media)