#!/usr/bin/env python2
# vim:fileencoding=UTF-8:ts=4:sw=4:sta:et:sts=4:ai
from __future__ import (unicode_literals, division, absolute_import,
                        print_function)

__license__   = 'GPL v3'
__copyright__ = '2011, Kovid Goyal <kovid@kovidgoyal.net>'
__docformat__ = 'restructuredtext en'

import textwrap, re, os, shutil, weakref
from datetime import date, datetime

from PyQt5.Qt import (
    Qt, QDateTimeEdit, pyqtSignal, QMessageBox, QIcon, QToolButton, QWidget,
    QLabel, QGridLayout, QApplication, QDoubleSpinBox, QListWidgetItem, QSize,
    QPixmap, QDialog, QMenu, QLineEdit, QSizePolicy, QKeySequence,
    QDialogButtonBox, QAction, QCalendarWidget, QDate, QDateTime, QUndoCommand,
    QUndoStack, QVBoxLayout, QPlainTextEdit)

from calibre.gui2.widgets import EnLineEdit, FormatList as _FormatList, ImageView
from calibre.gui2.widgets2 import access_key, populate_standard_spinbox_context_menu, RightClickButton, Dialog, RatingEditor
from calibre.utils.icu import sort_key
from calibre.utils.config import tweaks, prefs
from calibre.ebooks.metadata import (
    title_sort, string_to_authors, check_isbn, authors_to_sort_string)
from calibre.ebooks.metadata.meta import get_metadata
from calibre.gui2 import (file_icon_provider, UNDEFINED_QDATETIME,
        choose_files, error_dialog, choose_images)
from calibre.gui2.complete2 import EditWithComplete
from calibre.utils.date import (
    local_tz, qt_to_dt, as_local_time, UNDEFINED_DATE, is_date_undefined,
    utcfromtimestamp, parse_only_date)
from calibre import strftime
from calibre.ebooks import BOOK_EXTENSIONS
from calibre.customize.ui import run_plugins_on_import
from calibre.gui2.comments_editor import Editor
from calibre.library.comments import comments_to_html
from calibre.gui2.dialogs.tag_editor import TagEditor
from calibre.utils.icu import strcmp
from calibre.ptempfile import PersistentTemporaryFile, SpooledTemporaryFile
from calibre.gui2.languages import LanguagesEdit as LE
from calibre.db import SPOOL_SIZE

OK_COLOR = 'rgba(0, 255, 0, 12%)'
ERR_COLOR = 'rgba(255, 0, 0, 12%)'
INDICATOR_SHEET = 'QLineEdit { color: black; background-color: %s }'


def save_dialog(parent, title, msg, det_msg=''):
    d = QMessageBox(parent)
    d.setWindowTitle(title)
    d.setText(msg)
    d.setStandardButtons(QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel)
    return d.exec_()


def clean_text(x):
    return re.sub(r'\s', ' ', x.strip())


class ToMetadataMixin(object):
    FIELD_NAME = None
    allow_undo = False

    def apply_to_metadata(self, mi):
        mi.set(self.FIELD_NAME, self.current_val)

    def set_value(self, val, allow_undo=True):
        self.allow_undo = allow_undo
        try:
            self.current_val = val
        finally:
            self.allow_undo = False

    def set_text(self, text):
        if self.allow_undo:
            self.selectAll(), self.insert(text)
        else:
            self.setText(text)

    def set_edit_text(self, text):
        if self.allow_undo:
            orig, self.disable_popup = self.disable_popup, True
            try:
                self.lineEdit().selectAll(), self.lineEdit().insert(text)
            finally:
                self.disable_popup = orig
        else:
            self.setEditText(text)


def make_undoable(spinbox):
    class UndoCommand(QUndoCommand):
        def __init__(self, widget, val):
            QUndoCommand.__init__(self)
            self.widget = weakref.ref(widget)
            if hasattr(widget, 'dateTime'):
                self.undo_val = widget.dateTime()
            elif hasattr(widget, 'value'):
                self.undo_val = widget.value()
            if isinstance(val, date) and not isinstance(val, datetime):
                val = parse_only_date(val.isoformat(), assume_utc=False, as_utc=False)
            self.redo_val = val

        def undo(self):
            w = self.widget()
            if hasattr(w, 'setDateTime'):
                w.setDateTime(self.undo_val)
            elif hasattr(w, 'setValue'):
                w.setValue(self.undo_val)

        def redo(self):
            w = self.widget()
            if hasattr(w, 'setDateTime'):
                w.setDateTime(self.redo_val)
            elif hasattr(w, 'setValue'):
                w.setValue(self.redo_val)

    class UndoableSpinbox(spinbox):
        def __init__(self, parent=None):
            spinbox.__init__(self, parent)
            self.undo_stack = QUndoStack(self)
            self.undo, self.redo = self.undo_stack.undo, self.undo_stack.redo

        def keyPressEvent(self, ev):
            if ev == QKeySequence.Undo:
                self.undo()
                return ev.accept()
            if ev == QKeySequence.Redo:
                self.redo()
                return ev.accept()
            return spinbox.keyPressEvent(self, ev)

        def contextMenuEvent(self, ev):
            m = QMenu(self)
            if hasattr(self, 'setDateTime'):
                m.addAction(_('Set date to undefined') + '\t' + QKeySequence(Qt.Key_Minus).toString(QKeySequence.NativeText),
                            lambda: self.setDateTime(self.minimumDateTime()))
            m.addAction(_('&Undo') + access_key(QKeySequence.Undo), self.undo).setEnabled(self.undo_stack.canUndo())
            m.addAction(_('&Redo') + access_key(QKeySequence.Redo), self.redo).setEnabled(self.undo_stack.canRedo())
            m.addSeparator()
            populate_standard_spinbox_context_menu(self, m)
            m.popup(ev.globalPos())

        def set_spinbox_value(self, val):
            if self.allow_undo:
                cmd = UndoCommand(self, val)
                self.undo_stack.push(cmd)
            else:
                self.undo_stack.clear()
            if hasattr(self, 'setDateTime'):
                if isinstance(val, date) and not isinstance(val, datetime) and not is_date_undefined(val):
                    val = parse_only_date(val.isoformat(), assume_utc=False, as_utc=False)
                self.setDateTime(val)
            elif hasattr(self, 'setValue'):
                self.setValue(val)

    return UndoableSpinbox


