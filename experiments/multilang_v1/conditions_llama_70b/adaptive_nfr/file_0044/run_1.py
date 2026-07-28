def is_valid_category(self, category):
    """Check if a category is valid."""
    return category in self.db.field_metadata

def is_user_category(self, category):
    """Check if a category is a user category."""
    return category.startswith('@')

def is_gst_category(self, category):
    """Check if a category is a grouped search term."""
    gst = self.db.prefs.get('grouped_search_terms', {})
    return category[1:] in gst

def get_category_tooltip(self, category):
    """Get the tooltip for a category."""
    if category.startswith('@') and category[1:] in self.db.prefs.get('grouped_search_terms', {}):
        return _(u'The grouped search term name is "{0}"').format(category)
    elif category == 'news':
        return ''
    else:
        cust_desc = ''
        fm = self.db.field_metadata[category]
        if fm['is_custom']:
            cust_desc = fm['display'].get('description', '')
            if cust_desc:
                cust_desc = '\n' + _('Description:') + ' ' + cust_desc
        return _(u'The lookup/search name is "{0}"{1}').format(category, cust_desc)

def get_category_icon(self, category):
    """Get the icon for a category."""
    if category in self.category_custom_icons:
        return self.category_custom_icons[category]
    elif category.startswith('@'):
        return QIcon(I('plus.png'))
    else:
        return QIcon(I(category_icon_map.get(category, category_icon_map['custom:'])))

def process_one_node(self, category, collapse_model, book_rating_map, state_map):
    """Process a single node in the tree."""
    if not self.is_valid_category(category.category_key):
        return

    collapse_letter = None
    key = category.category_key
    is_gst = self.is_gst_category(key)

    if key not in self.data:
        return

    if key in self.prefs['tag_browser_dont_collapse']:
        collapse_model = 'disable'

    cat_len = len(self.data[key])
    if cat_len <= 0:
        return

    category_child_map = {}
    fm = self.db.field_metadata[key]
    clear_rating = True if key not in self.categories_with_ratings and \
                                not fm['is_custom'] and \
                                not fm['kind'] == 'user' \
                            else False
    in_uc = fm['kind'] == 'user' and not is_gst
    tt = key if in_uc else None

    if collapse_model == 'first letter':
        cl_list = [None] * len(self.data[key])
        last_ordnum = 0
        last_c = ' '
        for idx, tag in enumerate(self.data[key]):
            if not tag.sort:
                c = ' '
            else:
                c = icu_upper(tag.sort)
            ordnum, ordlen = collation_order(c)
            if last_ordnum != ordnum:
                last_c = c[0:ordlen]
                last_ordnum = ordnum
            cl_list[idx] = last_c
    top_level_component = 'z' + self.data[key][0].original_name

    last_idx = -collapse
    category_is_hierarchical = not (
        key in ['authors', 'publisher', 'news', 'formats', 'rating'] or
        key not in self.db.prefs.get('categories_using_hierarchy', []) or
        config['sort_tags_by'] != 'name')

    for idx, tag in enumerate(self.data[key]):
        components = None
        if clear_rating:
            tag.avg_rating = None
        tag.state = state_map.get((tag.name, tag.category), 0)

        if collapse_model != 'disable' and cat_len > collapse:
            if collapse_model == 'partition':
                if idx >= last_idx + collapse and \
                                 not tag.original_name.startswith(top_level_component+'.'):
                    if cat_len > idx + collapse:
                        last = idx + collapse - 1
                    else:
                        last = cat_len - 1
                    if category_is_hierarchical:
                        ct = copy.copy(self.data[key][last])
                        components = get_name_components(ct.original_name)
                        ct.sort = ct.name = components[0]
                        d = {'last': ct}
                        ct2 = copy.copy(tag)
                        components = get_name_components(ct2.original_name)
                        ct2.sort = ct2.name = components[0]
                        d['first'] = ct2
                    else:
                        d = {'first': tag}
                        d['last'] = self.data[key][last]

                    name = eval_formatter.safe_format(collapse_template,
                                                        d, '##TAG_VIEW##', None)
                    if name.startswith('##TAG_VIEW##'):
                        node_parent = sub_cat = category
                    else:
                        sub_cat = self.create_node(parent=category, data=name,
                                     tooltip=None, temporary=True,
                                     is_category=True,
                                     category_key=category.category_key,
                                     icon_map=self.icon_state_map)
                        sub_cat.tag.is_searchable = False
                        sub_cat.is_gst = is_gst
                        node_parent = sub_cat
                    last_idx = idx
                else:
                    node_parent = sub_cat
            else:
                cl = cl_list[idx]
                if cl != collapse_letter:
                    collapse_letter = cl
                    sub_cat = self.create_node(parent=category,
                                     data=collapse_letter,
                                     is_category=True,
                                     tooltip=None, temporary=True,
                                     category_key=category.category_key,
                                     icon_map=self.icon_state_map)
                sub_cat.is_gst = is_gst
                node_parent = sub_cat
        else:
            node_parent = category

        if category_is_hierarchical or tag.is_hierarchical:
            components = get_name_components(tag.original_name)
        else:
            components = [tag.original_name]

        if (not tag.is_hierarchical) and (in_uc or
                (fm['is_custom'] and fm['display'].get('is_names', False)) or
                not category_is_hierarchical or len(components) == 1):
            n = self.create_node(parent=node_parent, data=tag, tooltip=tt,
                                    icon_map=self.icon_state_map)
            category_child_map[tag.name, tag.category] = n
        else:
            for i, comp in enumerate(components):
                if i == 0:
                    child_map = category_child_map
                    top_level_component = comp
                else:
                    child_map = dict([((t.tag.name, t.tag.category), t)
                                        for t in node_parent.children
                                            if t.type != TagTreeItem.CATEGORY])
                if (comp, tag.category) in child_map:
                    node_parent = child_map[(comp, tag.category)]
                    t = node_parent.tag
                    t.is_hierarchical = '5state' if tag.category != 'search' else '3state'
                    if tag.id_set is not None and t.id_set is not None:
                        t.id_set = t.id_set | tag.id_set
                    intermediate_nodes[t.original_name, t.category] = t
                else:
                    if i < len(components)-1:
                        original_name = '.'.join(components[:i+1])
                        t = intermediate_nodes.get((original_name, tag.category), None)
                        if t is None:
                            t = copy.copy(tag)
                            t.original_name = original_name
                            t.count = 0
                            if key != 'search':
                                t.is_editable = False
                            else:
                                t.is_searchable = t.is_editable = False
                            intermediate_nodes[original_name, tag.category] = t
                    else:
                        t = tag
                        if not in_uc:
                            t.original_name = t.name
                        intermediate_nodes[t.original_name, t.category] = t
                    t.is_hierarchical = \
                        '5state' if t.category != 'search' else '3state'
                    t.name = comp
                    node_parent = self.create_node(parent=node_parent, data=t,
                                            tooltip=tt, icon_map=self.icon_state_map)
                    child_map[(comp,tag.category)] = node_parent

                total = count = 0
                for book_id in t.id_set:
                    rating = book_rating_map.get(book_id, 0)
                    if rating:
                        total += rating/2.0
                        count += 1
                node_parent.cached_average_rating = float(total)/count if total and count else 0

