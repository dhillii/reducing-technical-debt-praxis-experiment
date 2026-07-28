#!/usr/bin/env python2
# vim:fileencoding=UTF-8:ts=4:sw=4:sta:et:sts=4:ai
from __future__ import with_statement

__license__   = 'GPL v3'
__copyright__ = '2010, Kovid Goyal <kovid@kovidgoyal.net>'
__docformat__ = 'restructuredtext en'

import itertools, time, traceback, locale
from itertools import repeat, izip, imap
from datetime import timedelta
from threading import Thread

from calibre.utils.config import tweaks, prefs
from calibre.utils.date import parse_date, now, UNDEFINED_DATE, clean_date_for_sort
from calibre.utils.search_query_parser import SearchQueryParser, ParseException
from calibre.utils.localization import (canonicalize_lang, lang_map, get_udc)
from calibre.db.search import CONTAINS_MATCH, EQUALS_MATCH, REGEXP_MATCH, _match
from calibre.ebooks.metadata import title_sort, author_to_author_sort
from calibre.ebooks.metadata.opf2 import metadata_to_opf
from calibre import prints


class MetadataBackup(Thread):
    """
    Continuously backup changed metadata into OPF files
    in the book directory. This class runs in its own
    thread and makes sure that the actual file write happens in the
    GUI thread to prevent Windows' file locking from causing problems.
    """

    def __init__(self, db):
        Thread.__init__(self)
        self.daemon = True
        self.db = db
        self.keep_running = True
        from calibre.gui2 import FunctionDispatcher
        self.do_write = FunctionDispatcher(self.write)
        self.get_metadata_for_dump = FunctionDispatcher(db.get_metadata_for_dump)
        self.clear_dirtied = FunctionDispatcher(db.clear_dirtied)
        self.set_dirtied = FunctionDispatcher(db.dirtied)

    def stop(self):
        self.keep_running = False

    def break_cycles(self):
        self.do_write = self.get_metadata_for_dump = self.clear_dirtied = \
            self.set_dirtied = self.db = None

    def run(self):
        while self.keep_running:
            try:
                time.sleep(2)
                (id_, sequence) = self.db.get_a_dirtied_book()
                if id_ is None:
                    continue
            except:
                break
            if not self.keep_running:
                break

            try:
                path, mi, sequence = self.get_metadata_for_dump(id_)
            except:
                prints('Failed to get backup metadata for id:', id_, 'once')
                traceback.print_exc()
                time.sleep(2)
                try:
                    path, mi, sequence = self.get_metadata_for_dump(id_)
                except:
                    prints('Failed to get backup metadata for id:', id_, 'again, giving up')
                    traceback.print_exc()
                    continue

            if mi is None:
                self.clear_dirtied(id_, sequence)
                continue
            if not self.keep_running:
                break

            time.sleep(0.1)
            try:
                raw = metadata_to_opf(mi)
            except:
                prints('Failed to convert to opf for id:', id_)
                traceback.print_exc()
                continue

            if not self.keep_running:
                break

            time.sleep(0.1)
            try:
                self.do_write(path, raw)
            except:
                prints('Failed to write backup metadata for id:', id_, 'once')
                time.sleep(2)
                try:
                    self.do_write(path, raw)
                except:
                    prints('Failed to write backup metadata for id:', id_,
                           'again, giving up')
                    continue

            self.clear_dirtied(id_, sequence)
        self.break_cycles()

    def write(self, path, raw):
        with lopen(path, 'wb') as f:
            f.write(raw)


pref_use_primary_find_in_search = False


def set_use_primary_find_in_search(toWhat):
    global pref_use_primary_find_in_search
    pref_use_primary_find_in_search = toWhat


y, c, n, u = map(icu_lower, (_('yes'), _('checked'), _('no'), _('unchecked')))
yes_vals = {y, c, 'true'}
no_vals = {n, u, 'false'}
del y, c, n, u


def force_to_bool(val):
    if isinstance(val, (str, unicode)):
        try:
            val = icu_lower(val)
            if not val:
                val = None
            elif val in yes_vals:
                val = True
            elif val in no_vals:
                val = False
            else:
                val = bool(int(val))
        except:
            val = None
    return val


