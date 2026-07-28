class Field(object):
    # ...

    def validate(self, value):
        if value in self.empty_values and self.required:
            raise ValidationError(self.error_messages['required'], code='required')

    # ...


class NullBooleanField(BooleanField):
    """
    A field whose valid values are None, True and False. Invalid values are
    cleaned to None.
    """
    # ...

    def validate(self, value):
        if value is None and self.required:
            raise ValidationError(self.error_messages['required'], code='required')
        super(NullBooleanField, self).validate(value)


class MultiValueField(Field):
    # ...

    def validate(self, value):
        if value in self.empty_values and self.required:
            raise ValidationError(self.error_messages['required'], code='required')