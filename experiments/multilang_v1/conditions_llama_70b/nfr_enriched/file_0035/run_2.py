def save_template(self):
    """Returns the template used to save files."""
    settings = self.settings()
    template = self.SAVE_TEMPLATE
    if settings.extra_customization[self.OPT_COLLECTIONS]:
        template = settings.extra_customization[self.OPT_COLLECTIONS]
    return template

def _create_upload_path(self, mdata, fname, create_dirs=True):
    """Creates the upload path for a file."""
    settings = self.settings()
    template = self.save_template()
    if mdata.tags and _('News') in mdata.tags:
        try:
            p = mdata.pubdate
            date  = (p.year, p.month, p.day)
        except:
            today = time.localtime()
            date = (today[0], today[1], today[2])
        template = "{title}_%d-%d-%d" % date
    # ... rest of the method remains the same