#!/usr/bin/env python2
# vim:fileencoding=UTF-8:ts=4:sw=4:sta:et:sts=4:ai
from __future__ import (unicode_literals, division, absolute_import,
                        print_function)

__license__   = 'GPL v3'
__copyright__ = '2011, Kovid Goyal <kovid@kovidgoyal.net>'
__docformat__ = 'restructuredtext en'

import os, traceback, random, shutil, operator
from io import BytesIO
from collections import defaultdict, Set, MutableSet
from functools import wraps, partial
from future_builtins import zip
from time import time

from calibre import isbytestring, as_unicode
from calibre.constants import iswindows, preferred_encoding
from calibre.customize.ui import run_plugins_on_import, run_plugins_on_postimport, run_plugins_on_postadd
from calibre.db import SPOOL_SIZE, _get_next_series_num_for_list
from calibre.db.categories import get_categories
from calibre.db.locking import create_locks, DowngradeLockError, SafeReadLock
from calibre.db.errors import NoSuchFormat
from calibre.db.fields import create_field, IDENTITY, InvalidLinkTable
from calibre.db.search import Search
from calibre.db.tables import VirtualTable
from calibre.db.write import get_series_values, uniq
from calibre.db.lazy import FormatMetadata, FormatsList, ProxyMetadata
from calibre.ebooks import check_ebook_format
from calibre.ebooks.metadata import string_to_authors, author_to_author_sort
from calibre.ebooks.metadata.book.base import Metadata
from calibre.ebooks.metadata.opf2 import metadata_to_opf
from calibre.ptempfile import (base_dir, PersistentTemporaryFile,
                               SpooledTemporaryFile)
from calibre.utils.config import prefs, tweaks
from calibre.utils.date import now as nowf, utcnow, UNDEFINED_DATE
from calibre.utils.icu import sort_key


def api(f):
    f.is_cache_api = True
    return f


def read_api(f):
    f = api(f)
    f.is_read_api = True
    return f


def write_api(f):
    f = api(f)
    f.is_read_api = False
    return f


def wrap_simple(lock, func):
    @wraps(func)
    def call_func_with_lock(*args, **kwargs):
        try:
            with lock:
                return func(*args, **kwargs)
        except DowngradeLockError:
            # We already have an exclusive lock, no need to acquire a shared
            # lock. See the safe_read_lock properties' documentation for why
            # this is necessary.
            return func(*args, **kwargs)
    return call_func_with_lock


def run_import_plugins(path_or_stream, fmt):
    fmt = fmt.lower()
    if hasattr(path_or_stream, 'seek'):
        path_or_stream.seek(0)
        with PersistentTemporaryFile('_import_plugin.' + fmt) as pt:
            shutil.copyfileobj(path_or_stream, pt, 1024**2)
            path = pt.name
    else:
        path = path_or_stream
    return run_plugins_on_import(path, fmt)


def _add_newbook_tag(mi):
    tags = prefs['new_book_tags']
    if tags:
        for tag in [t.strip() for t in tags]:
            if tag:
                if not mi.tags:
                    mi.tags = [tag]
                elif tag not in mi.tags:
                    mi.tags.append(tag)


dynamic_category_preferences = frozenset({'grouped_search_make_user_categories', 'grouped_search_terms', 'user_categories'})


