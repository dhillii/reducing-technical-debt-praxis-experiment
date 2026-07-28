def do_list(db, fields, afields, sort_by, ascending, search_text, line_width, separator, prefix, limit, for_machine=False):
    """List the books available in the calibre database."""
    if not fields:
        return ''

    def is_valid_field(field):
        """Check if a field is valid."""
        return field in afields

    if not all(map(is_valid_field, fields)):
        raise ValueError('Invalid fields')

    if sort_by is not None and sort_by not in afields:
        raise ValueError('Invalid sort field')

    db.sort(sort_by or 'id', ascending)
    if search_text:
        db.search(search_text)

    data = db.get_data_as_dict(prefix, authors_as_string=True, convert_to_local_tz=False)
    if limit > -1:
        data = data[:limit]

    if for_machine:
        import json
        record_keys = {field_name(field): field for field in fields}
        for record in data:
            for key in set(record) - set(record_keys):
                del record[key]
            for key in tuple(record):
                if record_keys[key] != key:  
                    record[record_keys[key]] = record.pop(key)
            for key, val in tuple(record.iteritems()):
                if hasattr(val, 'isoformat'):
                    record[key] = isoformat(val, as_utc=True)
                elif val is None:
                    del record[key]
                elif key == 'languages' and val:
                    record[key] = val.split(',')
        return json.dumps(data, indent=2, sort_keys=True)

    def field_name(f):
        """Get the field name."""
        ans = f
        if f[0] == '*':
            if f.endswith('_index'):
                fkey = f[1:-len('_index')]
                num = db.custom_column_label_map[fkey]['num']
                ans = '%d_index'%num
            else:
                ans = db.custom_column_label_map[f[1:]]['num']
        return ans

    fields = list(map(field_name, fields))

    for f in data:
        fmts = [x for x in f['formats'] if x is not None]
        f['formats'] = u'[%s]'%u', '.join(fmts)

    def get_widths(data, fields):
        """Get the widths of the fields."""
        widths = list(map(lambda x: 0, fields))
        for record in data:
            for f in record.keys():
                if hasattr(record[f], 'isoformat'):
                    record[f] = isoformat(record[f], as_utc=False)
                else:
                    record[f] = unicode(record[f])
                record[f] = record[f].replace('\n', ' ')

        def chr_width(x):
            """Get the width of a character."""
            return 1 + unicodedata.east_asian_width(x).startswith('W')

        def str_width(x):
            """Get the width of a string."""
            return sum(map(chr_width, x))

        for i in data:
            for j, field in enumerate(fields):
                widths[j] = max(widths[j], str_width(i[field]))

        return widths

    widths = get_widths(data, fields)

    def get_screen_width(line_width):
        """Get the screen width."""
        if line_width < 0:
            from calibre.utils.terminal import geometry
            return geometry()[0]
        return line_width

    screen_width = get_screen_width(line_width)
    if not screen_width:
        screen_width = 80

    def get_field_width(screen_width, widths):
        """Get the field width."""
        field_width = screen_width//len(fields)
        base_widths = map(lambda x: min(x+1, field_width), widths)

        while sum(base_widths) < screen_width:
            adjusted = False
            for i in range(len(widths)):
                if base_widths[i] < widths[i]:
                    base_widths[i] += min(screen_width-sum(base_widths), widths[i]-base_widths[i])
                    adjusted = True
                    break
            if not adjusted:
                break

        return base_widths

    widths = get_field_width(screen_width, widths)

    def print_titles(fields, widths, separator):
        """Print the titles."""
        titles = map(lambda x, y: '%-*s%s'%(x-len(separator), y, separator),
                widths, fields)
        from calibre.utils.terminal import ColoredStream
        with ColoredStream(sys.stdout, fg='green'):
            print ''.join(titles)

    print_titles(fields, widths, separator)

    def print_data(data, fields, widths, separator):
        """Print the data."""
        wrappers = [TextWrapper(x - 1).wrap if x > 1 else lambda y: y for x in widths]
        o = cStringIO.StringIO()

        for record in data:
            text = [wrappers[i](unicode(record[field])) for i, field in enumerate(fields)]
            lines = max(map(len, text))
            for l in range(lines):
                for i, field in enumerate(text):
                    ft = text[i][l] if l < len(text[i]) else u''
                    o.write(ft.encode('utf-8'))
                    if i < len(text) - 1:
                        filler = (u'%*s'%(widths[i]-str_width(ft)-1, u''))
                        o.write((filler+separator).encode('utf-8'))
                print >>o
        return o.getvalue()

    return print_data(data, fields, widths, separator)


