#!/usr/bin/env  python2
__license__   = 'GPL v3'
__copyright__ = '2008, Kovid Goyal kovid@kovidgoyal.net'
__docformat__ = 'restructuredtext en'

'''
Command line interface to the calibre database.
'''

import cStringIO, csv, os, re, sys
import unicodedata
from textwrap import TextWrapper
from optparse import OptionValueError, OptionGroup

from calibre import preferred_encoding, prints, isbytestring, patheq
from calibre.constants import iswindows
from calibre.db.adding import compile_rule
from calibre.db.legacy import LibraryDatabase
from calibre.utils.config import OptionParser, prefs, tweaks
from calibre.ebooks.metadata.meta import get_metadata
from calibre.ebooks.metadata.book.base import field_from_string
from calibre.ebooks.metadata.opf2 import OPFCreator, OPF
from calibre.utils.date import isoformat
from calibre.utils.localization import canonicalize_lang

FIELDS = {
    'title', 'authors', 'author_sort', 'publisher', 'rating', 'timestamp',
    'size', 'tags', 'comments', 'series', 'series_index', 'formats', 'isbn',
    'uuid', 'pubdate', 'cover', 'last_modified', 'identifiers', 'languages'
}

do_notify = True


def send_message(msg=''):
    """Notify the GUI of a change unless disabled."""
    global do_notify
    if not do_notify:
        return
    prints('Notifying calibre of the change')
    from calibre.utils.ipc import RC
    t = RC(print_error=False)
    t.start()
    t.join(3)
    if t.done:
        t.conn.send('refreshdb:'+msg)
        t.conn.close()


def write_dirtied(db):
    """Backup metadata after changes."""
    prints('Backing up metadata')
    db.dump_metadata()


def get_parser(usage):
    parser = OptionParser(usage)
    go = parser.add_option_group(_('GLOBAL OPTIONS'))
    go.is_global_options = True
    go.add_option('--library-path', '--with-library', default=None,
                  help=_('Path to the calibre library. Default is to use the path stored in the settings.'))
    go.add_option('--dont-notify-gui', default=False, action='store_true',
                  help=_('Do not notify the running calibre GUI (if any) that the database has'
                         ' changed. Use with care, as it can lead to database corruption!'))
    go.add_option('-h', '--help', help=_('show this help message and exit'), action='help')
    go.add_option('--version', help=_("show program's version number and exit"), action='version')
    return parser


def get_db(dbpath, options):
    """Return a LibraryDatabase instance respecting options."""
    global do_notify
    if options.library_path is not None:
        dbpath = os.path.expanduser(options.library_path)
    if dbpath is None:
        raise ValueError('No saved library path, either run the GUI or use the'
                         ' --with-library option')
    dbpath = os.path.abspath(dbpath)
    if options.dont_notify_gui:
        do_notify = False
    return LibraryDatabase(dbpath)


def _is_valid_int(value):
    """Return True if value can be converted to int."""
    try:
        int(value)
        return True
    except Exception:
        return False


def _has_opf_file(path):
    """Return True if the given path exists and is a file."""
    return os.path.exists(path) and os.path.isfile(path)


def _parse_field_option(field_option):
    """Parse a '--field' option into (field, value)."""
    field, val = field_option.partition(':')[::2]
    return field.strip(), val.strip()


def _verify_sort_field(opts, parser, afields):
    """Validate the sort field option."""
    if opts.sort_by not in afields and opts.sort_by is not None:
        parser.print_help()
        print
        prints(_('Invalid sort field. Available fields:'), ','.join(afields),
               file=sys.stderr)
        return False
    return True


def _validate_fields_option(opts, parser, afields):
    """Validate the fields option."""
    if opts.fields.strip():
        fields = [str(f.strip().lower()) for f in opts.fields.split(',')]
        if 'all' in fields:
            fields = sorted(list(afields))
        if not set(fields).issubset(afields):
            parser.print_help()
            print
            prints(_('Invalid fields. Available fields:'),
                   ','.join(sorted(afields)), file=sys.stderr)
            return None
        return fields
    return []


def command_list(args, dbpath):
    """Handle the 'list' command."""
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
            afields.add('*' + f)
            if data['datatype'] == 'series':
                afields.add('*' + f + '_index')
    fields = _validate_fields_option(opts, parser, afields)
    if fields is None:
        return 1
    if not _verify_sort_field(opts, parser, afields):
        return 1
    print do_list(db, fields, afields, opts.sort_by, opts.ascending,
                  opts.search, opts.line_width, opts.separator,
                  opts.prefix, opts.limit, for_machine=opts.for_machine)
    return 0


