class NullBooleanField(BooleanField):
    """
    A field whose valid values are None, True and False. Invalid values are
    cleaned to None.
    """
    widget = NullBooleanSelect

    def to_python(self, value):
        """
        Explicitly checks for the string 'True' and 'False', which is what a
        hidden field will submit for True and False, for 'true' and 'false',
        which are likely to be returned by JavaScript serializations of forms,
        and for '1' and '0', which is what a RadioField will submit. Unlike
        the Booleanfield we need to explicitly check for True, because we are
        not using the bool() function
        """
        if value in (True, 'True', 'true', '1'):
            return True
        elif value in (False, 'False', 'false', '0'):
            return False
        else:
            return None

    def validate(self, value):
        # This method is intentionally left empty because NullBooleanField
        # does not require any additional validation beyond what is provided
        # by the BooleanField class.
        pass