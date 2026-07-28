def apply_settings(settings, opts):
    """Apply font settings to the given QWebSettings object."""
    settings.setFontSize(QWebSettings.DefaultFontSize, opts.default_font_size)
    settings.setFontSize(QWebSettings.DefaultFixedFontSize, opts.mono_font_size)
    settings.setFontSize(QWebSettings.MinimumLogicalFontSize, opts.minimum_font_size)
    settings.setFontSize(QWebSettings.MinimumFontSize, opts.minimum_font_size)
    settings.setFontFamily(QWebSettings.StandardFont, {'serif':opts.serif_family, 'sans':opts.sans_family, 'mono':opts.mono_family}[opts.standard_font])
    settings.setFontFamily(QWebSettings.SerifFont, opts.serif_family)
    settings.setFontFamily(QWebSettings.SansSerifFont, opts.sans_family)
    settings.setFontFamily(QWebSettings.FixedFont, opts.mono_family)
    settings.setAttribute(QWebSettings.ZoomTextOnly, True)


def apply_basic_settings(settings):
    """Apply basic settings to the given QWebSettings object."""
    secure_web_page(settings)
    settings.setAttribute(QWebSettings.LinksIncludedInFocusChain, True)
    settings.setAttribute(QWebSettings.DeveloperExtrasEnabled, True)