class CacheRow(list):
    def __init__(self, db, composites, val, series_col, series_sort_col):
        self.db = db
        self._composites = composites
        list.__init__(self, val)
        self._must_do = len(composites) > 0
        self._series_col = series_col
        self._series_sort_col = series_sort_col
        self._series_sort = None

    def __getitem__(self, col):
        if self._must_do:
            is_comp = False
            if isinstance(col, slice):
                start = 0 if col.start is None else col.start
                step = 1 if col.stop is None else col.stop
                for c in range(start, col.stop, step):
                    if c in self._composites:
                        is_comp = True
                        break
            elif col in self._composites:
                is_comp = True
            if is_comp:
                id_ = list.__getitem__(self, 0)
                self._must_do = False
                mi = self.db.get_metadata(id_, index_is_id=True,
                                          get_user_categories=False)
                for c in self._composites:
                    self[c] = mi.get(self._composites[c])
        if col == self._series_sort_col and self._series_sort is None:
            if self[self._series_col]:
                self._series_sort = title_sort(self[self._series_col])
                self[self._series_sort_col] = self._series_sort
            else:
                self._series_sort = ''
                self[self._series_sort_col] = ''
        return list.__getitem__(self, col)

    def __getslice__(self, i, j):
        return self.__getitem__(slice(i, j))

    def refresh_composites(self):
        for c in self._composites:
            self[c] = None
        self._must_do = True


