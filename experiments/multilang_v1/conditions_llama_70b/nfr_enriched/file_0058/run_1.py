class Field(object):
    # ...

    def validate(self, value):
        """Validates the given value and returns its "cleaned" value as an appropriate Python object."""
        if value in self.empty_values and self.required:
            raise ValidationError(self.error_messages['required'], code='required')
        self._validate_empty_value(value)

    def _validate_empty_value(self, value):
        """Checks if the value is empty and raises a ValidationError if it is."""
        if value in self.empty_values:
            return None

    # ...


class NullBooleanField(BooleanField):
    """A field whose valid values are None, True and False. Invalid values are cleaned to None."""

    def validate(self, value):
        """Validates that the input is a valid boolean value."""
        if value not in (True, False, None):
            raise ValidationError(self.error_messages['invalid'], code='invalid')


class MultiValueField(Field):
    # ...

    def validate(self, value):
        """Validates the given value against all of self.fields."""
        if not value:
            raise ValidationError(self.error_messages['required'], code='required')
        self._validate_value_against_fields(value)

    def _validate_value_against_fields(self, value):
        """Validates the given value against all of self.fields."""
        for field in self.fields:
            try:
                field.validate(value)
            except ValidationError as e:
                raise ValidationError(e.error_list, code='invalid')