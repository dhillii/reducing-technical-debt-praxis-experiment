def _create_upload_path(self, mdata, fname, create_dirs=True):
    """Create the upload path for a book."""
    fname = sanitize(fname)
    ext = os.path.splitext(fname)[1]

    def _use_uuid_as_filename(mdata, ext):
        """Try to use the UUID as the file name."""
        if self.settings().extra_customization[self.OPT_OVERWRITE_BOOKS_UUID]:
            existing_book = self._uuid_in_cache(mdata.uuid, ext)
            if existing_book and existing_book.lpath and self.known_metadata.get(existing_book.lpath, None):
                return existing_book.lpath
        return None

    def _use_special_tag_as_directory(mdata, extra_components):
        """Use a special tag as a directory."""
        special_tag = None
        if mdata.tags:
            for t in mdata.tags:
                if t.startswith(_('News')) or t.startswith('/'):
                    special_tag = t
                    break
        if special_tag is not None:
            if special_tag.startswith(_('News')):
                if self.NEWS_IN_FOLDER:
                    extra_components.append('News')
            else:
                for c in special_tag.split('/'):
                    c = sanitize(c)
                    if not c:
                        continue
                    extra_components.append(c)
        return extra_components

    def _create_path_components(mdata, template, extra_components):
        """Create the path components."""
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
            extra_components[-1] = sanitize(extra_components[-1]+ext)
        return extra_components

    uuid_path = _use_uuid_as_filename(mdata, ext)
    if uuid_path is not None:
        return uuid_path

    extra_components = []
    extra_components = _use_special_tag_as_directory(mdata, extra_components)
    extra_components = _create_path_components(mdata, self.save_template(), extra_components)

    if extra_components[-1] and extra_components[-1][0] in ('.', '_'):
        extra_components[-1] = 'x' + extra_components[-1][1:]

    def _remove_trailing_periods(extra_components):
        """Remove trailing periods from the extra components."""
        return list(map(lambda x: x.rstrip('.') or 'x', extra_components))

    extra_components = _remove_trailing_periods(extra_components)
    components = shorten_components_to(self.MAX_PATH_LEN, extra_components)
    filepath = posixpath.join(*components)
    self._debug('lengths', ext[1:], self.MAX_PATH_LEN,
                self.exts_path_lengths.get(ext[1:], self.PATH_FUDGE_FACTOR),
                len(filepath))
    return filepath