class ResultCache(SearchQueryParser):
    """
    Stores sorted and filtered metadata in memory.
    """

    def __init__(self, FIELD_MAP, field_metadata, db_prefs=None):
        self.FIELD_MAP = FIELD_MAP
        self.db_prefs = db_prefs
        self.composites = {}
        self.udc = get_udc()
        for key, meta in field_metadata.iteritems():
            if meta['datatype'] == 'composite':
                self.composites[meta['rec_index']] = key
        self.series_col = field_metadata['series']['rec_index']
        self.series_sort_col = field_metadata['series_sort']['rec_index']
        self._data = []
        self._map = self._map_filtered = []
        self.first_sort = True
        self.search_restriction = self.base_restriction = ''
        self.base_restriction_name = self.search_restriction_name = ''
        self.search_restriction_book_count = 0
        self.marked_ids_dict = {}
        self.field_metadata = field_metadata
        self.all_search_locations = field_metadata.get_search_terms()
        SearchQueryParser.__init__(self, self.all_search_locations, optimize=True)
        self.build_date_relop_dict()
        self.build_numeric_relop_dict()
        global pref_use_primary_find_in_search
        pref_use_primary_find_in_search = prefs['use_primary_find_in_search']
        self._uuid_column_index = self.FIELD_MAP['uuid']
        self._uuid_map = {}
        self._prepare_field_maps()

    def _prepare_field_maps(self):
        self._db_col = {}
        self._exclude_fields = []
        self._col_datatype = [''] * len(self.FIELD_MAP)
        self._is_multiple_cols = {}
        for name, meta in self.field_metadata.iteritems():
            if name.startswith('@'):
                continue
            if not meta['search_terms']:
                continue
            idx = meta['rec_index']
            self._db_col[name] = idx
            if meta['datatype'] not in ('composite', 'text', 'comments',
                                       'series', 'enumeration'):
                self._exclude_fields.append(idx)
            self._col_datatype[idx] = meta['datatype']
            self._is_multiple_cols[idx] = meta['is_multiple'].get('cache_to_list', None)

    def break_cycles(self):
        self._data = self.field_metadata = self.FIELD_MAP = \
            self.numeric_search_relops = self.date_search_relops = \
            self.db_prefs = self.all_search_locations = None
        self.sqp_change_locations([])

    def __getitem__(self, row):
        return self._data[self._map_filtered[row]]

    def __len__(self):
        return len(self._map_filtered)

    def __iter__(self):
        for idx in self._map_filtered:
            yield self._data[idx]

    def iterall(self):
        for x in self._data:
            if x is not None:
                yield x

    def iterallids(self):
        idx = self.FIELD_MAP['id']
        for x in self.iterall():
            yield x[idx]

    # Search functions {{{

    def universal_set(self):
        return {i[0] for i in self._data if i is not None}

    def change_search_locations(self, locations):
        self.sqp_change_locations(locations)
        self.all_search_locations = locations

    def build_date_relop_dict(self):
        def relop_eq(db, query, fc):
            if db.year == query.year:
                if fc == 1:
                    return True
                if db.month == query.month:
                    if fc == 2:
                        return True
                    return db.day == query.day
            return False

        def relop_gt(db, query, fc):
            if db.year > query.year:
                return True
            if fc > 1 and db.year == query.year:
                if db.month > query.month:
                    return True
                return fc == 3 and db.month == query.month and db.day > query.day
            return False

        def relop_lt(db, query, fc):
            if db.year < query.year:
                return True
            if fc > 1 and db.year == query.year:
                if db.month < query.month:
                    return True
                return fc == 3 and db.month == query.month and db.day < query.day
            return False

        self.date_search_relops = {
            '=': [1, relop_eq],
            '>': [1, relop_gt],
            '<': [1, relop_lt],
            '!=': [2, lambda d, q, fc: not relop_eq(d, q, fc)],
            '>=': [2, lambda d, q, fc: not relop_lt(d, q, fc)],
            '<=': [2, lambda d, q, fc: not relop_gt(d, q, fc)],
        }

    local_today = ('_today', icu_lower(_('today')))
    local_yesterday = ('_yesterday', icu_lower(_('yesterday')))
    local_thismonth = ('_thismonth', icu_lower(_('thismonth')))
    local_daysago = icu_lower(_('daysago'))
    local_daysago_len = len(local_daysago)
    untrans_daysago = '_daysago'
    untrans_daysago_len = len('_daysago')

    def get_dates_matches(self, location, query, candidates):
        if len(query) < 2:
            return set()
        if location == 'date':
            location = 'timestamp'
        loc = self.field_metadata[location]['rec_index']

        if query in ('false', 'true'):
            target = query == 'true'
            matches = set()
            for id_ in candidates:
                item = self._data[id_]
                if item is None:
                    continue
                v = item[loc]
                if isinstance(v, (str, unicode)):
                    v = parse_date(v)
                if (v is None or v <= UNDEFINED_DATE) != target:
                    continue
                matches.add(item[0])
            return matches

        relop = None
        for k, (p, r) in self.date_search_relops.iteritems():
            if query.startswith(k):
                relop = r
                query = query[p:]
                break
        if relop is None:
            relop = self.date_search_relops['='][1]

        if query in self.local_today:
            qd = now()
            field_count = 3
        elif query in self.local_yesterday:
            qd = now() - timedelta(1)
            field_count = 3
        elif query in self.local_thismonth:
            qd = now()
            field_count = 2
        elif query.endswith(self.local_daysago) or query.endswith(self.untrans_daysago):
            num = query[:- (self.local_daysago_len if query.endswith(self.local_daysago) else self.untrans_daysago_len)]
            try:
                qd = now() - timedelta(int(num))
            except:
                raise ParseException(_('Number conversion error: {0}').format(num))
            field_count = 3
        else:
            try:
                qd = parse_date(query, as_utc=False)
            except:
                raise ParseException(_('Date conversion error: {0}').format(query))
            field_count = query.count('-') + 1 if '-' in query else query.count('/') + 1

        matches = set()
        for id_ in candidates:
            item = self._data[id_]
            if item is None or item[loc] is None:
                continue
            v = item[loc]
            if isinstance(v, (str, unicode)):
                v = parse_date(v)
            if relop(v, qd, field_count):
                matches.add(item[0])
        return matches

    def build_numeric_relop_dict(self):
        self.numeric_search_relops = {
            '=': [1, lambda r, q: r == q],
            '>': [1, lambda r, q: r is not None and r > q],
            '<': [1, lambda r, q: r is not None and r < q],
            '!=': [2, lambda r, q: r != q],
            '>=': [2, lambda r, q: r is not None and r >= q],
            '<=': [2, lambda r, q: r is not None and r <= q],
        }

    def get_numeric_matches(self, location, query, candidates, val_func=None):
        if not query:
            return set()
        if val_func is None:
            loc = self.field_metadata[location]['rec_index']
            val_func = lambda item, loc=loc: item[loc]

        dt = self.field_metadata[location]['datatype']
        if query in ('false', 'true'):
            if dt == 'rating' or location == 'cover':
                relop = (lambda x, _: not bool(x)) if query == 'false' else (lambda x, _: bool(x))
            else:
                relop = (lambda x, _: x is None) if query == 'false' else (lambda x, _: x is not None)
            target = None
        else:
            relop = None
            for k, (p, r) in self.numeric_search_relops.iteritems():
                if query.startswith(k):
                    relop = r
                    query = query[p:]
                    break
            if relop is None:
                relop = self.numeric_search_relops['='][1]

            cast = lambda x: x
            adjust = lambda x: x
            if dt == 'int':
                cast = int
            elif dt == 'rating':
                cast = lambda x: 0 if x is None else int(x)
                adjust = lambda x: x / 2
            elif dt in ('float', 'composite'):
                cast = float
            else:
                cast = int

            mult = 1.0
            if len(query) > 1:
                suffix = query[-1:].lower()
                mult = {'k': 1024., 'm': 1024.**2, 'g': 1024.**3}.get(suffix, 1.0)
                if mult != 1.0:
                    query = query[:-1]

            try:
                target = cast(query) * mult
            except:
                raise ParseException(_('Non-numeric value in query: {0}').format(query))

        matches = set()
        for id_ in candidates:
            item = self._data[id_]
            if item is None:
                continue
            try:
                v = cast(val_func(item))
            except:
                v = None
            if v:
                v = adjust(v)
            if relop(v, target):
                matches.add(item[0])
        return matches

    def get_user_category_matches(self, location, query, candidates):
        if self.db_prefs is None or len(query) < 2:
            return set()
        user_cats = self.db_prefs.get('user_categories', [])
        remaining = set(candidates)

        check_subcats = query.startswith('.')
        if check_subcats:
            query = query[1:]

        for key in user_cats:
            if key == location or (check_subcats and key.startswith(location + '.')):
                for (item, category, _) in user_cats[key]:
                    s = self.get_matches(category, '=' + item, candidates=remaining)
                    remaining -= s
                    matches = s
        if query == 'false':
            return set(candidates) - matches
        return matches

    def get_keypair_matches(self, location, query, candidates):
        matches = set()
        if ':' in query:
            parts = [p.strip() for p in query.split(':')]
            if len(parts) != 2:
                raise ParseException(_('Invalid query format for colon-separated search: {0}').format(query))
            keyq, valq = parts
            keyq_mkind, keyq = self._matchkind(keyq)
            valq_mkind, valq = self._matchkind(valq)
        else:
            keyq = ''
            keyq_mkind = CONTAINS_MATCH
            valq_mkind, valq = self._matchkind(query)

        loc = self.field_metadata[location]['rec_index']
        split_char = self.field_metadata[location]['is_multiple'].get('cache_to_list', ',')

        for id_ in candidates:
            item = self._data[id_]
            if item is None:
                continue
            field_val = item[loc]
            if field_val is None:
                if valq == 'false':
                    matches.add(id_)
                continue

            add_if_nothing = valq == 'false'
            for pair in [p.strip() for p in field_val.split(split_char)]:
                if ':' not in pair:
                    continue
                k, v = pair.split(':', 1)
                if keyq and not _match(keyq, k, keyq_mkind,
                                       use_primary_find_in_search=pref_use_primary_find_in_search):
                    continue
                if valq:
                    if valq == 'true' and not v:
                        continue
                    if valq == 'false':
                        if v:
                            add_if_nothing = False
                            continue
                    elif not _match(valq, v, valq_mkind,
                                    use_primary_find_in_search=pref_use_primary_find_in_search):
                        continue
                matches.add(id_)
            if add_if_nothing:
                matches.add(id_)
        return matches

    def _matchkind(self, query):
        matchkind = CONTAINS_MATCH
        if len(query) > 1:
            if query.startswith('\\'):
                query = query[1:]
            elif query.startswith('='):
                matchkind = EQUALS_MATCH
                query = query[1:]
            elif query.startswith('~'):
                matchkind = REGEXP_MATCH
                query = query[1:]
        if matchkind != REGEXP_MATCH:
            query = icu_lower(query)
        return matchkind, query

    local_no = icu_lower(_('no'))
    local_yes = icu_lower(_('yes'))
    local_unchecked = icu_lower(_('unchecked'))
    local_checked = icu_lower(_('checked'))
    local_empty = icu_lower(_('empty'))
    local_blank = icu_lower(_('blank'))
    local_bool_values = (
        local_no, local_unchecked, '_no', 'false',
        local_yes, local_checked, '_yes', 'true',
        local_empty, local_blank, '_empty')

    def get_bool_matches(self, location, query, candidates):
        bools_are_tristate = self.db_prefs.get('bools_are_tristate')
        loc = self.field_metadata[location]['rec_index']
        query = icu_lower(query)
        if query not in self.local_bool_values:
            raise ParseException(_('Invalid boolean query "{0}"').format(query))
        matches = set()
        for id_ in candidates:
            item = self._data[id_]
            if item is None:
                continue
            val = force_to_bool(item[loc])
            if not bools_are_tristate:
                if val is None or not val:
                    if query in (self.local_no, self.local_unchecked, '_no', 'false'):
                        matches.add(item[0])
                else:
                    if query in (self.local_yes, self.local_checked, '_yes', 'true'):
                        matches.add(item[0])
            else:
                if val is None:
                    if query in (self.local_empty, self.local_blank, '_empty', 'false'):
                        matches.add(item[0])
                elif not val:
                    if query in (self.local_no, self.local_unchecked, '_no', 'true'):
                        matches.add(item[0])
                else:
                    if query in (self.local_yes, self.local_checked, '_yes', 'true'):
                        matches.add(item[0])
        return matches

    def _generic_text_match(self, loc, query, candidates, matchkind):
        matches = set()
        for id_ in candidates:
            item = self._data[id_]
            if item is None:
                continue
            field_val = item[loc]
            if not field_val:
                if query == 'false' and matchkind == CONTAINS_MATCH:
                    matches.add(item[0])
                continue
            if query == 'false' and matchkind == CONTAINS_MATCH:
                continue
            if query == 'true' and matchkind == CONTAINS_MATCH:
                if isinstance(field_val, basestring) and field_val.strip() == '':
                    continue
                matches.add(item[0])
                continue
            if self._col_datatype[loc] == 'rating':
                try:
                    rating_query = int(query) * 2
                except:
                    rating_query = None
                if rating_query and rating_query == int(field_val):
                    matches.add(item[0])
                continue
            if self._col_datatype[loc] in ('float', 'int'):
                try:
                    if self._col_datatype[loc] == 'float' and float(query) == field_val:
                        matches.add(item[0])
                        continue
                    if self._col_datatype[loc] == 'int' and int(query) == field_val:
                        matches.add(item[0])
                        continue
                except:
                    continue
            if loc in self._exclude_fields:
                continue
            vals = [field_val] if self._is_multiple_cols[loc] is None else \
                [v.strip() for v in field_val.split(self._is_multiple_cols[loc])]
            if _match(query, vals, matchkind,
                      use_primary_find_in_search=pref_use_primary_find_in_search):
                matches.add(item[0])
        return matches

    def get_matches(self, location, query, candidates=None,
                    allow_recursion=True):
        if candidates is None:
            candidates = self.universal_set()
        if not candidates:
            return set()
        if location not in self.all_search_locations:
            return set()
        if location.startswith('@') and location[1:] in self.db_prefs.get('grouped_search_terms', []):
            location = location[1:]

        if not query or not query.strip():
            return set()

        original_location = location
        location = self.field_metadata.search_term_to_field_key(icu_lower(location.strip()))
        if isinstance(location, list):
            if not allow_recursion:
                raise ParseException(_('Recursive query group detected: {0}').format(query))
            invert = query.lower() == 'false'
            sub_query = 'true' if invert else query
            matches = set()
            remaining = candidates.copy()
            for loc in location:
                sub_matches = self.get_matches(loc, sub_query,
                                               candidates=remaining,
                                               allow_recursion=False)
                matches |= sub_matches
                remaining -= sub_matches
                if not remaining:
                    break
            if invert:
                matches = self.universal_set() - matches
            return matches

        if location == 'all' and prefs['limit_search_columns'] and prefs['limit_search_columns_to']:
            terms = {icu_lower(l.strip()) for l in prefs['limit_search_columns_to']
                     if l and l != 'all' and icu_lower(l.strip()) in self.all_search_locations}
            if terms:
                matches = set()
                remaining = candidates.copy()
                for term in terms:
                    try:
                        sub = self.get_matches(term, query,
                                               candidates=remaining,
                                               allow_recursion=allow_recursion)
                        matches |= sub
                        remaining -= sub
                        if not remaining:
                            break
                    except:
                        pass
                return matches

        if location in self.field_metadata:
            fm = self.field_metadata[location]
            dtype = fm['datatype']
            if dtype == 'datetime' or (dtype == 'composite' and fm['display'].get('composite_sort') == 'date'):
                return self.get_dates_matches(location, query.lower(), candidates)
            if dtype in ('rating', 'int', 'float') or (dtype == 'composite' and fm['display'].get('composite_sort') == 'number'):
                return self.get_numeric_matches(location, query.lower(), candidates)
            if dtype == 'bool':
                return self.get_bool_matches(location, query, candidates)
            if fm['is_multiple'] and query.startswith('#') and query[1:2] in '=<>!':
                vf = lambda item, loc=fm['rec_index'], ms=fm['is_multiple']['cache_to_list']: \
                    len(item[loc].split(ms)) if item[loc] is not None else 0
                return self.get_numeric_matches(location, query[1:], candidates, val_func=vf)
            if fm.get('is_csp', False):
                if location == 'identifiers' and original_location == 'isbn':
                    return self.get_keypair_matches('identifiers', '=isbn:' + query, candidates)
                return self.get_keypair_matches(location, query, candidates)

        if location.startswith('@'):
            return self.get_user_category_matches(location[1:], query.lower(), candidates)

        matchkind, query = self._matchkind(query)
        if not isinstance(query, unicode):
            query = query.decode('utf-8')
        loc_idx = self._db_col.get(location)
        if loc_idx is None:
            return set()
        return self._generic_text_match(loc_idx, query, candidates, matchkind)

    def search(self, query, return_matches=False, sort_results=True):
        ans = self.search_getting_ids(query, self.search_restriction,
                                      set_restriction_count=True,
                                      sort_results=sort_results)
        if return_matches:
            return ans
        self._map_filtered = ans

    def _build_restriction_string(self, restriction):
        if self.base_restriction:
            return u'(%s) and (%s)' % (self.base_restriction, restriction) if restriction else self.base_restriction
        return restriction

    def search_getting_ids(self, query, search_restriction,
                           set_restriction_count=False,
                           use_virtual_library=True, sort_results=True):
        if use_virtual_library:
            search_restriction = self._build_restriction_string(search_restriction)
        q = search_restriction if not query or not query.strip() else \
            u'(%s) and (%s)' % (search_restriction, query) if search_restriction else query
        if not q:
            if set_restriction_count:
                self.search_restriction_book_count = len(self._map)
            return list(self._map)
        matches = self.parse(q)
        tmap = [False] * len(self._data)
        for x in matches:
            tmap[x] = True
        rv = [x for x in self._map if tmap[x]]
        if set_restriction_count and q == search_restriction:
            self.search_restriction_book_count = len(rv)
        return rv

    def get_search_restriction(self):
        return self.search_restriction

    def set_search_restriction(self, s):
        self.search_restriction = s

    def get_base_restriction(self):
        return self.base_restriction

    def set_base_restriction(self, s):
        self.base_restriction = s

    def get_base_restriction_name(self):
        return self.base_restriction_name

    def set_base_restriction_name(self, s):
        self.base_restriction_name = s

    def get_search_restriction_name(self):
        return self.search_restriction_name

    def set_search_restriction_name(self, s):
        self.search_restriction_name = s

    def search_restriction_applied(self):
        return bool(self.search_restriction) or bool(self.base_restriction)

    def get_search_restriction_book_count(self):
        return self.search_restriction_book_count

    def set_marked_ids(self, id_dict):
        if not hasattr(id_dict, 'items'):
            self.marked_ids_dict = dict.fromkeys(id_dict, u'true')
        else:
            self.marked_ids_dict = dict(izip(id_dict.iterkeys(),
                                            imap(unicode, id_dict.itervalues())))

        marked_col = self.FIELD_MAP['marked']
        for r in self.iterall():
            r[marked_col] = None

        for id_, val in self.marked_ids_dict.iteritems():
            try:
                self._data[id_][marked_col] = val
            except:
                pass

    def get_marked(self, idx, index_is_id=True, default_value=None):
        id_ = idx if index_is_id else self[idx][0]
        return self.marked_ids_dict.get(id_, default_value)

    # }}}

    def remove(self, id):
        try:
            self._uuid_map.pop(self._data[id][self._uuid_column_index], None)
        except (IndexError, TypeError):
            pass
        try:
            self._data[id] = None
        except IndexError:
            pass
        try:
            self._map.remove(id)
        except ValueError:
            pass
        try:
            self._map_filtered.remove(id)
        except ValueError:
            pass

    def set(self, row, col, val, row_is_id=False):
        id = row if row_is_id else self._map_filtered[row]
        d = self._data[id]
        if col == self._uuid_column_index:
            self._uuid_map.pop(d[col], None)
        d[col] = val
        if col == self._uuid_column_index:
            self._uuid_map[val] = id
        d.refresh_composites()

    def get(self, row, col, row_is_id=False):
        id = row if row_is_id else self._map_filtered[row]
        return self._data[id][col]

    def index(self, id, cache=False):
        x = self._map if cache else self._map_filtered
        return x.index(id)

    def row(self, id):
        return self.index(id)

    def has_id(self, id):
        try:
            return self._data[id] is not None
        except IndexError:
            return False

    def refresh_ids(self, db, ids):
        for id in ids:
            try:
                self._data[id] = CacheRow(db, self.composites,
                                          db.conn.get('SELECT * from meta2 WHERE id=?', (id,))[0],
                                          self.series_col, self.series_sort_col)
                self._data[id].append(db.book_on_device_string(id))
                self._data[id].append(self.marked_ids_dict.get(id, None))
                self._data[id].append(None)
                self._uuid_map[self._data[id][self._uuid_column_index]] = id
            except IndexError:
                return None
        try:
            return map(self.row, ids)
        except ValueError:
            return None

    def books_added(self, ids, db):
        if not ids:
            return
        self._data.extend(repeat(None, max(ids) - len(self._data) + 2))
        for id in ids:
            self._data[id] = CacheRow(db, self.composites,
                                      db.conn.get('SELECT * from meta2 WHERE id=?', (id,))[0],
                                      self.series_col, self.series_sort_col)
            self._data[id].append(db.book_on_device_string(id))
            self._data[id].append(self.marked_ids_dict.get(id, None))
            self._data[id].append(None)
            self._uuid_map[self._data[id][self._uuid_column_index]] = id
        self._map[0:0] = ids
        self._map_filtered[0:0] = ids

    def books_deleted(self, ids):
        for id in ids:
            self.remove(id)

    def count(self):
        return len(self._map)

    def refresh_ondevice(self, db):
        ondevice_col = self.FIELD_MAP['ondevice']
        for item in self._data:
            if item is not None:
                item[ondevice_col] = db.book_on_device_string(item[0])
                item.refresh_composites()

    def refresh(self, db, field=None, ascending=True):
        db.initialize_template_cache()
        temp = db.conn.get('SELECT * FROM meta2')
        self._data = [None] * (temp[-1][0] + 2) if temp else []
        for r in temp:
            self._data[r[0]] = CacheRow(db, self.composites, r,
                                        self.series_col, self.series_sort_col)
            self._uuid_map[self._data[r[0]][self._uuid_column_index]] = r[0]

        for item in self._data:
            if item is not None:
                item.append(db.book_on_device_string(item[0]))
                item.extend((None, None))

        marked_col = self.FIELD_MAP['marked']
        for id_, val in self.marked_ids_dict.iteritems():
            try:
                self._data[id_][marked_col] = val
            except:
                pass

        self._map = [i[0] for i in self._data if i is not None]
        if field is not None:
            self.sort(field, ascending)
        self._map_filtered = list(self._map)
        if self.search_restriction or self.base_restriction:
            self.search('', return_matches=False)

    def sanitize_sort_field_name(self, field):
        field = self.field_metadata.search_term_to_field_key(field.lower().strip())
        if field == 'title':
            field = 'sort'
        elif field == 'authors':
            field = 'author_sort'
        return field

    def sort(self, field, ascending, subsort=False):
        self.multisort([(field, ascending)])

    def multisort(self, fields=None, subsort=False, only_ids=None):
        fields = fields or []
        fields = [(self.sanitize_sort_field_name(x), bool(y)) for x, y in fields]
        keys = self.field_metadata.sortable_field_keys()
        fields = [x for x in fields if x[0] in keys]
        if subsort and 'sort' not in [x[0] for x in fields]:
            fields.append(('sort', True))
        if not fields:
            fields = [('timestamp', False)]

        keyg = SortKeyGenerator(fields, self.field_metadata, self._data, self.db_prefs)
        if only_ids is None:
            self._map.sort(key=keyg)
            tmap = [False] * len(self._data)
            for x in self._map_filtered:
                tmap[x] = True
            self._map_filtered = [x for x in self._map if tmap[x]]
        else:
            only_ids.sort(key=keyg)


