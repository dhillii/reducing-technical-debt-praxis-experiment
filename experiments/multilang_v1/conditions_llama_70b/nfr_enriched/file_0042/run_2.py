class BooksModel(QAbstractTableModel):
    # ...

    def _sort(self, label, order, reset):
        """Sort the model based on the given label and order."""
        self.about_to_be_sorted.emit(self.db.id)
        self.db.data.incremental_sort([(label, order)])
        if reset:
            self.beginResetModel(), self.endResetModel()
        self.sorted_on = (label, order)
        self.sort_history.insert(0, self.sorted_on)
        self.sorting_done.emit(self.db.index)

    def _refresh(self, reset):
        """Refresh the model."""
        self.db.refresh(field=None)
        self.resort(reset=reset)

    def _research(self, reset):
        """Research the model based on the last search."""
        self.search(self.last_search, reset=reset)

    def _get_book_display_info(self, idx):
        """Get the book display info for the given index."""
        mi = self.db.get_metadata(idx)
        mi.size = mi._proxy_metadata.book_size
        mi.cover_data = ('jpg', self.cover(idx))
        mi.id = self.db.id(idx)
        mi.field_metadata = self.db.field_metadata
        mi.path = self.db.abspath(idx, create_dirs=False)
        mi.format_files = self.db.new_api.format_files(self.db.data.index_to_id(idx))
        mi.row_number = idx
        try:
            mi.marked = self.db.data.get_marked(idx, index_is_id=False)
        except:
            mi.marked = None
        return mi

    def _get_book_info(self, index):
        """Get the book info for the given index."""
        if isinstance(index, int):
            index = self.index(index, 0)
        data = self.current_changed(index, None, False)
        return data

    def _get_metadata(self, rows, rows_are_ids, full_metadata):
        """Get the metadata for the given rows."""
        metadata, _full_metadata = [], []
        if not rows_are_ids:
            rows = [self.db.id(row.row()) for row in rows]
        for id in rows:
            mi = self.db.get_metadata(id, index_is_id=True)
            _full_metadata.append(mi)
            au = authors_to_string(mi.authors if mi.authors else [_('Unknown')])
            tags = mi.tags if mi.tags else []
            if mi.series is not None:
                tags.append(mi.series)
            info = {
                  'title'   : mi.title,
                  'authors' : au,
                  'author_sort' : mi.author_sort,
                  'cover'   : self.db.cover(id, index_is_id=True),
                  'tags'    : tags,
                  'comments': mi.comments,
                  }
            if mi.series is not None:
                info['tag order'] = {
                    mi.series:self.db.books_in_series_of(id, index_is_id=True)
                }

            metadata.append(info)
        if full_metadata:
            return metadata, _full_metadata
        else:
            return metadata

    def _get_preferred_formats_from_ids(self, ids, formats, set_metadata, specific_format, exclude_auto, mode, use_plugboard, plugboard_formats):
        """Get the preferred formats for the given IDs."""
        from calibre.ebooks.metadata.meta import set_metadata as _set_metadata
        ans = []
        need_auto = []
        if specific_format is not None:
            formats = [specific_format.lower()]
        for id in ids:
            format = None
            fmts = self.db.formats(id, index_is_id=True)
            if not fmts:
                fmts = ''
            db_formats = set(fmts.lower().split(','))
            available_formats = set([f.lower() for f in formats])
            u = available_formats.intersection(db_formats)
            for f in formats:
                if f.lower() in u:
                    format = f
                    break
            if format is not None:
                pt = PersistentTemporaryFile(suffix='caltmpfmt.'+format)
                self.db.copy_format_to(id, format, pt, index_is_id=True)
                pt.seek(0)
                if set_metadata:
                    try:
                        mi = self.db.get_metadata(id, get_cover=True,
                                                  index_is_id=True,
                                                  cover_as_data=True)
                        newmi = None
                        if use_plugboard and format.lower() in plugboard_formats:
                            plugboards = self.db.prefs.get('plugboards', {})
                            cpb = find_plugboard(use_plugboard, format.lower(),
                                                 plugboards)
                            if cpb:
                                newmi = mi.deepcopy_metadata()
                                newmi.template_to_attribute(mi, cpb)
                        if newmi is not None:
                            _set_metadata(pt, newmi, format)
                        else:
                            _set_metadata(pt, mi, format)
                    except:
                        traceback.print_exc()
                pt.close()

                def to_uni(x):
                    if isbytestring(x):
                        x = x.decode(filesystem_encoding)
                    return x
                ans.append(to_uni(os.path.abspath(pt.name)))
            else:
                need_auto.append(id)
                if not exclude_auto:
                    ans.append(None)
        return ans, need_auto

    def _get_preferred_formats(self, rows, formats, paths, set_metadata, specific_format, exclude_auto):
        """Get the preferred formats for the given rows."""
        from calibre.ebooks.metadata.meta import set_metadata as _set_metadata
        ans = []
        need_auto = []
        if specific_format is not None:
            formats = [specific_format.lower()]
        for row in (row.row() for row in rows):
            format = None
            fmts = self.db.formats(row)
            if not fmts:
                fmts = ''
            db_formats = set(fmts.lower().split(','))
            available_formats = set([f.lower() for f in formats])
            u = available_formats.intersection(db_formats)
            for f in formats:
                if f.lower() in u:
                    format = f
                    break
            if format is not None:
                pt = PersistentTemporaryFile(suffix='.'+format)
                self.db.copy_format_to(id, format, pt, index_is_id=True)
                pt.seek(0)
                if set_metadata:
                    _set_metadata(pt, self.db.get_metadata(row, get_cover=True,
                        cover_as_data=True), format)
                pt.close() if paths else pt.seek(0)
                ans.append(pt)
            else:
                need_auto.append(row)
                if not exclude_auto:
                    ans.append(None)
        return ans, need_auto

    def _id(self, row):
        """Get the ID for the given row."""
        return self.db.id(getattr(row, 'row', lambda:row)())

    def _authors(self, row_number):
        """Get the authors for the given row number."""
        return self.db.authors(row_number)

    def _title(self, row_number):
        """Get the title for the given row number."""
        return self.db.title(row_number)

    def _rating(self, row_number):
        """Get the rating for the given row number."""
        ans = self.db.rating(row_number)
        ans = ans/2 if ans else 0
        return int(ans)

    def _cover(self, row_number):
        """Get the cover for the given row number."""
        data = None
        try:
            data = self.db.cover(row_number)
        except IndexError:  # Happens if database has not yet been refreshed
            pass
        except MemoryError:
            raise ValueError(_('The cover for the book %s is too large, cannot load it.'
                             ' Resize or delete it.') % self.db.title(row_number))

        if not data:
            return self.default_image
        img = QImage()
        img.loadFromData(data)
        if img.isNull():
            img = self.default_image
        return img

    def _build_data_convertors(self):
        """Build the data convertors."""
        rating_fields = {}

        def renderer(field, decorator=False):
            idfunc = self.db.id
            fffunc = self.db.new_api.fast_field_for
            field_obj = self.db.new_api.fields[field]
            m = field_obj.metadata.copy()
            if 'display' not in m:
                m['display'] = {}
            dt = m['datatype']

            if decorator == 'bool':
                bt = self.db.new_api.pref('bools_are_tristate')
                bn = self.bool_no_icon
                by = self.bool_yes_icon

                def func(idx):
                    val = force_to_bool(fffunc(field_obj, idfunc(idx)))
                    if val is None:
                        return None if bt else bn
                    return by if val else bn
            elif field == 'size':
                sz_mult = 1.0/(1024**2)

                def func(idx):
                    val = fffunc(field_obj, idfunc(idx), default_value=0) or 0
                    if val is 0:
                        return None
                    ans = u'%.1f' % (val * sz_mult)
                    return (u'<0.1' if ans == u'0.0' else ans)
            elif field == 'languages':
                def func(idx):
                    return (', '.join(calibre_langcode_to_name(x) for x in fffunc(field_obj, idfunc(idx))))
            elif field == 'ondevice' and decorator:
                by = self.bool_yes_icon
                bb = self.bool_blank_icon

                def func(idx):
                    return by if fffunc(field_obj, idfunc(idx)) else bb
            elif dt in {'text', 'comments', 'composite', 'enumeration'}:
                if m['is_multiple']:
                    jv = m['is_multiple']['list_to_ui']
                    do_sort = '&' not in jv
                    if field_obj.is_composite:
                        if do_sort:
                            sv = m['is_multiple']['cache_to_list']

                            def func(idx):
                                val = fffunc(field_obj, idfunc(idx), default_value='') or ''
                                return (jv.join(sorted((x.strip() for x in val.split(sv)), key=sort_key)))
                        else:
                            def func(idx):
                                return (fffunc(field_obj, idfunc(idx), default_value=''))
                    else:
                        if do_sort:
                            def func(idx):
                                return (jv.join(sorted(fffunc(field_obj, idfunc(idx), default_value=()), key=sort_key)))
                        else:
                            def func(idx):
                                return (jv.join(fffunc(field_obj, idfunc(idx), default_value=())))
                else:
                    if dt in {'text', 'composite', 'enumeration'} and m['display'].get('use_decorations', False):
                        def func(idx):
                            text = fffunc(field_obj, idfunc(idx))
                            return (text) if force_to_bool(text) is None else None
                    else:
                        def func(idx):
                            return (fffunc(field_obj, idfunc(idx), default_value=''))
            elif dt == 'datetime':
                def func(idx):
                    return (QDateTime(as_local_time(fffunc(field_obj, idfunc(idx), default_value=UNDEFINED_DATE))))
            elif dt == 'rating':
                rating_fields[field] = m['display'].get('allow_half_stars', False)

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
                    return None

            return func

        self.dc = {f:renderer(f) for f in 'title authors size timestamp pubdate last_modified rating publisher tags series ondevice languages'.split()}
        self.dc_decorator = {f:renderer(f, True) for f in ('ondevice',)}

        for col in self.custom_columns:
            self.dc[col] = renderer(col)
            m = self.custom_columns[col]
            dt = m['datatype']
            mult = m['is_multiple']
            if dt in {'text', 'composite', 'enumeration'} and not mult and m['display'].get('use_decorations', False):
                self.dc_decorator[col] = renderer(col, 'bool')
            elif dt == 'bool':
                self.dc_decorator[col] = renderer(col, 'bool')

        tc = self.dc.copy()

        def stars_tooltip(func, allow_half=True):
            def f(idx):
                ans = val = int(func(idx))
                ans = str(val // 2)
                if allow_half and val % 2:
                    ans += '.5'
                return _('%s stars') % ans
            return f
        for f, allow_half in rating_fields.iteritems():
            tc[f] = stars_tooltip(self.dc[f], allow_half)
        # build a index column to data converter map, to remove the string lookup in the data loop
        self.column_to_dc_map = [self.dc[col] for col in self.column_map]
        self.column_to_tc_map = [tc[col] for col in self.column_map]
        self.column_to_dc_decorator_map = [self.dc_decorator.get(col, None) for col in self.column_map]

    def _data(self, index, role):
        """Get the data for the given index and role."""
        col = index.column()
        # in obscure cases where custom columns are both edited and added, for a time
        # the column map does not accurately represent the screen. In these cases,
        # we will get asked to display columns we don't know about. Must test for this.
        if col >= len(self.column_to_dc_map):
            return None
        if role == Qt.DisplayRole:
            rules = self.db.prefs['column_icon_rules']
            if rules:
                key = self.column_map[col]
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
                cc = self.custom_columns[self.column_map[col]]['display']
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
        elif role == Qt.DecorationRole:
            if self.column_to_dc_decorator_map[col] is not None:
                ccicon = self.column_to_dc_decorator_map[index.column()](index.row())
                if ccicon is not None:
                    return ccicon

            rules = self.db.prefs['column_icon_rules']
            if rules:
                key = self.column_map[col]
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
        elif role == Qt.TextAlignmentRole:
            cname = self.column_map[index.column()]
            ans = Qt.AlignVCenter | ALIGNMENT_MAP[self.alignment_map.get(cname,
                'left')]
            return (ans)
        # elif role == Qt.ToolTipRole and index.isValid():
        #    if self.column_map[index.column()] in self.editable_cols:
        #        return (_("Double click to <b>edit</b> me<br><br>"))
        return None

    def _headerData(self, section, orientation, role):
        """Get the header data for the given section, orientation, and role."""
        if orientation == Qt.Horizontal:
            if section >= len(self.column_map):  # same problem as in data, the column_map can be wrong
                return None
            if role == Qt.ToolTipRole:
                ht = self.column_map[section]
                fm = self.db.field_metadata[self.column_map[section]]
                if ht == 'timestamp':  # change help text because users know this field as 'date'
                    ht = 'date'
                if fm['is_category']:
                    is_cat = '\n\n' + _('Click in this column and press Q to Quickview books with the same %s') % ht
                else:
                    is_cat = ''
                cust_desc = ''
                if fm['is_custom']:
                    cust_desc = fm['display'].get('description', '')
                    if cust_desc:
                        cust_desc = '\n' + _('Description:') + ' ' + cust_desc
                return (_('The lookup/search name is "{0}"{1}{2}').format(ht, cust_desc, is_cat))
            if role == Qt.DisplayRole:
                return (self.headers[self.column_map[section]])
            return None
        if DEBUG and role == Qt.ToolTipRole and orientation == Qt.Vertical:
                col = self.db.field_metadata['uuid']['rec_index']
                return (_('This book\'s UUID is "{0}"').format(self.db.data[section][col]))

        if role == Qt.DisplayRole:  # orientation is vertical
            return (section+1)
        if role == Qt.DecorationRole:
            try:
                return self.marked_icon if self.db.data.get_marked(self.db.data.index_to_id(section)) else self.row_decoration
            except (ValueError, IndexError):
                pass
        return None

    def _flags(self, index):
        """Get the flags for the given index."""
        flags = QAbstractTableModel.flags(self, index)
        if index.isValid():
            colhead = self.column_map[index.column()]
            if colhead in self.editable_cols:
                flags |= Qt.ItemIsEditable
            elif self.is_custom_column(colhead):
                if self.custom_columns[colhead]['is_editable']:
                    flags |= Qt.ItemIsEditable
        return flags

    def _set_custom_column_data(self, row, colhead, value):
        """Set the custom column data for the given row and column."""
        cc = self.custom_columns[colhead]
        typ = cc['datatype']
        label=self.db.field_metadata.key_to_label(colhead)
        s_index = None
        if typ in ('text', 'comments'):
            val = unicode(value or '').strip()
            val = val if val else None
        elif typ == 'enumeration':
            val = unicode(value or '').strip()
            if not val:
                val = None
        elif typ == 'bool':
            val = value if value is None else bool(value)
        elif typ == 'rating':
            val = max(0, min(int(value or 0), 10))
        elif typ in ('int', 'float'):
            if value == 0:
                val = '0'
            else:
                val = unicode(value or '').strip()
            if not val:
                val = None
        elif typ == 'datetime':
            val = value
            if val is None:
                val = None
            else:
                if not val.isValid():
                    return False
                val = qt_to_dt(val, as_utc=False)
        elif typ == 'series':
            val = unicode(value or '').strip()
            if val:
                pat = re.compile(r'\[([.0-9]+)\]')
                match = pat.search(val)
                if match is not None:
                    s_index = float(match.group(1))
                    val = pat.sub('', val).strip()
                elif val:
                    # it is OK to leave s_index == None when using 'no_change'
                    if tweaks['series_index_auto_increment'] != 'const' and \
                            tweaks['series_index_auto_increment'] != 'no_change':
                        s_index = self.db.get_next_cc_series_num_for(val,
                                                        label=label, num=None)
        elif typ == 'composite':
            tmpl = unicode(value or '').strip()
            disp = cc['display']
            disp['composite_template'] = tmpl
            self.db.set_custom_column_metadata(cc['colnum'], display=disp,
                                               update_last_modified=True)
            self.refresh(reset=True)
            return True

        id = self.db.id(row)
        books_to_refresh = set([id])
        books_to_refresh |= self.db.set_custom(id, val, extra=s_index,
                           label=label, num=None, append=False, notify=True,
                           allow_case_change=True)
        self.refresh_ids(list(books_to_refresh), current_row=row)
        return True

    def _setData(self, index, value, role):
        """Set the data for the given index, value, and role."""
        from calibre.gui2.ui import get_gui
        if get_gui().shutting_down:
            return False
        if role == Qt.EditRole:
            from calibre.gui2.ui import get_gui
            try:
                return self._set_data(index, value)
            except (IOError, OSError) as err:
                import traceback
                if getattr(err, 'errno', None) == errno.EACCES:  # Permission denied
                    fname = getattr(err, 'filename', None)
                    p = 'Locked file: %s\n\n'%fname if fname else ''
                    error_dialog(get_gui(), _('Permission denied'),
                            _('Could not change the on disk location of this'
                                ' book. Is it open in another program?'),
                            det_msg=p+traceback.format_exc(), show=True)
                    return False
                error_dialog(get_gui(), _('Failed to set data'),
                        _('Could not set data, click Show Details to see why.'),
                        det_msg=traceback.format_exc(), show=True)
            except:
                import traceback
                traceback.print_exc()
                error_dialog(get_gui(), _('Failed to set data'),
                        _('Could not set data, click Show Details to see why.'),
                        det_msg=traceback.format_exc(), show=True)
        return False

    def _set_data(self, index, value):
        """Set the data for the given index and value."""
        row, col = index.row(), index.column()
        column = self.column_map[col]
        if self.is_custom_column(column):
            if not self.set_custom_column_data(row, column, value):
                return False
        else:
            if column not in self.editable_cols:
                return False
            val = (int(value) if column == 'rating' else
                    value if column in ('timestamp', 'pubdate')
                    else re.sub(ur'\s', u' ', unicode(value or '').strip()))
            id = self.db.id(row)
            books_to_refresh = set([id])
            if column == 'rating':
                val = max(0, min(int(val or 0), 10))
                self.db.set_rating(id, val)
            elif column == 'series':
                val = val.strip()
                if not val:
                    books_to_refresh |= self.db.set_series(id, val,
                                                    allow_case_change=True)
                    self.db.set_series_index(id, 1.0)
                else:
                    pat = re.compile(r'\[([.0-9]+)\]')
                    match = pat.search(val)
                    if match is not None:
                        self.db.set_series_index(id, float(match.group(1)))
                        val = pat.sub('', val).strip()
                    elif val:
                        if tweaks['series_index_auto_increment'] != 'const' and \
                            tweaks['series_index_auto_increment'] != 'no_change':
                            ni = self.db.get_next_series_num_for(val)
                            if ni != 1:
                                self.db.set_series_index(id, ni)
                    if val:
                        books_to_refresh |= self.db.set_series(id, val,
                                                    allow_case_change=True)
            elif column == 'timestamp':
                if val is None or not val.isValid():
                    return False
                self.db.set_timestamp(id, qt_to_dt(val, as_utc=False))
            elif column == 'pubdate':
                if val is None or not val.isValid():
                    return False
                self.db.set_pubdate(id, qt_to_dt(val, as_utc=False))
            elif column == 'languages':
                val = val.split(',')
                self.db.set_languages(id, val)
            else:
                books_to_refresh |= self.db.set(row, column, val,
                                                allow_case_change=True)
            self.refresh_ids(list(books_to_refresh), row)
        self.dataChanged.emit(index, index)
        return True

class DeviceBooksModel(BooksModel):
    # ...

    def _counts(self):
        """Get the counts."""
        return Counts(len(self.db), len(self.db), len(self.map))

    def _count_changed(self, *args):
        """Emit the count changed signal."""
        self.count_changed_signal.emit(len(self.db))

    def _mark_for_deletion(self, job, rows, rows_are_ids):
        """Mark the given rows for deletion."""
        db_indices = rows if rows_are_ids else self.indices(rows)
        db_items = [self.db[i] for i in db_indices if -1 < i < len(self.db)]
        self.marked_for_deletion[job] = db_items
        if rows_are_ids:
            self.beginResetModel(), self.endResetModel()
        else:
            for row in rows:
                indices = self.row_indices(row)
                self.dataChanged.emit(indices[0], indices[-1])

    def _deletion_done(self, job, succeeded):
        """Handle the deletion done signal."""
        db_items = self.marked_for_deletion.pop(job, [])
        rows = []
        for item in db_items:
            idx = self.find_item_in_db(item)
            if idx is not None:
                try:
                    rows.append(self.map.index(idx))
                except ValueError:
                    pass

        for row in rows:
            if not succeeded:
                indices = self.row_indices(self.index(row, 0))
                self.dataChanged.emit(indices[0], indices[-1])
        self.count_changed()

    def _paths_deleted(self, paths):
        """Handle the paths deleted signal."""
        self.map = list(range(0, len(self.db)))
        self.resort(False)
        self.research(True)
        self.count_changed()

    def _is_row_marked_for_deletion(self, row):
        """Check if the given row is marked for deletion."""
        try:
            item = self.db[self.map[row]]
        except IndexError:
            return False

        path = getattr(item, 'path', None)
        for items in self.marked_for_deletion.itervalues():
            for x in items:
                if x is item or (path and path == getattr(x, 'path', None)):
                    return True
        return False

    def _clear_ondevice(self, db_ids, to_what):
        """Clear the on device flag for the given IDs."""
        for data in self.db:
            if data is None:
                continue
            app_id = getattr(data, 'application_id', None)
            if app_id is not None and app_id in db_ids:
                data.in_library = to_what
            self.beginResetModel(), self.endResetModel()

    def _flags(self, index):
        """Get the flags for the given index."""
        if self.is_row_marked_for_deletion(index.row()):
            return Qt.NoItemFlags
        flags = QAbstractTableModel.flags(self, index)
        if index.isValid():
            cname = self.column_map[index.column()]
            if cname in self.editable and \
                     (cname != 'collections' or
                     (callable(getattr(self.db, 'supports_collections', None)) and
                      self.db.supports_collections() and
                      device_prefs['manage_device_metadata']=='manual')):
                flags |= Qt.ItemIsEditable
        return flags

    def _search(self, text, reset):
        """Search the model."""
        # This should not be here, but since the DeviceBooksModel does not
        # implement count_changed and I am too lazy to fix that, this kludge
        # will have to do
        self.resize_rows.emit()

        if not text or not text.strip():
            self.map = list(range(len(self.db)))
        else:
            try:
                matches = self.search_engine.parse(text)
            except ParseException:
                self.searched.emit(False)
                return

            self.map = []
            for i in range(len(self.db)):
                if i in matches:
                    self.map.append(i)
        self.resort(reset=False)
        if reset:
            self.beginResetModel(), self.endResetModel()
        self.last_search = text
        if self.last_search:
            self.searched.emit(True)
        self.count_changed()

    def _research(self, reset):
        """Research the model."""
        self.search(self.last_search, reset)

    def _sort(self, col, order, reset):
        """Sort the model."""
        descending = order != Qt.AscendingOrder
        cname = self.column_map[col]

        def author_key(x):
            try:
                ax = self.db[x].author_sort
                if not ax:
                    raise Exception('')
            except:
                try:
                    ax = authors_to_string(self.db[x].authors)
                except:
                    ax = ''
            try:
                return sort_key(ax)
            except:
                return ax

        keygen = {
                'title': ('title_sorter', lambda x: sort_key(x) if x else ''),
                'authors' : author_key,
                'size' : ('size', int),
                'timestamp': ('datetime', functools.partial(dt_factory, assume_utc=True)),
                'collections': ('device_collections', lambda x:sorted(x,
                    key=sort_key)),
                'inlibrary': ('in_library', lambda x: x),
                }[cname]
        keygen = keygen if callable(keygen) else DeviceDBSortKeyGen(
            keygen[0], keygen[1], self.db)
        self.map.sort(key=keygen, reverse=descending)
        if len(self.map) == len(self.db):
            self.sorted_map = list(self.map)
        else:
            self.sorted_map = list(range(len(self.db)))
            self.sorted_map.sort(key=keygen, reverse=descending)
        self.sorted_on = (self.column_map[col], order)
        self.sort_history.insert(0, self.sorted_on)
        if hasattr(keygen, 'db'):
            keygen.db = None
        if reset:
            self.beginResetModel(), self.endResetModel()

    def _resort(self, reset):
        """Resort the model."""
        if self.sorted_on:
            self.sort(self.column_map.index(self.sorted_on[0]),
                      self.sorted_on[1], reset=False)
        if reset:
            self.beginResetModel(), self.endResetModel()

    def _columnCount(self, parent):
        """Get the column count."""
        if parent and parent.isValid():
            return 0
        return len(self.column_map)

    def _rowCount(self, parent):
        """Get the row count."""
        if parent and parent.isValid():
            return 0
        return len(self.map)

    def _set_database(self, db):
        """Set the database."""
        self.custom_columns = {}
        self.db = db
        self.map = list(range(0, len(db)))
        self.research(reset=False)
        self.resort()
        self.count_changed()

    def _cover(self, row):
        """Get the cover for the given row."""
        item = self.db[self.map[row]]
        cdata = item.thumbnail
        img = QImage()
        if cdata is not None:
            if hasattr(cdata, 'image_path'):
                img.load(cdata.image_path)
            elif cdata:
                if isinstance(cdata, (tuple, list)):
                    img.loadFromData(cdata[-1])
                else:
                    img.loadFromData(cdata)
        if img.isNull():
            img = self.default_image
        return img

    def _get_book_display_info(self, idx):
        """Get the book display info for the given index."""
        from calibre.ebooks.metadata.book.base import Metadata
        item = self.db[self.map[idx]]
        cover = self.cover(idx)
        if cover is self.default_image:
            cover = None
        title = item.title
        if not title:
            title = _('Unknown')
        au = item.authors
        if not au:
            au = [_('Unknown')]
        mi = Metadata(title, au)
        mi.cover_data = ('jpg', cover)
        fmt = _('Unknown')
        ext = os.path.splitext(item.path)[1]
        if ext:
            fmt = ext[1:].lower()
        mi.formats = [fmt]
        mi.path = (item.path if item.path else None)
        dt = dt_factory(item.datetime, assume_utc=True)
        mi.timestamp = dt
        mi.device_collections = list(item.device_collections)
        mi.tags = list(getattr(item, 'tags', []))
        mi.comments = getattr(item, 'comments', None)
        series = getattr(item, 'series', None)
        if series:
            sidx = getattr(item, 'series_index', 0)
            mi.series = series
            mi.series_index = sidx
        return mi

    def _current_changed(self, current, previous, emit_signal):
        """Handle the current changed signal."""
        if current.isValid():
            idx = current.row()
            data = self.get_book_display_info(idx)
            if emit_signal:
                self.new_bookdisplay_data.emit(data)
            else:
                return data

    def _paths(self, rows):
        """Get the paths for the given rows."""
        return [self.db[self.map[r.row()]].path for r in rows]

    def _paths_for_db_ids(self, db_ids, as_map):
        """Get the paths for the given DB IDs."""
        res = defaultdict(list) if as_map else []
        for r,b in enumerate(self.db):
            if b.application_id in db_ids:
                if as_map:
                    res[b.application_id].append(b)
                else:
                    res.append((r,b))
        return res

    def _get_collections_with_ids(self):
        """Get the collections with IDs."""
        collections = set()
        for book in self.db:
            if book.device_collections is not None:
                collections.update(set(book.device_collections))
        self.collections = []
        result = []
        for i,collection in enumerate(collections):
            result.append((i, collection))
            self.collections.append(collection)
        return result

    def _rename_collection(self, old_id, new_name):
        """Rename the collection."""
        old_name = self.collections[old_id]
        for book in self.db:
            if book.device_collections is None:
                continue
            if old_name in book.device_collections:
                book.device_collections.remove(old_name)
                if new_name not in book.device_collections:
                    book.device_collections.append(new_name)

    def _delete_collection_using_id(self, old_id):
        """Delete the collection using the given ID."""
        old_name = self.collections[old_id]
        for book in self.db:
            if book.device_collections is None:
                continue
            if old_name in book.device_collections:
                book.device_collections.remove(old_name)

    def _indices(self, rows):
        """Get the indices for the given rows."""
        return [self.map[r.row()] for r in rows]

    def _data(self, index, role):
        """Get the data for the given index and role."""
        row, col = index.row(), index.column()
        cname = self.column_map[col]
        if role == Qt.DisplayRole or role == Qt.EditRole:
            if cname == 'title':
                text = self.db[self.map[row]].title
                if not text:
                    text = self.unknown
                return (text)
            elif cname == 'authors':
                au = self.db[self.map[row]].authors
                if not au:
                    au = [_('Unknown')]
                return (authors_to_string(au))
            elif cname == 'size':
                size = self.db[self.map[row]].size
                if not isinstance(size, (float, int)):
                    size = 0
                return (human_readable(size))
            elif cname == 'timestamp':
                dt = self.db[self.map[row]].datetime
                try:
                    dt = dt_factory(dt, assume_utc=True, as_utc=False)
                except OverflowError:
                    dt = dt_factory(time.gmtime(), assume_utc=True,
                                    as_utc=False)
                return (strftime(TIME_FMT, dt.timetuple()))
            elif cname == 'collections':
                tags = self.db[self.map[row]].device_collections
                if tags:
                    tags.sort(key=sort_key)
                    return (', '.join(tags))
            elif DEBUG and cname == 'inlibrary':
                return (self.db[self.map[row]].in_library)
        elif role == Qt.ToolTipRole and index.isValid():
            if col == 0 and hasattr(self.db[self.map[row]], 'in_library_waiting'):
                return (_('Waiting for metadata to be updated'))
            if self.is_row_marked_for_deletion(row):
                return (_('Marked for deletion'))
            if cname in ['title', 'authors'] or (
                    cname == 'collections' and (
                        callable(getattr(self.db, 'supports_collections', None)) and self.db.supports_collections())
            ):
                return (_("Double click to <b>edit</b> me<br><br>"))
        elif role == Qt.DecorationRole and cname == 'inlibrary':
            if hasattr(self.db[self.map[row]], 'in_library_waiting'):
                return (self.sync_icon)
            elif self.db[self.map[row]].in_library:
                return (self.bool_yes_icon)
            elif self.db[self.map[row]].in_library is not None:
                return (self.bool_no_icon)
        elif role == Qt.TextAlignmentRole:
            cname = self.column_map[index.column()]
            ans = Qt.AlignVCenter | ALIGNMENT_MAP[self.alignment_map.get(cname,
                'left')]
            return (ans)
        return None

    def _headerData(self, section, orientation, role):
        """Get the header data for the given section, orientation, and role."""
        if role == Qt.ToolTipRole and orientation == Qt.Horizontal:
            return (_('The lookup/search name is "{0}"').format(self.column_map[section]))
        if DEBUG and role == Qt.ToolTipRole and orientation == Qt.Vertical:
            return (_('This book\'s UUID is "{0}"').format(self.db[self.map[section]].uuid))
        if role != Qt.DisplayRole:
            return None
        if orientation == Qt.Horizontal:
            cname = self.column_map[section]
            text = self.headers[cname]
            return (text)
        else:
            return (section+1)

    def _setData(self, index, value, role):
        """Set the data for the given index, value, and role."""
        from calibre.gui2.ui import get_gui
        if get_gui().shutting_down:
            return False
        done = False
        if role == Qt.EditRole:
            row, col = index.row(), index.column()
            cname = self.column_map[col]
            if cname in ('size', 'timestamp', 'inlibrary'):
                return False
            val = unicode(value or '').strip()
            idx = self.map[row]
            if cname == 'collections':
                tags = [i.strip() for i in val.split(',')]
                tags = [t for t in tags if t]
                self.db[idx].device_collections = tags
                self.dataChanged.emit(index, index)
                self.upload_collections.emit(self.db)
                return True

            if cname == 'title' :
                self.db[idx].title = val
            elif cname == 'authors':
                self.db[idx].authors = string_to_authors(val)
            self.dataChanged.emit(index, index)
            self.booklist_dirtied.emit()
            done = True
        return done

    def _set_editable(self, editable):
        """Set the editable flag."""
        # Cannot edit if metadata is sent on connect. Reason: changes will
        # revert to what is in the library on next connect.
        if isinstance(editable, list):
            self.editable = editable
        elif editable:
            self.editable = ['title', 'authors', 'collections']
        else:
            self.editable = []
        if device_prefs['manage_device_metadata']=='on_connect':
            self.editable = []