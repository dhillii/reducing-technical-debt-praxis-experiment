def media_property(cls):
    def _media(self):
        try:
            base = super(cls, self).media
        except AttributeError:
            base = Media()

        definition = getattr(cls, 'Media', None)
        if not definition:
            return base

        extend = getattr(definition, 'extend', True)
        if not extend:
            return Media(definition)

        if extend is True:
            m = base
        else:
            m = Media()
            for medium in extend:
                m = m + base[medium]
        return m + Media(definition)

    return property(_media)