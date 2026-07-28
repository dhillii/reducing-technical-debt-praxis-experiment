class Document(QWebPage):
    # ...

    def __init__(self, shortcuts, parent=None, debug_javascript=False):
        QWebPage.__init__(self, parent)
        self.nam = NetworkAccessManager(self)
        self.setNetworkAccessManager(self.nam)
        self.setObjectName("py_bridge")
        self.in_paged_mode = False
        self.first_load = True
        self.jump_to_cfi_listeners = set()

        self.debug_javascript = debug_javascript
        self.anchor_positions = {}
        self.index_anchors = set()
        self.current_language = None
        self.loaded_javascript = False
        self.js_loader = JavaScriptLoader(
                    dynamic_coffeescript=self.debug_javascript)
        self.in_fullscreen_mode = False
        self.math_present = False

        self.setLinkDelegationPolicy(self.DelegateAllLinks)
        self.scroll_marks = []
        self.shortcuts = shortcuts
        pal = self.palette()
        pal.setBrush(QPalette.Background, QColor(0xee, 0xee, 0xee))
        self.setPalette(pal)
        self.page_position = PagePosition(self)

        settings = self.settings()

        # Fonts
        self.all_viewer_plugins = tuple(all_viewer_plugins())
        for pl in self.all_viewer_plugins:
            pl.load_fonts()
        opts = config().parse()
        self.set_font_settings(opts)

        apply_basic_settings(settings)
        self.set_user_stylesheet(opts)
        self.misc_config(opts)

        # Load javascript
        self.mainFrame().javaScriptWindowObjectCleared.connect(
                self.add_window_objects)

        self.turn_off_internal_scrollbars()

    # ...

    def after_load(self, last_loaded_path=None):
        self._after_load(last_loaded_path)

    def _after_load(self, last_loaded_path=None):
        self.javascript('window.paged_display.read_document_margins()')
        self.set_bottom_padding(0)
        self.fit_images()
        w = 1 if iswindows else 0
        self.math_present = self.javascript('window.mathjax.check_for_math(%d)' % w, bool)
        self.init_hyphenate()
        self.javascript('full_screen.save_margins()')
        if self.in_fullscreen_mode:
            self.switch_to_fullscreen_mode()
        if self.in_paged_mode:
            self.switch_to_paged_mode(last_loaded_path=last_loaded_path)
        self.read_anchor_positions(use_cache=False)
        evaljs = self.mainFrame().evaluateJavaScript
        for pl in self.all_viewer_plugins:
            pl.run_javascript(evaljs)
        self.first_load = False

    # ...

    def switch_to_paged_mode(self, onresize=False, last_loaded_path=None):
        if onresize and not self.loaded_javascript:
            return
        cols_per_screen = self.cols_per_screen_portrait if self.is_portrait else self.cols_per_screen_landscape
        cols_per_screen = max(1, min(5, cols_per_screen))
        self.javascript('''
            window.paged_display.use_document_margins = %s;
            window.paged_display.set_geometry(%d, %d, %d, %d);
            '''%(
            ('true' if self.use_book_margins else 'false'),
            cols_per_screen, self.top_margin, self.side_margin,
            self.bottom_margin
            ))
        force_fullscreen_layout = self.nam.is_single_page(last_loaded_path)
        self.update_contents_size_for_paged_mode(force_fullscreen_layout)

    # ...

    def update_contents_size_for_paged_mode(self, force_fullscreen_layout=None):
        # Setup the contents size to ensure that there is a right most margin.
        # Without this WebKit renders the final column with no margin, as the
        # columns extend beyond the boundaries (and margin) of body
        if force_fullscreen_layout is None:
            force_fullscreen_layout = self.javascript('window.paged_display.is_full_screen_layout', typ=bool)
        f = 'true' if force_fullscreen_layout else 'false'
        side_margin = self.javascript('window.paged_display.layout(%s)'%f, typ=int)
        mf = self.mainFrame()
        sz = mf.contentsSize()
        scroll_width = self.javascript('document.body.scrollWidth', int)
        # At this point sz.width() is not reliable, presumably because Qt
        # has not yet been updated
        if scroll_width > self.window_width:
            sz.setWidth(scroll_width+side_margin)
            self.setPreferredContentsSize(sz)
        self.javascript('window.paged_display.fit_images()')

    # ...

    def after_resize(self):
        if self.in_paged_mode:
            self.setPreferredContentsSize(QSize())
            self.switch_to_paged_mode(onresize=True)
        self.javascript('if (window.mathjax) window.mathjax.after_resize();')

    # ...

    def switch_to_fullscreen_mode(self):
        self.in_fullscreen_mode = True
        self.javascript('full_screen.on(%d, %d, %s)'%(self.max_fs_width, self.max_fs_height,
            'true' if self.in_paged_mode else 'false'))

    # ...

    def switch_to_window_mode(self):
        self.in_fullscreen_mode = False
        self.javascript('full_screen.off(%s)'%('true' if self.in_paged_mode
            else 'false'))

    # ...

    def _load_javascript_libraries(self):
        if self.loaded_javascript:
            return
        self.loaded_javascript = True
        evaljs = self.mainFrame().evaluateJavaScript
        self.loaded_lang = self.js_loader(evaljs, self.current_language,
                self.hyphenate_default_lang)
        evaljs('window.calibre_utils.setup_epub_reading_system(%s, %s, %s, %s)' % tuple(map(json.dumps, (
            'calibre-desktop', __version__, 'paginated' if self.in_paged_mode else 'scrolling',
            'dom-manipulation layout-changes mouse-events keyboard-events'.split()))))
        self.javascript(u'window.mathjax.base = %s'%(json.dumps(self.nam.mathjax_base, ensure_ascii=False)))
        for pl in self.all_viewer_plugins:
            pl.load_javascript(evaljs)
        evaljs('py_bridge.mark_element.connect(window.calibre_extract.mark)')

    # ...

    def load_javascript_libraries(self):
        self._load_javascript_libraries()

    # ...

    def _apply_settings(self, opts):
        self.set_font_settings(opts)
        self.set_user_stylesheet(opts)
        self.misc_config(opts)
        self.settings_changed.emit()
        self.after_load()

    # ...

    def apply_settings(self, opts):
        with self.page_position:
            self._apply_settings(opts)