class IdentifiersEdit(QLineEdit, ToMetadataMixin):
    LABEL = _('I&ds:')
    BASE_TT = _('Edit the identifiers for this book. '
                'For example: \n\n%s') % (
        'isbn:1565927249, doi:10.1000/182, amazon:1565927249')
    FIELD_NAME = 'identifiers'

    def __init__(self, parent):
        QLineEdit.__init__(self, parent)
        self.pat = re.compile(r'[^0-9a-zA-Z]')
        self.textChanged.connect(self.validate)

    def contextMenuEvent(self, ev):
        m = self.createStandardContextMenu()
        first = m.actions()[0]
        ac = m.addAction(_('Edit identifiers in a dedicated window'), self.edit_identifiers)
        m.insertAction(first, ac)
        m.insertSeparator(first)
        m.exec_(ev.globalPos())

    def edit_identifiers(self):
        d = Identifiers(self.current_val, self)
        if d.exec_() == d.Accepted:
            self.current_val = d.get_identifiers()

    def _parse_identifiers_text(self, text):
        raw = text.strip()
        parts = [clean_text(x) for x in raw.split(',')]
        ans = {}
        for part in parts:
            if ':' not in part:
                continue
            itype, value = part.split(':', 1)
            itype = itype.lower()
            if itype == 'isbn':
                v = check_isbn(value)
                if v is not None:
                    value = v
            ans[itype] = value
        return ans

    def _format_identifiers(self, val):
        if not val:
            return ''
        def sort_key_func(item):
            key = item[0]
            return '00isbn' if key == 'isbn' else key
        sorted_items = sorted(val.items(), key=sort_key_func)
        txt = ', '.join(['%s:%s' % (k.lower(), v) for k, v in sorted_items])
        return txt.strip()

    @dynamic_property
    def current_val(self):
        def fget(self):
            return self._parse_identifiers_text(unicode(self.text()))
        def fset(self, val):
            txt = self._format_identifiers(val)
            self.selectAll()
            self.insert(txt)
            self.setCursorPosition(0)
        return property(fget=fget, fset=fset)

    def initialize(self, db, id_):
        self.original_val = db.get_identifiers(id_, index_is_id=True)
        self.current_val = self.original_val

    def commit(self, db, id_):
        if self.original_val != self.current_val:
            db.set_identifiers(id_, self.current_val, notify=False, commit=False)

    def validate(self, *args):
        identifiers = self.current_val
        isbn = identifiers.get('isbn', '')
        tt = self.BASE_TT
        if not isbn:
            col = 'none'
            extra = ''
        elif check_isbn(isbn) is not None:
            col = OK_COLOR
            extra = '\n\n' + _('This ISBN number is valid')
        else:
            col = ERR_COLOR
            extra = '\n\n' + _('This ISBN number is invalid')
        self.setToolTip(tt + extra)
        self.setStyleSheet(INDICATOR_SHEET % col)

    def paste_isbn(self):
        text = unicode(QApplication.clipboard().text()).strip()
        if not text or not check_isbn(text):
            d = ISBNDialog(self, text)
            if not d.exec_():
                return
            text = d.text()
            if not text:
                return
        text = check_isbn(text)
        if text:
            vals = self.current_val
            vals['isbn'] = text
            self.current_val = vals

class ISBNDialog(QDialog):
    def __init__(self, parent, txt):
        QDialog.__init__(self, parent)
        l = QGridLayout()
        self.setLayout(l)
        self.setWindowTitle(_('Invalid ISBN'))
        w = QLabel(_('Enter an ISBN'))
        l.addWidget(w, 0, 0, 1, 2)
        w = QLabel(_('ISBN:'))
        l.addWidget(w, 1, 0, 1, 1)
        self.line_edit = w = QLineEdit()
        w.setText(txt)
        w.selectAll()
        w.textChanged.connect(self.checkText)
        l.addWidget(w, 1, 1, 1, 1)
        w = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        l.addWidget(w, 2, 0, 1, 2)
        w.accepted.connect(self.accept)
        w.rejected.connect(self.reject)
        self.checkText(self.text())
        sz = self.sizeHint()
        sz.setWidth(sz.width() + 50)
        self.resize(sz)

    def accept(self):
        isbn = unicode(self.line_edit.text())
        if not check_isbn(isbn):
            return error_dialog(self, _('Invalid ISBN'),
                                _('The ISBN you entered is not valid. Try again.'),
                                show=True)
        QDialog.accept(self)

    def checkText(self, txt):
        isbn = unicode(txt)
        if not isbn:
            col = 'none'
            extra = ''
        elif check_isbn(isbn) is not None:
            col = OK_COLOR
            extra = _('This ISBN number is valid')
        else:
            col = ERR_COLOR
            extra = _('This ISBN number is invalid')
        self.line_edit.setToolTip(extra)
        self.line_edit.setStyleSheet(INDICATOR_SHEET % col)

    def text(self):
        return check_isbn(unicode(self.line_edit.text()))