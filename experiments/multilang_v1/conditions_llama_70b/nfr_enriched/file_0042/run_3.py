class BooksModel(QAbstractTableModel):
    # ...

    def _clear_caches(self):
        """Clear all caches."""
        self.color_cache = defaultdict(dict)
        self.icon_cache = defaultdict(dict)
        self.icon_bitmap_cache = {}
        self.cover_grid_emblem_cache = defaultdict(dict)
        self.cover_grid_bitmap_cache = {}
        self.color_row_fmt_cache = None
        self.color_template_cache = {}
        self.icon_template_cache = {}
        self.cover_grid_template_cache = {}

    def _get_data_converter(self, field):
        """Get data converter for a field."""
        idfunc = self.db.id
        fffunc = self.db.new_api.fast_field_for
        field_obj = self.db.new_api.fields[field]
        m = field_obj.metadata.copy()
        if 'display' not in m:
            m['display'] = {}
        dt = m['datatype']

        def func(idx):
            val = fffunc(field_obj, idfunc(idx))
            # ...
            return val

        return func

    def _get_tooltip_converter(self, field):
        """Get tooltip converter for a field."""
        def func(idx):
            val = self._get_data_converter(field)(idx)
            # ...
            return val

        return func

    def _get_decoration_converter(self, field):
        """Get decoration converter for a field."""
        def func(idx):
            val = self._get_data_converter(field)(idx)
            # ...
            return val

        return func

    def build_data_convertors(self):
        """Build data converters for all fields."""
        self.dc = {}
        self.dc_decorator = {}
        self.tc = {}

        for field in 'title authors size timestamp pubdate last_modified rating publisher tags series ondevice languages'.split():
            self.dc[field] = self._get_data_converter(field)
            self.tc[field] = self._get_tooltip_converter(field)
            if field in ('ondevice',):
                self.dc_decorator[field] = self._get_decoration_converter(field)

        # ...

    def data(self, index, role):
        """Get data for a given index and role."""
        col = index.column()
        if role == Qt.DisplayRole:
            return self.column_to_dc_map[col](index.row())
        elif role == Qt.ToolTipRole:
            return self.column_to_tc_map[col](index.row())
        # ...

    # ...

class DeviceBooksModel(BooksModel):
    # ...

    def _get_data(self, index):
        """Get data for a given index."""
        row, col = index.row(), index.column()
        cname = self.column_map[col]
        if cname == 'title':
            return self.db[self.map[row]].title
        # ...

    def data(self, index, role):
        """Get data for a given index and role."""
        if role == Qt.DisplayRole or role == Qt.EditRole:
            return self._get_data(index)
        # ...

    # ...