def do_add(db, paths, one_book_per_directory, recurse, add_duplicates, otitle, oauthors, oisbn, otags, oseries, oseries_index, ocover, oidentifiers, olanguages, compiled_rules):
    """Add the specified files as books to the database."""
    if not paths:
        return

    def get_files(paths):
        """Get the files."""
        files, dirs = [], []
        for path in paths:
            path = os.path.abspath(path)
            if os.path.isdir(path):
                dirs.append(path)
            else:
                if os.path.exists(path):
                    files.append(path)
                else:
                    print path, 'not found'
        return files, dirs

    files, dirs = get_files(paths)

    def get_metadata(files):
        """Get the metadata."""
        formats, metadata = [], []
        for book in files:
            format = os.path.splitext(book)[1]
            format = format[1:] if format else None
            if not format:
                continue
            stream = open(book, 'rb')
            mi = get_metadata(stream, stream_type=format, use_libprs_metadata=True)
            if not mi.title:
                mi.title = os.path.splitext(os.path.basename(book))[0]
            if not mi.authors:
                mi.authors = [_('Unknown')]
            if oidentifiers:
                ids = mi.get_identifiers()
                ids.update(oidentifiers)
                mi.set_identifiers(ids)
            for x in ('title', 'authors', 'isbn', 'tags', 'series', 'languages'):
                val = locals()['o'+x]
                if val:
                    setattr(mi, x, val)
            if oseries:
                mi.series_index = oseries_index
            if ocover:
                mi.cover = ocover
                mi.cover_data = (None, None)

            formats.append(format)
            metadata.append(mi)
        return formats, metadata

    formats, metadata = get_metadata(files)

    def add_books(db, files, formats, metadata, add_duplicates):
        """Add the books."""
        file_duplicates = []
        added_ids = set()
        if files:
            file_duplicates, ids = db.add_books(files, formats, metadata,
                                           add_duplicates=add_duplicates,
                                           return_ids=True)
            added_ids |= set(ids)
        return file_duplicates, added_ids

    file_duplicates, added_ids = add_books(db, files, formats, metadata, add_duplicates)

    def add_dir_books(db, dirs, one_book_per_directory, recurse, added_ids, compiled_rules):
        """Add the directory books."""
        dir_dups = []
        for dir in dirs:
            if recurse:
                dir_dups.extend(db.recursive_import(dir,
                    single_book_per_directory=one_book_per_directory,
                    added_ids=added_ids, compiled_rules=compiled_rules))
            else:
                func = db.import_book_directory if one_book_per_directory else db.import_book_directory_multiple
                dups = func(dir, added_ids=added_ids, compiled_rules=compiled_rules)
                if not dups:
                    dups = []
                dir_dups.extend(dups)
        return dir_dups

    dir_dups = add_dir_books(db, dirs, one_book_per_directory, recurse, added_ids, compiled_rules)

    if add_duplicates:
        for mi, formats in dir_dups:
            book_id = db.import_book(mi, formats)
            added_ids.add(book_id)
    else:
        if dir_dups or file_duplicates:
            print >>sys.stderr, _('The following books were not added as '
                                  'they already exist in the database '
                                  '(see --duplicates option):')
        for mi, formats in dir_dups:
            title = mi.title
            if isinstance(title, unicode):
                title = title.encode(preferred_encoding)
            print >>sys.stderr, '\t', title + ':'
            for path in formats:
                print >>sys.stderr, '\t\t ', path
        if file_duplicates:
            for path, mi in zip(file_duplicates[0], file_duplicates[2]):
                title = mi.title
                if isinstance(title, unicode):
                    title = title.encode(preferred_encoding)
                print >>sys.stderr, '\t', title+':'
                print >>sys.stderr, '\t\t ', path

    write_dirtied(db)
    if added_ids:
        prints(_('Added book ids: %s')%(', '.join(map(type(u''),
            added_ids))))
    send_message()


def do_set_metadata(db, id, stream):
    """Set the metadata stored in the calibre database for the book identified by id."""
    mi = OPF(stream).to_book_metadata()
    db.set_metadata(id, mi)


def do_export(db, ids, dir, opts):
    """Export the books specified by ids to the filesystem."""
    if ids is None:
        ids = list(db.all_ids())
    from calibre.library.save_to_disk import save_to_disk
    failures = save_to_disk(db, ids, dir, opts=opts)

    if failures:
        prints('Failed to save the following books:')
        for id, title, tb in failures:
            prints(str(id)+':', title)
            prints('\t'+'\n\t'.join(tb.splitlines()))
            prints(' ')