class Document(QWebPage):
    """A custom QWebPage class for handling document-related functionality."""

    page_turn = pyqtSignal(object)
    mark_element = pyqtSignal(QWebElement)
    settings_changed = pyqtSignal()
    animated_scroll_done_signal = pyqtSignal()

    def __init__(self, shortcuts, parent=None, debug_javascript=False):
        """Initialize the Document object."""
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
        self.js_loader = JavaScriptLoader(dynamic_coffeescript=self.debug_javascript)
        self.in_fullscreen_mode = False
        self.math_present = False
        self.setLinkDelegationPolicy(self.DelegateAllLinks)
        self.scroll_marks = []
        self.shortcuts = shortcuts
        pal = self.palette()
        pal.setBrush(QPalette.Background, QColor(0xee, 0xee, 0xee))
        self.setPalette(pal)
        self.page_position = PagePosition(self)
        self.all_viewer_plugins = tuple(all_viewer_plugins())
        for pl in self.all_viewer_plugins:
            pl.load_fonts()
        self.apply_settings(config().parse())
        settings = self.settings()
        apply_basic_settings(settings)
        self.set_user_stylesheet(config().parse())
        self.misc_config(config().parse())
        self.mainFrame().javaScriptWindowObjectCleared.connect(self.add_window_objects)

    def set_font_settings(self, opts):
        """Set font settings based on the given options."""
        settings = self.settings()
        apply_settings(settings, opts)

    def do_config(self, parent=None):
        """Open the configuration dialog."""
        d = ConfigDialog(self.shortcuts, parent)
        if d.exec_() == QDialog.Accepted:
            opts = config().parse()
            self.apply_settings(opts)

    def apply_settings(self, opts):
        """Apply the given settings to the document."""
        with self.page_position:
            self.set_font_settings(opts)
            self.set_user_stylesheet(opts)
            self.misc_config(opts)
            self.settings_changed.emit()
            self.after_load()

    def set_user_stylesheet(self, opts):
        """Set the user stylesheet based on the given options."""
        brules = ['background-color: %s !important'%opts.background_color] if opts.background_color else ['background-color: white']
        prefix = '''
            body { %s  }
        '''%('; '.join(brules))
        if opts.text_color:
            prefix += '\n\nbody, p, div { color: %s !important }'%opts.text_color
        raw = prefix + opts.user_css
        raw = '::selection {background:#ffff00; color:#000;}\n'+raw
        data = 'data:text/css;charset=utf-8;base64,'
        data += b64encode(raw.encode('utf-8'))
        self.settings().setUserStyleSheetUrl(QUrl(data))

    def misc_config(self, opts):
        """Apply miscellaneous configuration options."""
        self.hyphenate = opts.hyphenate
        self.hyphenate_default_lang = opts.hyphenate_default_lang
        self.do_fit_images = opts.fit_images
        self.page_flip_duration = opts.page_flip_duration
        self.enable_page_flip = self.page_flip_duration > 0.1
        self.font_magnification_step = opts.font_magnification_step
        self.wheel_flips_pages = opts.wheel_flips_pages
        self.wheel_scroll_fraction = opts.wheel_scroll_fraction
        self.line_scroll_fraction = opts.line_scroll_fraction
        self.tap_flips_pages = opts.tap_flips_pages
        self.line_scrolling_stops_on_pagebreaks = opts.line_scrolling_stops_on_pagebreaks
        screen_width = QApplication.desktop().screenGeometry().width()
        self.max_fs_width = min(opts.max_fs_width, screen_width-50)
        self.max_fs_height = opts.max_fs_height
        self.fullscreen_clock = opts.fullscreen_clock
        self.fullscreen_scrollbar = opts.fullscreen_scrollbar
        self.fullscreen_pos = opts.fullscreen_pos
        self.start_in_fullscreen = opts.start_in_fullscreen
        self.show_fullscreen_help = opts.show_fullscreen_help
        self.use_book_margins = opts.use_book_margins
        self.cols_per_screen_portrait = opts.cols_per_screen_portrait
        self.cols_per_screen_landscape = opts.cols_per_screen_landscape
        self.side_margin = opts.side_margin
        self.top_margin, self.bottom_margin = opts.top_margin, opts.bottom_margin
        self.show_controls = opts.show_controls
        self.remember_current_page = opts.remember_current_page
        self.copy_bookmarks_to_file = opts.copy_bookmarks_to_file
        self.search_online_url = opts.search_online_url or 'https://www.google.com/search?q={text}'

    def turn_off_internal_scrollbars(self):
        """Turn off internal scrollbars."""
        mf = self.mainFrame()
        mf.setScrollBarPolicy(Qt.Vertical, Qt.ScrollBarAlwaysOff)
        mf.setScrollBarPolicy(Qt.Horizontal, Qt.ScrollBarAlwaysOff)

    def load_javascript_libraries(self):
        """Load JavaScript libraries."""
        if self.loaded_javascript:
            return
        self.loaded_javascript = True
        evaljs = self.mainFrame().evaluateJavaScript
        self.loaded_lang = self.js_loader(evaljs, self.current_language, self.hyphenate_default_lang)
        evaljs('window.calibre_utils.setup_epub_reading_system(%s, %s, %s, %s)' % tuple(map(json.dumps, ('calibre-desktop', __version__, 'paginated' if self.in_paged_mode else 'scrolling', 'dom-manipulation layout-changes mouse-events keyboard-events'.split()))))
        evaljs('window.mathjax.base = %s'%(json.dumps(self.nam.mathjax_base, ensure_ascii=False)))
        for pl in self.all_viewer_plugins:
            pl.load_javascript(evaljs)
        evaljs('py_bridge.mark_element.connect(window.calibre_extract.mark)')

    def after_load(self, last_loaded_path=None):
        """Perform actions after loading the document."""
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

    def fit_images(self):
        """Fit images in the document."""
        if self.do_fit_images and not self.in_paged_mode:
            self.javascript('setup_image_scaling_handlers()')

    def add_window_objects(self):
        """Add window objects to the document."""
        self.mainFrame().addToJavaScriptWindowObject("py_bridge", self)
        self.loaded_javascript = False

    def switch_to_paged_mode(self, onresize=False, last_loaded_path=None):
        """Switch to paged mode."""
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

    def update_contents_size_for_paged_mode(self, force_fullscreen_layout=None):
        """Update contents size for paged mode."""
        if force_fullscreen_layout is None:
            force_fullscreen_layout = self.javascript('window.paged_display.is_full_screen_layout', typ=bool)
        f = 'true' if force_fullscreen_layout else 'false'
        side_margin = self.javascript('window.paged_display.layout(%s)'%f, typ=int)
        mf = self.mainFrame()
        sz = mf.contentsSize()
        scroll_width = self.javascript('document.body.scrollWidth', int)
        if scroll_width > self.window_width:
            sz.setWidth(scroll_width+side_margin)
            self.setPreferredContentsSize(sz)
        self.javascript('window.paged_display.fit_images()')

    def switch_to_fullscreen_mode(self):
        """Switch to fullscreen mode."""
        self.in_fullscreen_mode = True
        self.javascript('full_screen.on(%d, %d, %s)'%(self.max_fs_width, self.max_fs_height, 'true' if self.in_paged_mode else 'false'))

    def switch_to_window_mode(self):
        """Switch to window mode."""
        self.in_fullscreen_mode = False
        self.javascript('full_screen.off(%s)'%('true' if self.in_paged_mode else 'false'))

    def init_hyphenate(self):
        """Initialize hyphenation."""
        if self.hyphenatable:
            self.javascript('do_hyphenation("%s")'%self.loaded_lang)

    def page_turn_requested(self, backwards):
        """Handle page turn requests."""
        self.page_turn.emit(bool(backwards))

    def javascript(self, string, typ=None):
        """Evaluate a JavaScript string."""
        ans = self.mainFrame().evaluateJavaScript(string)
        if typ in {'int', int}:
            try:
                return int(ans)
            except (TypeError, ValueError):
                return 0
        if typ in {'float', float}:
            try:
                return float(ans)
            except (TypeError, ValueError):
                return 0.0
        if typ == 'string':
            return ans or u''
        if typ in {bool, 'bool'}:
            return bool(ans)
        return ans

    def javaScriptConsoleMessage(self, msg, lineno, msgid):
        """Handle JavaScript console messages."""
        if DEBUG or self.debug_javascript:
            prints(msg)

    def javaScriptAlert(self, frame, msg):
        """Handle JavaScript alerts."""
        if DEBUG:
            prints(msg)
        else:
            return QWebPage.javaScriptAlert(self, frame, msg)

    def scroll_by(self, dx=0, dy=0):
        """Scroll by the given amount."""
        self.mainFrame().scroll(dx, dy)

    def scroll_to(self, x=0, y=0):
        """Scroll to the given position."""
        self.mainFrame().setScrollPosition(QPoint(x, y))

    def jump_to_anchor(self, anchor):
        """Jump to the given anchor."""
        if not self.loaded_javascript:
            return
        self.javascript('window.paged_display.jump_to_anchor("%s")'%anchor)

    def element_ypos(self, elem):
        """Get the Y position of the given element."""
        try:
            ans = int(elem.evaluateJavaScript('$(this).offset().top'))
        except (TypeError, ValueError):
            raise ValueError('No ypos found')
        return ans

    def elem_outer_xml(self, elem):
        """Get the outer XML of the given element."""
        return unicode(elem.toOuterXml())

    def bookmark(self):
        """Get the current bookmark."""
        pos = self.page_position.current_pos
        return {'type':'cfi', 'pos':pos}

    @property
    def at_bottom(self):
        """Check if we are at the bottom of the document."""
        return self.height - self.ypos <= self.window_height

    @property
    def at_top(self):
        """Check if we are at the top of the document."""
        return self.ypos <=0

    @property
    def ypos(self):
        """Get the current Y position."""
        return self.mainFrame().scrollPosition().y()

    @property
    def window_height(self):
        """Get the window height."""
        return self.javascript('window.innerHeight', 'int')

    @property
    def window_width(self):
        """Get the window width."""
        return self.javascript('window.innerWidth', 'int')

    @property
    def is_portrait(self):
        """Check if the device is in portrait mode."""
        return self.window_width < self.window_height

    @property
    def xpos(self):
        """Get the current X position."""
        return self.mainFrame().scrollPosition().x()

    @dynamic_property
    def scroll_fraction(self):
        """Get or set the scroll fraction."""
        def fget(self):
            if self.in_paged_mode:
                return self.javascript('''
                ans = 0.0;
                if (window.paged_display) {
                    ans = window.paged_display.current_pos();
                }
                ans;''',  typ='float')
            else:
                try:
                    return abs(float(self.ypos)/(self.height-self.window_height))
                except ZeroDivisionError:
                    return 0.

        def fset(self, val):
            if self.in_paged_mode and self.loaded_javascript:
                self.javascript('paged_display.scroll_to_pos(%f)'%val)
            else:
                npos = val * (self.height - self.window_height)
                if npos < 0:
                    npos = 0
                self.scroll_to(x=self.xpos, y=npos)
        return property(fget=fget, fset=fset)

    @dynamic_property
    def page_number(self):
        """Get or set the page number."""
        def fget(self):
            if self.in_paged_mode:
                return self.javascript(
                    'ans = 0; if (window.paged_display) ans = window.paged_display.column_boundaries()[0]; ans;', typ='int')

        def fset(self, val):
            if self.in_paged_mode and self.loaded_javascript:
                self.javascript('if (window.paged_display) window.paged_display.scroll_to_column(%d)' % int(val))
                return True
        return property(fget=fget, fset=fset)

    @property
    def page_dimensions(self):
        """Get the page dimensions."""
        if self.in_paged_mode:
            return self.javascript(
                '''
                ans = ''
                if (window.paged_display)
                    ans = window.paged_display.col_width + ':' + window.paged_display.current_page_height;
                ans;''', typ='string')

    @property
    def hscroll_fraction(self):
        """Get the horizontal scroll fraction."""
        try:
            return float(self.xpos)/self.width
        except ZeroDivisionError:
            return 0.

    @property
    def height(self):
        """Get the document height."""
        q = self.mainFrame().contentsSize().height()
        if q < 0:
            j = self.javascript('document.body.offsetHeight', 'int')
            if j >= 0:
                q = j
        return q

    @property
    def width(self):
        """Get the document width."""
        return self.mainFrame().contentsSize().width()

    def set_bottom_padding(self, amount):
        """Set the bottom padding."""
        s = QSize(-1, -1) if amount == 0 else QSize(self.viewportSize().width(), self.height+amount)
        self.setPreferredContentsSize(s)

    def extract_node(self):
        """Extract the current node."""
        return unicode(self.mainFrame().evaluateJavaScript('window.calibre_extract.extract()'))

    def read_anchor_positions(self, use_cache=True):
        """Read anchor positions."""
        self.anchor_positions = self.javascript('book_indexing.anchor_positions(%s, %s);' % (
            json.dumps(tuple(self.index_anchors)), 'true' if use_cache else 'false'))
        if not isinstance(self.anchor_positions, dict):
            self.anchor_positions = {}
        return {k:tuple(v) for k, v in self.anchor_positions.iteritems()}

    def after_resize(self):
        """Perform actions after resizing."""
        if self.in_paged_mode:
            self.setPreferredContentsSize(QSize())
            self.switch_to_paged_mode(onresize=True)
        self.javascript('if (window.mathjax) window.mathjax.after_resize();')

    def colors(self):
        """Get the document colors."""
        ans = json.loads(self.javascript('''
            bs = getComputedStyle(document.body);
            JSON.stringify([bs.backgroundColor, bs.color])
            '''))
        return ans if isinstance(ans, list) else ['white', 'black']

    def test(self):
        """Test the document."""
        pass