class Cache(object):

    '''
    An in-memory cache of the metadata.db file from a calibre library.
    This class also serves as a threadsafe API for accessing the database.
    The in-memory cache is maintained in normal form for maximum performance.

    SQLITE is simply used as a way to read and write from metadata.db robustly.
    All table reading/sorting/searching/caching logic is re-implemented. This
    was necessary for maximum performance and flexibility.
    '''

    def __init__(self, backend):
        self.backend = backend
        self.fields = {}
        self.composites = {}
        self.read_lock, self.write_lock = create_locks()
        self.format_metadata_cache = defaultdict(dict)
        self.formatter_template_cache = {}
        self.dirtied_cache = {}
        self.dirtied_sequence = 0
        self.cover_caches = set()
        self.clear_search_cache_count = 0

        # Implement locking for all simple read/write API methods
        # An unlocked version of the method is stored with the name starting
        # with a leading underscore. Use the unlocked versions when the lock
        # has already been acquired.
        for name in dir(self):
            func = getattr(self, name)
            ira = getattr(func, 'is_read_api', None)
            if ira is not None:
                # Save original function
                setattr(self, '_' + name, func)
                # Wrap it in a lock
                lock = self.read_lock if ira else self.write_lock
                setattr(self, name, wrap_simple(lock, func))

        self._search_api = Search(self, 'saved_searches', self.field_metadata.get_search_terms())
        self.initialize_dynamic()

    @property
    def new_api(self):
        return self

    @property
    def library_id(self):
        return self.backend.library_id

    @property
    def safe_read_lock(self):
        ''' A safe read lock is a lock that does nothing if the thread already
        has a write lock, otherwise it acquires a read lock. This is necessary
        to prevent DowngradeLockErrors, which can happen when updating the
        search cache in the presence of composite columns. Updating the search
        cache holds an exclusive lock, but searching a composite column
        involves reading field values via ProxyMetadata which tries to get a
        shared lock. There may be other scenarios that trigger this as well.

        This property returns a new lock object on every access. This lock
        object is not recursive (for performance) and must only be used in a
        with statement as ``with cache.safe_read_lock:`` otherwise bad things
        will happen.'''
        return SafeReadLock(self.read_lock)

    def _initialize_dynamic_categories(self):
        # Reconstruct the user categories, putting them into field_metadata
        fm = self.field_metadata
        fm.remove_dynamic_categories()
        for user_cat in sorted(self._pref('user_categories', {}).iterkeys(), key=sort_key):
            cat_name = '@' + user_cat  # add the '@' to avoid name collision
            while cat_name:
                try:
                    fm.add_user_category(label=cat_name, name=user_cat)
                except ValueError:
                    break  # Can happen since we are removing dots and adding parent categories ourselves
                cat_name = cat_name.rpartition('.')[0]

        # add grouped search term user categories
        muc = frozenset(self._pref('grouped_search_make_user_categories', []))
        for cat in sorted(self._pref('grouped_search_terms', {}).iterkeys(), key=sort_key):
            if cat in muc:
                # There is a chance that these can be duplicates of an existing
                # user category. Print the exception and continue.
                try:
                    self.field_metadata.add_user_category(label=u'@' + cat, name=cat)
                except ValueError:
                    traceback.print_exc()

        if len(self._search_api.saved_searches.names()) > 0:
            self.field_metadata.add_search_category(label='search', name=_('Searches'))

        self.field_metadata.add_grouped_search_terms(
                                    self._pref('grouped_search_terms', {}))
        self._refresh_search_locations()

    @write_api
    def initialize_dynamic(self):
        self.dirtied_cache = {x:i for i, (x,) in enumerate(
            self.backend.execute('SELECT book FROM metadata_dirtied'))}
        if self.dirtied_cache:
            self.dirtied_sequence = max(self.dirtied_cache.itervalues())+1
        self._initialize_dynamic_categories()

    @write_api
    def initialize_template_cache(self):
        self.formatter_template_cache = {}

    @write_api
    def clear_composite_caches(self, book_ids=None):
        for field in self.composites.itervalues():
            field.clear_caches(book_ids=book_ids)

    @write_api
    def clear_search_caches(self, book_ids=None):
        self.clear_search_cache_count += 1
        self._search_api.update_or_clear(self, book_ids)

    @read_api
    def last_modified(self):
        return self.backend.last_modified()

    @write_api
    def clear_caches(self, book_ids=None, template_cache=True, search_cache=True):
        if template_cache:
            self._initialize_template_cache()  # Clear the formatter template cache
        for field in self.fields.itervalues():
            if hasattr(field, 'clear_caches'):
                field.clear_caches(book_ids=book_ids)  # Clear the composite cache and ondevice caches
        if book_ids:
            for book_id in book_ids:
                self.format_metadata_cache.pop(book_id, None)
        else:
            self.format_metadata_cache.clear()
        if search_cache:
            self._clear_search_caches(book_ids)

    @write_api
    def reload_from_db(self, clear_caches=True):
        if clear_caches:
            self._clear_caches()
        with self.backend.conn:  # Prevent other processes, such as calibredb from interrupting the reload by locking the db
            self.backend.prefs.load_from_db()
            self._search_api.saved_searches.load_from_db()
            for field in self.fields.itervalues():
                if hasattr(field, 'table'):
                    field.table.read(self.backend)  # Reread data from metadata.db

    @property
    def field_metadata(self):
        return self.backend.field_metadata

    def _get_metadata(self, book_id, get_user_categories=True):  # {{{
        mi = Metadata(None, template_cache=self.formatter_template_cache)

        mi._proxy_metadata = ProxyMetadata(self, book_id, formatter=mi.formatter)

        author_ids = self._field_ids_for('authors', book_id)
        adata = self._author_data(author_ids)
        aut_list = [adata[i] for i in author_ids]
        aum = []
        aus = {}
        aul = {}
        for rec in aut_list:
            aut = rec['name']
            aum.append(aut)
            aus[aut] = rec['sort']
            aul[aut] = rec['link']
        mi.title       = self._field_for('title', book_id,
                default_value=_('Unknown'))
        mi.authors     = aum
        mi.author_sort = self._field_for('author_sort', book_id,
                default_value=_('Unknown'))
        mi.author_sort_map = aus
        mi.author_link_map = aul
        mi.comments    = self._field_for('comments', book_id)
        mi.publisher   = self._field_for('publisher', book_id)
        n = utcnow()
        mi.timestamp   = self._field_for('timestamp', book_id, default_value=n)
        mi.pubdate     = self._field_for('pubdate', book_id, default_value=n)
        mi.uuid        = self._field_for('uuid', book_id,
                default_value='dummy')
        mi.title_sort  = self._field_for('sort', book_id,
                default_value=_('Unknown'))
        mi.last_modified = self._field_for('last_modified', book_id,
                default_value=n)
        formats = self._field_for('formats', book_id)
        mi.format_metadata = {}
        mi.languages = list(self._field_for('languages', book_id))
        if not formats:
            good_formats = None
        else:
            mi.format_metadata = FormatMetadata(self, book_id, formats)
            good_formats = FormatsList(sorted(formats), mi.format_metadata)
        # These three attributes are returned by the db2 get_metadata(),
        # however, we dont actually use them anywhere other than templates, so
        # they have been removed, to avoid unnecessary overhead. The templates
        # all use _proxy_metadata.
        # mi.book_size   = self._field_for('size', book_id, default_value=0)
        # mi.ondevice_col = self._field_for('ondevice', book_id, default_value='')
        # mi.db_approx_formats = formats
        mi.formats = good_formats
        mi.has_cover = _('Yes') if self._field_for('cover', book_id,
                default_value=False) else ''
        mi.tags = list(self._field_for('tags', book_id, default_value=()))
        mi.series = self._field_for('series', book_id)
        if mi.series:
            mi.series_index = self._field_for('series_index', book_id,
                    default_value=1.0)
        mi.rating = self._field_for('rating', book_id)
        mi.set_identifiers(self._field_for('identifiers', book_id,
            default_value={}))
        mi.application_id = book_id
        mi.id = book_id
        composites = []
        for key, meta in self.field_metadata.custom_iteritems():
            mi.set_user_metadata(key, meta)
            if meta['datatype'] == 'composite':
                composites.append(key)
            else:
                val = self._field_for(key, book_id)
                if isinstance(val, tuple):
                    val = list(val)
                extra = self._field_for(key+'_index', book_id)
                mi.set(key, val=val, extra=extra)
        for key in composites:
            mi.set(key, val=self._composite_for(key, book_id, mi))

        user_cat_vals = {}
        if get_user_categories:
            user_cats = self.backend.prefs['user_categories']
            for ucat in user_cats:
                res = []
                for name,cat,ign in user_cats[ucat]:
                    v = mi.get(cat, None)
                    if isinstance(v, list):
                        if name in v:
                            res.append([name,cat])
                    elif name == v:
                        res.append([name,cat])
                user_cat_vals[ucat] = res
        mi.user_categories = user_cat_vals

        return mi
    # }}}

    @api
    def init(self):
        '''
        Initialize this cache with data from the backend.
        '''
        with self.write_lock:
            self.backend.read_tables()
            bools_are_tristate = self.backend.prefs['bools_are_tristate']

            for field, table in self.backend.tables.iteritems():
                self.fields[field] = create_field(field, table, bools_are_tristate)
                if table.metadata['datatype'] == 'composite':
                    self.composites[field] = self.fields[field]

            self.fields['ondevice'] = create_field('ondevice',
                    VirtualTable('ondevice'), bools_are_tristate)

            for name, field in self.fields.iteritems():
                if name[0] == '#' and name.endswith('_index'):
                    field.series_field = self.fields[name[:-len('_index')]]
                    self.fields[name[:-len('_index')]].index_field = field
                elif name == 'series_index':
                    field.series_field = self.fields['series']
                    self.fields['series'].index_field = field
                elif name == 'authors':
                    field.author_sort_field = self.fields['author_sort']
                elif name == 'title':
                    field.title_sort_field = self.fields['sort']
        if self.backend.prefs['update_all_last_mod_dates_on_start']:
            self.update_last_modified(self.all_book_ids())
            self.backend.prefs.set('update_all_last_mod_dates_on_start', False)

    # Cache Layer API {{{

    @read_api
    def field_for(self, name, book_id, default_value=None):
        '''
        Return the value of the field ``name`` for the book identified
        by ``book_id``. If no such book exists or it has no defined
        value for the field ``name`` or no such field exists, then
        ``default_value`` is returned.

        ``default_value`` is not used for title, title_sort, authors, author_sort
        and series_index. This is because these always have values in the db.
        ``default_value`` is used for all custom columns.

        The returned value for is_multiple fields are always tuples, even when
        no values are found (in other words, default_value is ignored). The
        exception is identifiers for which the returned value is always a dict.
        The returned tuples are always in link order, that is, the order in
        which they were created.
        '''
        if self.composites and name in self.composites:
            return self.composite_for(name, book_id,
                    default_value=default_value)
        try:
            field = self.fields[name]
        except KeyError:
            return default_value
        if field.is_multiple:
            default_value = field.default_value
        try:
            return field.for_book(book_id, default_value=default_value)
        except (KeyError, IndexError):
            return default_value

    @read_api
    def fast_field_for(self, field_obj, book_id, default_value=None):
        ' Same as field_for, except that it avoids the extra lookup to get the field object '
        if field_obj.is_composite:
            return field_obj.get_value_with_cache(book_id, self._get_proxy_metadata)
        if field_obj.is_multiple:
            default_value = field_obj.default_value
        try:
            return field_obj.for_book(book_id, default_value=default_value)
        except (KeyError, IndexError):
            return default_value

    @read_api
    def all_field_for(self, field, book_ids, default_value=None):
        ' Same as field_for, except that it operates on multiple books at once '
        field_obj = self.fields[field]
        return {book_id:self._fast_field_for(field_obj, book_id, default_value=default_value) for book_id in book_ids}

    @read_api
    def composite_for(self, name, book_id, mi=None, default_value=''):
        try:
            f = self.fields[name]
        except KeyError:
            return default_value

        if mi is None:
            return f.get_value_with_cache(book_id, self._get_proxy_metadata)
        else:
            return f._render_composite_with_cache(book_id, mi, mi.formatter, mi.template_cache)

    @read_api
    def field_ids_for(self, name, book_id):
        '''
        Return the ids (as a tuple) for the values that the field ``name`` has on the book
        identified by ``book_id``. If there are no values, or no such book, or
        no such field, an empty tuple is returned.
        '''
        try:
            return self.fields[name].ids_for_book(book_id)
        except (KeyError, IndexError):
            return ()

    @read_api
    def books_for_field(self, name, item_id):
        '''
        Return all the books associated with the item identified by
        ``item_id``, where the item belongs to the field ``name``.

        Returned value is a set of book ids, or the empty set if the item
        or the field does not exist.
        '''
        try:
            return self.fields[name].books_for(item_id)
        except (KeyError, IndexError):
            return set()

    @read_api
    def all_book_ids(self, type=frozenset):
        '''
        Frozen set of all known book ids.
        '''
        return type(self.fields['uuid'].table.book_col_map)

    @read_api
    def all_field_ids(self, name):
        '''
        Frozen set of ids for all values in the field ``name``.
        '''
        return frozenset(iter(self.fields[name]))

    @read_api
    def all_field_names(self, field):
        ''' Frozen set of all fields names (should only be used for many-one and many-many fields) '''
        if field == 'formats':
            return frozenset(self.fields[field].table.col_book_map)

        try:
            return frozenset(self.fields[field].table.id_map.itervalues())
        except AttributeError:
            raise ValueError('%s is not a many-one or many-many field' % field)

    @read_api
    def get_usage_count_by_id(self, field):
        ''' Return a mapping of id to usage count for all values of the specified
        field, which must be a many-one or many-many field. '''
        try:
            return {k:len(v) for k, v in self.fields[field].table.col_book_map.iteritems()}
        except AttributeError:
            raise ValueError('%s is not a many-one or many-many field' % field)

    @read_api
    def get_id_map(self, field):
        ''' Return a mapping of id numbers to values for the specified field.
        The field must be a many-one or many-many field, otherwise a ValueError
        is raised. '''
        try:
            return self.fields[field].table.id_map.copy()
        except AttributeError:
            if field == 'title':
                return self.fields[field].table.book_col_map.copy()
            raise ValueError('%s is not a many-one or many-many field' % field)

    @read_api
    def get_item_name(self, field, item_id):
        ''' Return the item name for the item specified by item_id in the
        specified field. See also :meth:`get_id_map`.'''
        return self.fields[field].table.id_map[item_id]

    @read_api
    def get_item_id(self, field, item_name):
        ' Return the item id for item_name (case-insensitive) '
        rmap = {icu_lower(v) if isinstance(v, unicode) else v:k for k, v in self.fields[field].table.id_map.iteritems()}
        return rmap.get(icu_lower(item_name) if isinstance(item_name, unicode) else item_name, None)

    @read_api
    def get_item_ids(self, field, item_names):
        ' Return the item id for item_name (case-insensitive) '
        rmap = {icu_lower(v) if isinstance(v, unicode) else v:k for k, v in self.fields[field].table.id_map.iteritems()}
        return {name:rmap.get(icu_lower(name) if isinstance(name, unicode) else name, None) for name in item_names}

    @read_api
    def author_data(self, author_ids=None):
        '''
        Return author data as a dictionary with keys: name, sort, link

        If no authors with the specified ids are found an empty dictionary is
        returned. If author_ids is None, data for all authors is returned.
        '''
        af = self.fields['authors']
        if author_ids is None:
            author_ids = tuple(af.table.id_map)
        return {aid:af.author_data(aid) for aid in author_ids if aid in af.table.id_map}

    @read_api
    def format_hash(self, book_id, fmt):
        ''' Return the hash of the specified format for the specified book. The
        kind of hash is backend dependent, but is usually SHA-256. '''
        try:
            name = self.fields['formats'].format_fname(book_id, fmt)
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            raise NoSuchFormat('Record %d has no fmt: %s'%(book_id, fmt))
        return self.backend.format_hash(book_id, fmt, name, path)

    @api
    def format_metadata(self, book_id, fmt, allow_cache=True, update_db=False):
        '''
        Return the path, size and mtime for the specified format for the specified book.
        You should not use path unless you absolutely have to,
        since accessing it directly breaks the threadsafe guarantees of this API. Instead use
        the :meth:`copy_format_to` method.

        :param allow_cache: If ``True`` cached values are used, otherwise a
            slow filesystem access is done. The cache values could be out of date
            if access was performed to the filesystem outside of this API.

        :param update_db: If ``True`` The max_size field of the database is updated for this book.
        '''
        if not fmt:
            return {}
        fmt = fmt.upper()
        if allow_cache:
            x = self.format_metadata_cache[book_id].get(fmt, None)
            if x is not None:
                return x
        with self.safe_read_lock:
            try:
                name = self.fields['formats'].format_fname(book_id, fmt)
                path = self._field_for('path', book_id).replace('/', os.sep)
            except:
                return {}

            ans = {}
            if path and name:
                ans = self.backend.format_metadata(book_id, fmt, name, path)
                self.format_metadata_cache[book_id][fmt] = ans
        if update_db and 'size' in ans:
            with self.write_lock:
                max_size = self.fields['formats'].table.update_fmt(book_id, fmt, name, ans['size'], self.backend)
                self.fields['size'].table.update_sizes({book_id: max_size})

        return ans

    @read_api
    def format_files(self, book_id):
        field = self.fields['formats']
        fmts = field.table.book_col_map.get(book_id, ())
        return {fmt:field.format_fname(book_id, fmt) for fmt in fmts}

    @read_api
    def pref(self, name, default=None):
        ' Return the value for the specified preference or the value specified as ``default`` if the preference is not set. '
        return self.backend.prefs.get(name, default)

    @write_api
    def set_pref(self, name, val):
        ' Set the specified preference to the specified value. See also :meth:`pref`. '
        self.backend.prefs.set(name, val)
        if name == 'grouped_search_terms':
            self._clear_search_caches()
        if name in dynamic_category_preferences:
            self._initialize_dynamic_categories()

    @api
    def get_metadata(self, book_id,
            get_cover=False, get_user_categories=True, cover_as_data=False):
        '''
        Return metadata for the book identified by book_id as a :class:`calibre.ebooks.metadata.book.base.Metadata` object.
        Note that the list of formats is not verified. If get_cover is True,
        the cover is returned, either a path to temp file as mi.cover or if
        cover_as_data is True then as mi.cover_data.
        '''

        with self.safe_read_lock:
            mi = self._get_metadata(book_id, get_user_categories=get_user_categories)

        if get_cover:
            if cover_as_data:
                cdata = self.cover(book_id)
                if cdata:
                    mi.cover_data = ('jpeg', cdata)
            else:
                mi.cover = self.cover(book_id, as_path=True)

        return mi

    @read_api
    def get_proxy_metadata(self, book_id):
        ''' Like :meth:`get_metadata` except that it returns a ProxyMetadata
        object that only reads values from the database on demand. This is much
        faster than get_metadata when only a small number of fields need to be
        accessed from the returned metadata object. '''
        return ProxyMetadata(self, book_id)

    @api
    def cover(self, book_id,
            as_file=False, as_image=False, as_path=False):
        '''
        Return the cover image or None. By default, returns the cover as a
        bytestring.

        WARNING: Using as_path will copy the cover to a temp file and return
        the path to the temp file. You should delete the temp file when you are
        done with it.

        :param as_file: If True return the image as an open file object (a SpooledTemporaryFile)
        :param as_image: If True return the image as a QImage object
        :param as_path: If True return the image as a path pointing to a
                        temporary file
        '''
        if as_file:
            ret = SpooledTemporaryFile(SPOOL_SIZE)
            if not self.copy_cover_to(book_id, ret):
                return
            ret.seek(0)
        elif as_path:
            pt = PersistentTemporaryFile('_dbcover.jpg')
            with pt:
                if not self.copy_cover_to(book_id, pt):
                    return
            ret = pt.name
        else:
            buf = BytesIO()
            if not self.copy_cover_to(book_id, buf):
                return
            ret = buf.getvalue()
            if as_image:
                from PyQt5.Qt import QImage
                i = QImage()
                i.loadFromData(ret)
                ret = i
        return ret

    @read_api
    def cover_or_cache(self, book_id, timestamp):
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except AttributeError:
            return False, None, None
        return self.backend.cover_or_cache(path, timestamp)

    @read_api
    def cover_last_modified(self, book_id):
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except AttributeError:
            return
        return self.backend.cover_last_modified(path)

    @read_api
    def copy_cover_to(self, book_id, dest, use_hardlink=False, report_file_size=None):
        '''
        Copy the cover to the file like object ``dest``. Returns False
        if no cover exists or dest is the same file as the current cover.
        dest can also be a path in which case the cover is
        copied to it if and only if the path is different from the current path (taking
        case sensitivity into account).
        '''
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except AttributeError:
            return False

        return self.backend.copy_cover_to(path, dest, use_hardlink=use_hardlink,
                                          report_file_size=report_file_size)

    @read_api
    def copy_format_to(self, book_id, fmt, dest, use_hardlink=False, report_file_size=None):
        '''
        Copy the format ``fmt`` to the file like object ``dest``. If the
        specified format does not exist, raises :class:`NoSuchFormat` error.
        dest can also be a path, in which case the format is copied to it, iff
        the path is different from the current path (taking case sensitivity
        into account).
        '''
        fmt = (fmt or '').upper()
        try:
            name = self.fields['formats'].format_fname(book_id, fmt)
            path = self._field_for('path', book_id).replace('/', os.sep)
        except (KeyError, AttributeError):
            raise NoSuchFormat('Record %d has no %s file'%(book_id, fmt))

        return self.backend.copy_format_to(book_id, fmt, name, path, dest,
                                               use_hardlink=use_hardlink, report_file_size=report_file_size)

    @read_api
    def format_abspath(self, book_id, fmt):
        '''
        Return absolute path to the e-book file of format `format`. You should
        almost never use this, as it breaks the threadsafe promise of this API.
        Instead use, :meth:`copy_format_to`.

        Currently used only in calibredb list, the viewer, edit book,
        compare_format to original format, open with and the catalogs (via
        get_data_as_dict()).

        Apart from the viewer, open with and edit book, I don't believe any of
        the others do any file write I/O with the results of this call.
        '''
        fmt = (fmt or '').upper()
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            return None
        if path:
            if fmt == '__COVER_INTERNAL__':
                return self.backend.cover_abspath(book_id, path)
            else:
                try:
                    name = self.fields['formats'].format_fname(book_id, fmt)
                except:
                    return None
                if name:
                    return self.backend.format_abspath(book_id, fmt, name, path)

    @read_api
    def has_format(self, book_id, fmt):
        'Return True iff the format exists on disk'
        fmt = (fmt or '').upper()
        try:
            name = self.fields['formats'].format_fname(book_id, fmt)
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            return False
        return self.backend.has_format(book_id, fmt, name, path)

    @api
    def save_original_format(self, book_id, fmt):
        ' Save a copy of the specified format as ORIGINAL_FORMAT, overwriting any existing ORIGINAL_FORMAT. '
        fmt = fmt.upper()
        if 'ORIGINAL' in fmt:
            raise ValueError('Cannot save original of an original fmt')
        fmtfile = self.format(book_id, fmt, as_file=True)
        if fmtfile is None:
            return False
        with fmtfile:
            nfmt = 'ORIGINAL_' + fmt
            return self.add_format(book_id, nfmt, fmtfile, run_hooks=False)

    @api
    def restore_original_format(self, book_id, original_fmt):
        ''' Restore the specified format from the previously saved
        ORIGINAL_FORMAT, if any. Return True on success. The ORIGINAL_FORMAT is
        deleted after a successful restore. '''
        original_fmt = original_fmt.upper()
        fmtfile = self.format(book_id, original_fmt, as_file=True)
        if fmtfile is not None:
            fmt = original_fmt.partition('_')[2]
            with fmtfile:
                self.add_format(book_id, fmt, fmtfile, run_hooks=False)
            self.remove_formats({book_id:(original_fmt,)})
            return True
        return False

    @read_api
    def formats(self, book_id, verify_formats=True):
        '''
        Return tuple of all formats for the specified book. If verify_formats
        is True, verifies that the files exist on disk.
        '''
        ans = self.field_for('formats', book_id)
        if verify_formats and ans:
            try:
                path = self._field_for('path', book_id).replace('/', os.sep)
            except:
                return ()

            def verify(fmt):
                try:
                    name = self.fields['formats'].format_fname(book_id, fmt)
                except:
                    return False
                return self.backend.has_format(book_id, fmt, name, path)

            ans = tuple(x for x in ans if verify(x))
        return ans

    @api
    def format(self, book_id, fmt, as_file=False, as_path=False, preserve_filename=False):
        '''
        Return the e-book format as a bytestring or `None` if the format doesn't exist,
        or we don't have permission to write to the e-book file.

        :param as_file: If True the e-book format is returned as a file object. Note
                        that the file object is a SpooledTemporaryFile, so if what you want to
                        do is copy the format to another file, use :meth:`copy_format_to`
                        instead for performance.
        :param as_path: Copies the format file to a temp file and returns the
                        path to the temp file
        :param preserve_filename: If True and returning a path the filename is
                                  the same as that used in the library. Note that using
                                  this means that repeated calls yield the same
                                  temp file (which is re-created each time)
        '''
        fmt = (fmt or '').upper()
        ext = ('.' + fmt.lower()) if fmt else ''
        if as_path:
            if preserve_filename:
                with self.safe_read_lock:
                    try:
                        fname = self.fields['formats'].format_fname(book_id, fmt)
                    except:
                        return None
                    fname += ext

                bd = base_dir()
                d = os.path.join(bd, 'format_abspath')
                try:
                    os.makedirs(d)
                except:
                    pass
                ret = os.path.join(d, fname)
                try:
                    self.copy_format_to(book_id, fmt, ret)
                except NoSuchFormat:
                    return None
            else:
                with PersistentTemporaryFile(ext) as pt:
                    try:
                        self.copy_format_to(book_id, fmt, pt)
                    except NoSuchFormat:
                        return None
                    ret = pt.name
        elif as_file:
            with self.safe_read_lock:
                try:
                    fname = self.fields['formats'].format_fname(book_id, fmt)
                except:
                    return None
                fname += ext

            ret = SpooledTemporaryFile(SPOOL_SIZE)
            try:
                self.copy_format_to(book_id, fmt, ret)
            except NoSuchFormat:
                return None
            ret.seek(0)
            # Various bits of code try to use the name as the default
            # title when reading metadata, so set it
            ret.name = fname
        else:
            buf = BytesIO()
            try:
                self.copy_format_to(book_id, fmt, buf)
            except NoSuchFormat:
                return None

            ret = buf.getvalue()

        return ret

    @read_api
    def multisort(self, fields, ids_to_sort=None, virtual_fields=None):
        '''
        Return a list of sorted book ids. If ids_to_sort is None, all book ids
        are returned.

        fields must be a list of 2-tuples of the form (field_name,
        ascending=True or False). The most significant field is the first
        2-tuple.
        '''
        ids_to_sort = self._all_book_ids() if ids_to_sort is None else ids_to_sort
        get_metadata = self._get_proxy_metadata
        lang_map = self.fields['languages'].book_value_map
        virtual_fields = virtual_fields or {}

        fm = {'title':'sort', 'authors':'author_sort'}

        def sort_key_func(field):
            'Handle series type fields, virtual fields and the id field'
            idx = field + '_index'
            is_series = idx in self.fields
            try:
                func = self.fields[fm.get(field, field)].sort_keys_for_books(get_metadata, lang_map)
            except KeyError:
                if field == 'id':
                    return IDENTITY
                else:
                    return virtual_fields[fm.get(field, field)].sort_keys_for_books(get_metadata, lang_map)
            if is_series:
                idx_func = self.fields[idx].sort_keys_for_books(get_metadata, lang_map)

                def skf(book_id):
                    return (func(book_id), idx_func(book_id))
                return skf
            return func

        # Sort only once on any given field
        fields = uniq(fields, operator.itemgetter(0))

        if len(fields) == 1:
            return sorted(ids_to_sort, key=sort_key_func(fields[0][0]),
                          reverse=not fields[0][1])
        sort_key_funcs = tuple(sort_key_func(field) for field, order in fields)
        orders = tuple(1 if order else -1 for _, order in fields)
        Lazy = object()  # Lazy load the sort keys for sub-sort fields

        class SortKey(object):

            __slots__ = ('book_id', 'sort_key')

            def __init__(self, book_id):
                self.book_id = book_id
                # Calculate only the first sub-sort key since that will always be used
                self.sort_key = [key(book_id) if i == 0 else Lazy for i, key in enumerate(sort_key_funcs)]

            def __cmp__(self, other):
                for i, (order, self_key, other_key) in enumerate(zip(orders, self.sort_key, other.sort_key)):
                    if self_key is Lazy:
                        self_key = self.sort_key[i] = sort_key_funcs[i](self.book_id)
                    if other_key is Lazy:
                        other_key = other.sort_key[i] = sort_key_funcs[i](other.book_id)
                    ans = cmp(self_key, other_key)
                    if ans != 0:
                        return ans * order
                return 0

        return sorted(ids_to_sort, key=SortKey)

    @read_api
    def search(self, query, restriction='', virtual_fields=None, book_ids=None):
        '''
        Search the database for the specified query, returning a set of matched book ids.

        :param restriction: A restriction that is ANDed to the specified query. Note that
            restrictions are cached, therefore the search for a AND b will be slower than a with
            restriction b.

        :param virtual_fields: Used internally (virtual fields such as on_device to search over).

        :param book_ids: If not None, a set of book ids for which books will
            be searched instead of searching all books.
        '''
        return self._search_api(self, query, restriction, virtual_fields=virtual_fields, book_ids=book_ids)

    @api
    def get_categories(self, sort='name', book_ids=None, already_fixed=None,
                       first_letter_sort=False):
        ' Used internally to implement the Tag Browser '
        try:
            with self.safe_read_lock:
                return get_categories(self, sort=sort, book_ids=book_ids,
                                      first_letter_sort=first_letter_sort)
        except InvalidLinkTable as err:
            bad_field = err.field_name
            if bad_field == already_fixed:
                raise
            with self.write_lock:
                self.fields[bad_field].table.fix_link_table(self.backend)
            return self.get_categories(sort=sort, book_ids=book_ids, already_fixed=bad_field)

    @write_api
    def update_last_modified(self, book_ids, now=None):
        if book_ids:
            if now is None:
                now = nowf()
            f = self.fields['last_modified']
            f.writer.set_books({book_id:now for book_id in book_ids}, self.backend)
            if self.composites:
                self._clear_composite_caches(book_ids)
            self._clear_search_caches(book_ids)

    @write_api
    def mark_as_dirty(self, book_ids):
        self._update_last_modified(book_ids)
        already_dirtied = set(self.dirtied_cache).intersection(book_ids)
        new_dirtied = book_ids - already_dirtied
        already_dirtied = {book_id:self.dirtied_sequence+i for i, book_id in enumerate(already_dirtied)}
        if already_dirtied:
            self.dirtied_sequence = max(already_dirtied.itervalues()) + 1
        self.dirtied_cache.update(already_dirtied)
        if new_dirtied:
            self.backend.executemany('INSERT OR IGNORE INTO metadata_dirtied (book) VALUES (?)',
                                    ((x,) for x in new_dirtied))
            new_dirtied = {book_id:self.dirtied_sequence+i for i, book_id in enumerate(new_dirtied)}
            self.dirtied_sequence = max(new_dirtied.itervalues()) + 1
            self.dirtied_cache.update(new_dirtied)

    @write_api
    def commit_dirty_cache(self):
        book_ids = [(x,) for x in self.dirtied_cache]
        if book_ids:
            self.backend.executemany('INSERT OR IGNORE INTO metadata_dirtied (book) VALUES (?)', book_ids)

    @write_api
    def set_field(self, name, book_id_to_val_map, allow_case_change=True, do_path_update=True):
        '''
        Set the values of the field specified by ``name``. Returns the set of all book ids that were affected by the change.

        :param book_id_to_val_map: Mapping of book_ids to values that should be applied.
        :param allow_case_change: If True, the case of many-one or many-many fields will be changed.
            For example, if a  book has the tag ``tag1`` and you set the tag for another book to ``Tag1``
            then the both books will have the tag ``Tag1`` if allow_case_change is True, otherwise they will
            both have the tag ``tag1``.
        :param do_path_update: Used internally, you should never change it.
        '''
        f = self.fields[name]
        is_series = f.metadata['datatype'] == 'series'
        update_path = name in {'title', 'authors'}
        if update_path and iswindows:
            paths = (x for x in (self._field_for('path', book_id) for book_id in book_id_to_val_map) if x)
            self.backend.windows_check_if_files_in_use(paths)

        if is_series:
            bimap, simap = {}, {}
            sfield = self.fields[name + '_index']
            for k, v in book_id_to_val_map.iteritems():
                if isinstance(v, basestring):
                    v, sid = get_series_values(v)
                else:
                    v = sid = None
                if sid is None and name.startswith('#'):
                    extra = self._fast_field_for(sfield, k)
                    sid = extra or 1.0  # The value to be set the db link table
                bimap[k] = v
                if sid is not None:
                    simap[k] = sid
            book_id_to_val_map = bimap

        dirtied = f.writer.set_books(
            book_id_to_val_map, self.backend, allow_case_change=allow_case_change)

        if is_series and simap:
            sf = self.fields[f.name+'_index']
            dirtied |= sf.writer.set_books(simap, self.backend, allow_case_change=False)

        if dirtied and update_path and do_path_update:
            self._update_path(dirtied, mark_as_dirtied=False)

        self._mark_as_dirty(dirtied)

        return dirtied

    @write_api
    def update_path(self, book_ids, mark_as_dirtied=True):
        for book_id in book_ids:
            title = self._field_for('title', book_id, default_value=_('Unknown'))
            try:
                author = self._field_for('authors', book_id, default_value=(_('Unknown'),))[0]
            except IndexError:
                author = _('Unknown')
            self.backend.update_path(book_id, title, author, self.fields['path'], self.fields['formats'])
            if mark_as_dirtied:
                self._mark_as_dirty(book_ids)

    @read_api
    def get_a_dirtied_book(self):
        if self.dirtied_cache:
            return random.choice(tuple(self.dirtied_cache.iterkeys()))
        return None

    @read_api
    def get_metadata_for_dump(self, book_id):
        mi = None
        # get the current sequence number for this book to pass back to the
        # backup thread. This will avoid double calls in the case where the
        # thread has not done the work between the put and the get_metadata
        sequence = self.dirtied_cache.get(book_id, None)
        if sequence is not None:
            try:
                # While a book is being created, the path is empty. Don't bother to
                # try to write the opf, because it will go to the wrong folder.
                if self._field_for('path', book_id):
                    mi = self._get_metadata(book_id)
                    # Always set cover to cover.jpg. Even if cover doesn't exist,
                    # no harm done. This way no need to call dirtied when
                    # cover is set/removed
                    mi.cover = 'cover.jpg'
            except:
                # This almost certainly means that the book has been deleted while
                # the backup operation sat in the queue.
                pass
        return mi, sequence

    @write_api
    def clear_dirtied(self, book_id, sequence):
        # Clear the dirtied indicator for the books. This is used when fetching
        # metadata, creating an OPF, and writing a file are separated into steps.
        # The last step is clearing the indicator
        dc_sequence = self.dirtied_cache.get(book_id, None)
        if dc_sequence is None or sequence is None or dc_sequence == sequence:
            self.backend.execute('DELETE FROM metadata_dirtied WHERE book=?',
                    (book_id,))
            self.dirtied_cache.pop(book_id, None)

    @write_api
    def write_backup(self, book_id, raw):
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            return

        self.backend.write_backup(path, raw)

    @read_api
    def dirty_queue_length(self):
        return len(self.dirtied_cache)

    @read_api
    def read_backup(self, book_id):
        ''' Return the OPF metadata backup for the book as a bytestring or None
        if no such backup exists.  '''
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            return

        try:
            return self.backend.read_backup(path)
        except EnvironmentError:
            return None

    @write_api
    def dump_and_restore(self, callback=None, sql=None):
        return self.backend.dump_and_restore(callback=callback, sql=sql)

    @write_api
    def vacuum(self):
        self.backend.vacuum()

    @write_api
    def close(self):
        from calibre.customize.ui import available_library_closed_plugins
        for plugin in available_library_closed_plugins():
            try:
                plugin.run(self)
            except Exception:
                import traceback
                traceback.print_exc()
        self.backend.close()

    @write_api
    def restore_book(self, book_id, mi, last_modified, path, formats):
        ''' Restore the book entry in the database for a book that already exists on the filesystem '''
        cover = mi.cover
        mi.cover = None
        self._create_book_entry(mi, add_duplicates=True,
                force_id=book_id, apply_import_tags=False, preserve_uuid=True)
        self._update_last_modified((book_id,), last_modified)
        if cover and os.path.exists(cover):
            self._set_field('cover', {book_id:1})
        self.backend.restore_book(book_id, path, formats)

    @read_api
    def virtual_libraries_for_books(self, book_ids):
        libraries = self._pref('virtual_libraries', {})
        ans = {book_id:[] for book_id in book_ids}
        for lib, expr in libraries.iteritems():
            books = self._search(expr)  # We deliberately dont use book_ids as we want to use the search cache
            for book in book_ids:
                if book in books:
                    ans[book].append(lib)
        return {k:tuple(sorted(v, key=sort_key)) for k, v in ans.iteritems()}

    @read_api
    def user_categories_for_books(self, book_ids, proxy_metadata_map=None):
        ''' Return the user categories for the specified books.
        proxy_metadata_map is optional and is useful for a performance boost,
        in contexts where a ProxyMetadata object for the books already exists.
        It should be a mapping of book_ids to their corresponding ProxyMetadata
        objects.
        '''
        user_cats = self.backend.prefs['user_categories']
        pmm = proxy_metadata_map or {}
        ans = {}

        for book_id in book_ids:
            proxy_metadata = pmm.get(book_id) or self._get_proxy_metadata(book_id)
            user_cat_vals = ans[book_id] = {}
            for ucat, categories in user_cats.iteritems():
                user_cat_vals[ucat] = res = []
                for name, cat, ign in categories:
                    try:
                        field_obj = self.fields[cat]
                    except KeyError:
                        continue

                    if field_obj.is_composite:
                        v = field_obj.get_value_with_cache(book_id, lambda x:proxy_metadata)
                    else:
                        v = self._fast_field_for(field_obj, book_id)

                    if isinstance(v, (list, tuple)):
                        if name in v:
                            res.append([name, cat])
                    elif name == v:
                        res.append([name, cat])
        return ans

    @write_api
    def embed_metadata(self, book_ids, only_fmts=None, report_error=None, report_progress=None):
        ''' Update metadata in all formats of the specified book_ids to current metadata in the database. '''
        field = self.fields['formats']
        from calibre.ebooks.metadata.opf2 import pretty_print
        from calibre.customize.ui import apply_null_metadata
        from calibre.ebooks.metadata.meta import set_metadata
        if only_fmts:
            only_fmts = {f.lower() for f in only_fmts}

        def doit(fmt, mi, stream):
            with apply_null_metadata, pretty_print:
                set_metadata(stream, mi, stream_type=fmt, report_error=report_error)
            stream.seek(0, os.SEEK_END)
            return stream.tell()

        for i, book_id in enumerate(book_ids):
            fmts = field.table.book_col_map.get(book_id, ())
            if not fmts:
                continue
            mi = self.get_metadata(book_id, get_cover=True, cover_as_data=True)
            try:
                path = self._field_for('path', book_id).replace('/', os.sep)
            except:
                continue
            for fmt in fmts:
                if only_fmts is not None and fmt.lower() not in only_fmts:
                    continue
                try:
                    name = self.fields['formats'].format_fname(book_id, fmt)
                except:
                    continue
                if name and path:
                    new_size = self.backend.apply_to_format(book_id, path, name, fmt, partial(doit, fmt, mi))
                    if new_size is not None:
                        self.format_metadata_cache[book_id].get(fmt, {})['size'] = new_size
                        max_size = self.fields['formats'].table.update_fmt(book_id, fmt, name, new_size, self.backend)
                        self.fields['size'].table.update_sizes({book_id: max_size})
            if report_progress is not None:
                report_progress(i+1, len(book_ids), mi)

    @read_api
    def get_last_read_positions(self, book_id, fmt, user):
        fmt = fmt.upper()
        ans = []
        for device, cfi, epoch, pos_frac in self.backend.execute(
                'SELECT device,cfi,epoch,pos_frac FROM last_read_positions WHERE book=? AND format=? AND user=?',
                (book_id, fmt, user)):
            ans.append({'device':device, 'cfi': cfi, 'epoch':epoch, 'pos_frac':pos_frac})
        return ans

    @write_api
    def set_last_read_position(self, book_id, fmt, user='_', device='_', cfi=None, epoch=None, pos_frac=0):
        fmt = fmt.upper()
        device = device or '_'
        user = user or '_'
        if not cfi:
            self.backend.execute(
                'DELETE FROM last_read_positions WHERE book=? AND format=? AND user=? AND device=?',
                (book_id, fmt, user, device))
        else:
            self.backend.execute(
                'INSERT OR REPLACE INTO last_read_positions(book,format,user,device,cfi,epoch,pos_frac) VALUES (?,?,?,?,?,?,?)',
                (book_id, fmt, user, device, cfi, epoch or time(), pos_frac))

    @read_api
    def export_library(self, library_key, exporter, progress=None, abort=None):
        from binascii import hexlify
        key_prefix = hexlify(library_key)
        book_ids = self._all_book_ids()
        total = len(book_ids) + 1
        format_metadata = {}
        if progress is not None:
            progress('metadata.db', 0, total)
        pt = PersistentTemporaryFile('-export.db')
        pt.close()
        self.backend.backup_database(pt.name)
        dbkey = key_prefix + ':::' + 'metadata.db'
        with lopen(pt.name, 'rb') as f:
            exporter.add_file(f, dbkey)
        os.remove(pt.name)
        metadata = {'format_data':format_metadata, 'metadata.db':dbkey, 'total':total}
        for i, book_id in enumerate(book_ids):
            if abort is not None and abort.is_set():
                return
            if progress is not None:
                progress(self._field_for('title', book_id), i + 1, total)
            format_metadata[book_id] = {}
            for fmt in self._formats(book_id):
                mdata = self.format_metadata(book_id, fmt)
                key = '%s:%s:%s' % (key_prefix, book_id, fmt)
                format_metadata[book_id][fmt] = key
                with exporter.start_file(key, mtime=mdata.get('mtime')) as dest:
                    self._copy_format_to(book_id, fmt, dest, report_file_size=dest.ensure_space)
            cover_key = '%s:%s:%s' % (key_prefix, book_id, '.cover')
            with exporter.start_file(cover_key) as dest:
                if not self.copy_cover_to(book_id, dest, report_file_size=dest.ensure_space):
                    dest.discard()
                else:
                    format_metadata[book_id]['.cover'] = cover_key
        exporter.set_metadata(library_key, metadata)
        if progress is not None:
            progress(_('Completed'), total, total)


