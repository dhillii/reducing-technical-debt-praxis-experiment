class BooksModel(QAbstractTableModel):
    # ...

    def _get_data_converter(self, field):
        """Return a data converter function for the given field."""
        idfunc = self.db.id
        fffunc = self.db.new_api.fast_field_for
        field_obj = self.db.new_api.fields[field]
        m = field_obj.metadata.copy()
        if 'display' not in m:
            m['display'] = {}
        dt = m['datatype']

        if dt == 'bool':
            def func(idx):
                val = force_to_bool(fffunc(field_obj, idfunc(idx)))
                if val is None:
                    return None
                return self.bool_yes_icon if val else self.bool_no_icon
        elif dt == 'rating':
            def func(idx):
                return int(fffunc(field_obj, idfunc(idx), default_value=0))
        elif dt == 'series':
            sidx_field = self.db.new_api.fields[field + '_index']

            def func(idx):
                book_id = idfunc(idx)
                series = fffunc(field_obj, book_id, default_value=False)
                if series:
                    return ('%s [%s]' % (series, fmt_sidx(fffunc(sidx_field, book_id, default_value=1.0))))
                return None
        elif dt in {'int', 'float'}:
            fmt = m['display'].get('number_format', None)

            def func(idx):
                val = fffunc(field_obj, idfunc(idx))
                if val is None:
                    return None
                if fmt:
                    try:
                        return (fmt.format(val))
                    except (TypeError, ValueError, AttributeError, IndexError, KeyError):
                        pass
                return (val)
        else:
            def func(idx):
                return fffunc(field_obj, idfunc(idx), default_value='')

        return func

    def _get_tooltip_converter(self, field):
        """Return a tooltip converter function for the given field."""
        rating_fields = {}

        def stars_tooltip(func, allow_half=True):
            def f(idx):
                ans = val = int(func(idx))
                ans = str(val // 2)
                if allow_half and val % 2:
                    ans += '.5'
                return _('%s stars') % ans
            return f

        if field in rating_fields:
            return stars_tooltip(self._get_data_converter(field), rating_fields[field])
        return self._get_data_converter(field)

    def _get_decoration_converter(self, field):
        """Return a decoration converter function for the given field."""
        def func(idx):
            return self.bool_yes_icon if self._get_data_converter(field)(idx) else self.bool_no_icon
        return func

    def build_data_convertors(self):
        """Build data converters for each field."""
        self.dc = {}
        self.dc_decorator = {}
        self.tc = {}

        for field in 'title authors size timestamp pubdate last_modified rating publisher tags series ondevice languages'.split():
            self.dc[field] = self._get_data_converter(field)
            self.tc[field] = self._get_tooltip_converter(field)
            if field in ('ondevice',):
                self.dc_decorator[field] = self._get_decoration_converter(field)

        for col in self.custom_columns:
            self.dc[col] = self._get_data_converter(col)
            self.tc[col] = self._get_tooltip_converter(col)
            m = self.custom_columns[col]
            dt = m['datatype']
            if dt in {'text', 'composite', 'enumeration'} and not m['is_multiple'] and m['display'].get('use_decorations', False):
                self.dc_decorator[col] = self._get_decoration_converter(col)
            elif dt == 'bool':
                self.dc_decorator[col] = self._get_decoration_converter(col)

        self.column_to_dc_map = [self.dc[col] for col in self.column_map]
        self.column_to_tc_map = [self.tc[col] for col in self.column_map]
        self.column_to_dc_decorator_map = [self.dc_decorator.get(col, None) for col in self.column_map]

    # ...

    def data(self, index, role):
        """Return data for the given index and role."""
        col = index.column()
        if col >= len(self.column_to_dc_map):
            return None
        if role == Qt.DisplayRole:
            return self.column_to_dc_map[col](index.row())
        elif role == Qt.ToolTipRole:
            return self.column_to_tc_map[col](index.row())
        elif role == Qt.EditRole:
            return self.column_to_dc_map[col](index.row())
        elif role == Qt.BackgroundRole:
            if self.id(index) in self.ids_to_highlight_set:
                return (QColor('lightgreen'))
        elif role == Qt.ForegroundRole:
            key = self.column_map[col]
            id_ = self.id(index)
            # ...
        elif role == Qt.DecorationRole:
            if self.column_to_dc_decorator_map[col] is not None:
                return self.column_to_dc_decorator_map[col](index.row())
            # ...
        return None

# ...