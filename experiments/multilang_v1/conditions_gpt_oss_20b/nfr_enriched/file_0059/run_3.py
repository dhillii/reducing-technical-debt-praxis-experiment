def media_property(cls):
    """
    Return a property that resolves the media for a widget class.

    The property combines media from the superclass with the media
    defined on the class itself, respecting the ``extend`` attribute
    of the ``Media`` definition.
    """
    def _media(self):
        # Base media from the superclass, if any.
        base = getattr(super(cls, self), 'media', Media())

        # Media definition on the class.
        definition = getattr(cls, 'Media', None)
        if not definition:
            return base

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

    return property(_media)