def do_add_custom_column(db, label, name, datatype, is_multiple, display):
    """Create a custom column."""
    num = db.create_custom_column(label, name, datatype, is_multiple, display=display)
    prints('Custom column created with id: %s'%num)


def do_remove_custom_column(db, label, force):
    """Remove the custom column identified by label."""
    if not force:
        q = raw_input(_('You will lose all data in the column: %s.'
            ' Are you sure (y/n)? ')%label)
        if q.lower().strip() != _('y'):
            return
    try:
        db.delete_custom_column(label=label)
    except KeyError:
        prints(_('No column named %s found. You must use column labels, not titles.'
               ' Use calibredb custom_columns to get a list of labels.')%label, file=sys.stderr)
        raise SystemExit(1)
    prints('Column %r removed.'%label)


def do_set_custom(db, col, id_, val, append):
    """Set the value of a custom column for the book identified by id."""
    if id_ not in db.all_ids():
        prints(_('No book with id: %s in the database')%id_, file=sys.stderr)
        raise SystemExit(1)
    if db.custom_column_label_map[col]['datatype'] == 'series':
        val, s_index = parse_series_string(db, col, val)
        db.set_custom(id_, val, extra=s_index, label=col, append=append)
        prints('Data set to: %r[%4.2f]'%
               (db.get_custom(id_, label=col, index_is_id=True),
                db.get_custom_extra(id_, label=col, index_is_id=True)))
    else:
        db.set_custom(id_, val, label=col, append=append)
        prints('Data set to: %r'%db.get_custom(id_, label=col, index_is_id=True))
    write_dirtied(db)
    send_message()


def do_show_metadata(db, id, as_opf):
    """Show the metadata stored in the calibre database for the book identified by id."""
    if not db.has_id(id):
        raise ValueError('Id #%d is not present in database.'%id)
    mi = db.get_metadata(id, index_is_id=True)
    if as_opf:
        mi = OPFCreator(os.getcwdu(), mi)
        mi.render(sys.stdout)
    else:
        prints(unicode(mi))


def do_remove(db, ids):
    """Remove the books identified by ids from the database."""
    book_ids = set()
    for x in ids:
        if isinstance(x, int):
            book_ids.add(x)
        else:
            book_ids |= set(x)

    db.new_api.remove_books(book_ids)
    db.clean()
    send_message()
    from calibre.db.delete_service import delete_service
    delete_service().wait()


def do_add_format(db, id, fmt, path, opts):
    """Add the e-book in ebook_file to the available formats for the logical book identified by id."""
    done = db.add_format_with_hooks(id, fmt.upper(), path, index_is_id=True,
                             replace=opts.replace)
    if not done and not opts.replace:
        prints(_('A %(fmt)s file already exists for book: %(id)d, not replacing')%dict(fmt=fmt.upper(), id=id))
    else:
        send_message()


def do_remove_format(db, id, fmt):
    """Remove the format fmt from the logical book identified by id."""
    db.remove_format(id, fmt, index_is_id=True)
    send_message()
    from calibre.db.delete_service import delete_service
    delete_service().wait()


def do_embed_metadata(db, ids, only_fmts):
    """Update the metadata in the actual book files stored in the calibre library from the metadata in the calibre database."""
    def progress(i, total, mi):
        prints(_('Processed {0} ({1} of {2})').format(mi.title, i, total))
    db.new_api.embed_metadata(ids, only_fmts=only_fmts, report_progress=progress)


def do_backup_metadata(db, book_ids, callback):
    """Backup the metadata stored in the database into individual OPF files in each books directory."""
    db.dump_metadata(book_ids=book_ids, callback=callback)


def do_restore_database(dbpath):
    """Restore this database from the metadata stored in OPF files in each directory of the calibre library."""
    class Progress(object):

        def __init__(self):
            self.total = 1

        def __call__(self, msg, step):
            if msg is None:
                self.total = float(step)
            else:
                prints(msg, '...', '%d%%'%int(100*(step/self.total)))
    from calibre.db.restore import Restore
    r = Restore(dbpath, progress_callback=Progress())
    r.start()
    r.join()

    if r.tb is not None:
        prints('Restoring database failed with error:')
        prints(r.tb)
    else:
        prints('Restoring database succeeded')
        prints('old database saved as', r.olddb)
        if r.errors_occurred:
            name = 'calibre_db_restore_report.txt'
            open('calibre_db_restore_report.txt',
                    'wb').write(r.report.encode('utf-8'))
            prints('Some errors occurred. A detailed report was '
                    'saved to', name)