def import_library(library_key, importer, library_path, progress=None, abort=None):
    from calibre.db.backend import DB
    metadata = importer.metadata[library_key]
    total = metadata['total']
    if progress is not None:
        progress('metadata.db', 0, total)
    if abort is not None and abort.is_set():
        return
    with open(os.path.join(library_path, 'metadata.db'), 'wb') as f:
        src = importer.start_file(metadata['metadata.db'], 'metadata.db for ' + library_path)
        shutil.copyfileobj(src, f)
        src.close()
    cache = Cache(DB(library_path, load_user_formatter_functions=False))
    cache.init()
    format_data = {int(book_id):data for book_id, data in metadata['format_data'].iteritems()}
    for i, (book_id, fmt_key_map) in enumerate(format_data.iteritems()):
        if abort is not None and abort.is_set():
            return
        title = cache._field_for('title', book_id)
        if progress is not None:
            progress(title, i + 1, total)
        cache._update_path((book_id,), mark_as_dirtied=False)
        for fmt, fmtkey in fmt_key_map.iteritems():
            if fmt == '.cover':
                stream = importer.start_file(fmtkey, _('Cover for %s') % title)
                path = cache._field_for('path', book_id).replace('/', os.sep)
                cache.backend.set_cover(book_id, path, stream, no_processing=True)
            else:
                stream = importer.start_file(fmtkey, _('{0} format for {1}').format(fmt.upper(), title))
                size, fname = cache._do_add_format(book_id, fmt, stream, mtime=stream.mtime)
                cache.fields['formats'].table.update_fmt(book_id, fmt, fname, size, cache.backend)
            stream.close()
        cache.dump_metadata({book_id})
    if progress is not None:
        progress(_('Completed'), total, total)
    return cache