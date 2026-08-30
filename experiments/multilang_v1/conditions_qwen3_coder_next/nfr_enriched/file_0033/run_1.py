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
from calibre.utils.date import nowf, utcnow, UNDEFINED_DATE
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


def _copy_stream_to_temp_file(stream, fmt):
    '''
    Copy the given stream to a temporary file and return the path to the temp file.
    The stream's position will be reset to 0 before copying.
    '''
    stream.seek(0)
    pt = PersistentTemporaryFile('_import_plugin.' + fmt)
    shutil.copyfileobj(stream, pt, 1024**2)
    pt.close()
    return pt.name


def run_import_plugins(path_or_stream, fmt):
    fmt = fmt.lower()
    if hasattr(path_or_stream, 'seek'):
        path = _copy_stream_to_temp_file(path_or_stream, fmt)
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
                setattr(self, '_'+name, func)
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
            self._initialize_template_cache()
        for field in self.fields.itervalues():
            if hasattr(field, 'clear_caches'):
                field.clear_caches(book_ids=book_ids)
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
        with self.backend.conn:
            self.backend.prefs.load_from_db()
            self._search_api.saved_searches.load_from_db()
            for field in self.fields.itervalues():
                if hasattr(field, 'table'):
                    field.table.read(self.backend)

    @property
    def field_metadata(self):
        return self.backend.field_metadata

    def _get_metadata(self, book_id, get_user_categories=True):
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


    @api
    def init(self):
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
        try:
            return self.fields[name].ids_for_book(book_id)
        except (KeyError, IndexError):
            return ()

    @read_api
    def books_for_field(self, name, item_id):
        try:
            return self.fields[name].books_for(item_id)
        except (KeyError, IndexError):
            return set()

    @read_api
    def all_book_ids(self, type=frozenset):
        return type(self.fields['uuid'].table.book_col_map)

    @read_api
    def all_field_ids(self, name):
        return frozenset(iter(self.fields[name]))

    @read_api
    def all_field_names(self, field):
        if field == 'formats':
            return frozenset(self.fields[field].table.col_book_map)

        try:
            return frozenset(self.fields[field].table.id_map.itervalues())
        except AttributeError:
            raise ValueError('%s is not a many-one or many-many field' % field)

    @read_api
    def get_usage_count_by_id(self, field):
        try:
            return {k:len(v) for k, v in self.fields[field].table.col_book_map.iteritems()}
        except AttributeError:
            raise ValueError('%s is not a many-one or many-many field' % field)

    @read_api
    def get_id_map(self, field):
        try:
            return self.fields[field].table.id_map.copy()
        except AttributeError:
            if field == 'title':
                return self.fields[field].table.book_col_map.copy()
            raise ValueError('%s is not a many-one or many-many field' % field)

    @read_api
    def get_item_name(self, field, item_id):
        return self.fields[field].table.id_map[item_id]

    @read_api
    def get_item_id(self, field, item_name):
        rmap = {icu_lower(v) if isinstance(v, unicode) else v:k for k, v in self.fields[field].table.id_map.iteritems()}
        return rmap.get(icu_lower(item_name) if isinstance(item_name, unicode) else item_name, None)

    @read_api
    def get_item_ids(self, field, item_names):
        rmap = {icu_lower(v) if isinstance(v, unicode) else v:k for k, v in self.fields[field].table.id_map.iteritems()}
        return {name:rmap.get(icu_lower(name) if isinstance(name, unicode) else name, None) for name in item_names}

    @read_api
    def author_data(self, author_ids=None):
        af = self.fields['authors']
        if author_ids is None:
            author_ids = tuple(af.table.id_map)
        return {aid:af.author_data(aid) for aid in author_ids if aid in af.table.id_map}

    @read_api
    def format_hash(self, book_id, fmt):
        try:
            name = self.fields['formats'].format_fname(book_id, fmt)
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            raise NoSuchFormat('Record %d has no fmt: %s'%(book_id, fmt))
        return self.backend.format_hash(book_id, fmt, name, path)

    @api
    def format_metadata(self, book_id, fmt, allow_cache=True, update_db=False):
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
        return self.backend.prefs.get(name, default)

    @write_api
    def set_pref(self, name, val):
        self.backend.prefs.set(name, val)
        if name == 'grouped_search_terms':
            self._clear_search_caches()
        if name in dynamic_category_preferences:
            self._initialize_dynamic_categories()

    @api
    def get_metadata(self, book_id,
            get_cover=False, get_user_categories=True, cover_as_data=False):

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
        return ProxyMetadata(self, book_id)

    @api
    def cover(self, book_id,
            as_file=False, as_image=False, as_path=False):
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
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except AttributeError:
            return False

        return self.backend.copy_cover_to(path, dest, use_hardlink=use_hardlink,
                                          report_file_size=report_file_size)

    @read_api
    def copy_format_to(self, book_id, fmt, dest, use_hardlink=False, report_file_size=None):
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
        fmt = (fmt or '').upper()
        try:
            name = self.fields['formats'].format_fname(book_id, fmt)
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            return False
        return self.backend.has_format(book_id, fmt, name, path)

    @api
    def save_original_format(self, book_id, fmt):
        fmt = fmt.upper()
        if 'ORIGINAL' in fmt:
            raise ValueError('Cannot save original of an original fmt')
        fmtfile = self.format(book_id, fmt, as_file=True)
        if fmtfile is None:
            return False
        with fmtfile:
            nfmt = 'ORIGINAL_'+fmt
            return self.add_format(book_id, nfmt, fmtfile, run_hooks=False)

    @api
    def restore_original_format(self, book_id, original_fmt):
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
        fmt = (fmt or '').upper()
        ext = ('.'+fmt.lower()) if fmt else ''
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
        ids_to_sort = self._all_book_ids() if ids_to_sort is None else ids_to_sort
        get_metadata = self._get_proxy_metadata
        lang_map = self.fields['languages'].book_value_map
        virtual_fields = virtual_fields or {}

        fm = {'title':'sort', 'authors':'author_sort'}

        def sort_key_func(field):
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

        fields = uniq(fields, operator.itemgetter(0))

        if len(fields) == 1:
            return sorted(ids_to_sort, key=sort_key_func(fields[0][0]),
                          reverse=not fields[0][1])
        sort_key_funcs = tuple(sort_key_func(field) for field, order in fields)
        orders = tuple(1 if order else -1 for _, order in fields)
        Lazy = object()

        class SortKey(object):

            __slots__ = ('book_id', 'sort_key')

            def __init__(self, book_id):
                self.book_id = book_id
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
        return self._search_api(self, query, restriction, virtual_fields=virtual_fields, book_ids=book_ids)

    @api
    def get_categories(self, sort='name', book_ids=None, already_fixed=None,
                       first_letter_sort=False):
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
                    sid = extra or 1.0
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
        sequence = self.dirtied_cache.get(book_id, None)
        if sequence is not None:
            try:
                if self._field_for('path', book_id):
                    mi = self._get_metadata(book_id)
                    mi.cover = 'cover.jpg'
            except:
                pass
        return mi, sequence

    @write_api
    def clear_dirtied(self, book_id, sequence):
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
        try:
            path = self._field_for('path', book_id).replace('/', os.sep)
        except:
            return

        try:
            return self.backend.read_backup(path)
        except EnvironmentError:
            return None

    @write_api
    def dump_metadata(self, book_ids=None, remove_from_dirtied=True,
            callback=None):
        if book_ids is None:
            book_ids = set(self.dirtied_cache)

        if callback is not None:
            callback(len(book_ids), True, False)

        for book_id in book_ids:
            if self._field_for('path', book_id) is None:
                if callback is not None:
                    callback(book_id, None, False)
                continue
            mi, sequence = self._get_metadata_for_dump(book_id)
            if mi is None:
                if callback is not None:
                    callback(book_id, mi, False)
                continue
            try:
                raw = metadata_to_opf(mi)
                self._write_backup(book_id, raw)
                if remove_from_dirtied:
                    self._clear_dirtied(book_id, sequence)
            except:
                pass
            if callback is not None:
                callback(book_id, mi, True)

    @write_api
    def set_cover(self, book_id_data_map):
        for book_id, data in book_id_data_map.iteritems():
            try:
                path = self._field_for('path', book_id).replace('/', os.sep)
            except AttributeError:
                self._update_path((book_id,))
                path = self._field_for('path', book_id).replace('/', os.sep)

            self.backend.set_cover(book_id, path, data)
        for cc in self.cover_caches:
            cc.invalidate(book_id_data_map)
        return self._set_field('cover', {
            book_id:(0 if data is None else 1) for book_id, data in book_id_data_map.iteritems()})

    @write_api
    def add_cover_cache(self, cover_cache):
        if not callable(cover_cache.invalidate):
            raise ValueError('Cover caches must have an invalidate method')
        self.cover_caches.add(cover_cache)

    @write_api
    def remove_cover_cache(self, cover_cache):
        self.cover_caches.discard(cover_cache)

    @write_api
    def set_metadata(self, book_id, mi, ignore_errors=False, force_changes=False,
                     set_title=True, set_authors=True, allow_case_change=False):

        try:
            mi = mi.to_book_metadata()
        except (AttributeError, TypeError):
            pass

        def set_field(name, val):
            self._set_field(name, {book_id:val}, do_path_update=False, allow_case_change=allow_case_change)

        path_changed = False
        if set_title and mi.title:
            path_changed = True
            set_field('title', mi.title)
        if set_authors:
            path_changed = True
            if not mi.authors:
                mi.authors = [_('Unknown')]
            authors = []
            for a in mi.authors:
                authors += string_to_authors(a)
            set_field('authors', authors)

        if path_changed:
            self._update_path({book_id})

        def protected_set_field(name, val):
            try:
                set_field(name, val)
            except:
                if ignore_errors:
                    traceback.print_exc()
                else:
                    raise

        try:
            cdata = mi.cover_data[1]
            if cdata is None and isinstance(mi.cover, basestring) and mi.cover and os.access(mi.cover, os.R_OK):
                with lopen(mi.cover, 'rb') as f:
                    cdata = f.read() or None
            if cdata is not None:
                self._set_cover({book_id: cdata})
        except:
            if ignore_errors:
                traceback.print_exc()
            else:
                raise

        try:
            with self.backend.conn:
                for field in ('rating', 'series_index', 'timestamp'):
                    val = getattr(mi, field)
                    if val is not None:
                        protected_set_field(field, val)

                for field in ('author_sort', 'publisher', 'series', 'tags', 'comments',
                    'languages', 'pubdate'):
                    val = mi.get(field, None)
                    if (force_changes and val is not None) or not mi.is_null(field):
                        protected_set_field(field, val)

                val = mi.get('title_sort', None)
                if (force_changes and val is not None) or not mi.is_null('title_sort'):
                    protected_set_field('sort', val)

                mi_idents = mi.get_identifiers()
                if force_changes:
                    protected_set_field('identifiers', mi_idents)
                elif mi_idents:
                    identifiers = self._field_for('identifiers', book_id, default_value={})
                    for key, val in mi_idents.iteritems():
                        if val and val.strip():
                            identifiers[icu_lower(key)] = val
                    protected_set_field('identifiers', identifiers)

                user_mi = mi.get_all_user_metadata(make_copy=False)
                fm = self.field_metadata
                for key in user_mi.iterkeys():
                    if (key in fm and
                            user_mi[key]['datatype'] == fm[key]['datatype'] and
                            (user_mi[key]['datatype'] != 'text' or
                            user_mi[key]['is_multiple'] == fm[key]['is_multiple'])):
                        val = mi.get(key, None)
                        if force_changes or val is not None:
                            protected_set_field(key, val)
                            idx = key + '_index'
                            if idx in self.fields:
                                extra = mi.get_extra(key)
                                if extra is not None or force_changes:
                                    protected_set_field(idx, extra)
        except:
            self._reload_from_db()
            raise

    def _do_add_format(self, book_id, fmt, stream, name=None, mtime=None):
        path = self._field_for('path', book_id)
        if path is None:
            self._update_path({book_id}, mark_as_dirtied=False)
            path = self._field_for('path', book_id)

        path = path.replace('/', os.sep)
        title = self._field_for('title', book_id, default_value=_('Unknown'))
        try:
            author = self._field_for('authors', book_id, default_value=(_('Unknown'),))[0]
        except IndexError:
            author = _('Unknown')

        size, fname = self.backend.add_format(book_id, fmt, stream, title, author, path, name, mtime=mtime)
        return size, fname

    @api
    def add_format(self, book_id, fmt, stream_or_path, replace=True, run_hooks=True, dbapi=None):
        if run_hooks:
            npath = run_import_plugins(stream_or_path, fmt)
            fmt = os.path.splitext(npath)[-1].lower().replace('.', '').upper()
            stream_or_path = lopen(npath, 'rb')
            fmt = check_ebook_format(stream_or_path, fmt)

        with self.write_lock:
            fmt = (fmt or '').upper()
            self.format_metadata_cache[book_id].pop(fmt, None)
            try:
                name = self.fields['formats'].format_fname(book_id, fmt)
            except Exception:
                name = None

            if name and not replace:
                return False

            stream = stream_or_path if hasattr(stream_or_path, 'read') else lopen(stream_or_path, 'rb')
            size, fname = self._do_add_format(book_id, fmt, stream, name)
            del stream

            max_size = self.fields['formats'].table.update_fmt(book_id, fmt, fname, size, self.backend)
            self.fields['size'].table.update_sizes({book_id: max_size})
            self._update_last_modified((book_id,))

        if run_hooks:
            run_plugins_on_postimport(dbapi or self, book_id, fmt)
            stream_or_path.close()

        return True

    @write_api
    def remove_formats(self, formats_map, db_only=False):
        table = self.fields['formats'].table
        formats_map = {book_id:frozenset((f or '').upper() for f in fmts) for book_id, fmts in formats_map.iteritems()}

        for book_id, fmts in formats_map.iteritems():
            for fmt in fmts:
                self.format_metadata_cache[book_id].pop(fmt, None)

        if not db_only:
            removes = defaultdict(set)
            for book_id, fmts in formats_map.iteritems():
                try:
                    path = self._field_for('path', book_id).replace('/', os.sep)
                except:
                    continue
                for fmt in fmts:
                    try:
                        name = self.fields['formats'].format_fname(book_id, fmt)
                    except:
                        continue
                    if name and path:
                        removes[book_id].add((fmt, name, path))
            if removes:
                self.backend.remove_formats(removes)

        size_map = table.remove_formats(formats_map, self.backend)
        self.fields['size'].table.update_sizes(size_map)
        self._update_last_modified(tuple(formats_map.iterkeys()))

    @read_api
    def get_next_series_num_for(self, series, field='series', current_indices=False):
        books = ()
        sf = self.fields[field]
        if series:
            q = icu_lower(series)
            for val, book_ids in sf.iter_searchable_values(self._get_proxy_metadata, frozenset(self._all_book_ids())):
                if q == icu_lower(val):
                    books = book_ids
                    break
        idf = sf.index_field
        index_map = {book_id:self._fast_field_for(idf, book_id, default_value=1.0) for book_id in books}
        if current_indices:
            return index_map
        series_indices = sorted(index_map.itervalues())
        return _get_next_series_num_for_list(tuple(series_indices), unwrap=False)

    @read_api
    def author_sort_from_authors(self, authors, key_func=icu_lower):
        table = self.fields['authors'].table
        result = []
        rmap = {key_func(v):k for k, v in table.id_map.iteritems()}
        for aut in authors:
            aid = rmap.get(key_func(aut), None)
            result.append(author_to_author_sort(aut) if aid is None else table.asort_map[aid])
        return ' & '.join(filter(None, result))

    @read_api
    def data_for_has_book(self):
        try:
            return {icu_lower(title) for title in self.fields['title'].table.book_col_map.itervalues()}
        except TypeError:
            return {icu_lower(as_unicode(title)) for title in self.fields['title'].table.book_col_map.itervalues()}

    @read_api
    def has_book(self, mi):
        title = mi.title
        if title:
            if isbytestring(title):
                title = title.decode(preferred_encoding, 'replace')
            q = icu_lower(title).strip()
            for title in self.fields['title'].table.book_col_map.itervalues():
                if q == icu_lower(title):
                    return True
        return False

    @read_api
    def has_id(self, book_id):
        return book_id in self.fields['title'].table.book_col_map

    @write_api
    def create_book_entry(self, mi, cover=None, add_duplicates=True, force_id=None, apply_import_tags=True, preserve_uuid=False):
        if mi.tags:
            mi.tags = list(mi.tags)
        if apply_import_tags:
            _add_newbook_tag(mi)
        if not add_duplicates and self._has_book(mi):
            return
        series_index = (self._get_next_series_num_for(mi.series) if mi.series_index is None else mi.series_index)
        try:
            series_index = float(series_index)
        except Exception:
            try:
                series_index = float(self._get_next_series_num_for(mi.series))
            except Exception:
                series_index = 1.0
        if not mi.authors:
            mi.authors = (_('Unknown'),)
        aus = mi.author_sort if mi.author_sort else self._author_sort_from_authors(mi.authors)
        mi.title = mi.title or _('Unknown')
        if isbytestring(aus):
            aus = aus.decode(preferred_encoding, 'replace')
        if isbytestring(mi.title):
            mi.title = mi.title.decode(preferred_encoding, 'replace')
        if force_id is None:
            self.backend.execute('INSERT INTO books(title, series_index, author_sort) VALUES (?, ?, ?)',
                         (mi.title, series_index, aus))
        else:
            self.backend.execute('INSERT INTO books(id, title, series_index, author_sort) VALUES (?, ?, ?, ?)',
                         (force_id, mi.title, series_index, aus))
        book_id = self.backend.last_insert_rowid()

        mi.timestamp = utcnow() if mi.timestamp is None else mi.timestamp
        mi.pubdate = UNDEFINED_DATE if mi.pubdate is None else mi.pubdate
        if cover is not None:
            mi.cover, mi.cover_data = None, (None, cover)
        self._set_metadata(book_id, mi, ignore_errors=True)
        if preserve_uuid and mi.uuid:
            self._set_field('uuid', {book_id:mi.uuid})
        self.fields['size'].table.book_col_map[book_id] = 0
        row = next(self.backend.execute('SELECT sort, series_index, author_sort, uuid, has_cover FROM books WHERE id=?', (book_id,)))
        for field, val in zip(('sort', 'series_index', 'author_sort', 'uuid', 'cover'), row):
            if field == 'cover':
                val = bool(val)
            elif field == 'uuid':
                self.fields[field].table.uuid_to_id_map[val] = book_id
            self.fields[field].table.book_col_map[book_id] = val

        return book_id

    @api
    def add_books(self, books, add_duplicates=True, apply_import_tags=True, preserve_uuid=False, run_hooks=True, dbapi=None):
        duplicates, ids = [], []
        fmt_map = {}
        for mi, format_map in books:
            book_id = self.create_book_entry(mi, add_duplicates=add_duplicates, apply_import_tags=apply_import_tags, preserve_uuid=preserve_uuid)
            if book_id is None:
                duplicates.append((mi, format_map))
            else:
                ids.append(book_id)
                for fmt, stream_or_path in format_map.iteritems():
                    if self.add_format(book_id, fmt, stream_or_path, dbapi=dbapi, run_hooks=run_hooks):
                        fmt_map[fmt.lower()] = getattr(stream_or_path, 'name', stream_or_path) or '<stream>'
            run_plugins_on_postadd(dbapi or self, book_id, fmt_map)
        return ids, duplicates

    @write_api
    def remove_books(self, book_ids, permanent=False):
        path_map = {}
        for book_id in book_ids:
            try:
                path = self._field_for('path', book_id).replace('/', os.sep)
            except:
                path = None
            path_map[book_id] = path
        if iswindows:
            paths = (x.replace(os.sep, '/') for x in path_map.itervalues() if x)
            self.backend.windows_check_if_files_in_use(paths)

        self.backend.remove_books(path_map, permanent=permanent)
        for field in self.fields.itervalues():
            try:
                table = field.table
            except AttributeError:
                continue
            else:
                table.remove_books(book_ids, self.backend)
        self._search_api.discard_books(book_ids)
        self._clear_caches(book_ids=book_ids, template_cache=False, search_cache=False)
        for cc in self.cover_caches:
            cc.invalidate(book_ids)

    @read_api
    def author_sort_strings_for_books(self, book_ids):
        val_map = {}
        for book_id in book_ids:
            authors = self._field_ids_for('authors', book_id)
            adata = self._author_data(authors)
            val_map[book_id] = tuple(adata[aid]['sort'] for aid in authors)
        return val_map

    @write_api
    def rename_items(self, field, item_id_to_new_name_map, change_index=True, restrict_to_book_ids=None):

        f = self.fields[field]
        affected_books = set()
        try:
            sv = f.metadata['is_multiple']['ui_to_list']
        except (TypeError, KeyError, AttributeError):
            sv = None

        if restrict_to_book_ids is not None:
            if not isinstance(restrict_to_book_ids, (Set, MutableSet)):
                restrict_to_book_ids = frozenset(restrict_to_book_ids)
            id_map = {}
            default_process_map = {}
            for old_id, new_name in item_id_to_new_name_map.iteritems():
                new_names = tuple(x.strip() for x in new_name.split(sv)) if sv else (new_name,)
                books_with_id = f.books_for(old_id)
                books_to_process = books_with_id & restrict_to_book_ids
                if len(books_with_id) == len(books_to_process):
                    default_process_map[old_id] = new_name
                elif books_to_process:
                    affected_books.update(books_to_process)
                    newvals = {}
                    for book_id in books_to_process:
                        vals = self._field_for(field, book_id)
                        if isinstance(vals, tuple):
                            vals = list(vals)
                            try:
                                dex = vals.index(self._get_item_name(field, old_id))
                                vals[dex] = new_names[0]
                                if len(new_names) > 1:
                                    set_vals = {icu_lower(x) for x in vals}
                                    for v in new_names[1:]:
                                        lv = icu_lower(v)
                                        if lv not in set_vals:
                                            vals.append(v)
                                            set_vals.add(lv)
                                newvals[book_id] = vals
                            except Exception:
                                traceback.print_exc()
                        else:
                            newvals[book_id] = new_names[0]
                    self._set_field(field, newvals)
                    id_map[old_id] = self._get_item_id(field, new_names[0])
            if default_process_map:
                ab, idm = self._rename_items(field, default_process_map, change_index=change_index)
                affected_books.update(ab)
                id_map.update(idm)
            return affected_books, id_map

        try:
            func = f.table.rename_item
        except AttributeError:
            raise ValueError('Cannot rename items for one-one fields: %s' % field)
        moved_books = set()
        id_map = {}
        for item_id, new_name in item_id_to_new_name_map.iteritems():
            new_names = tuple(x.strip() for x in new_name.split(sv)) if sv else (new_name,)
            books, new_id = func(item_id, new_names[0], self.backend)
            affected_books.update(books)
            id_map[item_id] = new_id
            if new_id != item_id:
                moved_books.update(books)
            if len(new_names) > 1:
                extra = new_names[1:]
                self._set_field(field, {book_id:self._fast_field_for(f, book_id) + extra for book_id in books})

        if affected_books:
            if field == 'authors':
                self._set_field('author_sort',
                                {k:' & '.join(v) for k, v in self._author_sort_strings_for_books(affected_books).iteritems()})
                self._update_path(affected_books, mark_as_dirtied=False)
            elif change_index and hasattr(f, 'index_field') and tweaks['series_index_auto_increment'] != 'no_change':
                for book_id in moved_books:
                    self._set_field(f.index_field.name, {book_id:self._get_next_series_num_for(self._fast_field_for(f, book_id), field=field)})
            self._mark_as_dirty(affected_books)
        return affected_books, id_map

    @write_api
    def remove_items(self, field, item_ids, restrict_to_book_ids=None):
        field = self.fields[field]
        if restrict_to_book_ids is not None and not isinstance(restrict_to_book_ids, (MutableSet, Set)):
            restrict_to_book_ids = frozenset(restrict_to_book_ids)
        affected_books = field.table.remove_items(item_ids, self.backend,
                                                  restrict_to_book_ids=restrict_to_book_ids)
        if affected_books:
            if hasattr(field, 'index_field'):
                self._set_field(field.index_field.name, {bid:1.0 for bid in affected_books})
            else:
                self._mark_as_dirty(affected_books)
        return affected_books

    @write_api
    def add_custom_book_data(self, name, val_map, delete_first=False):
        missing = frozenset(val_map) - self._all_book_ids()
        if missing:
            raise ValueError('add_custom_book_data: no such book_ids: %d'%missing)
        self.backend.add_custom_data(name, val_map, delete_first)

    @read_api
    def get_custom_book_data(self, name, book_ids=(), default=None):
        return self.backend.get_custom_book_data(name, book_ids, default)

    @write_api
    def delete_custom_book_data(self, name, book_ids=()):
        self.backend.delete_custom_book_data(name, book_ids)

    @read_api
    def get_ids_for_custom_book_data(self, name):
        return self.backend.get_ids_for_custom_book_data(name)

    @read_api
    def conversion_options(self, book_id, fmt='PIPE'):
        return self.backend.conversion_options(book_id, fmt)

    @read_api
    def has_conversion_options(self, ids, fmt='PIPE'):
        return self.backend.has_conversion_options(ids, fmt)

    @write_api
    def delete_conversion_options(self, book_ids, fmt='PIPE'):
        return self.backend.delete_conversion_options(book_ids, fmt)

    @write_api
    def set_conversion_options(self, options, fmt='PIPE'):
        return self.backend.set_conversion_options(options, fmt)

    @write_api
    def refresh_format_cache(self):
        self.fields['formats'].table.read(self.backend)
        self.format_metadata_cache.clear()

    @write_api
    def refresh_ondevice(self):
        self.fields['ondevice'].clear_caches()
        self.clear_search_caches()
        self.clear_composite_caches()

    @read_api
    def tags_older_than(self, tag, delta=None, must_have_tag=None, must_have_authors=None):
        tag_map = {icu_lower(v):k for k, v in self._get_id_map('tags').iteritems()}
        tag = icu_lower(tag.strip())
        mht = icu_lower(must_have_tag.strip()) if must_have_tag else None
        tag_id, mht_id = tag_map.get(tag, None), tag_map.get(mht, None)
        ans = set()
        if mht_id is None and mht:
            return ans
        if tag_id is not None:
            tagged_books = self._books_for_field('tags', tag_id)
            if mht_id is not None and tagged_books:
                tagged_books = tagged_books.intersection(self._books_for_field('tags', mht_id))
            if tagged_books:
                if must_have_authors is not None:
                    amap = {icu_lower(v):k for k, v in self._get_id_map('authors').iteritems()}
                    books = None
                    for author in must_have_authors:
                        abooks = self._books_for_field('authors', amap.get(icu_lower(author), None))
                        books = abooks if books is None else books.intersection(abooks)
                        if not books:
                            break
                    tagged_books = tagged_books.intersection(books or set())
                if delta is None:
                    ans = tagged_books
                else:
                    now = nowf()
                    for book_id in tagged_books:
                        ts = self._field_for('timestamp', book_id)
                        if (now - ts) > delta:
                            ans.add(book_id)
        return ans

    @write_api
    def set_sort_for_authors(self, author_id_to_sort_map, update_books=True):
        sort_map = self.fields['authors'].table.set_sort_names(author_id_to_sort_map, self.backend)
        changed_books = set()
        if update_books:
            val_map = {}
            for author_id in sort_map:
                books = self._books_for_field('authors', author_id)
                changed_books |= books
                for book_id in books:
                    authors = self._field_ids_for('authors', book_id)
                    adata = self._author_data(authors)
                    sorts = [adata[x]['sort'] for x in authors]
                    val_map[book_id] = ' & '.join(sorts)
            if val_map:
                self._set_field('author_sort', val_map)
        if changed_books:
            self._mark_as_dirty(changed_books)
        return changed_books

    @write_api
    def set_link_for_authors(self, author_id_to_link_map):
        link_map = self.fields['authors'].table.set_links(author_id_to_link_map, self.backend)
        changed_books = set()
        for author_id in link_map:
            changed_books |= self._books_for_field('authors', author_id)
        if changed_books:
            self._mark_as_dirty(changed_books)
        return changed_books

    @read_api
    def lookup_by_uuid(self, uuid):
        return self.fields['uuid'].table.lookup_by_uuid(uuid)

    @write_api
    def delete_custom_column(self, label=None, num=None):
        self.backend.delete_custom_column(label, num)

    @write_api
    def create_custom_column(self, label, name, datatype, is_multiple, editable=True, display={}):
        return self.backend.create_custom_column(label, name, datatype, is_multiple, editable=editable, display=display)

    @write_api
    def set_custom_column_metadata(self, num, name=None, label=None, is_editable=None,
                                   display=None, update_last_modified=False):
        changed = self.backend.set_custom_column_metadata(num, name=name, label=label, is_editable=is_editable, display=display)
        if changed:
            if update_last_modified:
                self._update_last_modified(self._all_book_ids())
            else:
                self.backend.prefs.set('update_all_last_mod_dates_on_start', True)
        return changed

    @read_api
    def get_books_for_category(self, category, item_id_or_composite_value):
        f = self.fields[category]
        if hasattr(f, 'get_books_for_val'):
            return f.get_books_for_val(item_id_or_composite_value, self._get_proxy_metadata, self._all_book_ids())
        return self._books_for_field(f.name, int(item_id_or_composite_value))

    @read_api
    def data_for_find_identical_books(self):
        at = self.fields['authors'].table
        author_map = defaultdict(set)
        for aid, author in at.id_map.iteritems():
            author_map[icu_lower(author)].add(aid)
        return (author_map, at.col_book_map.copy(), self.fields['title'].table.book_col_map.copy())

    @read_api
    def update_data_for_find_identical_books(self, book_id, data):
        author_map, author_book_map, title_map = data
        title_map[book_id] = self._field_for('title', book_id)
        at = self.fields['authors'].table
        for aid in at.book_col_map.get(book_id, ()):
            author_map[icu_lower(at.id_map[aid])].add(aid)
            try:
                author_book_map[aid].add(book_id)
            except KeyError:
                author_book_map[aid] = {book_id}

    @read_api
    def find_identical_books(self, mi, search_restriction='', book_ids=None):
        from calibre.db.utils import fuzzy_title
        identical_book_ids = set()
        if mi.authors:
            try:
                quathors = mi.authors[:20]
                query = ' and '.join('authors:"=%s"'%(a.replace('"', '')) for a in quathors)
                qauthors = mi.authors[20:]
            except ValueError:
                return identical_book_ids
            try:
                book_ids = self._search(query, restriction=search_restriction, book_ids=book_ids)
            except:
                traceback.print_exc()
                return identical_book_ids
            if qauthors and book_ids:
                matches = set()
                qauthors = {icu_lower(x) for x in qauthors}
                for book_id in book_ids:
                    aut = self._field_for('authors', book_id)
                    if aut:
                        aut = {icu_lower(x) for x in aut}
                        if aut.issuperset(qauthors):
                            matches.add(book_id)
                book_ids = matches

            for book_id in book_ids:
                fbook_title = self._field_for('title', book_id)
                fbook_title = fuzzy_title(fbook_title)
                mbook_title = fuzzy_title(mi.title)
                if fbook_title == mbook_title:
                    identical_book_ids.add(book_id)
        return identical_book_ids

    @read_api
    def get_top_level_move_items(self):
        all_paths = {self._field_for('path', book_id).partition('/')[0] for book_id in self._all_book_ids()}
        return self.backend.get_top_level_move_items(all_paths)

    @write_api
    def move_library_to(self, newloc, progress=None, abort=None):
        def progress_callback(item_name, item_count, total):
            try:
                if progress is not None:
                    progress(item_name, item_count, total)
            except Exception:
                import traceback
                traceback.print_exc()

        all_paths = {self._field_for('path', book_id).partition('/')[0] for book_id in self._all_book_ids()}
        self.backend.move_library_to(all_paths, newloc, progress=progress_callback, abort=abort)

    @read_api
    def saved_search_names(self):
        return self._search_api.saved_searches.names()

    @read_api
    def saved_search_lookup(self, name):
        return self._search_api.saved_searches.lookup(name)

    @write_api
    def saved_search_set_all(self, smap):
        self._search_api.saved_searches.set_all(smap)
        self._clear_search_caches()

    @write_api
    def saved_search_delete(self, name):
        self._search_api.saved_searches.delete(name)
        self._clear_search_caches()

    @write_api
    def saved_search_add(self, name, val):
        self._search_api.saved_searches.add(name, val)

    @write_api
    def saved_search_rename(self, old_name, new_name):
        self._search_api.saved_searches.rename(old_name, new_name)
        self._clear_search_caches()

    @write_api
    def change_search_locations(self, newlocs):
        self._search_api.change_locations(newlocs)

    @write_api
    def refresh_search_locations(self):
        self._search_api.change_locations(self.field_metadata.get_search_terms())

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
            books = self._search(expr)
            for book in book_ids:
                if book in books:
                    ans[book].append(lib)
        return {k:tuple(sorted(v, key=sort_key)) for k, v in ans.iteritems()}

    @read_api
    def user_categories_for_books(self, book_ids, proxy_metadata_map=None):
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

    @write_api
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
# }}}