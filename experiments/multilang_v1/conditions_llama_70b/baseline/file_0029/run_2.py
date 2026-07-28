class BuildStep(object, properties.PropertiesMixin):

    # ...

    def __new__(cls, *args, **kwargs):
        self = object.__new__(cls)
        self._factory = _BuildStepFactory(cls, *args, **kwargs)
        return self