def do_check_library(dbpath, report, exts, names):
    """Perform some checks on the filesystem representing a library."""
    if not LibraryDatabase.exists_at(dbpath):
        prints('No library found at', dbpath, file=sys.stderr)
        raise SystemExit(1)

    db = LibraryDatabase(dbpath)
    print _('Vacuuming database...')
    db.new_api.vacuum()
    checker = CheckLibrary(dbpath, db)
    checker.scan_library(names, exts)
    for check in report:
        _print_check_library_results(checker, check, as_csv=False)


def do_list_categories(db, report_on, item_count, csv, quote, width, separator):
    """Produce a report of the category information in the database."""
    category_data = db.get_categories()
    data = []
    categories = [k for k in category_data.keys()
                  if db.metadata_for_field(k)['kind'] not in ['user', 'search'] and
                  (not report_on or k in report_on)]

    categories.sort(cmp=lambda x,y: cmp(x if x[0] != '#' else x[1:],
                                        y if y[0] != '#' else y[1:]))
    if not item_count:
        for category in categories:
            is_rating = db.metadata_for_field(category)['datatype'] == 'rating'
            for tag in category_data[category]:
                if is_rating:
                    tag.name = unicode(len(tag.name))
                data.append({'category':category, 'tag_name':tag.name,
                             'count':unicode(tag.count), 'rating':unicode(tag.avg_rating)})
    else:
        for category in categories:
            data.append({'category':category,
                         'tag_name':_('CATEGORY ITEMS'),
                         'count': len(category_data[category]), 'rating': 0.0})

    fields = ['category', 'tag_name', 'count', 'rating']

    def do_list():
        from calibre.utils.terminal import geometry, ColoredStream

        separator = ' '
        widths = list(map(lambda x: 0, fields))
        for i in data:
            for j, field in enumerate(fields):
                widths[j] = max(widths[j], max(len(field), len(unicode(i[field]))))

        screen_width = geometry()[0]
        if not screen_width:
            screen_width = 80
        field_width = screen_width//len(fields)
        base_widths = map(lambda x: min(x+1, field_width), widths)

        while sum(base_widths) < screen_width:
            adjusted = False
            for i in range(len(widths)):
                if base_widths[i] < widths[i]:
                    base_widths[i] += min(screen_width-sum(base_widths), widths[i]-base_widths[i])
                    adjusted = True
                    break
            if not adjusted:
                break

        widths = list(base_widths)
        titles = map(lambda x, y: '%-*s%s'%(x-len(separator), y, separator),
                widths, fields)
        with ColoredStream(sys.stdout, fg='green'):
            print ''.join(titles)

        wrappers = map(lambda x: TextWrapper(x-1), widths)
        o = cStringIO.StringIO()

        for record in data:
            text = [wrappers[i].wrap(unicode(record[field]).encode('utf-8')) for i, field in enumerate(fields)]
            lines = max(map(len, text))
            for l in range(lines):
                for i, field in enumerate(text):
                    ft = text[i][l] if l < len(text[i]) else ''
                    o.write(ft)
                    if i < len(text) - 1:
                        filler = '%*s'%(widths[i]-len(ft)-1, '')
                        o.write(filler+separator)
                print >>o
        return o.getvalue()

    def do_csv():
        lf = '{category},"{tag_name}",{count},{rating}'
        lf = lf.replace(',', separator).replace(r'\t','\t').replace(r'\n','\n')
        lf = lf.replace('"', quote)
        for d in data:
            print lf.format(**d)

    if csv:
        do_csv()
    else:
        do_list()


def do_clone(dbpath, loc):
    """Create a clone of the current library."""
    db = LibraryDatabase(dbpath)
    loc = os.path.abspath(loc)

    if patheq(loc, db.library_path):
        prints(_('The location for the new library is the same as the current library'))
        return 1
    empty = not os.listdir(loc)
    if not empty:
        prints(_('%s is not empty. You must choose an empty directory for the new library.') % loc)
        return 1
    if iswindows and len(loc) > LibraryDatabase.WINDOWS_LIBRARY_PATH_LIMIT:
        prints(_('Path to library too long. Must be less than'
                    ' %d characters.')%LibraryDatabase.WINDOWS_LIBRARY_PATH_LIMIT)
        return 1
    dbprefs = dict(db.prefs)
    db.close()
    LibraryDatabase(loc, default_prefs=dbprefs)


def do_search(db, q, limit):
    """Search the library for the specified search term, returning a comma separated list of book ids matching the search expression."""
    ids = db.new_api.search(q)
    if not ids:
        prints(_('No books matching the search expression:') + ' ' + q, file=sys.stderr)
        raise SystemExit(1)
    prints(','.join(map(str, sorted(ids)[:limit])), end='')


