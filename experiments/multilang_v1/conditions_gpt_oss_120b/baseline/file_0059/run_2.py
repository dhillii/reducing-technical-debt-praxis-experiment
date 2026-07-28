def media_property(cls):
    def _media(self):
        # Retrieve base media from superclass, defaulting to empty Media.
        try:
            base = super(cls, self).media
        except AttributeError:
            base = Media()

        # Get the Media definition for this class, if any.
        definition = getattr(cls, 'Media', None)
        if not definition:
            return base

        # Determine how to extend the base media.
        extend = getattr(definition, 'extend', True)
        if not extend:
            return Media(definition)

        # Build the media to extend.
        if extend is True:
            extended = base
        else:
            extended = Media()
            for medium in extend:
                extended = extended + base[medium]

        # Combine the extended media with the class's own definition.
        return extended + Media(definition)

    return property(_media)