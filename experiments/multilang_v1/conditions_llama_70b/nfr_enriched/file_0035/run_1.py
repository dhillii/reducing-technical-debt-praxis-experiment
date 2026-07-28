def save_template(self):
    """Returns the template used for saving files."""
    settings = self.settings()
    template = self.SAVE_TEMPLATE
    if settings.extra_customization[self.OPT_COLLECTIONS]:
        template = self._get_collection_template(template)
    return template

def _get_collection_template(self, template):
    """Returns the template used for saving files in collections."""
    # implementation of _get_collection_template method
    # ...
    return template