def command_list(args, dbpath):
    pre = get_parser('')
    pargs = [x for x in args if x.startswith('--with-library') or x.startswith('--library-path') or
             not x.startswith('-')]
    opts = pre.parse_args(sys.argv[:1] + pargs)[0]
    db = get_db(dbpath, opts)
    parser = list_option_parser(db=db)
    opts, args = parser.parse_args(sys.argv[:1] + args)
    afields = set(FIELDS) | {'id'}
    if db is not None:
        for f, data in db.custom_column_label_map.iteritems():
            afields.add('*'+f)
            if data['datatype'] == 'series':
                afields.add('*'+f+'_index')
    if opts.fields.strip():
        fields = [str(f.strip().lower()) for f in opts.fields.split(',')]
        if 'all' in fields:
            fields = sorted(list(afields))
        if not set(fields).issubset(afields):
            parser.print_help()
            print
            prints(_('Invalid fields. Available fields:'),
                    ','.join(sorted(afields)), file=sys.stderr)
            return 1
    else:
        fields = []

    if opts.sort_by not in afields and opts.sort_by is not None:
        parser.print_help()
        print
        prints(_('Invalid sort field. Available fields:'), ','.join(afields),
                file=sys.stderr)
        return 1

    print do_list(db, fields, afields, opts.sort_by, opts.ascending, opts.search, opts.line_width, opts.separator,
            opts.prefix, opts.limit, for_machine=opts.for_machine)
    return 0


def command_add(args, dbpath):
    parser = add_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    aut = string_to_authors(opts.authors) if opts.authors else []
    tags = [x.strip() for x in opts.tags.split(',')] if opts.tags else []
    lcodes = [canonicalize_lang(x) for x in (opts.languages or '').split(',')]
    lcodes = [x for x in lcodes if x]
    identifiers = (x.partition(':')[::2] for x in opts.identifier)
    identifiers = dict((k.strip(), v.strip()) for k, v in identifiers if k.strip() and v.strip())
    if opts.empty:
        do_add_empty(get_db(dbpath, opts), opts.title, aut, opts.isbn, tags,
                opts.series, opts.series_index, opts.cover, identifiers, lcodes)
        return 0
    if len(args) < 2:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify at least one file to add')
        return 1
    do_add(get_db(dbpath, opts), args[1:], opts.one_book_per_directory,
            opts.recurse, opts.duplicates, opts.title, aut, opts.isbn,
            tags, opts.series, opts.series_index, opts.cover, identifiers, lcodes, opts.filters)
    return 0


def command_remove(args, dbpath):
    parser = remove_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    if len(args) < 2:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify at least one book to remove')
        return 1

    ids = []
    for x in args[1].split(','):
        y = x.split('-')
        if len(y) > 1:
            ids.extend(range(int(y[0]), int(y[1])))
        else:
            ids.append(int(y[0]))

    do_remove(get_db(dbpath, opts), set(ids))

    return 0


def command_add_format(args, dbpath):
    parser = add_format_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    if len(args) < 3:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify an id and an e-book file')
        return 1

    id, path, fmt = int(args[1]), args[2], os.path.splitext(args[2])[-1]
    if not fmt:
        print _('e-book file must have an extension')
    do_add_format(get_db(dbpath, opts), id, fmt[1:], path, opts)
    return 0


def command_remove_format(args, dbpath):
    parser = remove_format_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    if len(args) < 3:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify an id and a format')
        return 1

    id, fmt = int(args[1]), args[2].upper()
    do_remove_format(get_db(dbpath, opts), id, fmt)
    return 0


def command_show_metadata(args, dbpath):
    parser = show_metadata_option_parser()
    opts, args = parser.parse_args(sys.argv[1:]+args)
    if len(args) < 2:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify an id')
        return 1
    id = int(args[1])
    do_show_metadata(get_db(dbpath, opts), id, opts.as_opf)
    return 0


