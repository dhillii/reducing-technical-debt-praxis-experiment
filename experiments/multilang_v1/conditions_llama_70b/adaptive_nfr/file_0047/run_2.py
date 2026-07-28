class DocumentView(QWebView):
    # ...

    def handle_key_press(self, event):
        handled = True
        key = self.shortcuts.get_match(event)
        func = self.goto_location_actions.get(key, None)
        if func is not None:
            self.is_auto_repeat_event = event.isAutoRepeat()
            try:
                func()
            finally:
                self.is_auto_repeat_event = False
        elif key in ['Down', 'Up', 'Left', 'Right']:
            handled = self.handle_arrow_key_press(key, event)
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

    def handle_arrow_key_press(self, key, event):
        if self.document.in_paged_mode:
            return self.handle_paged_mode_arrow_key_press(key)
        else:
            return self.handle_scrolling_mode_arrow_key_press(key)

    def handle_paged_mode_arrow_key_press(self, key):
        if key == 'Down':
            self.paged_col_scroll(scroll_past_end=not
                    self.document.line_scrolling_stops_on_pagebreaks)
        elif key == 'Up':
            self.paged_col_scroll(forward=False, scroll_past_end=not
                    self.document.line_scrolling_stops_on_pagebreaks)
        elif key == 'Left':
            self.paged_col_scroll(forward=False)
        elif key == 'Right':
            self.paged_col_scroll()
        return True

    def handle_scrolling_mode_arrow_key_press(self, key):
        if key == 'Down':
            if (not self.document.line_scrolling_stops_on_pagebreaks and
                    self.document.at_bottom):
                self.manager.next_document()
            else:
                amt = int((self.document.line_scroll_fraction / 100.) * 15)
                self.scroll_by(y=amt)
        elif key == 'Up':
            if (not self.document.line_scrolling_stops_on_pagebreaks and
                    self.document.at_top):
                self.manager.previous_document()
            else:
                amt = int((self.document.line_scroll_fraction / 100.) * 15)
                self.scroll_by(y=-amt)
        elif key == 'Left':
            amt = int((self.document.line_scroll_fraction / 100.) * 15)
            self.scroll_by(x=-amt)
        elif key == 'Right':
            amt = int((self.document.line_scroll_fraction / 100.) * 15)
            self.scroll_by(x=amt)
        return True

    # ...

    def wheelEvent(self, event):
        if event.phase() not in (Qt.ScrollUpdate, 0):
            return
        mods = event.modifiers()
        num_degrees = event.angleDelta().y() // 8
        if mods & Qt.CTRL:
            if self.manager is not None and num_degrees != 0:
                (self.manager.font_size_larger if num_degrees > 0 else
                        self.manager.font_size_smaller)()
                return

        if self.document.in_paged_mode:
            return self.handle_paged_mode_wheel_event(event, num_degrees)
        else:
            return self.handle_scrolling_mode_wheel_event(event, num_degrees)

    def handle_paged_mode_wheel_event(self, event, num_degrees):
        if abs(num_degrees) < 15:
            return
        typ = 'screen' if self.document.wheel_flips_pages else 'col'
        direction = 'next' if num_degrees < 0 else 'previous'
        loc = self.document.javascript('paged_display.%s_%s_location()'%(
            direction, typ), typ='int')
        if loc > -1:
            self.document.scroll_to(x=loc, y=0)
            self.manager.scrolled(self.scroll_fraction)
            event.accept()
        elif self.manager is not None:
            if direction == 'next':
                self.manager.next_document()
            else:
                self.manager.previous_document()
            event.accept()
        return

    def handle_scrolling_mode_wheel_event(self, event, num_degrees):
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

    # ...