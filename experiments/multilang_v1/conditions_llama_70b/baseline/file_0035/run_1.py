def save_template(self):
    settings = self.settings()
    template = self.SAVE_TEMPLATE
    if mdata.tags and _('News') in mdata.tags:
        try:
            p = mdata.pubdate
            date  = (p.year, p.month, p.day)
        except:
            today = time.localtime()
            date = (today[0], today[1], today[2])
        template = "{title}_%d-%d-%d" % date
    return template