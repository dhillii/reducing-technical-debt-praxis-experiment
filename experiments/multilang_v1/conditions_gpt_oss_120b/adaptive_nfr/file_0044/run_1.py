#!/usr/bin/env python2
# vim:fileencoding=UTF-8:ts=4:sw=4:sta:et:sts=4:ai
from __future__ import (unicode_literals, division, absolute_import,
                        print_function)
from future_builtins import map

__license__   = 'GPL v3'
__copyright__ = '2011, Kovid Goyal <kovid@kovidgoyal.net>'
__docformat__ = 'restructuredtext en'

import traceback, cPickle, copy, os
from collections import OrderedDict

from PyQt5.Qt import (QAbstractItemModel, QIcon, QFont, Qt,
        QMimeData, QModelIndex, pyqtSignal, QObject)

from calibre.constants import config_dir
from calibre.ebooks.metadata import rating_to_stars
from calibre.gui2 import gprefs, config, error_dialog, file_icon_provider
from calibre.db.categories import Tag
from calibre.utils.config import tweaks
from calibre.utils.icu import sort_key, lower, strcmp, collation_order
from calibre.library.field_metadata import category_icon_map
from calibre.gui2.dialogs.confirm_delete import confirm
from calibre.utils.formatter import EvalFormatter

TAG_SEARCH_STATES = {'clear': 0, 'mark_plus': 1, 'mark_plusplus': 2,
                     'mark_minus': 3, 'mark_minusminus': 4}
DRAG_IMAGE_ROLE = Qt.UserRole + 1000
COUNT_ROLE = DRAG_IMAGE_ROLE + 1

_bf = None


def bf():
    """Return a bold QFont, cached."""
    global _bf
    if _bf is None:
        _bf = QFont()
        _bf.setBold(True)
        _bf = (_bf)
    return _bf


class TagTreeItem(object):  # {{{

    CATEGORY = 0
    TAG      = 1
    ROOT     = 2
    category_custom_icons = {}
    file_icon_provider = None

    def __init__(self, data=None, is_category=False, icon_map=None,
                 parent=None, tooltip=None, category_key=None, temporary=False):
        if self.file_icon_provider is None:
            self.file_icon_provider = TagTreeItem.file_icon_provider = file_icon_provider().icon_from_ext
        self.parent = parent
        self.children = []
        self.blank = QIcon()
        self.is_gst = False
        self.boxed = False
        self.icon_state_map = list(icon_map)
        if self.parent is not None:
            self.parent.append(self)

        if data is None:
            self.type = self.ROOT
        else:
            self.type = self.CATEGORY if is_category else self.TAG

        if self.type == self.CATEGORY:
            self.name = data
            self.py_name = data
            self.category_key = category_key
            self.temporary = temporary
            self.tag = Tag(data, category=category_key,
                   is_editable=category_key not in
                            ['news', 'search', 'identifiers', 'languages'],
                   is_searchable=category_key not in ['search'])
        elif self.type == self.TAG:
            self.tag = data
            self.cached_average_rating = None
            self.cached_item_count = None

        self.tooltip = tooltip or ''

    def break_cycles(self):
        del self.parent
        del self.children

    def ensure_icon(self):
        if self.icon_state_map[0] is not None:
            return
        if self.type == self.TAG:
            if self.tag.category == 'formats':
                fmt = self.tag.original_name.replace('ORIGINAL_', '')
                cc = self.file_icon_provider(fmt)
            else:
                cc = self.category_custom_icons.get(self.tag.category, None)
        elif self.type == self.CATEGORY:
            cc = self.category_custom_icons.get(self.category_key, None)
        self.icon_state_map[0] = cc or QIcon()

    def __str__(self):
        if self.type == self.ROOT:
            return 'ROOT'
        if self.type == self.CATEGORY:
            return 'CATEGORY:'+str(
                self.name)+':%d'%len(getattr(self,
                    'children', []))
        return 'TAG: %s'%self.tag.name

    def row(self):
        if self.parent is not None:
            return self.parent.children.index(self)
        return 0

    def append(self, child):
        child.parent = self
        self.children.append(child)

    @property
    def average_rating(self):
        if self.type != self.TAG:
            return 0
        if not self.tag.is_hierarchical:
            return self.tag.avg_rating
        if not self.children:
            return self.tag.avg_rating
        if self.cached_average_rating is None:
            raise ValueError('Must compute average rating for tag ' + self.tag.original_name)
        return self.cached_average_rating

    @property
    def item_count(self):
        if not self.tag.is_hierarchical or not self.children:
            return self.tag.count
        if self.cached_item_count is not None:
            return self.cached_item_count

        def child_item_set(node):
            s = node.tag.id_set.copy()
            for child in node.children:
                s |= child_item_set(child)
            return s
        self.cached_item_count = len(child_item_set(self))
        return self.cached_item_count

    def data(self, role):
        if role == Qt.UserRole:
            return self
        if self.type == self.TAG:
            return self.tag_data(role)
        if self.type == self.CATEGORY:
            return self.category_data(role)
        return None

    def category_data(self, role):
        if role == Qt.DisplayRole:
            return self.py_name
        if role == Qt.EditRole:
            return (self.py_name)
        if role == Qt.DecorationRole:
            if not self.tag.state:
                self.ensure_icon()
            return self.icon_state_map[self.tag.state]
        if role == Qt.FontRole:
            return bf()
        if role == Qt.ToolTipRole:
            return self.tooltip
        if role == DRAG_IMAGE_ROLE:
            self.ensure_icon()
            return self.icon_state_map[0]
        if role == COUNT_ROLE:
            return len(self.child_tags())
        return None

    def tag_data(self, role):
        tag = self.tag
        name = tag.sort if tag.use_sort_as_name else (tag.original_name if not tag.is_hierarchical else tag.name)
        if role == Qt.DisplayRole:
            return unicode(name)
        if role == Qt.EditRole:
            return (tag.original_name)
        if role == Qt.DecorationRole:
            if not tag.state:
                self.ensure_icon()
            return self.icon_state_map[tag.state]
        if role == Qt.ToolTipRole:
            tt = [self.tooltip] if self.tooltip else []
            if tag.original_categories:
                tt.append('%s:%s' % (','.join(tag.original_categories), tag.original_name))
            else:
                tt.append('%s:%s' % (tag.category, tag.original_name))
            ar = self.average_rating
            if ar:
                tt.append(_('Average rating for books in this category: %.1f') % ar)
            elif self.type == self.TAG and ar is not None:
                tt.append(_('Books in this category are unrated'))
            if self.type == self.TAG and self.tag.category == 'search':
                tt.append(_('Search expression:') + ' ' + self.tag.search_expression)
            if self.type == self.TAG:
                tt.append(_('Number of books: %s') % self.item_count)
            return '\n'.join(tt)
        if role == DRAG_IMAGE_ROLE:
            self.ensure_icon()
            return self.icon_state_map[0]
        if role == COUNT_ROLE:
            return self.item_count
        return None

    def dump_data(self):
        fmt = '%s [count=%s%s]'
        if self.type == self.CATEGORY:
            return fmt % (self.py_name, len(self.child_tags()), '')
        tag = self.tag
        name = tag.sort if tag.use_sort_as_name else (tag.original_name if not tag.is_hierarchical else tag.name)
        count = self.item_count
        rating = self.average_rating
        rating_str = ',rating=%.1f' % rating if rating else ''
        return fmt % (name, count, rating_str)

    def toggle(self, set_to=None):
        """
        set_to: None => advance the state, otherwise a value from TAG_SEARCH_STATES
        """
        if set_to is None:
            while True:
                self.tag.state = (self.tag.state + 1) % 5
                if self.tag.state in (TAG_SEARCH_STATES['mark_plus'],
                                      TAG_SEARCH_STATES['mark_minus']):
                    if self.tag.is_searchable:
                        break
                elif self.tag.state in (TAG_SEARCH_STATES['mark_plusplus'],
                                        TAG_SEARCH_STATES['mark_minusminus']):
                    if self.tag.is_searchable and self.children and \
                                    self.tag.is_hierarchical == '5state':
                        break
                else:
                    break
        else:
            self.tag.state = set_to

    def all_children(self):
        res = []

        def recurse(nodes):
            for t in nodes:
                res.append(t)
                recurse(t.children)
        recurse(self.children)
        return res

    def child_tags(self):
        res = []

        def recurse(nodes, depth):
            if depth > 100:
                return
            for t in nodes:
                if t.type != TagTreeItem.CATEGORY:
                    res.append(t)
                recurse(t.children, depth + 1)
        recurse(self.children, 1)
        return res
    # }}}