def command_set_metadata(args, dbpath):
    parser = set_metadata_option_parser()
    opts, args = parser.parse_args(sys.argv[0:1]+args)
    db = get_db(dbpath, opts)

    def fields():
        for key in sorted(db.field_metadata.all_field_keys()):
            m = db.field_metadata[key]
            if (key not in {'formats', 'series_sort', 'ondevice', 'path',
                'last_modified'} and m['is_editable'] and m['name']):
                yield key, m
                if m['datatype'] == 'series':
                    si = m.copy()
                    si['name'] = m['name'] + ' Index'
                    si['datatype'] = 'float'
                    yield key+'_index', si
        c = db.field_metadata['cover'].copy()
        c['datatype'] = 'text'
        yield 'cover', c

    if opts.list_fields:
        prints('%-40s'%_('Title'), _('Field name'), '\n')
        for key, m in fields():
            prints('%-40s'%m['name'], key)

        return 0

    def verify_int(x):
        try:
            int(x)
            return True
        except:
            return False

    if len(args) < 2 or not verify_int(args[1]):
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify a record id as the '
                'first argument')
        return 1
    if len(args) < 3 and not opts.field:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify either a field or an opf file')
        return 1
    book_id = int(args[1])
    if book_id not in db.all_ids():
        prints(_('No book with id: %s in the database')%book_id, file=sys.stderr)
        raise SystemExit(1)

    if len(args) > 2:
        opf = args[2]
        if not os.path.exists(opf):
            prints(_('The OPF file %s does not exist')%opf, file=sys.stderr)
            return 1
        do_set_metadata(db, book_id, opf)

    if opts.field:
        fields = {k:v for k, v in fields()}
        fields['title_sort'] = fields['sort']
        vals = {}
        for x in opts.field:
            field, val = x.partition(':')[::2]
            if field == 'sort':
                field = 'title_sort'
            if field not in fields:
                print >>sys.stderr, _('%s is not a known field'%field)
                return 1
            val = field_from_string(field, val, fields[field])
            vals[field] = val
        mi = db.get_metadata(book_id, index_is_id=True, get_cover=False)
        for field, val in sorted(  # ensure series_index fields are set last
                vals.iteritems(), key=lambda k: 1 if k[0].endswith('_index') else 0):
            if field.endswith('_index'):
                try:
                    val = float(val)
                except Exception:
                    print >>sys.stderr, 'The value %r is not a valid series index' % val
                    raise SystemExit(1)
                sname = mi.get(field[:-6])
                if not sname:
                    print >>sys.stderr, 'Cannot set index for series before setting the series name'
                    raise SystemExit(1)
                mi.set(field[:-6], sname, extra=val)
                if field == 'series_index':
                    mi.series_index = val  # extra has no effect for the builtin series field
            else:
                mi.set(field, val)
        db.set_metadata(book_id, mi, force_changes=True)
    db.clean()
    do_show_metadata(db, book_id, False)
    write_dirtied(db)
    send_message()

    return 0


def command_embed_metadata(args, dbpath):
    parser = embed_metadata_option_parser()
    opts, args = parser.parse_args(sys.argv[0:1]+args)
    db = get_db(dbpath, opts)
    ids = set()
    for x in args[1:]:
        if x == 'all':
            ids = db.new_api.all_book_ids()
            break
        parts = x.split('-')
        if len(parts) == 1:
            ids.add(int(parts[0]))
        else:
            ids |= {x for x in xrange(int(parts[0], int(parts[1])))}
    only_fmts = opts.only_formats or None

    def progress(i, total, mi):
        prints(_('Processed {0} ({1} of {2})').format(mi.title, i, total))
    db.new_api.embed_metadata(ids, only_fmts=only_fmts, report_progress=progress)
    send_message()


def command_add_custom_column(args, dbpath):
    import json
    parser = add_custom_column_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 3:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify label, name and datatype')
        return 1
    do_add_custom_column(get_db(dbpath, opts), args[0], args[1], args[2],
            opts.is_multiple, json.loads(opts.display))
    # Re-open the DB so that  field_metadata is reflects the column changes
    db = get_db(dbpath, opts)
    db.prefs['field_metadata'] = db.field_metadata.all_metadata()
    return 0


def command_custom_columns(args, dbpath):
    parser = custom_columns_option_parser()
    opts, args = parser.parse_args(args)
    do_custom_columns(get_db(dbpath, opts), opts.details)
    return 0


def command_remove_custom_column(args, dbpath):
    parser = remove_custom_column_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 1:
        parser.print_help()
        print
        prints(_('Error: You must specify a column label'), file=sys.stderr)
        return 1

    do_remove_custom_column(get_db(dbpath, opts), args[0], opts.force)
    # Re-open the DB so that  field_metadata is reflects the column changes
    db = get_db(dbpath, opts)
    db.prefs['field_metadata'] = db.field_metadata.all_metadata()
    return 0


