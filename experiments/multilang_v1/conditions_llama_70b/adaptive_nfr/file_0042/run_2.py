class BooksModel(QAbstractTableModel):
    # ...

    def data(self, index, role):
        if not index.isValid():
            return None

        col = index.column()
        if col >= len(self.column_to_dc_map):
            return None

        if role == Qt.DisplayRole:
            return self._get_display_data(index)
        elif role == Qt.ToolTipRole:
            return self._get_tooltip_data(index)
        elif role == Qt.EditRole:
            return self._get_edit_data(index)
        elif role == Qt.BackgroundRole:
            return self._get_background_data(index)
        elif role == Qt.ForegroundRole:
            return self._get_foreground_data(index)
        elif role == Qt.DecorationRole:
            return self._get_decoration_data(index)
        elif role == Qt.TextAlignmentRole:
            return self._get_alignment_data(index)
        return None

    def _get_display_data(self, index):
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

    def _get_tooltip_data(self, index):
        return self.column_to_tc_map[index.column()](index.row())

    def _get_edit_data(self, index):
        return self.column_to_dc_map[index.column()](index.row())

    def _get_background_data(self, index):
        if self.id(index) in self.ids_to_highlight_set:
            return QColor('lightgreen')
        return None

    def _get_foreground_data(self, index):
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
                        return color
                except:
                    pass

        for fmt in self.color_row_fmt_cache:
            ccol = self.column_color(id_, color_row_key, fmt, self.db,
                                     self.color_cache, self.color_template_cache)
            if ccol is not None:
                return ccol

        self.column_color.mi = None
        return None

    def _get_decoration_data(self, index):
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

    def _get_alignment_data(self, index):
        cname = self.column_map[index.column()]
        ans = Qt.AlignVCenter | ALIGNMENT_MAP[self.alignment_map.get(cname,
            'left')]
        return ans


class DeviceBooksModel(BooksModel):
    # ...

    def data(self, index, role):
        if not index.isValid():
            return None

        row, col = index.row(), index.column()
        cname = self.column_map[col]

        if role == Qt.DisplayRole or role == Qt.EditRole:
            if cname == 'title':
                text = self.db[self.map[row]].title
                if not text:
                    text = self.unknown
                return text
            elif cname == 'authors':
                au = self.db[self.map[row]].authors
                if not au:
                    au = [_('Unknown')]
                return authors_to_string(au)
            elif cname == 'size':
                size = self.db[self.map[row]].size
                if not isinstance(size, (float, int)):
                    size = 0
                return human_readable(size)
            elif cname == 'timestamp':
                dt = self.db[self.map[row]].datetime
                try:
                    dt = dt_factory(dt, assume_utc=True, as_utc=False)
                except OverflowError:
                    dt = dt_factory(time.gmtime(), assume_utc=True,
                                    as_utc=False)
                return strftime(TIME_FMT, dt.timetuple())
            elif cname == 'collections':
                tags = self.db[self.map[row]].device_collections
                if tags:
                    tags.sort(key=sort_key)
                    return ', '.join(tags)
        elif role == Qt.ToolTipRole and index.isValid():
            if col == 0 and hasattr(self.db[self.map[row]], 'in_library_waiting'):
                return _('Waiting for metadata to be updated')
            if self.is_row_marked_for_deletion(row):
                return _('Marked for deletion')
            if cname in ['title', 'authors'] or (
                    cname == 'collections' and (
                        callable(getattr(self.db, 'supports_collections', None)) and self.db.supports_collections())
            ):
                return _("Double click to <b>edit</b> me<br><br>")
        elif role == Qt.DecorationRole and cname == 'inlibrary':
            if hasattr(self.db[self.map[row]], 'in_library_waiting'):
                return self.sync_icon
            elif self.db[self.map[row]].in_library:
                return self.bool_yes_icon
            elif self.db[self.map[row]].in_library is not None:
                return self.bool_no_icon
        elif role == Qt.TextAlignmentRole:
            cname = self.column_map[index.column()]
            ans = Qt.AlignVCenter | ALIGNMENT_MAP[self.alignment_map.get(cname,
                'left')]
            return ans
        return None