class TagsModel(QAbstractItemModel):  # {{{

    search_item_renamed = pyqtSignal()
    tag_item_renamed = pyqtSignal()
    refresh_required = pyqtSignal()
    restriction_error = pyqtSignal()
    drag_drop_finished = pyqtSignal(object)
    user_categories_edited = pyqtSignal(object, object)
    user_category_added = pyqtSignal()

    def __init__(self, parent, prefs=gprefs):
        QAbstractItemModel.__init__(self, parent)
        self.prefs = prefs
        self.node_map = {}
        self.category_nodes = []
        self.category_custom_icons = {}
        for k, v in self.prefs['tags_browser_category_icons'].iteritems():
            icon = QIcon(os.path.join(config_dir, 'tb_icons', v))
            if len(icon.availableSizes()) > 0:
                self.category_custom_icons[k] = icon
        self.categories_with_ratings = ['authors', 'series', 'publisher', 'tags']
        self.icon_state_map = [None, QIcon(I('plus.png')), QIcon(I('plusplus.png')),
                             QIcon(I('minus.png')), QIcon(I('minusminus.png'))]

        self.hidden_categories = set()
        self.search_restriction = None
        self.filter_categories_by = None
        self.collapse_model = 'disable'
        self.row_map = []
        self.root_item = self.create_node(icon_map=self.icon_state_map)
        self.db = None
        self._build_in_progress = False
        self.reread_collapse_model({}, rebuild=False)

    @property
    def gui_parent(self):
        return QObject.parent(self)

    def set_custom_category_icon(self, key, path):
        d = self.prefs['tags_browser_category_icons']
        if path:
            d[key] = path
            self.category_custom_icons[key] = QIcon(os.path.join(config_dir,
                                                            'tb_icons', path))
        else:
            if key in d:
                try:
                    os.remove(os.path.join(config_dir, 'tb_icons', d[key]))
                except:
                    pass
                del d[key]
                del self.category_custom_icons[key]
        self.prefs['tags_browser_category_icons'] = d

    def reread_collapse_model(self, state_map, rebuild=True):
        if self.prefs['tags_browser_collapse_at'] == 0:
            self.collapse_model = 'disable'
        else:
            self.collapse_model = self.prefs['tags_browser_partition_method']
        if rebuild:
            self.rebuild_node_tree(state_map)

    def set_database(self, db, hidden_categories=None):
        self.beginResetModel()
        hidden_cats = db.new_api.pref('tag_browser_hidden_categories', None)
        if hidden_cats is None:
            hidden_cats = config['tag_browser_hidden_categories']
        self.hidden_categories = set()
        for cat in hidden_cats:
            if cat in db.field_metadata:
                self.hidden_categories.add(cat)
        db.new_api.set_pref('tag_browser_hidden_categories', list(self.hidden_categories))
        if hidden_categories is not None:
            self.hidden_categories = hidden_categories

        self.db = db
        self._run_rebuild()
        self.endResetModel()

    def rebuild_node_tree(self, state_map={}):
        if self._build_in_progress:
            print ('Tag browser build already in progress')
            traceback.print_stack()
            return
        self._build_in_progress = True
        self.beginResetModel()
        self._run_rebuild(state_map=state_map)
        self.endResetModel()
        self._build_in_progress = False

    def _run_rebuild(self, state_map={}):
        for node in self.node_map.itervalues():
            node.break_cycles()
        self.node_map.clear()
        self.category_nodes = []
        self.root_item = self.create_node(icon_map=self.icon_state_map)
        self._rebuild_node_tree(state_map=state_map)

    def _rebuild_node_tree(self, state_map):
        data = self._get_category_nodes(config['sort_tags_by'])
        gst = self.db.prefs.get('grouped_search_terms', {})

        last_category_node = None
        category_node_map = {}
        self.user_category_node_tree = {}

        for i, key in enumerate(self.categories):
            is_gst = False
            if key.startswith('@') and key[1:] in gst:
                tt = _(u'The grouped search term name is "{0}"').format(key)
                is_gst = True
            elif key == 'news':
                tt = ''
            else:
                fm = self.db.field_metadata[key]
                cust_desc = ''
                if fm['is_custom']:
                    cust_desc = fm['display'].get('description', '')
                    if cust_desc:
                        cust_desc = '\n' + _('Description:') + ' ' + cust_desc
                tt = _(u'The lookup/search name is "{0}"{1}').format(key, cust_desc)

            if self.category_custom_icons.get(key) is None:
                self.category_custom_icons[key] = QIcon(I(
                    category_icon_map['gst'] if is_gst else
                    category_icon_map.get(key, category_icon_map['custom:'])))

            if key.startswith('@'):
                path_parts = key.split('.')
                path = ''
                last_category_node = self.root_item
                tree_root = self.user_category_node_tree
                for idx, part in enumerate(path_parts):
                    path += part
                    if path not in category_node_map:
                        node = self.create_node(parent=last_category_node,
                                   data=part[1:] if idx == 0 else part,
                                   is_category=True,
                                   tooltip=tt if path == key else path,
                                   category_key=path,
                                   icon_map=self.icon_state_map)
                        last_category_node = node
                        category_node_map[path] = node
                        self.category_nodes.append(node)
                        node.can_be_edited = (not is_gst) and (idx == len(path_parts) - 1)
                        node.is_gst = is_gst
                        if not is_gst:
                            node.tag.is_hierarchical = '5state'
                            tree_root[part] = {}
                            tree_root = tree_root[part]
                    else:
                        last_category_node = category_node_map[path]
                        tree_root = tree_root[part]
                    path += '.'
            else:
                node = self.create_node(parent=self.root_item,
                                   data=self.categories[key],
                                   is_category=True,
                                   tooltip=tt, category_key=key,
                                   icon_map=self.icon_state_map)
                node.is_gst = False
                category_node_map[key] = node
                last_category_node = node
                self.category_nodes.append(node)
        self._create_node_tree(data, state_map)

    def _create_node_tree(self, data, state_map):
        if data is None:
            print ('_create_node_tree: no data!')
            traceback.print_stack()
            return

        collapse = self.prefs['tags_browser_collapse_at']
        collapse_model = self.collapse_model if collapse != 0 else 'disable'
        sort_by = config['sort_tags_by']

        if collapse_model != 'disable':
            collapse_template = self._choose_collapse_template(sort_by, collapse_model)

        with self.db.new_api.safe_read_lock:
            for category in self.category_nodes:
                self._process_one_node(category, collapse_model, collapse,
                                      collapse_template, data, state_map)

        self._finalize_node_tree()

    def _choose_collapse_template(self, sort_by, collapse_model):
        if sort_by == 'name':
            return tweaks['categories_collapsed_name_template']
        if sort_by == 'rating':
            return tweaks['categories_collapsed_rating_template']
        return tweaks['categories_collapsed_popularity_template']

    def _process_one_node(self, category, collapse_model, collapse,
                          collapse_template, data, state_map):
        key = category.category_key
        if key not in data:
            return
        if key in self.prefs['tag_browser_dont_collapse']:
            collapse_model = 'disable'
        if not data[key]:
            return

        fm = self.db.field_metadata[key]
        clear_rating = self._should_clear_rating(key, fm)
        in_user_category = fm['kind'] == 'user' and not category.is_gst
        top_level_component = 'z' + data[key][0].original_name
        last_idx = -collapse
        category_is_hierarchical = self._is_category_hierarchical(key)

        for idx, tag in enumerate(data[key]):
            if clear_rating:
                tag.avg_rating = None
            tag.state = state_map.get((tag.name, tag.category), 0)

            node_parent = self._determine_parent_node(category, tag, idx,
                                                      collapse, collapse_model,
                                                      collapse_template,
                                                      last_idx, top_level_component,
                                                      category_is_hierarchical)
            if node_parent is None:
                continue

            components = self._get_components(tag, category_is_hierarchical)
            self._create_or_update_nodes(node_parent, tag, components,
                                         category, in_user_category, fm, data[key])

    def _should_clear_rating(self, key, fm):
        return (key not in self.categories_with_ratings and
                not fm['is_custom'] and
                not fm['kind'] == 'user')

    def _is_category_hierarchical(self, key):
        return not (key in ['authors', 'publisher', 'news', 'formats', 'rating'] or
                    key not in self.db.prefs.get('categories_using_hierarchy', []) or
                    config['sort_tags_by'] != 'name')

    def _determine_parent_node(self, category, tag, idx, collapse,
                               collapse_model, collapse_template,
                               last_idx, top_level_component,
                               category_is_hierarchical):
        if collapse_model == 'disable' or len(data[category.category_key]) <= collapse:
            return category

        if collapse_model == 'partition':
            if idx >= last_idx + collapse and not tag.original_name.startswith(top_level_component + '.'):
                sub_cat = self._create_partition_node(category, tag, idx,
                                                      collapse, data[category.category_key],
                                                      collapse_template)
                return sub_cat
            return sub_cat
        else:  # first letter
            cl = self._first_letter(tag)
            if cl != getattr(category, '_last_collapse_letter', None):
                category._last_collapse_letter = cl
                sub_cat = self.create_node(parent=category,
                             data=cl,
                             is_category=True,
                             tooltip=None, temporary=True,
                             category_key=category.category_key,
                             icon_map=self.icon_state_map)
                sub_cat.is_gst = category.is_gst
                return sub_cat
            return getattr(category, '_last_sub_cat', None)

    def _first_letter(self, tag):
        if not tag.sort:
            return ' '
        c = icu_upper(tag.sort)
        _, ordlen = collation_order(c)
        return c[0:ordlen]

    def _create_partition_node(self, category, tag, idx, collapse,
                               tag_list, template):
        last = min(idx + collapse - 1, len(tag_list) - 1)
        d = {'first': tag, 'last': tag_list[last]}
        name = EvalFormatter().safe_format(template, d, '##TAG_VIEW##', None)
        if name.startswith('##TAG_VIEW##'):
            return category
        sub_cat = self.create_node(parent=category, data=name,
                 tooltip=None, temporary=True,
                 is_category=True,
                 category_key=category.category_key,
                 icon_map=self.icon_state_map)
        sub_cat.tag.is_searchable = False
        sub_cat.is_gst = category.is_gst
        return sub_cat

    def _get_components(self, tag, category_is_hierarchical):
        if category_is_hierarchical or tag.is_hierarchical:
            return [t.strip() for t in tag.original_name.split('.') if t.strip()]
        return [tag.original_name]

    def _create_or_update_nodes(self, parent_node, tag, components,
                                category, in_user_category, fm, tag_list):
        if (not tag.is_hierarchical) and (in_user_category or
                (fm['is_custom'] and fm['display'].get('is_names', False)) or
                not self._is_category_hierarchical(category.category_key) or
                len(components) == 1):
            node = self.create_node(parent=parent_node, data=tag,
                                   tooltip=category.category_key,
                                   icon_map=self.icon_state_map)
            return

        node_parent = parent_node
        for i, comp in enumerate(components):
            child_map = self._get_child_map(node_parent, i)
            key = (comp, tag.category)
            if key in child_map:
                node_parent = child_map[key]
                self._merge_intermediate_node(node_parent, tag)
            else:
                t = self._make_intermediate_tag(comp, tag, i, components, tag_list)
                node_parent = self.create_node(parent=node_parent, data=t,
                                               tooltip=category.category_key,
                                               icon_map=self.icon_state_map)
                child_map[key] = node_parent

    def _get_child_map(self, node_parent, depth):
        if depth == 0:
            return {}
        return {((t.tag.name, t.tag.category), t) for t in node_parent.children
                if t.type != TagTreeItem.CATEGORY}

    def _merge_intermediate_node(self, node, tag):
        t = node.tag
        t.is_hierarchical = '5state' if tag.category != 'search' else '3state'
        if tag.id_set and t.id_set:
            t.id_set |= tag.id_set

    def _make_intermediate_tag(self, comp, tag, idx, components, tag_list):
        if idx < len(components) - 1:
            original_name = '.'.join(components[:idx + 1])
            t = copy.copy(tag)
            t.original_name = original_name
            t.count = 0
            if tag.category != 'search':
                t.is_editable = False
            else:
                t.is_searchable = t.is_editable = False
        else:
            t = tag
            if not tag.category.startswith('@'):
                t.original_name = t.name
        t.is_hierarchical = '5state' if t.category != 'search' else '3state'
        t.name = comp
        return t

    def _finalize_node_tree(self):
        new_children = []
        for node in self.root_item.children:
            key = node.category_key
            if key not in self.row_map:
                continue
            if self.prefs['tag_browser_hide_empty_categories'] and not node.child_tags():
                continue
            if self.hidden_categories and (key in self.hidden_categories or
               any(key.startswith(cat + '.') for cat in self.hidden_categories if cat.startswith('@'))):
                continue
            new_children.append(node)
        self.root_item.children = new_children
        self.root_item.children.sort(key=lambda x: self.row_map.index(x.category_key))

    def get_category_editor_data(self, category):
        for cat in self.root_item.children:
            if cat.category_key == category:
                return [(t.tag.id, t.tag.original_name, t.tag.count)
                        for t in cat.child_tags() if t.tag.count > 0]

    def is_in_user_category(self, index):
        if not index.isValid():
            return False
        p = self.get_node(index)
        while p.type != TagTreeItem.CATEGORY:
            p = p.parent
        return p.tag.category.startswith('@')

    # Drag'n Drop {{{
    def mimeTypes(self):
        return ["application/calibre+from_library",
                'application/calibre+from_tag_browser']

    def mimeData(self, indexes):
        data = []
        for idx in indexes:
            if not idx.isValid():
                data.append(None)
                continue
            node = self.get_node(idx)
            path = self.path_for_index(idx)
            if node.type == TagTreeItem.CATEGORY:
                d = (node.type, node.py_name, node.category_key)
            else:
                p = node
                while p.type != TagTreeItem.CATEGORY:
                    p = p.parent
                t = node.tag
                d = (node.type, p.category_key, p.is_gst, t.original_name,
                     t.category, path)
            data.append(d)
        raw = bytearray(cPickle.dumps(data, -1))
        ans = QMimeData()
        ans.setData('application/calibre+from_tag_browser', raw)
        return ans

    def dropMimeData(self, md, action, row, column, parent):
        fmts = set([unicode(x) for x in md.formats()])
        if not fmts.intersection(set(self.mimeTypes())):
            return False
        if "application/calibre+from_library" in fmts:
            if action != Qt.CopyAction:
                return False
            return self.do_drop_from_library(md, action, row, column, parent)
        if 'application/calibre+from_tag_browser' in fmts:
            return self.do_drop_from_tag_browser(md, action, row, column, parent)

    def do_drop_from_tag_browser(self, md, action, row, column, parent):
        if not parent.isValid():
            return False
        dest = self.get_node(parent)
        if dest.type != TagTreeItem.CATEGORY:
            return False
        if not md.hasFormat('application/calibre+from_tag_browser'):
            return False
        src = cPickle.loads(str(md.data('application/calibre+from_tag_browser')))
        for s in src:
            if s[0] != TagTreeItem.TAG:
                return False
        return self.move_or_copy_item_to_user_category(src, dest, action)

    def move_or_copy_item_to_user_category(self, src, dest, action):
        def process_source_node(user_cats, src_parent, src_parent_is_gst,
                                is_uc, dest_key, idx):
            copied = False
            src_name = idx.tag.original_name
            src_cat = idx.tag.category
            if is_uc and not src_parent_is_gst and src_parent in user_cats and \
                                    action == Qt.MoveAction:
                new_cat = [t for t in user_cats[src_parent]
                           if not (src_name == t[0] and src_cat == t[1])]
                user_cats[src_parent] = new_cat
            else:
                copied = True

            if not is_uc and src_cat == 'news':
                src_cat = 'tags'
            for tup in user_cats[dest_key]:
                if src_name == tup[0] and src_cat == tup[1]:
                    break
            else:
                user_cats[dest_key].append([src_name, src_cat, 0])

            for c in idx.children:
                process_source_node(user_cats, src_parent, src_parent_is_gst,
                                    is_uc, dest_key, c)
            return copied

        user_cats = self.db.prefs.get('user_categories', {})
        for s in src:
            src_parent, src_parent_is_gst = s[1:3]
            path = s[5]
            is_uc = src_parent.startswith('@')
            src_parent = src_parent[1:] if is_uc else src_parent
            dest_key = dest.category_key[1:]

            if dest_key not in user_cats:
                continue

            idx = self.index_for_path(path)
            if idx.isValid():
                process_source_node(user_cats, src_parent, src_parent_is_gst,
                                    is_uc, dest_key, self.get_node(idx))

        self.db.new_api.set_pref('user_categories', user_cats)
        self.refresh_required.emit()
        self.user_category_added.emit()
        return True

    def do_drop_from_library(self, md, action, row, column, parent):
        idx = parent
        if not idx.isValid():
            return False
        node = self.data(idx, Qt.UserRole)
        if node.type == TagTreeItem.TAG:
            fm = self.db.metadata_for_field(node.tag.category)
            if node.tag.category in ('tags', 'series', 'authors', 'rating',
                                     'publisher', 'languages') or \
               (fm['is_custom'] and fm['datatype'] in ['text', 'rating',
                'series', 'enumeration'] or (fm['datatype'] == 'composite' and
                fm['display'].get('make_category', False))):
                ids = list(map(int, str(md.data('application/calibre+from_library')).split()))
                self.handle_drop(node, ids)
                return True
        if node.type == TagTreeItem.CATEGORY:
            fm_dest = self.db.metadata_for_field(node.category_key)
            if fm_dest['kind'] == 'user':
                fm_src = self.db.metadata_for_field(md.column_name)
                if md.column_name in ['authors', 'publisher', 'series'] or \
                   (fm_src['is_custom'] and ((fm_src['datatype'] in ['series',
                    'text', 'enumeration'] and not fm_src['is_multiple']) or
                    (fm_src['datatype'] == 'composite' and
                     fm_src['display'].get('make_category', False)))):
                    ids = list(map(int, str(md.data('application/calibre+from_library')).split()))
                    self.handle_user_category_drop(node, ids, md.column_name)
                    return True
        return False

    def handle_user_category_drop(self, on_node, ids, column):
        categories = self.db.prefs.get('user_categories', {})
        cat_contents = categories.get(on_node.category_key[1:], None)
        if cat_contents is None:
            return
        cat_contents = set((v, c) for v, c, _ in cat_contents)

        fm_src = self.db.metadata_for_field(column)
        label = fm_src['label']

        for id in ids:
            if not fm_src['is_custom']:
                if label == 'authors':
                    value = self.db.authors(id, index_is_id=True)
                    value = [v.replace('|', ',') for v in value.split(',')]
                elif label == 'publisher':
                    value = self.db.publisher(id, index_is_id=True)
                elif label == 'series':
                    value = self.db.series(id, index_is_id=True)
            else:
                if fm_src['datatype'] != 'composite':
                    value = self.db.get_custom(id, label=label, index_is_id=True)
                else:
                    value = self.db.get_property(id, loc=fm_src['rec_index'],
                                                 index_is_id=True)
            if value:
                if not isinstance(value, list):
                    value = [value]
                cat_contents.update((v, column) for v in value)

        categories[on_node.category_key[1:]] = [[v, c, 0] for v, c in cat_contents]
        self.db.new_api.set_pref('user_categories', categories)
        self.refresh_required.emit()
        self.user_category_added.emit()

    def handle_drop(self, on_node, ids):
        key = on_node.tag.category
        if key == 'authors' and len(ids) >= 5:
            if not confirm('<p>'+_('Changing the authors for several books can '
                           'take a while. Are you sure?') +
                           '</p>', 'tag_browser_drop_authors', self.gui_parent):
                return
        elif len(ids) > 15:
            if not confirm('<p>'+_('Changing the metadata for that many books '
                           'can take a while. Are you sure?') +
                           '</p>', 'tag_browser_many_changes', self.gui_parent):
                return

        fm = self.db.metadata_for_field(key)
        is_multiple = fm['is_multiple']
        val = on_node.tag.original_name
        for id in ids:
            mi = self.db.get_metadata(id, index_is_id=True)
            set_authors = False
            mi.author_sort = None
            if key == 'authors':
                mi.authors = [val]
                set_authors = True
            elif fm['datatype'] == 'rating':
                mi.set(key, len(val) * 2)
            elif fm['datatype'] == 'series':
                series_index = self.db.new_api.get_next_series_num_for(val, field=key)
                if fm['is_custom']:
                    mi.set(key, val, extra=series_index)
                else:
                    mi.series, mi.series_index = val, series_index
            elif is_multiple:
                new_val = mi.get(key, [])
                if val not in new_val:
                    new_val.append(val)
                    mi.set(key, new_val)
            else:
                mi.set(key, val)
            self.db.set_metadata(id, mi, set_title=False,
                                 set_authors=set_authors, commit=False)
        self.db.commit()
        self.drag_drop_finished.emit(ids)

    # }}}

    def get_in_vl(self):
        return self.db.data.get_base_restriction() or self.db.data.get_search_restriction()

    def get_book_ids_to_use(self):
        if self.db.data.get_base_restriction() or self.db.data.get_search_restriction():
            return self.db.search('', return_matches=True, sort_results=False)
        return None

    def _get_category_nodes(self, sort):
        """
        Called by __init__. Do not directly call this method.
        """
        self.row_map = []
        self.categories = OrderedDict()
        try:
            data = self.db.new_api.get_categories(sort=sort,
                    book_ids=self.get_book_ids_to_use(),
                    first_letter_sort=self.collapse_model == 'first letter')
        except:
            traceback.print_exc()
            data = self.db.new_api.get_categories(sort=sort,
                    first_letter_sort=self.collapse_model == 'first letter')
            self.restriction_error.emit()

        if self.filter_categories_by:
            for category in data.keys():
                data[category] = [t for t in data[category]
                        if lower(t.name).find(self.filter_categories_by) >= 0]

        tb_categories = self.db.field_metadata
        for category in tb_categories:
            if category in data:
                self.categories[category] = tb_categories[category]['name']

        order = tweaks['tag_browser_category_order']
        defvalue = order.get('*', 100)
        self.row_map = sorted(self.categories, key=lambda x: order.get(x, defvalue))
        return data

    def set_categories_filter(self, txt):
        self.filter_categories_by = icu_lower(txt) if txt else None

    def get_categories_filter(self):
        return self.filter_categories_by

    def refresh(self, data=None):
        print ('TagsModel: refresh called!')
        traceback.print_stack()
        return False

    def create_node(self, *args, **kwargs):
        node = TagTreeItem(*args, **kwargs)
        self.node_map[id(node)] = node
        node.category_custom_icons = self.category_custom_icons
        return node

    def get_node(self, idx):
        return self.node_map.get(idx.internalId(), self.root_item)

    def createIndex(self, row, column, internal_pointer=None):
        return QAbstractItemModel.createIndex(self, row, column,
                id(internal_pointer))

    def index_for_category(self, name):
        for row, category in enumerate(self.category_nodes):
            if category.category_key == name:
                return self.index(row, 0, QModelIndex())

    def columnCount(self, parent):
        return 1

    def data(self, index, role):
        if not index.isValid():
            return None
        return self.get_node(index).data(role)

    def setData(self, index, value, role=Qt.EditRole):
        if not index.isValid():
            return False
        val = unicode(value or '').strip()
        if not val:
            error_dialog(self.gui_parent, _('Item is blank'),
                        _('An item cannot be set to nothing. Delete it instead.')).exec_()
            return False
        item = self.get_node(index)
        if item.type == TagTreeItem.CATEGORY and item.category_key.startswith('@'):
            if '.' in val:
                error_dialog(self.gui_parent, _('Rename user category'),
                    _('You cannot use periods in the name when '
                      'renaming user categories'), show=True)
                return False
            return self._rename_user_category(item, val)
        return self._rename_tag_item(item, val)

    def _rename_user_category(self, item, val):
        user_cats = self.db.prefs.get('user_categories', {})
        ckey = item.category_key[1:]
        dotpos = ckey.rfind('.')
        nkey = ckey if dotpos < 0 else ckey[:dotpos+1] + val
        if ckey == nkey:
            return True
        user_cat_keys_lower = [icu_lower(k) for k in user_cats]
        for c in sorted(user_cats.keys(), key=sort_key):
            if icu_lower(c).startswith(icu_lower(ckey)):
                if len(c) == len(ckey):
                    if strcmp(ckey, nkey) != 0 and icu_lower(nkey) in user_cat_keys_lower:
                        error_dialog(self.gui_parent, _('Rename user category'),
                            _('The name %s is already used')%nkey, show=True)
                        return False
                    user_cats[nkey] = user_cats[ckey]
                    del user_cats[ckey]
                elif c[len(ckey)] == '.':
                    rest = c[len(ckey):]
                    if strcmp(ckey, nkey) != 0 and icu_lower(nkey + rest) in user_cat_keys_lower:
                        error_dialog(self.gui_parent, _('Rename user category'),
                            _('The name %s is already used')%(nkey+rest), show=True)
                        return False
                    user_cats[nkey + rest] = user_cats[ckey + rest]
                    del user_cats[ckey + rest]
        self.user_categories_edited.emit(user_cats, nkey)
        return True

    def _rename_tag_item(self, item, val):
        key = item.tag.category
        name = item.tag.original_name
        if key not in self.db.field_metadata:
            return False
        if key == 'authors' and '&' in val:
            error_dialog(self.gui_parent, _('Invalid author name'),
                    _('Author names cannot contain & characters.')).exec_()
            return False
        if key == 'search':
            if val in self.db.saved_search_names():
                error_dialog(self.gui_parent, _('Duplicate search name'),
                    _('The saved search name %s is already used.')%val).exec_()
                return False
            self.db.saved_search_rename(unicode(item.data(role) or ''), val)
            item.tag.name = val
            self.search_item_renamed.emit()
        else:
            restrict_to_book_ids = self.get_book_ids_to_use() if item.use_vl else None
            self.db.new_api.rename_items(key, {item.tag.id: val},
                                         restrict_to_book_ids=restrict_to_book_ids)
            self.tag_item_renamed.emit()
            item.tag.name = val
            item.tag.state = TAG_SEARCH_STATES['clear']
            if not restrict_to_book_ids:
                self.rename_item_in_all_user_categories(name, key, val)
            self.refresh_required.emit()
        return True

    def rename_item_in_all_user_categories(self, item_name, item_category, new_name):
        """
        Search all user categories for items named item_name with category
        item_category and rename them to new_name. The caller must arrange to
        redisplay the tree as appropriate.
        """
        user_cats = self.db.prefs.get('user_categories', {})
        for k in user_cats.keys():
            new_contents = []
            for tup in user_cats[k]:
                if tup[0] == item_name and tup[1] == item_category:
                    new_contents.append([new_name, item_category, 0])
                else:
                    new_contents.append(tup)
            user_cats[k] = new_contents
        self.db.new_api.set_pref('user_categories', user_cats)

    def delete_item_from_all_user_categories(self, item_name, item_category):
        """
        Search all user categories for items named item_name with category
        item_category and delete them. The caller must arrange to redisplay the
        tree as appropriate.
        """
        user_cats = self.db.prefs.get('user_categories', {})
        for cat in user_cats.keys():
            self.delete_item_from_user_category(cat, item_name, item_category,
                                                user_categories=user_cats)
        self.db.new_api.set_pref('user_categories', user_cats)

    def delete_item_from_user_category(self, category, item_name, item_category,
                                       user_categories=None):
        user_cats = user_categories if user_categories is not None else \
                    self.db.prefs.get('user_categories', {})
        new_contents = [t for t in user_cats[category]
                        if not (t[0] == item_name and t[1] == item_category)]
        user_cats[category] = new_contents
        if user_categories is None:
            self.db.new_api.set_pref('user_categories', user_cats)

    def headerData(self, *args):
        return None

    def flags(self, index, *args):
        ans = Qt.ItemIsEnabled | Qt.ItemIsEditable
        if index.isValid():
            node = self.data(index, Qt.UserRole)
            if node.type == TagTreeItem.TAG:
                if node.tag.is_editable:
                    ans |= Qt.ItemIsDragEnabled
                fm = self.db.metadata_for_field(node.tag.category)
                if node.tag.category in ('tags', 'series', 'authors',
                                         'rating', 'publisher', 'languages') or \
                   (fm['is_custom'] and fm['datatype'] in ['text', 'rating',
                    'series', 'enumeration']):
                    ans |= Qt.ItemIsDropEnabled
            else:
                ans |= Qt.ItemIsDropEnabled
        return ans

    def supportedDropActions(self):
        return Qt.CopyAction | Qt.MoveAction

    def path_for_index(self, index):
        ans = []
        while index.isValid():
            ans.append(index.row())
            index = self.parent(index)
        ans.reverse()
        return ans

    def index_for_path(self, path):
        parent = QModelIndex()
        for idx, v in enumerate(path):
            tparent = self.index(v, 0, parent)
            if not tparent.isValid():
                if v > 0 and idx == len(path) - 1:
                    tparent = self.index(v - 1, 0, parent)
                    if not tparent.isValid():
                        break
                else:
                    break
            parent = tparent
        return parent

    def index(self, row, column, parent):
        if not self.hasIndex(row, column, parent):
            return QModelIndex()
        parent_item = self.root_item if not parent.isValid() else self.get_node(parent)
        try:
            child_item = parent_item.children[row]
        except IndexError:
            return QModelIndex()
        return self.createIndex(row, column, child_item)

    def parent(self, index):
        if not index.isValid():
            return QModelIndex()
        child_item = self.get_node(index)
        parent_item = getattr(child_item, 'parent', None)
        if parent_item is self.root_item or parent_item is None:
            return QModelIndex()
        ans = self.createIndex(parent_item.row(), 0, parent_item)
        return ans if ans.isValid() else QModelIndex()

    def rowCount(self, parent):
        if parent.column() > 0:
            return 0
        parent_item = self.root_item if not parent.isValid() else self.get_node(parent)
        return len(parent_item.children)

    def reset_all_states(self, except_=None):
        update_list = []

        def process_tag(tag_item):
            tag = tag_item.tag
            if tag is except_:
                idx = self.createIndex(tag_item.row(), 0, tag_item)
                self.dataChanged.emit(idx, idx)
            elif tag.state != 0 or tag in update_list:
                idx = self.createIndex(tag_item.row(), 0, tag_item)
                tag.state = 0
                update_list.append(tag)
                self.dataChanged.emit(idx, idx)
            for t in tag_item.children:
                process_tag(t)

        for t in self.root_item.children:
            process_tag(t)

    def clear_state(self):
        self.reset_all_states()

    def toggle(self, index, exclusive, set_to=None):
        """
        exclusive: clear all states before applying this one
        set_to: None => advance the state, otherwise a value from TAG_SEARCH_STATES
        """
        if not index.isValid():
            return False
        item = self.get_node(index)
        item.toggle(set_to=set_to)
        if exclusive:
            self.reset_all_states(except_=item.tag)
        self.dataChanged.emit(index, index)
        return True

    def tokens(self):
        ans = []
        tags_seen = set()
        nodes_seen = set()
        stars = rating_to_stars(3, True)

        node_searches = {TAG_SEARCH_STATES['mark_plus']       : 'true',
                         TAG_SEARCH_STATES['mark_plusplus']   : '.true',
                         TAG_SEARCH_STATES['mark_minus']      : 'false',
                         TAG_SEARCH_STATES['mark_minusminus'] : '.false'}

        for node in self.category_nodes:
            if node.tag.state:
                if node.category_key == "news":
                    expr = 'true' if node_searches[node.tag.state] == 'true' else '( not true )'
                    ans.append('tags:"=' + _('News') + '"' if expr == 'true' else '( not tags:"=' + _('News') + '")')
                else:
                    ans.append('%s:%s' % (node.category_key, node_searches[node.tag.state]))

            key = node.category_key
            for tag_item in node.all_children():
                if tag_item.type == TagTreeItem.CATEGORY:
                    if self.collapse_model == 'first letter' and \
                            tag_item.temporary and not key.startswith('@') and \
                            tag_item.tag.state:
                        k = 'author_sort' if key == 'authors' else key
                        letters_seen = {subnode.tag.sort[0] for subnode in tag_item.children
                                        if subnode.tag.sort}
                        if letters_seen:
                            charclass = ''.join(letters_seen)
                            if k == 'author_sort':
                                expr = r'%s:"~(^[%s])|(&\s*[%s])"' % (k, charclass, charclass)
                            elif k == 'series':
                                expr = r'series_sort:"~^[%s]"' % charclass
                            else:
                                expr = r'%s:"~^[%s]"' % (k, charclass)
                        else:
                            expr = r'%s:false' % k
                        ans.append(expr if node_searches[tag_item.tag.state] == 'true' else '(not ' + expr + ')')
                    continue
                tag = tag_item.tag
                if tag.state == TAG_SEARCH_STATES['clear']:
                    continue
                prefix = ' not ' if tag.state in (TAG_SEARCH_STATES['mark_minus'],
                                                  TAG_SEARCH_STATES['mark_minusminus']) else ''
                category = key if not node.is_gst else key
                if self.db.field_metadata[tag.category]['is_csp']:
                    category += ':'
                if tag.name and tag.name[0] in stars:
                    rnum = len(tag.name)
                    if tag.name.endswith(stars[-1]):
                        rnum = '%s.5' % (rnum - 1)
                    ans.append('%s%s:%s' % (prefix, category, rnum))
                else:
                    name = tag.original_name
                    use_prefix = tag.state in [TAG_SEARCH_STATES['mark_plusplus'],
                                               TAG_SEARCH_STATES['mark_minusminus']]
                    if category == 'tags' and name in tags_seen:
                        continue
                    tags_seen.add(name)
                    if tag in nodes_seen:
                        continue
                    nodes_seen.add(tag)
                    n = name.replace(r'"', r'\"')
                    if name.startswith('.'):
                        n = '.' + n
                    ans.append('%s%s:"=%s%s%s"' % (prefix, category,
                                                   '.' if use_prefix else '', n,
                                                   ':' if self.db.field_metadata[tag.category]['is_csp'] else ''))
        return ans

    def find_item_node(self, key, txt, start_path, equals_match=False):
        """
        Search for an item (a node) in the tags browser list that matches both
        the key (exact case-insensitive match) and txt (not equals_match =>
        case-insensitive contains match; equals_match => case_insensitive
        equal match). Returns the path to the node. Note that paths are to a
        location (second item, fourth item, 25 item), not to a node. If
        start_path is None, the search starts with the topmost node. If the tree
        is changed subsequent to calling this method, the path can easily refer
        to a different node or no node at all.
        """
        if not txt:
            return None
        txt = lower(txt) if not equals_match else txt
        self.path_found = None
        start_path = start_path or []

        def process_tag(depth, tag_index, tag_item, start_path):
            path = self.path_for_index(tag_index)
            if depth < len(start_path) and path[depth] <= start_path[depth]:
                return False
            tag = tag_item.tag
            if not tag:
                return False
            name = tag.original_name
            if (equals_match and strcmp(name, txt) == 0) or \
               (not equals_match and lower(name).find(txt) >= 0):
                self.path_found = path
                return True
            for i, child in enumerate(tag_item.children):
                if process_tag(depth + 1, self.createIndex(i, 0, child), child, start_path):
                    return True
            return False

        def process_level(depth, category_index, start_path):
            path = self.path_for_index(category_index)
            if depth < len(start_path):
                if path[depth] < start_path[depth]:
                    return False
                if path[depth] > start_path[depth]:
                    start_path = path
            my_key = self.get_node(category_index).category_key
            for j in xrange(self.rowCount(category_index)):
                tag_index = self.index(j, 0, category_index)
                tag_item = self.get_node(tag_index)
                if tag_item.type == TagTreeItem.CATEGORY:
                    if process_level(depth + 1, tag_index, start_path):
                        return True
                elif not key or strcmp(key, my_key) == 0:
                    if process_tag(depth + 1, tag_index, tag_item, start_path):
                        return True
            return False

        for i in xrange(self.rowCount(QModelIndex())):
            if process_level(0, self.index(i, 0, QModelIndex()), start_path):
                break
        return self.path_found

    def find_category_node(self, key, parent=QModelIndex()):
        """
        Search for an category node (a top-level node) in the tags browser list
        that matches the key (exact case-insensitive match). Returns the path to
        the node. Paths are as in find_item_node.
        """
        if not key:
            return None
        for i in xrange(self.rowCount(parent)):
            idx = self.index(i, 0, parent)
            node = self.get_node(idx)
            if node.type == TagTreeItem.CATEGORY and strcmp(node.category_key, key) == 0:
                return self.path_for_index(idx)
            if node.children:
                v = self.find_category_node(key, idx)
                if v is not None:
                    return v
        return None

    def set_boxed(self, idx):
        tag_item = self.get_node(idx)
        tag_item.boxed = True
        self.dataChanged.emit(idx, idx)

    def clear_boxed(self):
        """
        Clear all boxes around items.
        """
        def process_tag(tag_index, tag_item):
            if tag_item.boxed:
                tag_item.boxed = False
                self.dataChanged.emit(tag_index, tag_index)
            for i, child in enumerate(tag_item.children):
                process_tag(self.index(i, 0, tag_index), child)

        def process_level(category_index):
            for j in xrange(self.rowCount(category_index)):
                tag_index = self.index(j, 0, category_index)
                tag_item = self.get_node(tag_index)
                if tag_item.boxed:
                    tag_item.boxed = False
                    self.dataChanged.emit(tag_index, tag_index)
                if tag_item.type == TagTreeItem.CATEGORY:
                    process_level(tag_index)
                else:
                    process_tag(tag_index, tag_item)

        for i in xrange(self.rowCount(QModelIndex())):
            process_level(self.index(i, 0, QModelIndex()))
    # }}}