def command_saved_searches(args, dbpath):
    parser = saved_searches_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 1:
        parser.print_help()
        print
        prints(_('Error: You must specify an action (add|remove|list)'), file=sys.stderr)
        return 1
    db = get_db(dbpath, opts)
    if args[0] == 'list':
        for name in db.saved_search_names():
            prints(_('Name:'), name)
            prints(_('Search string:'), db.saved_search_lookup(name))
            print
    elif args[0] == 'add':
        if len(args) < 3:
            parser.print_help()
            print
            prints(_('Error: You must specify a name and a search string'), file=sys.stderr)
            return 1
        db.saved_search_add(args[1], args[2])
        prints(args[1], _('added'))
    elif args[0] == 'remove':
        if len(args) < 2:
            parser.print_help()
            print
            prints(_('Error: You must specify a name'), file=sys.stderr)
            return 1
        db.saved_search_delete(args[1])
        prints(args[1], _('removed'))
    else:
        parser.print_help()
        print
        prints(_('Error: Action %s not recognized, must be one '
            'of: (add|remove|list)') % args[1], file=sys.stderr)
        return 1

    return 0


def command_backup_metadata(args, dbpath):
    parser = backup_metadata_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) != 0:
        parser.print_help()
        return 1

    if opts.library_path is not None:
        dbpath = opts.library_path
    if isbytestring(dbpath):
        dbpath = dbpath.decode(preferred_encoding)
    db = LibraryDatabase(dbpath)
    book_ids = None
    if opts.all:
        book_ids = db.all_ids()
    db.dump_metadata(book_ids=book_ids, callback=BackupProgress())


def command_check_library(args, dbpath):
    parser = check_library_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) != 0:
        parser.print_help()
        return 1

    if opts.library_path is not None:
        dbpath = opts.library_path

    if isbytestring(dbpath):
        dbpath = dbpath.decode(preferred_encoding)

    if opts.report is None:
        checks = CHECKS
    else:
        checks = []
        for r in opts.report.split(','):
            found = False
            for c in CHECKS:
                if c[0] == r:
                    checks.append(c)
                    found = True
                    break
            if not found:
                print _('Unknown report check'), r
                return 1

    if opts.names is None:
        names = []
    else:
        names = [f.strip() for f in opts.names.split(',') if f.strip()]
    if opts.exts is None:
        exts = []
    else:
        exts = [f.strip() for f in opts.exts.split(',') if f.strip()]

    if not LibraryDatabase.exists_at(dbpath):
        prints('No library found at', dbpath, file=sys.stderr)
        raise SystemExit(1)

    db = LibraryDatabase(dbpath)
    print _('Vacuuming database...')
    db.new_api.vacuum()
    checker = CheckLibrary(dbpath, db)
    checker.scan_library(names, exts)
    for check in checks:
        _print_check_library_results(checker, check, as_csv=opts.csv)


def command_restore_database(args, dbpath):
    parser = restore_database_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) != 0:
        parser.print_help()
        return 1

    if not opts.really_do_it:
        prints(_('You must provide the %s option to do a'
            ' recovery')%'--really-do-it', end='\n\n')
        parser.print_help()
        return 1

    if opts.library_path is not None:
        dbpath = opts.library_path

    if isbytestring(dbpath):
        dbpath = dbpath.decode(preferred_encoding)

    class Progress(object):

        def __init__(self):
            self.total = 1

        def __call__(self, msg, step):
            if msg is None:
                self.total = float(step)
            else:
                prints(msg, '...', '%d%%'%int(100*(step/self.total)))
    from calibre.db.restore import Restore
    r = Restore(dbpath, progress_callback=Progress())
    r.start()
    r.join()

    if r.tb is not None:
        prints('Restoring database failed with error:')
        prints(r.tb)
    else:
        prints('Restoring database succeeded')
        prints('old database saved as', r.olddb)
        if r.errors_occurred:
            name = 'calibre_db_restore_report.txt'
            open('calibre_db_restore_report.txt',
                    'wb').write(r.report.encode('utf-8'))
            prints('Some errors occurred. A detailed report was '
                    'saved to', name)