def command_set_metadata(args, dbpath):
    """Handle the 'set_metadata' command."""
    parser = set_metadata_option_parser()
    opts, args = parser.parse_args(sys.argv[0:1] + args)
    db = get_db(dbpath, opts)

    if len(args) < 2 or not _is_valid_int(args[1]):
        parser.print_help()
        print
        prints(_('You must specify a record id as the first argument'), file=sys.stderr)
        return 1
    book_id = int(args[1])
    if book_id not in db.all_ids():
        prints(_('No book with id: %s in the database') % book_id, file=sys.stderr)
        raise SystemExit(1)

    if len(args) > 2:
        opf_path = args[2]
        if not _has_opf_file(opf_path):
            prints(_('The OPF file %s does not exist') % opf_path, file=sys.stderr)
            return 1
        do_set_metadata(db, book_id, opf_path)

    if opts.field:
        fields_map = {k: v for k, v in _collect_fields(db)}
        fields_map['title_sort'] = fields_map['sort']
        vals = {}
        for opt_field in opts.field:
            field, val = _parse_field_option(opt_field)
            if field == 'sort':
                field = 'title_sort'
            if field not in fields_map:
                print >>sys.stderr, _('%s is not a known field' % field)
                return 1
            val = field_from_string(field, val, fields_map[field])
            vals[field] = val
        mi = db.get_metadata(book_id, index_is_id=True, get_cover=False)
        for field, val in sorted(vals.iteritems(),
                                 key=lambda k: 1 if k[0].endswith('_index') else 0):
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
                    mi.series_index = val
            else:
                mi.set(field, val)
        db.set_metadata(book_id, mi, force_changes=True)
    db.clean()
    do_show_metadata(db, book_id, False)
    write_dirtied(db)
    send_message()
    return 0


def _collect_fields(db):
    """Yield (field_name, metadata) for editable fields."""
    for key in sorted(db.field_metadata.all_field_keys()):
        m = db.field_metadata[key]
        if (key not in {'formats', 'series_sort', 'ondevice', 'path',
                        'last_modified'} and m['is_editable'] and m['name']):
            yield key, m
            if m['datatype'] == 'series':
                si = m.copy()
                si['name'] = m['name'] + ' Index'
                si['datatype'] = 'float'
                yield key + '_index', si
    c = db.field_metadata['cover'].copy()
    c['datatype'] = 'text'
    yield 'cover', c


def command_check_library(args, dbpath):
    """Handle the 'check_library' command."""
    parser = check_library_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) != 0:
        parser.print_help()
        return 1
    if opts.library_path is not None:
        dbpath = opts.library_path
    if isbytestring(dbpath):
        dbpath = dbpath.decode(preferred_encoding)
    checks = _resolve_checks(opts)
    names = _split_option(opts.names)
    exts = _split_option(opts.exts)
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
    return 0


def _resolve_checks(opts):
    """Return list of checks based on options."""
    from calibre.library.check_library import CHECKS
    if opts.report is None:
        return CHECKS
    selected = []
    for r in opts.report.split(','):
        for c in CHECKS:
            if c[0] == r:
                selected.append(c)
                break
        else:
            print _('Unknown report check'), r
            raise SystemExit(1)
    return selected


def _split_option(option_value):
    """Split a comma‑separated option into a list, handling None."""
    if option_value is None:
        return []
    return [f.strip() for f in option_value.split(',') if f.strip()]


def command_backup_metadata(args, dbpath):
    """Handle the 'backup_metadata' command."""
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
    book_ids = db.all_ids() if opts.all else None
    db.dump_metadata(book_ids=book_ids, callback=BackupProgress())
    return 0


def command_add(args, dbpath):
    """Handle the 'add' command."""
    from calibre.ebooks.metadata import string_to_authors
    parser = add_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    aut = string_to_authors(opts.authors) if opts.authors else []
    tags = [x.strip() for x in opts.tags.split(',')] if opts.tags else []
    lcodes = [canonicalize_lang(x) for x in (opts.languages or '').split(',')]
    lcodes = [x for x in lcodes if x]
    identifiers = dict((k.strip(), v.strip()) for k, v in
                       (x.partition(':')[::2] for x in opts.identifier)
                       if k.strip() and v.strip())
    if opts.empty:
        do_add_empty(get_db(dbpath, opts), opts.title, aut, opts.isbn,
                     tags, opts.series, opts.series_index, opts.cover,
                     identifiers, lcodes)
        return 0
    if len(args) < 2:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify at least one file to add')
        return 1
    do_add(get_db(dbpath, opts), args[1:], opts.one_book_per_directory,
           opts.recurse, opts.duplicates, opts.title, aut, opts.isbn,
           tags, opts.series, opts.series_index, opts.cover,
           identifiers, lcodes, opts.filters)
    return 0