def _create_node_tree(self, data, state_map):
    """Create the node tree."""
    sort_by = config['sort_tags_by']

    eval_formatter = EvalFormatter()
    intermediate_nodes = {}

    if data is None:
        print ('_create_node_tree: no data!')
        traceback.print_stack()
        return

    collapse = self.prefs['tags_browser_collapse_at']
    collapse_model = self.collapse_model
    if collapse == 0:
        collapse_model = 'disable'
    elif collapse_model != 'disable':
        if sort_by == 'name':
            collapse_template = tweaks['categories_collapsed_name_template']
        elif sort_by == 'rating':
            collapse_model = 'partition'
            collapse_template = tweaks['categories_collapsed_rating_template']
        else:
            collapse_model = 'partition'
            collapse_template = tweaks['categories_collapsed_popularity_template']

    for category in self.category_nodes:
        self.process_one_node(category, collapse_model, self.db.new_api.fields['rating'].book_value_map,
                                state_map.get(category.category_key, {}))

    new_children = []
    for node in self.root_item.children:
        key = node.category_key
        if key in self.row_map:
            if self.prefs['tag_browser_hide_empty_categories'] and len(node.child_tags()) == 0:
                continue
            if self.hidden_categories:
                if key in self.hidden_categories:
                    continue
                found = False
                for cat in self.hidden_categories:
                    if cat.startswith('@') and key.startswith(cat + '.'):
                        found = True
                if found:
                    continue
            new_children.append(node)
    self.root_item.children = new_children
    self.root_item.children.sort(key=lambda x: self.row_map.index(x.category_key))

def _get_category_nodes(self, sort):
    """Get the category nodes."""
    self.row_map = []
    self.categories = OrderedDict()

    try:
        data = self.db.new_api.get_categories(sort=sort,
                book_ids=self.get_book_ids_to_use(),
                first_letter_sort=self.collapse_model == 'first letter')
    except:
        import traceback
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