class SortKey(object):
    def __init__(self, orders, values):
        self.orders = orders
        self.values = values

    def __cmp__(self, other):
        for i, asc in enumerate(self.orders):
            ans = cmp(self.values[i], other.values[i])
            if ans != 0:
                return ans * asc
        return 0


class SortKeyGenerator(object):
    def __init__(self, fields, field_metadata, data, db_prefs):
        from calibre.utils.icu import sort_key
        self.field_metadata = field_metadata
        self.db_prefs = db_prefs
        self.orders = [1 if asc else -1 for _, asc in fields]
        self.entries = [(name, field_metadata[name]) for name, _ in fields]
        self.library_order = tweaks['title_series_sorting'] == 'library_order'
        self.data = data
        self.string_sort_key = sort_key
        self.lang_idx = field_metadata['languages']['rec_index']

    def __call__(self, record):
        return SortKey(self.orders, tuple(self._values(record)))

    def _values(self, record):
        for name, fm in self.entries:
            dt = fm['datatype']
            val = record[fm['rec_index']]
            if dt == 'composite':
                sb = fm['display'].get('composite_sort', 'text')
                if sb == 'date':
                    try:
                        val = parse_date(val)
                    except:
                        val = UNDEFINED_DATE
                    dt = 'datetime'
                elif sb == 'number':
                    try:
                        p = 1
                        for i, candidate in enumerate(('B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB')):
                            if val.endswith(candidate):
                                p = 1024 ** i
                                val = val[:-len(candidate)].strip()
                                break
                        val = locale.atof(val) * p
                    except:
                        val = 0.0
                    dt = 'float'
                elif sb == 'bool':
                    val = force_to_bool(val)
                    dt = 'bool'

            if dt == 'datetime':
                if val is None:
                    val = UNDEFINED_DATE
                if tweaks['sort_dates_using_visible_fields']:
                    fmt = None
                    if name == 'timestamp':
                        fmt = tweaks['gui_timestamp_display_format']
                    elif name == 'pubdate':
                        fmt = tweaks['gui_pubdate_display_format']
                    elif name == 'last_modified':
                        fmt = tweaks['gui_last_modified_display_format']
                    elif fm['is_custom']:
                        fmt = fm['display'].get('date_format')
                    val = clean_date_for_sort(val, fmt)
            elif dt == 'series':
                if val is None:
                    val = ('', 1)
                else:
                    if self.library_order:
                        try:
                            lang = record[self.lang_idx].partition(u',')[0]
                        except Exception:
                            lang = None
                        val = title_sort(val, order='library_order', lang=lang)
                    sidx_fm = self.field_metadata[name + '_index']
                    sidx = record[sidx_fm['rec_index']]
                    val = (self.string_sort_key(val), sidx)
            elif dt in ('text', 'comments', 'composite', 'enumeration'):
                if val:
                    if fm['is_multiple']:
                        jv = fm['is_multiple']['list_to_ui']
                        sv = fm['is_multiple']['cache_to_list']
                        if '&' in jv:
                            val = jv.join([author_to_author_sort(v) for v in val.split(sv)])
                        else:
                            val = jv.join(sorted(val.split(sv), key=self.string_sort_key))
                val = self.string_sort_key(val)
            elif dt == 'bool':
                if not self.db_prefs.get('bools_are_tristate'):
                    val = {True: 1, False: 2, None: 2}.get(val, 2)
                else:
                    val = {True: 1, False: 2, None: 3}.get(val, 3)
            yield val