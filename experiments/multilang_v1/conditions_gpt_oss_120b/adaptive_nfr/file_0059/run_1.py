def _resolve_media(cls, instance):
    """
    Resolve the Media object for a given widget class and instance.
    """
    # Get base media from superclass, defaulting to empty Media.
    try:
        base = super(cls, instance).media
    except AttributeError:
        base = Media()

    # Retrieve the Media definition on the class, if any.
    definition = getattr(cls, 'Media', None)
    if not definition:
        return base

    extend = getattr(definition, 'extend', True)

    # If extend is falsy, ignore superclass media.
    if not extend:
        return Media(definition)

    # If extend is True, use the full base media.
    if extend is True:
        combined = base
    else:
        # extend is an iterable of media types to include.
        combined = Media()
        for medium in extend:
            combined = combined + base[medium]

    return combined + Media(definition)


def media_property(cls):
    def _media(self):
        return _resolve_media(cls, self)
    return property(_media)