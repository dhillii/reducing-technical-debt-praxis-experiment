def _create_upload_path(self, mdata, fname, create_dirs=True):
    """Create the upload path for a book."""
    settings = self.settings()
    template = self.save_template_name()
    path = getattr(self, 'path', fname)
    path = path.replace('\\', '/')

    if mdata.tags and _('News') in mdata.tags:
        try:
            p = mdata.pubdate
            date  = (p.year, p.month, p.day)
        except:
            today = time.localtime()
            date = (today[0], today[1], today[2])
        template = "{title}_%d-%d-%d" % date

    use_subdirs = self.SUPPORTS_SUB_DIRS and settings.use_subdirs

    from calibre.library.save_to_disk import get_components
    from calibre.library.save_to_disk import config
    opts = config().parse()
    if not isinstance(template, unicode):
        template = template.decode('utf-8')
    app_id = str(getattr(mdata, 'application_id', ''))
    id_ = mdata.get('id', fname)
    extra_components = get_components(template, mdata, id_,
                timefmt=opts.send_timefmt, length=self.MAX_PATH_LEN-len(app_id)-1,
                last_has_extension=False)
    if not extra_components:
        extra_components.append(sanitize(fname))
    else:
        extra_components[-1] = sanitize(extra_components[-1]+os.path.splitext(fname)[1])

    if extra_components[-1] and extra_components[-1][0] in ('.', '_'):
        extra_components[-1] = 'x' + extra_components[-1][1:]

    special_tag = None
    if mdata.tags:
        for t in mdata.tags:
            if t.startswith(_('News')) or t.startswith('/'):
                special_tag = t
                break

    if special_tag is not None:
        name = extra_components[-1]
        extra_components = []
        tag = special_tag
        if tag.startswith(_('News')):
            if self.NEWS_IN_FOLDER:
                extra_components.append('News')
        else:
            for c in tag.split('/'):
                c = sanitize(c)
                if not c:
                    continue
                extra_components.append(c)
        extra_components.append(name)

    if not use_subdirs:
        extra_components = extra_components[-1:]

    def remove_trailing_periods(x):
        ans = x
        while ans.endswith('.'):
            ans = ans[:-1].strip()
        if not ans:
            ans = 'x'
        return ans

    extra_components = list(map(remove_trailing_periods, extra_components))
    components = shorten_components_to(self.MAX_PATH_LEN, extra_components)
    filepath = posixpath.join(*components)
    self._debug('lengths', os.path.splitext(fname)[1], self.MAX_PATH_LEN,
                self.exts_path_lengths.get(os.path.splitext(fname)[1], self.PATH_FUDGE_FACTOR),
                len(filepath))
    return filepath

def save_template_name(self):
    """Return the save template name."""
    return self.SAVE_TEMPLATE