class DocumentView(QWebView):
    # ...

    def __init__(self):
        QWebView.__init__(self)
        self.setRenderHints(QPainter.Antialiasing|QPainter.TextAntialiasing|QPainter.SmoothPixmapTransform)
        self.flipper = SlideFlip(self)
        self.gesture_handler = GestureHandler(self)
        self.is_auto_repeat_event = False
        self.debug_javascript = False
        self.shortcuts =  Shortcuts(SHORTCUTS, 'shortcuts/viewer')
        self.setSizePolicy(QSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding))
        self._size_hint = QSize(510, 680)
        self.initial_pos = 0.0
        self.to_bottom = False
        self.document = Document(self.shortcuts, parent=self,
                debug_javascript=self.debug_javascript)
        self.document.nam.load_error.connect(self.on_unhandled_load_error)
        self.footnotes = Footnotes(self)
        self.document.settings_changed.connect(self.footnotes.clone_settings)
        self.setPage(self.document)
        self.inspector = WebInspector(self, self.document)
        self.manager = None
        self._reference_mode = False
        self._ignore_scrollbar_signals = False
        self.loading_url = None
        self.loadFinished.connect(self.load_finished)
        self.document.linkClicked.connect(self.link_clicked)
        self.document.linkHovered.connect(self.link_hovered)
        self.document.selectionChanged[()].connect(self.selection_changed)
        self.document.animated_scroll_done_signal.connect(self.animated_scroll_done, type=Qt.QueuedConnection)
        self.document.page_turn.connect(self.page_turn_requested)
        copy_action = self.copy_action
        copy_action.setIcon(QIcon(I('edit-copy.png')))
        copy_action.triggered.connect(self.copy, Qt.QueuedConnection)
        d = self.document
        self.unimplemented_actions = list(map(self.pageAction,
            [d.DownloadImageToDisk, d.OpenLinkInNewWindow, d.DownloadLinkToDisk,
                d.OpenImageInNewWindow, d.OpenLink, d.Reload, d.InspectElement]))

        self.search_online_action = QAction(QIcon(I('search.png')), '', self)
        self.search_online_action.triggered.connect(self.search_online)
        self.addAction(self.search_online_action)
        self.dictionary_action = QAction(QIcon(I('dictionary.png')),
                _('&Lookup in dictionary'), self)
        self.dictionary_action.triggered.connect(self.lookup)
        self.addAction(self.dictionary_action)
        self.image_popup = ImagePopup(self)
        self.table_popup = TablePopup(self)
        self.view_image_action = QAction(QIcon(I('view-image.png')), _('View &image...'), self)
        self.view_image_action.triggered.connect(self.image_popup)
        self.view_table_action = QAction(QIcon(I('view.png')), _('View &table...'), self)
        self.view_table_action.triggered.connect(self.popup_table)
        self.search_action = QAction(QIcon(I('dictionary.png')),
                _('&Search for next occurrence'), self)
        self.search_action.triggered.connect(self.search_next)
        self.addAction(self.search_action)

        self.goto_location_action = QAction(_('Go to...'), self)
        self.goto_location_menu = m = QMenu(self)
        self.goto_location_actions = a = {
                'Next Page': self.next_page,
                'Previous Page': self.previous_page,
                'Section Top' : partial(self.scroll_to, 0),
                'Document Top': self.goto_document_start,
                'Section Bottom':partial(self.scroll_to, 1),
                'Document Bottom': self.goto_document_end,
                'Next Section': self.goto_next_section,
                'Previous Section': self.goto_previous_section,
        }
        for name, key in [(_('Next section'), 'Next Section'),
                (_('Previous section'), 'Previous Section'),
                (None, None),
                (_('Document start'), 'Document Top'),
                (_('Document end'), 'Document Bottom'),
                (None, None),
                (_('Section start'), 'Section Top'),
                (_('Section end'), 'Section Bottom'),
                (None, None),
                (_('Next page'), 'Next Page'),
                (_('Previous page'), 'Previous Page')]:
            if key is None:
                m.addSeparator()
            else:
                m.addAction(name, a[key], self.shortcuts.get_sequences(key)[0])
        self.goto_location_action.setMenu(self.goto_location_menu)

        self.restore_fonts_action = QAction(_('Default font size'), self)
        self.restore_fonts_action.setCheckable(True)
        self.restore_fonts_action.triggered.connect(self.restore_font_size)

    # ...

    def _load_finished(self, ok):
        if self.loading_url is None:
            # An <iframe> finished loading
            return
        self.loading_url = None
        self.document.load_javascript_libraries()
        self.document.after_load(self.last_loaded_path)
        self._size_hint = self.document.mainFrame().contentsSize()
        scrolled = False
        if self.to_bottom:
            self.to_bottom = False
            self.initial_pos = 1.0
        if self.initial_pos > 0.0:
            scrolled = True
        self.scroll_to(self.initial_pos, notify=False)
        self.initial_pos = 0.0
        self.update()
        self.initialize_scrollbar()
        self.document.reference_mode(self._reference_mode)
        if self.manager is not None:
            spine_index = self.manager.load_finished(bool(ok))
            if spine_index > -1:
                self.document.set_reference_prefix('%d.'%(spine_index+1))
            if scrolled:
                self.manager.scrolled(self.document.scroll_fraction,
                        onload=True)

        if self.flipper.isVisible():
            if self.flipper.running:
                self.flipper.setVisible(False)
            else:
                self.flipper(self.current_page_image(),
                        duration=self.document.page_flip_duration)

    # ...

    def load_finished(self, ok):
        self._load_finished(ok)

    # ...

    def _next_page(self):
        if self.flipper.running and not self.is_auto_repeat_event:
            return
        if self.loading_url is not None:
            return
        epf = self.document.enable_page_flip and not self.is_auto_repeat_event

        if self.document.in_paged_mode:
            loc = self.document.javascript(
                    'paged_display.next_screen_location()', typ='int')
            if loc < 0:
                if self.manager is not None:
                    if epf:
                        self.flipper.initialize(self.current_page_image())
                    self.manager.next_document()
            else:
                if epf:
                    self.flipper.initialize(self.current_page_image())
                self.document.scroll_to(x=loc, y=0)
                if epf:
                    self.flipper(self.current_page_image(),
                            duration=self.document.page_flip_duration)
                if self.manager is not None:
                    self.manager.scrolled(self.scroll_fraction)

            return

        window_height = self.document.window_height
        document_height = self.document.height
        ddelta = document_height - window_height
        # print '\nWindow height:', window_height
        # print 'Document height:', self.document.height

        delta_y = window_height - 25
        if self.document.at_bottom or ddelta <= 0:
            if self.manager is not None:
                if epf:
                    self.flipper.initialize(self.current_page_image())
                self.manager.next_document()
        elif ddelta < 25:
            self.scroll_by(y=ddelta)
            return
        else:
            oopos = self.document.ypos
            # print 'Original position:', oopos
            self.document.set_bottom_padding(0)
            opos = self.document.ypos
            # print 'After set padding=0:', self.document.ypos
            if opos < oopos:
                if self.manager is not None:
                    if epf:
                        self.flipper.initialize(self.current_page_image())
                    self.manager.next_document()
                return
            # oheight = self.document.height
            lower_limit = opos + delta_y  # Max value of top y co-ord after scrolling
            max_y = self.document.height - window_height  # The maximum possible top y co-ord
            if max_y < lower_limit:
                padding = lower_limit - max_y
                if padding == window_height:
                    if self.manager is not None:
                        if epf:
                            self.flipper.initialize(self.current_page_image())
                        self.manager.next_document()
                    return
                # print 'Setting padding to:', lower_limit - max_y
                self.document.set_bottom_padding(lower_limit - max_y)
            if epf:
                self.flipper.initialize(self.current_page_image())
            # print 'Document height:', self.document.height
            # print 'Height change:', (self.document.height - oheight)
            max_y = self.document.height - window_height
            lower_limit = min(max_y, lower_limit)
            # print 'Scroll to:', lower_limit
            if lower_limit > opos:
                self.document.scroll_to(self.document.xpos, lower_limit)
            actually_scrolled = self.document.ypos - opos
            # print 'After scroll pos:', self.document.ypos
            # print 'Scrolled by:', self.document.ypos - opos
            self.find_next_blank_line(window_height - actually_scrolled)
            # print 'After blank line pos:', self.document.ypos
            if epf:
                self.flipper(self.current_page_image(),
                        duration=self.document.page_flip_duration)
            if self.manager is not None:
                self.manager.scrolled(self.scroll_fraction)
            # print 'After all:', self.document.ypos

    # ...

    def next_page(self):
        self._next_page()

    # ...

    def _previous_page(self):
        if self.flipper.running and not self.is_auto_repeat_event:
            return
        if self.loading_url is not None:
            return
        epf = self.document.enable_page_flip and not self.is_auto_repeat_event

        if self.document.in_paged_mode:
            loc = self.document.javascript(
                    'paged_display.previous_screen_location()', typ='int')
            if loc < 0:
                if self.manager is not None:
                    if epf:
                        self.flipper.initialize(self.current_page_image(),
                                forwards=False)
                    self.manager.previous_document()
            else:
                if epf:
                    self.flipper.initialize(self.current_page_image(),
                            forwards=False)
                self.document.scroll_to(x=loc, y=0)
                if epf:
                    self.flipper(self.current_page_image(),
                            duration=self.document.page_flip_duration)
                if self.manager is not None:
                    self.manager.scrolled(self.scroll_fraction)

            return

        delta_y = self.document.window_height - 25
        if self.document.at_top:
            if self.manager is not None:
                self.to_bottom = True
                if epf:
                    self.flipper.initialize(self.current_page_image(), False)
                self.manager.previous_document()
        else:
            opos = self.document.ypos
            upper_limit = opos - delta_y
            if upper_limit < 0:
                upper_limit = 0
            if upper_limit < opos:
                if epf:
                    self.flipper.initialize(self.current_page_image(),
                            forwards=False)
                self.document.scroll_to(self.document.xpos, upper_limit)
                if epf:
                    self.flipper(self.current_page_image(),
                            duration=self.document.page_flip_duration)
                if self.manager is not None:
                    self.manager.scrolled(self.scroll_fraction)

    # ...

    def previous_page(self):
        self._previous_page()

    # ...

    def _handle_key_press(self, event):
        handled = True
        key = self.shortcuts.get_match(event)
        func = self.goto_location_actions.get(key, None)
        if func is not None:
            self.is_auto_repeat_event = event.isAutoRepeat()
            try:
                func()
            finally:
                self.is_auto_repeat_event = False
        elif key == 'Down':
            if self.document.in_paged_mode:
                self.paged_col_scroll(scroll_past_end=not
                        self.document.line_scrolling_stops_on_pagebreaks)
            else:
                if (not self.document.line_scrolling_stops_on_pagebreaks and
                        self.document.at_bottom):
                    self.manager.next_document()
                else:
                    amt = int((self.document.line_scroll_fraction / 100.) * 15)
                    self.scroll_by(y=amt)
        elif key == 'Up':
            if self.document.in_paged_mode:
                self.paged_col_scroll(forward=False, scroll_past_end=not
                        self.document.line_scrolling_stops_on_pagebreaks)
            else:
                if (not self.document.line_scrolling_stops_on_pagebreaks and
                        self.document.at_top):
                    self.manager.previous_document()
                else:
                    amt = int((self.document.line_scroll_fraction / 100.) * 15)
                    self.scroll_by(y=-amt)
        elif key == 'Left':
            if self.document.in_paged_mode:
                self.paged_col_scroll(forward=False)
            else:
                amt = int((self.document.line_scroll_fraction / 100.) * 15)
                self.scroll_by(x=-amt)
        elif key == 'Right':
            if self.document.in_paged_mode:
                self.paged_col_scroll()
            else:
                amt = int((self.document.line_scroll_fraction / 100.) * 15)
                self.scroll_by(x=amt)
        elif key == 'Back':
            if self.manager is not None:
                self.manager.back(None)
        elif key == 'Forward':
            if self.manager is not None:
                self.manager.forward(None)
        elif event.matches(QKeySequence.Copy):
            self.copy()
        else:
            handled = False
        return handled

    # ...

    def handle_key_press(self, event):
        return self._handle_key_press(event)

    # ...

    def _wheel_event(self, event):
        if event.phase() not in (Qt.ScrollUpdate, 0):
            # 0 is Qt.NoScrollPhase which is not yet available in PyQt
            return
        mods = event.modifiers()
        num_degrees = event.angleDelta().y() // 8
        if mods & Qt.CTRL:
            if self.manager is not None and num_degrees != 0:
                (self.manager.font_size_larger if num_degrees > 0 else
                        self.manager.font_size_smaller)()
                return

        if self.document.in_paged_mode:
            if abs(num_degrees) < 15:
                return
            typ = 'screen' if self.document.wheel_flips_pages else 'col'
            direction = 'next' if num_degrees < 0 else 'previous'
            loc = self.document.javascript('paged_display.%s_%s_location()'%(
                direction, typ), typ='int')
            if loc > -1:
                self.document.scroll_to(x=loc, y=0)
                if self.manager is not None:
                    self.manager.scrolled(self.scroll_fraction)
                event.accept()
            elif self.manager is not None:
                if direction == 'next':
                    self.manager.next_document()
                else:
                    self.manager.previous_document()
                event.accept()
            return

        if num_degrees < -14:
            if self.document.wheel_flips_pages:
                self.next_page()
                event.accept()
                return
            if self.document.at_bottom:
                self.scroll_by(y=15)  # at_bottom can lie on windows
                if self.manager is not None:
                    self.manager.next_document()
                    event.accept()
                    return
        elif num_degrees > 14:
            if self.document.wheel_flips_pages:
                self.previous_page()
                event.accept()
                return

            if self.document.at_top:
                if self.manager is not None:
                    self.manager.previous_document()
                    event.accept()
                    return

        ret = QWebView.wheelEvent(self, event)

        num_degrees_h = event.angleDelta().x() // 8
        vertical = abs(num_degrees) > abs(num_degrees_h)
        scroll_amount = ((num_degrees if vertical else num_degrees_h)/ 120.0) * .2 * -1 * 8
        dim = self.document.viewportSize().height() if vertical else self.document.viewportSize().width()
        amt =  dim * scroll_amount
        mult = -1 if amt < 0 else 1
        if self.document.wheel_scroll_fraction != 100:
            amt = mult * max(1, abs(int(amt * self.document.wheel_scroll_fraction / 100.)))
        self.scroll_by(0, amt) if vertical else self.scroll_by(amt, 0)

        if self.manager is not None:
            self.manager.scrolled(self.scroll_fraction)
        return ret

    # ...

    def wheelEvent(self, event):
        return self._wheel_event(event)