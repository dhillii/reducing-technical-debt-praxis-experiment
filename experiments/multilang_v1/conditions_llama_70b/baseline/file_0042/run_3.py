class BooksModel(QAbstractTableModel):
    # ...

    def data(self, index, role):
        col = index.column()
        if col >= len(self.column_to_dc_map):
            return None

        if role == Qt.DisplayRole:
            return self.get_display_data(index)
        elif role == Qt.ToolTipRole:
            return self.get_tooltip_data(index)
        elif role == Qt.EditRole:
            return self.get_edit_data(index)
        elif role == Qt.BackgroundRole:
            return self.get_background_data(index)
        elif role == Qt.ForegroundRole:
            return self.get_foreground_data(index)
        elif role == Qt.DecorationRole:
            return self.get_decoration_data(index)
        elif role == Qt.TextAlignmentRole:
            return self.get_text_alignment_data(index)
        return None

    def get_display_data(self, index):
        rules = self.db.prefs['column_icon_rules']
        if rules:
            key = self.column_map[index.column()]
            id_ = None
            fmts = []
            for kind, k, fmt in rules:
                if k == key and kind in {'icon_only', 'icon_only_composed'}:
                    if id_ is None:
                        id_ = self.id(index)
                        self.column_icon.mi = None
                    fmts.append((kind, fmt))

            if fmts:
                cache_index = key + ':DisplayRole'
                ccicon = self.column_icon(id_, fmts, cache_index, self.db,
                                  self.icon_cache, self.icon_bitmap_cache,
                                  self.icon_template_cache)
                if ccicon is not None:
                    return None
                self.icon_cache[id_][cache_index] = None
        return self.column_to_dc_map[index.column()](index.row())

    def get_tooltip_data(self, index):
        return self.column_to_tc_map[index.column()](index.row())

    def get_edit_data(self, index):
        return self.column_to_dc_map[index.column()](index.row())

    def get_background_data(self, index):
        if self.id(index) in self.ids_to_highlight_set:
            return (QColor('lightgreen'))

    def get_foreground_data(self, index):
        key = self.column_map[index.column()]
        id_ = self.id(index)
        self.column_color.mi = None

        if self.color_row_fmt_cache is None:
            self.color_row_fmt_cache = tuple(fmt for key, fmt in
                self.db.prefs['column_color_rules'] if key == color_row_key)

        for k, fmt in self.db.prefs['column_color_rules']:
            if k == key:
                ccol = self.column_color(id_, key, fmt, self.db,
                                     self.color_cache, self.color_template_cache)
                if ccol is not None:
                    return ccol

        if self.is_custom_column(key) and \
                    self.custom_columns[key]['datatype'] == 'enumeration':
            cc = self.custom_columns[self.column_map[index.column()]]['display']
            colors = cc.get('enum_colors', [])
            values = cc.get('enum_values', [])
            txt = unicode(index.data(Qt.DisplayRole) or '')
            if len(colors) > 0 and txt in values:
                try:
                    color = QColor(colors[values.index(txt)])
                    if color.isValid():
                        self.column_color.mi = None
                        return (color)
                except:
                    pass

        for fmt in self.color_row_fmt_cache:
            ccol = self.column_color(id_, color_row_key, fmt, self.db,
                                     self.color_cache, self.color_template_cache)
            if ccol is not None:
                return ccol

        self.column_color.mi = None
        return None

    def get_decoration_data(self, index):
        if self.column_to_dc_decorator_map[index.column()] is not None:
            ccicon = self.column_to_dc_decorator_map[index.column()](index.row())
            if ccicon is not None:
                return ccicon

        rules = self.db.prefs['column_icon_rules']
        if rules:
            key = self.column_map[index.column()]
            id_ = None
            need_icon_with_text = False
            fmts = []
            for kind, k, fmt in rules:
                if k == key and kind.startswith('icon'):
                    if id_ is None:
                        id_ = self.id(index)
                        self.column_icon.mi = None
                    fmts.append((kind, fmt))
                    if kind in ('icon', 'icon_composed'):
                        need_icon_with_text = True
            if fmts:
                cache_index = key + ':DecorationRole'
                ccicon = self.column_icon(id_, fmts, cache_index, self.db,
                                  self.icon_cache, self.icon_bitmap_cache,
                                  self.icon_template_cache)
                if ccicon is not None:
                    return ccicon
                if need_icon_with_text:
                    self.icon_cache[id_][cache_index] = self.bool_blank_icon
                    return self.bool_blank_icon
                self.icon_cache[id_][cache_index] = None
        return None

    def get_text_alignment_data(self, index):
        cname = self.column_map[index.column()]
        ans = Qt.AlignVCenter | ALIGNMENT_MAP[self.alignment_map.get(cname,
            'left')]
        return (ans)