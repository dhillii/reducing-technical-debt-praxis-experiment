def _create_upload_path(self, mdata, fname, create_dirs=True):
    """Create an upload path for a book."""
    fname = sanitize(fname)
    ext = os.path.splitext(fname)[1]

    def _use_uuid_as_filename(mdata, ext):
        """Try to use the UUID as the file name."""
        if mdata.uuid:
            return mdata.uuid + ext
        return None

    def _use_existing_path(self, mdata, ext):
        """Try to use an existing path for the book."""
        if self.settings().extra_customization[self.OPT_OVERWRITE_BOOKS_UUID]:
            existing_book = self._uuid_in_cache(mdata.uuid, ext)
            if existing_book and existing_book.lpath and self.known_metadata.get(existing_book.lpath, None):
                return existing_book.lpath
        return None

    def _create_path_from_template(self, mdata, template, maxlen):
        """Create a path from a template."""
        from calibre.library.save_to_disk import get_components
        from calibre.library.save_to_disk import config
        opts = config().parse()
        if not isinstance(template, unicode):
            template = template.decode('utf-8')
        app_id = str(getattr(mdata, 'application_id', ''))
        id_ = mdata.get('id', fname)
        extra_components = get_components(template, mdata, id_,
                timefmt=opts.send_timefmt, length=maxlen-len(app_id)-1,
                last_has_extension=False)
        if not extra_components:
            extra_components.append(sanitize(fname))
        else:
            extra_components[-1] = sanitize(extra_components[-1]+ext)

        if extra_components[-1] and extra_components[-1][0] in ('.', '_'):
            extra_components[-1] = 'x' + extra_components[-1][1:]

        return extra_components

    def _create_path_from_tags(self, mdata, template, ext):
        """Create a path from tags."""
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

        return extra_components

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

    use_subdirs = self.SUPPORTS_SUB_DIRS and settings.use_subdirs

    existing_path = _use_existing_path(mdata, ext)
    if existing_path is not None:
        return existing_path

    uuid_filename = _use_uuid_as_filename(mdata, ext)
    if uuid_filename is not None:
        return uuid_filename

    dotless_ext = ext[1:] if len(ext) > 0 else ext
    maxlen = (self.MAX_PATH_LEN - (self.PATH_FUDGE_FACTOR +
               self.exts_path_lengths.get(dotless_ext, self.PATH_FUDGE_FACTOR)))

    extra_components = _create_path_from_template(mdata, template, maxlen)
    extra_components = _create_path_from_tags(mdata, template, ext)

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
    components = shorten_components_to(maxlen, extra_components)
    filepath = posixpath.join(*components)
    self._debug('lengths', dotless_ext, maxlen,
                self.exts_path_lengths.get(dotless_ext, self.PATH_FUDGE_FACTOR),
                len(filepath))
    return filepath