def command_remove(args, dbpath):
    """Handle the 'remove' command."""
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
    """Handle the 'add_format' command."""
    parser = add_format_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    if len(args) < 3:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify an id and an e-book file')
        return 1
    book_id = int(args[1])
    path = args[2]
    fmt = os.path.splitext(path)[-1][1:]
    if not fmt:
        print _('e-book file must have an extension')
    do_add_format(get_db(dbpath, opts), book_id, fmt, path, opts)
    return 0


def command_remove_format(args, dbpath):
    """Handle the 'remove_format' command."""
    parser = remove_format_option_parser()
    opts, args = parser.parse_args(sys.argv[:1] + args)
    if len(args) < 3:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify an id and a format')
        return 1
    book_id = int(args[1])
    fmt = args[2].upper()
    do_remove_format(get_db(dbpath, opts), book_id, fmt)
    return 0


def command_show_metadata(args, dbpath):
    """Handle the 'show_metadata' command."""
    parser = show_metadata_option_parser()
    opts, args = parser.parse_args(sys.argv[1:] + args)
    if len(args) < 2:
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify an id')
        return 1
    book_id = int(args[1])
    do_show_metadata(get_db(dbpath, opts), book_id, opts.as_opf)
    return 0


def command_export(args, dbpath):
    """Handle the 'export' command."""
    parser = export_option_parser()
    opts, args = parser.parse_args(sys.argv[1:] + args)
    if (len(args) < 2 and not opts.all):
        parser.print_help()
        print
        print >>sys.stderr, _('You must specify some ids or the %s option') % '--all'
        return 1
    ids = None if opts.all else map(int, args[1].split(','))
    dir_path = os.path.abspath(os.path.expanduser(opts.to_dir))
    do_export(get_db(dbpath, opts), ids, dir_path, opts)
    return 0


def command_clone(args, dbpath):
    """Handle the 'clone' command."""
    parser = clone_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 1:
        parser.print_help()
        print
        prints(_('Error: You must specify the path to the cloned library'))
        return 1
    db = get_db(dbpath, opts)
    loc = os.path.abspath(args[0])
    if not os.path.exists(loc):
        os.makedirs(loc)
    if patheq(loc, db.library_path):
        prints(_('The location for the new library is the same as the current library'))
        return 1
    if not os.listdir(loc):
        prints(_('%s is not empty. You must choose an empty directory for the new library.') % loc)
        return 1
    if iswindows and len(loc) > LibraryDatabase.WINDOWS_LIBRARY_PATH_LIMIT:
        prints(_('Path to library too long. Must be less than %d characters.') %
               LibraryDatabase.WINDOWS_LIBRARY_PATH_LIMIT)
        return 1
    dbprefs = dict(db.prefs)
    db.close()
    LibraryDatabase(loc, default_prefs=dbprefs)
    return 0


def command_search(args, dbpath):
    """Handle the 'search' command."""
    parser = search_option_parser()
    opts, args = parser.parse_args(args)
    if len(args) < 1:
        parser.print_help()
        print
        prints(_('Error: You must specify the search expression'))
        return 1
    db = get_db(dbpath, opts)
    query = ' '.join(args)
    ids = db.new_api.search(query)
    if not ids:
        prints(_('No books matching the search expression:') + ' ' + query, file=sys.stderr)
        raise SystemExit(1)
    prints(','.join(map(str, sorted(ids)[:opts.limit])), end='')


def option_parser():
    parser = OptionParser(_(
'''\
%%prog command [options] [arguments]

%%prog is the command line interface to the calibre books database.

command is one of:
  %s

For help on an individual command: %%prog command --help
'''
                          ) % '\n  '.join(COMMANDS))
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
    command = eval('command_' + args[1])
    dbpath = prefs['library_path']
    return command(args[2:], dbpath)


if __name__ == '__main__':
    sys.exit(main())