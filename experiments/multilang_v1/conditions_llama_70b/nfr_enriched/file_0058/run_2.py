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
        """Validates that the input is either True, False, or None."""
        if value not in (True, False, None):
            raise ValidationError(self.error_messages['invalid'], code='invalid')


class MultiValueField(Field):
    # ...

    def validate(self, value):
        """Validates the given value against all of self.fields."""
        pass

    def _validate_fields(self, value):
        """Validates each field in self.fields."""
        for field in self.fields:
            field.validate(value)

    def clean(self, value):
        """Validates every value in the given list. A value is validated against the corresponding Field in self.fields."""
        clean_data = []
        errors = []
        if not value or isinstance(value, (list, tuple)):
            if not value or not [v for v in value if v not in self.empty_values]:
                if self.required:
                    raise ValidationError(self.error_messages['required'], code='required')
                else:
                    return self.compress([])
        else:
            raise ValidationError(self.error_messages['invalid'], code='invalid')
        for i, field in enumerate(self.fields):
            try:
                field_value = value[i]
            except IndexError:
                field_value = None
            if field_value in self.empty_values:
                if self.require_all_fields:
                    # Raise a 'required' error if the MultiValueField is required and any field is empty.
                    if self.required:
                        raise ValidationError(self.error_messages['required'], code='required')
                elif field.required:
                    # Otherwise, add an 'incomplete' error to the list of collected errors and skip field cleaning, if a required field is empty.
                    if field.error_messages['incomplete'] not in errors:
                        errors.append(field.error_messages['incomplete'])
                    continue
            try:
                clean_data.append(field.clean(field_value))
            except ValidationError as e:
                # Collect all validation errors in a single list, which we'll raise at the end of clean(), rather than raising a single exception for the first error we encounter. Skip duplicates.
                errors.extend(m for m in e.error_list if m not in errors)
        if errors:
            raise ValidationError(errors)

        out = self.compress(clean_data)
        self._validate_fields(out)
        self.run_validators(out)
        return out