def command_list_categories(args, dbpath):
    parser = list_categories_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) != 0:
        parser.print_help()
        return 1

    if opts.library_path is not None:
        dbpath = opts.library_path

    if isbytestring(dbpath):
        dbpath = dbpath.decode(preferred_encoding)

    db = LibraryDatabase(dbpath)
    category_data = db.get_categories()
    data = []
    report_on = [c.strip() for c in opts.report.split(',') if c.strip()]
    categories = [k for k in category_data.keys()
                  if db.metadata_for_field(k)['kind'] not in ['user', 'search'] and
                  (not report_on or k in report_on)]

    categories.sort(cmp=lambda x,y: cmp(x if x[0] != '#' else x[1:],
                                        y if y[0] != '#' else y[1:]))
    if not opts.item_count:
        for category in categories:
            is_rating = db.metadata_for_field(category)['datatype'] == 'rating'
            for tag in category_data[category]:
                if is_rating:
                    tag.name = unicode(len(tag.name))
                data.append({'category':category, 'tag_name':tag.name,
                             'count':unicode(tag.count), 'rating':unicode(tag.avg_rating)})
    else:
        for category in categories:
            data.append({'category':category,
                         'tag_name':_('CATEGORY ITEMS'),
                         'count': len(category_data[category]), 'rating': 0.0})

    fields = ['category', 'tag_name', 'count', 'rating']

    def do_list():
        from calibre.utils.terminal import geometry, ColoredStream

        separator = ' '
        widths = list(map(lambda x: 0, fields))
        for i in data:
            for j, field in enumerate(fields):
                widths[j] = max(widths[j], max(len(field), len(unicode(i[field]))))

        screen_width = geometry()[0]
        if not screen_width:
            screen_width = 80
        field_width = screen_width//len(fields)
        base_widths = map(lambda x: min(x+1, field_width), widths)

        while sum(base_widths) < screen_width:
            adjusted = False
            for i in range(len(widths)):
                if base_widths[i] < widths[i]:
                    base_widths[i] += min(screen_width-sum(base_widths), widths[i]-base_widths[i])
                    adjusted = True
                    break
            if not adjusted:
                break

        widths = list(base_widths)
        titles = map(lambda x, y: '%-*s%s'%(x-len(separator), y, separator),
                widths, fields)
        with ColoredStream(sys.stdout, fg='green'):
            print ''.join(titles)

        wrappers = map(lambda x: TextWrapper(x-1), widths)
        o = cStringIO.StringIO()

        for record in data:
            text = [wrappers[i].wrap(unicode(record[field]).encode('utf-8')) for i, field in enumerate(fields)]
            lines = max(map(len, text))
            for l in range(lines):
                for i, field in enumerate(text):
                    ft = text[i][l] if l < len(text[i]) else ''
                    o.write(ft)
                    if i < len(text) - 1:
                        filler = '%*s'%(widths[i]-len(ft)-1, '')
                        o.write(filler+separator)
                print >>o
        return o.getvalue()

    def do_csv():
        lf = '{category},"{tag_name}",{count},{rating}'
        lf = lf.replace(',', opts.separator).replace(r'\t','\t').replace(r'\n','\n')
        lf = lf.replace('"', opts.quote)
        for d in data:
            print lf.format(**d)

    if opts.csv:
        do_csv()
    else:
        do_list()

    return parser


def command_clone(args, dbpath):
    parser = clone_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 1:
        parser.print_help()
        print
        prints(_('Error: You must specify the path to the cloned library'))
        return 1
    db = get_db(dbpath, opts)
    loc = args[0]
    if not os.path.exists(loc):
        os.makedirs(loc)
    loc = os.path.abspath(loc)

    if patheq(loc, db.library_path):
        prints(_('The location for the new library is the same as the current library'))
        return 1
    empty = not os.listdir(loc)
    if not empty:
        prints(_('%s is not empty. You must choose an empty directory for the new library.') % loc)
        return 1
    if iswindows and len(loc) > LibraryDatabase.WINDOWS_LIBRARY_PATH_LIMIT:
        prints(_('Path to library too long. Must be less than'
                    ' %d characters.')%LibraryDatabase.WINDOWS_LIBRARY_PATH_LIMIT)
        return 1
    dbprefs = dict(db.prefs)
    db.close()
    LibraryDatabase(loc, default_prefs=dbprefs)


def command_search(args, dbpath):
    parser = search_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 1:
        parser.print_help()
        print
        prints(_('Error: You must specify the search expression'))
        return 1
    db = get_db(dbpath, opts)
    q = ' '.join(args)
    ids = db.new_api.search(q)
    if not ids:
        prints(_('No books matching the search expression:') + ' ' + q, file=sys.stderr)
        raise SystemExit(1)
    prints(','.join(map(str, sorted(ids)[:opts.limit])), end='')


def option_parser():
    parser = OptionParser(_(
'''\
%prog command [options] [arguments]

%prog is the command line interface to the calibre books database.

command is one of:
  %s

For help on an individual command: %prog command --help
'''
                          )%'\n  '.join(COMMANDS))
    return parser


def main(args=sys.argv):
    parser = option_parser()
    if len(args) < 2:
        parser.print_help()
        return 1
    if args[1] not in COMMANDS:
        if args[1] == '--version':
            parser.print_version()
            return 0
        parser.print_help()
        return 1

    command = eval('command_'+args[1])
    dbpath = prefs['library_path']

    return command(args[2:], dbpath)


if __name__ == '__main__':
    sys.exit(main())