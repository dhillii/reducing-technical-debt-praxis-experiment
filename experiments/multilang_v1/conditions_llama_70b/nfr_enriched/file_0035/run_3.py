def save_template(self):
    """Return the template used to save files."""
    settings = self.settings()
    template = self.SAVE_TEMPLATE
    if settings.extra_customization[self.OPT_COLLECTIONS]:
        template = self._get_collection_template(template)
    return template

def _get_collection_template(self, template):
    """Return the template used to save files in collections."""
    # implementation of _get_collection_template
    pass