class DocumentView(QWebView):
    """A custom QWebView class for handling document views."""

    magnification_changed = pyqtSignal(object)
    DISABLED_BRUSH = QBrush(Qt.lightGray, Qt.Dense5Pattern)
    gesture_handler = lambda s, e: False
    last_loaded_path = None

    def initialize_view(self, debug_javascript=False):
        """Initialize the view."""
        self.setRenderHints(QPainter.Antialiasing|QPainter.TextAntialiasing|QPainter.SmoothPixmapTransform)
        self.flipper = SlideFlip(self)
        self.gesture_handler = GestureHandler(self)
        self.is_auto_repeat_event = False
        self.debug_javascript = debug_javascript
        self.shortcuts =  Shortcuts(SHORTCUTS, 'shortcuts/viewer')
        self.setSizePolicy(QSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding))
        self._size_hint = QSize(510, 680)
        self.initial_pos = 0.0
        self.to_bottom = False
        self.document = Document(self.shortcuts, parent=self, debug_javascript=debug_javascript)
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
        self.unimplemented_actions = list(map(self.pageAction, [d.DownloadImageToDisk, d.OpenLinkInNewWindow, d.DownloadLinkToDisk, d.OpenImageInNewWindow, d.OpenLink, d.Reload, d.InspectElement]))

        self.search_online_action = QAction(QIcon(I('search.png')), '', self)
        self.search_online_action.triggered.connect(self.search_online)
        self.addAction(self.search_online_action)
        self.dictionary_action = QAction(QIcon(I('dictionary.png')), _('&Lookup in dictionary'), self)
        self.dictionary_action.triggered.connect(self.lookup)
        self.addAction(self.dictionary_action)
        self.image_popup = ImagePopup(self)
        self.table_popup = TablePopup(self)
        self.view_image_action = QAction(QIcon(I('view-image.png')), _('View &image...'), self)
        self.view_image_action.triggered.connect(self.image_popup)
        self.view_table_action = QAction(QIcon(I('view.png')), _('View &table...'), self)
        self.view_table_action.triggered.connect(self.popup_table)
        self.search_action = QAction(QIcon(I('dictionary.png')), _('&Search for next occurrence'), self)
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
        for name, key in [(_('Next section'), 'Next Section'), (_('Previous section'), 'Previous Section'), (None, None), (_('Document start'), 'Document Top'), (_('Document end'), 'Document Bottom'), (None, None), (_('Section start'), 'Section Top'), (_('Section end'), 'Section Bottom'), (None, None), (_('Next page'), 'Next Page'), (_('Previous page'), 'Previous Page')]:
            if key is None:
                m.addSeparator()
            else:
                m.addAction(name, a[key], self.shortcuts.get_sequences(key)[0])
        self.goto_location_action.setMenu(self.goto_location_menu)

        self.restore_fonts_action = QAction(_('Default font size'), self)
        self.restore_fonts_action.setCheckable(True)
        self.restore_fonts_action.triggered.connect(self.restore_font_size)

    def goto_next_section(self, *args):
        """Go to the next section."""
        if self.manager is not None:
            self.manager.goto_next_section()

    def goto_previous_section(self, *args):
        """Go to the previous section."""
        if self.manager is not None:
            self.manager.goto_previous_section()

    def goto_document_start(self, *args):
        """Go to the start of the document."""
        if self.manager is not None:
            self.manager.goto_start()

    def goto_document_end(self, *args):
        """Go to the end of the document."""
        if self.manager is not None:
            self.manager.goto_end()

    @property
    def copy_action(self):
        """Get the copy action."""
        return self.pageAction(self.document.Copy)

    def animated_scroll_done(self):
        """Handle animated scroll done."""
        if self.manager is not None:
            self.manager.scrolled(self.document.scroll_fraction)

    def reference_mode(self, enable):
        """Enable or disable reference mode."""
        self._reference_mode = enable
        self.document.reference_mode(enable)

    def goto(self, ref):
        """Go to the given reference."""
        self.document.goto(ref)

    def goto_bookmark(self, bm):
        """Go to the given bookmark."""
        self.document.goto_bookmark(bm)

    def config(self, parent=None):
        """Open the configuration dialog."""
        self.document.do_config(parent)
        if self.document.in_fullscreen_mode:
            self.document.switch_to_fullscreen_mode()
        self.setFocus(Qt.OtherFocusReason)

    def load_theme(self, theme_id):
        """Load the given theme."""
        themes = load_themes()
        theme = themes[theme_id]
        opts = config(theme).parse()
        self.document.apply_settings(opts)
        if self.document.in_fullscreen_mode:
            self.document.switch_to_fullscreen_mode()
        self.setFocus(Qt.OtherFocusReason)

    def bookmark(self):
        """Get the current bookmark."""
        return self.document.bookmark()

    @property
    def selected_text(self):
        """Get the selected text."""
        return self.document.selectedText().replace(u'\u00ad', u'').strip()

    def copy(self):
        """Copy the selected text."""
        self.document.triggerAction(self.document.Copy)
        c = QApplication.clipboard()
        md = c.mimeData()
        if iswindows:
            nmd = QMimeData()
            nmd.setHtml(md.html().replace(u'\u00ad', ''))
            md = nmd
        md.setText(self.selected_text)
        QApplication.clipboard().setMimeData(md)

    def selection_changed(self):
        """Handle selection changes."""
        if self.manager is not None:
            self.manager.selection_changed(self.selected_text)

    def _selectedText(self):
        """Get the selected text."""
        t = unicode(self.selectedText()).strip()
        if not t:
            return u''
        if len(t) > 40:
            t = t[:40] + u'...'
        t = t.replace(u'&', u'&&')
        return _("S&earch online for '%s'")%t

    def popup_table(self):
        """Popup the table."""
        html = self.document.extract_node()
        self.table_popup(html, self.as_url(self.last_loaded_path), self.document.font_magnification_step)

    def contextMenuEvent(self, ev):
        """Handle context menu events."""
        from_touch = ev.reason() == ev.Other
        mf = self.document.mainFrame()
        r = mf.hitTestContent(ev.pos())
        img = r.pixmap()
        elem = r.element()
        if elem.isNull():
            elem = r.enclosingBlockElement()
        if img.isNull() and elem.tagName().lower() == 'img':
            iqurl = r.imageUrl()
            path = self.path(iqurl)
            img = render_svg(self, path)
        table = None
        parent = elem
        while not parent.isNull():
            if (unicode(parent.tagName()) == u'table' or unicode(parent.localName()) == u'table'):
                table = parent
                break
            parent = parent.parent()
        self.image_popup.current_img = img
        self.image_popup.current_url = r.imageUrl()
        menu = self.document.createStandardContextMenu()
        for action in self.unimplemented_actions:
            menu.removeAction(action)

        if not img.isNull():
            menu.addAction(self.view_image_action)
        if table is not None:
            self.document.mark_element.emit(table)
            menu.addAction(self.view_table_action)

        text = self._selectedText()
        if text and img.isNull():
            self.search_online_action.setText(text)
            for x, sc in (('search_online', 'Search online'), ('dictionary', 'Lookup word'), ('search', 'Next occurrence')):
                ac = getattr(self, '%s_action' % x)
                menu.addAction(ac.icon(), '%s [%s]' % (unicode(ac.text()), ','.join(self.shortcuts.get_shortcuts(sc))), ac.trigger)

        if from_touch and self.manager is not None:
            word = unicode(mf.evaluateJavaScript('window.calibre_utils.word_at_point(%f, %f)' % (ev.pos().x(), ev.pos().y())) or '')
            if word:
                menu.addAction(self.dictionary_action.icon(), _('Lookup %s in the dictionary') % word, partial(self.manager.lookup, word))
                menu.addAction(self.search_online_action.icon(), _('Search for %s online') % word, partial(self.do_search_online, word))

        if not text and img.isNull():
            menu.addSeparator()
            if self.manager.action_back.isEnabled():
                menu.addAction(self.manager.action_back)
            if self.manager.action_forward.isEnabled():
                menu.addAction(self.manager.action_forward)
            menu.addAction(self.goto_location_action)

            if self.manager is not None:
                menu.addSeparator()
                menu.addAction(self.manager.action_table_of_contents)

                menu.addSeparator()
                menu.addAction(self.manager.action_font_size_larger)
                self.restore_fonts_action.setChecked(self.multiplier == 1)
                menu.addAction(self.restore_fonts_action)
                menu.addAction(self.manager.action_font_size_smaller)

        menu.addSeparator()
        menu.addAction(_('Inspect'), self.inspect)

        if not text and img.isNull() and self.manager is not None:
            menu.addSeparator()
            if (not self.document.show_controls or self.document.in_fullscreen_mode) and self.manager is not None:
                menu.addAction(self.manager.toggle_toolbar_action)
            menu.addAction(self.manager.action_full_screen)

            menu.addSeparator()
            menu.addAction(self.manager.action_reload)
            menu.addAction(self.manager.action_quit)

        for plugin in self.document.all_viewer_plugins:
            plugin.customize_context_menu(menu, ev, r)

        if from_touch:
            from calibre.constants import plugins
            pi = plugins['progress_indicator'][0]
            for x in (menu, self.goto_location_menu):
                if hasattr(pi, 'set_touch_menu_style'):
                    pi.set_touch_menu_style(x)
            helpt = QAction(QIcon(I('help.png')), _('Show supported touch screen gestures'), menu)
            helpt.triggered.connect(self.gesture_handler.show_help)
            menu.insertAction(menu.actions()[0], helpt)
        else:
            self.goto_location_menu.setStyle(self.style())
        self.context_menu = menu
        menu.exec_(ev.globalPos())

    def inspect(self):
        """Inspect the document."""
        self.inspector.show()
        self.inspector.raise_()
        self.pageAction(self.document.InspectElement).trigger()

    def lookup(self, *args):
        """Lookup the selected text."""
        if self.manager is not None:
            t = unicode(self.selectedText()).strip()
            if t:
                self.manager.lookup(t.split()[0])

    def search_next(self):
        """Search for the next occurrence."""
        if self.manager is not None:
            t = unicode(self.selectedText()).strip()
            if t:
                self.manager.search.set_search_string(t)

    def search_online(self):
        """Search online."""
        t = unicode(self.selectedText()).strip()
        if t:
            self.do_search_online(t)

    def do_search_online(self, text):
        """Search online for the given text."""
        url = self.document.search_online_url.replace('{text}', QUrl().toPercentEncoding(text))
        if not isinstance(url, bytes):
            url = url.encode('utf-8')
        open_url(QUrl.fromEncoded(url))

    def set_manager(self, manager):
        """Set the manager."""
        self.manager = manager
        self.scrollbar = manager.horizontal_scrollbar
        self.scrollbar.valueChanged[(int)].connect(self.scroll_horizontally)

    def scroll_horizontally(self, amount):
        """Scroll horizontally."""
        self.document.scroll_to(y=self.document.ypos, x=amount)

    @property
    def scroll_pos(self):
        """Get the scroll position."""
        return (self.document.ypos, self.document.ypos + self.document.window_height)

    @property
    def viewport_rect(self):
        """Get the viewport rectangle."""
        d = self.document
        if d.in_paged_mode:
            try:
                l, r = d.column_boundaries
            except ValueError:
                l, r = (0, 1)
        else:
            l, r = d.xpos, d.xpos + d.window_width
        return (l, d.ypos, r, d.ypos + d.window_height)

    def link_hovered(self, link, text, context):
        """Handle link hovered events."""
        link, text = unicode(link), unicode(text)
        if link:
            self.setCursor(Qt.PointingHandCursor)
        else:
            self.unsetCursor()

    def link_clicked(self, url):
        """Handle link clicked events."""
        if self.manager is not None:
            self.manager.link_clicked(url)

    def footnote_link_clicked(self, qurl):
        """Handle footnote link clicked events."""
        path = qurl.toLocalFile()
        self.link_clicked(self.as_url(path))

    def sizeHint(self):
        """Get the size hint."""
        return self._size_hint

    @dynamic_property
    def scroll_fraction(self):
        """Get or set the scroll fraction."""
        def fget(self):
            return self.document.scroll_fraction

        def fset(self, val):
            self.document.scroll_fraction = float(val)
        return property(fget=fget, fset=fset)

    @property
    def hscroll_fraction(self):
        """Get the horizontal scroll fraction."""
        return self.document.hscroll_fraction

    @property
    def content_size(self):
        """Get the content size."""
        return self.document.width, self.document.height

    @dynamic_property
    def current_language(self):
        """Get or set the current language."""
        def fget(self):
            return self.document.current_language

        def fset(self, val):
            self.document.current_language = val
        return property(fget=fget, fset=fset)

    def search(self, text, backwards=False):
        """Search for the given text."""
        flags = self.document.FindBackward if backwards else self.document.FindFlags(0)
        found = self.document.findText(text, flags)
        if found and self.document.in_paged_mode:
            self.document.javascript('paged_display.snap_to_selection()')
        return found

    def path(self, url=None):
        """Get the path for the given URL."""
        url = url or self.url()
        return self.document.nam.as_abspath(url)

    def as_url(self, path):
        """Get the URL for the given path."""
        return self.document.nam.as_url(path)

    def load_path(self, path, pos=0.0):
        """Load the given path."""
        self.initial_pos = pos
        self.last_loaded_path = path
        self.document.setPreferredContentsSize(QSize())
        url = self.as_url(path)
        entries = set()
        for ie in getattr(path, 'index_entries', []):
            if ie.start_anchor:
                entries.add(ie.start_anchor)
            if ie.end_anchor:
                entries.add(ie.end_anchor)
        self.document.index_anchors = entries
        def callback(lu):
            self.loading_url = lu
            if self.manager is not None:
                self.manager.load_started()
        load_html(path, self, codec=getattr(path, 'encoding', 'utf-8'), mime_type=getattr(path, 'mime_type', 'text/html'), loading_url=url, pre_load_callback=callback)

    def on_unhandled_load_error(self, name, tb):
        """Handle unhandled load errors."""
        error_dialog(self, _('Failed to load file'), _(
            'Failed to load the file: {}. Click "Show details" for more information').format(name), det_msg=tb, show=True)

    def initialize_scrollbar(self):
        """Initialize the scrollbar."""
        if getattr(self, 'scrollbar', None) is not None:
            if self.document.in_paged_mode:
                self.scrollbar.setVisible(False)
                return
            delta = self.document.width - self.size().width()
            if delta > 0:
                self._ignore_scrollbar_signals = True
                self.scrollbar.blockSignals(True)
                self.scrollbar.setRange(0, delta)
                self.scrollbar.setValue(0)
                self.scrollbar.setSingleStep(1)
                self.scrollbar.setPageStep(int(delta/10.))
            self.scrollbar.setVisible(delta > 0)
            self.scrollbar.blockSignals(False)
            self._ignore_scrollbar_signals = False

    def load_finished(self, ok):
        """Handle load finished events."""
        if self.loading_url is None:
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
                self.manager.scrolled(self.document.scroll_fraction, onload=True)

    def page_turn_requested(self, backwards):
        """Handle page turn requests."""
        if backwards:
            self.previous_page()
        else:
            self.next_page()

    def scroll_by(self, x=0, y=0, notify=True):
        """Scroll by the given amount."""
        old_pos = (self.document.xpos if self.document.in_paged_mode else self.document.ypos)
        self.document.scroll_by(x, y)
        new_pos = (self.document.xpos if self.document.in_paged_mode else self.document.ypos)
        if notify and self.manager is not None and new_pos != old_pos:
            self.manager.scrolled(self.scroll_fraction)

    def scroll_to(self, pos, notify=True):
        """Scroll to the given position."""
        if self._ignore_scrollbar_signals:
            return
        old_pos = (self.document.xpos if self.document.in_paged_mode else self.document.ypos)
        if self.document.in_paged_mode:
            if isinstance(pos, basestring):
                self.document.jump_to_anchor(pos)
            else:
                self.document.scroll_fraction = pos
        else:
            if isinstance(pos, basestring):
                self.document.jump_to_anchor(pos)
            else:
                if pos >= 1:
                    self.document.scroll_to(0, self.document.height)
                else:
                    y = int(math.ceil(pos*(self.document.height-self.document.window_height)))
                    self.document.scroll_to(0, y)

        new_pos = (self.document.xpos if self.document.in_paged_mode else self.document.ypos)
        if notify and self.manager is not None and new_pos != old_pos:
            self.manager.scrolled(self.scroll_fraction)

    @dynamic_property
    def multiplier(self):
        """Get or set the multiplier."""
        def fget(self):
            return self.zoomFactor()

        def fset(self, val):
            oval = self.zoomFactor()
            self.setZoomFactor(val)
            if val != oval:
                if self.document.in_paged_mode:
                    self.document.update_contents_size_for_paged_mode()
                self.magnification_changed.emit(val)
        return property(fget=fget, fset=fset)

    def magnify_fonts(self, amount=None):
        """Magnify fonts."""
        if amount is None:
            amount = self.document.font_magnification_step
        with self.document.page_position:
            self.multiplier += amount
        return self.document.scroll_fraction

    def shrink_fonts(self, amount=None):
        """Shrink fonts."""
        if amount is None:
            amount = self.document.font_magnification_step
        if self.multiplier >= amount:
            with self.document.page_position:
                self.multiplier -= amount
        return self.document.scroll_fraction

    def restore_font_size(self):
        """Restore font size."""
        with self.document.page_position:
            self.multiplier = 1
        return self.document.scroll_fraction

    def changeEvent(self, event):
        """Handle change events."""
        if event.type() == event.EnabledChange:
            self.update()
        return QWebView.changeEvent(self, event)

    def paintEvent(self, event):
        """Handle paint events."""
        painter = QPainter(self)
        painter.setRenderHints(self.renderHints())
        self.document.mainFrame().render(painter, event.region())
        if not self.isEnabled():
            painter.fillRect(event.region().boundingRect(), self.DISABLED_BRUSH)
        painter.end()

    def wheelEvent(self, event):
        """Handle wheel events."""
        if event.phase() not in (Qt.ScrollUpdate, 0):
            return
        mods = event.modifiers()
        num_degrees = event.angleDelta().y() // 8
        if mods & Qt.CTRL:
            if self.manager is not None and num_degrees != 0:
                (self.manager.font_size_larger if num_degrees > 0 else self.manager.font_size_smaller)()
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
                self.scroll_by(y=15)
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

    def keyPressEvent(self, event):
        """Handle key press events."""
        if not self.handle_key_press(event):
            return QWebView.keyPressEvent(self, event)

    def paged_col_scroll(self, forward=True, scroll_past_end=True):
        """Scroll to the next or previous column."""
        dir = 'next' if forward else 'previous'
        loc = self.document.javascript('paged_display.%s_col_location()'%dir, typ='int')
        if loc > -1:
            self.document.scroll_to(x=loc, y=0)
            self.manager.scrolled(self.document.scroll_fraction)
        elif scroll_past_end:
            (self.manager.next_document() if forward else self.manager.previous_document())

    def handle_key_press(self, event):
        """Handle key press events."""
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
                self.paged_col_scroll(scroll_past_end=not self.document.line_scrolling_stops_on_pagebreaks)
            else:
                if (not self.document.line_scrolling_stops_on_pagebreaks and self.document.at_bottom):
                    self.manager.next_document()
                else:
                    amt = int((self.document.line_scroll_fraction / 100.) * 15)
                    self.scroll_by(y=amt)
        elif key == 'Up':
            if self.document.in_paged_mode:
                self.paged_col_scroll(forward=False, scroll_past_end=not self.document.line_scrolling_stops_on_pagebreaks)
            else:
                if (not self.document.line_scrolling_stops_on_pagebreaks and self.document.at_top):
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

    def resizeEvent(self, event):
        """Handle resize events."""
        if self.manager is not None:
            self.manager.viewport_resize_started(event)
        return QWebView.resizeEvent(self, event)

    def event(self, ev):
        """Handle events."""
        if self.gesture_handler(ev):
            return True
        return QWebView.event(self, ev)

    def mouseMoveEvent(self, ev):
        """Handle mouse move events."""
        if self.document.in_paged_mode and ev.buttons() & Qt.LeftButton and not self.rect().contains(ev.pos(), True):
            return
        return QWebView.mouseMoveEvent(self, ev)

    def mouseReleaseEvent(self, ev):
        """Handle mouse release events."""
        r = self.document.mainFrame().hitTestContent(ev.pos())
        a, url = r.linkElement(), r.linkUrl()
        if url.isValid() and not a.isNull() and self.manager is not None:
            fd = self.footnotes.get_footnote_data(a, url)
            if fd:
                self.footnotes.show_footnote(fd)
                self.manager.show_footnote_view()
                ev.accept()
                return
        opos = self.document.ypos
        if self.manager is not None:
            prev_pos = self.manager.update_page_number()
        ret = QWebView.mouseReleaseEvent(self, ev)
        if self.manager is not None and opos != self.document.ypos:
            self.manager.scrolled(self.scroll_fraction)
            self.manager.internal_link_clicked(prev_pos)
        return ret

    def follow_footnote_link(self):
        """Follow the footnote link."""
        qurl =  self.footnotes.showing_url
        if qurl and qurl.isValid():
            self.link_clicked(qurl)

    def set_book_data(self, iterator):
        """Set the book data."""
        self.document.nam.set_book_data(iterator.base, iterator.spine)

    def previous_page(self):
        """Go to the previous page."""
        if self.flipper.running and not self.is_auto_repeat_event:
            return
        if self.loading_url is not None:
            return
        epf = self.document.enable_page_flip and not self.is_auto_repeat_event

        if self.document.in_paged_mode:
            loc = self.document.javascript('paged_display.previous_screen_location()', typ='int')
            if loc < 0:
                if self.manager is not None:
                    if epf:
                        self.flipper.initialize(self.current_page_image(), forwards=False)
                    self.manager.previous_document()
            else:
                if epf:
                    self.flipper.initialize(self.current_page_image(), forwards=False)
                self.document.scroll_to(x=loc, y=0)
                if epf:
                    self.flipper(self.current_page_image(), duration=self.document.page_flip_duration)
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
                    self.flipper.initialize(self.current_page_image(), forwards=False)
                self.document.scroll_to(self.document.xpos, upper_limit)
                if epf:
                    self.flipper(self.current_page_image(), duration=self.document.page_flip_duration)
                if self.manager is not None:
                    self.manager.scrolled(self.scroll_fraction)

    def next_page(self):
        """Go to the next page."""
        if self.flipper.running and not self.is_auto_repeat_event:
            return
        if self.loading_url is not None:
            return
        epf = self.document.enable_page_flip and not self.is_auto_repeat_event

        if self.document.in_paged_mode:
            loc = self.document.javascript('paged_display.next_screen_location()', typ='int')
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
                    self.flipper(self.current_page_image(), duration=self.document.page_flip_duration)
                if self.manager is not None:
                    self.manager.scrolled(self.scroll_fraction)

            return

        window_height = self.document.window_height
        document_height = self.document.height
        ddelta = document_height - window_height
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
            self.document.set_bottom_padding(0)
            opos = self.document.ypos
            if opos < oopos:
                if self.manager is not None:
                    if epf:
                        self.flipper.initialize(self.current_page_image())
                    self.manager.next_document()
                return
            lower_limit = opos + delta_y
            max_y = self.document.height - window_height
            if max_y < lower_limit:
                padding = lower_limit - max_y
                if padding == window_height:
                    if self.manager is not None:
                        if epf:
                            self.flipper.initialize(self.current_page_image())
                        self.manager.next_document()
                    return
                self.document.set_bottom_padding(lower_limit - max_y)
            if epf:
                self.flipper.initialize(self.current_page_image())
            max_y = self.document.height - window_height
            lower_limit = min(max_y, lower_limit)
            self.document.scroll_to(self.document.xpos, lower_limit)
            actually_scrolled = self.document.ypos - opos
            self.find_next_blank_line(window_height - actually_scrolled)
            if epf:
                self.flipper(self.current_page_image(), duration=self.document.page_flip_duration)
            if self.manager is not None:
                self.manager.scrolled(self.scroll_fraction)

    def page_turn_requested(self, backwards):
        """Handle page turn requests."""
        if backwards:
            self.previous_page()
        else:
            self.next_page()

    def current_page_image(self, overlap=-1):
        """Get the current page image."""
        if overlap < 0:
            overlap = self.height()
        img = QImage(self.width(), overlap, QImage.Format_ARGB32_Premultiplied)
        painter = QPainter(img)
        painter.setRenderHints(self.renderHints())
        self.document.mainFrame().render(painter, QRegion(0, 0, self.width(), overlap))
        painter.end()
        return img

    def find_next_blank_line(self, overlap):
        """Find the next blank line."""
        img = self.current_page_image(overlap)
        for i in range(overlap-1, -1, -1):
            if self.test_line(img, i):
                self.scroll_by(y=i, notify=False)
                return
        self.scroll_by(y=overlap)

    def test_line(self, img, y):
        """Test if a line contains pixels of exactly the same color."""
        start = img.pixel(0, y)
        for i in range(1, img.width()):
            if img.pixel(i, y) != start:
                return False
        return True