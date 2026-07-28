#!/usr/bin/env python2
# vim:fileencoding=utf-8
from __future__ import (unicode_literals, division, absolute_import,
                        print_function)

__license__ = 'GPL v3'
__copyright__ = '2013, Kovid Goyal <kovid at kovidgoyal.net>'

import os
import sys
import shutil
import tempfile
from functools import partial, wraps
from urlparse import urlparse

from PyQt5.Qt import (QObject, QApplication, QDialog, QGridLayout, QLabel,
                      QSize, Qt, QDialogButtonBox, QIcon, QInputDialog, QUrl,
                      pyqtSignal)

from calibre import prints, isbytestring
from calibre.constants import cache_dir, iswindows
from calibre.ptempfile import PersistentTemporaryDirectory, TemporaryDirectory
from calibre.ebooks.oeb.base import urlnormalize
from calibre.ebooks.oeb.polish.main import SUPPORTED, tweak_polish
from calibre.ebooks.oeb.polish.container import (get_container as _gc,
                                                 clone_container, guess_type,
                                                 OEB_DOCS, OEB_STYLES)
from calibre.ebooks.oeb.polish.cover import mark_as_cover, mark_as_titlepage, set_cover
from calibre.ebooks.oeb.polish.css import filter_css
from calibre.ebooks.oeb.polish.pretty import fix_all_html, pretty_all
from calibre.ebooks.oeb.polish.replace import (rename_files, replace_file,
                                               get_recommended_folders,
                                               rationalize_folders)
from calibre.ebooks.oeb.polish.split import (split, merge, AbortError,
                                             multisplit)
from calibre.ebooks.oeb.polish.toc import remove_names_from_toc, create_inline_toc
from calibre.ebooks.oeb.polish.utils import link_stylesheets, setup_cssutils_serialization as scs
from calibre.gui2 import (error_dialog, choose_files, question_dialog,
                          info_dialog, choose_save_file, open_url, choose_dir)
from calibre.gui2.dialogs.confirm_delete import confirm
from calibre.gui2.tweak_book import (set_current_container, current_container,
                                     tprefs, actions, editors,
                                     set_book_locale, dictionaries,
                                     editor_name)
from calibre.gui2.tweak_book.completion.worker import completion_worker
from calibre.gui2.tweak_book.undo import GlobalUndoHistory
from calibre.gui2.tweak_book.file_list import NewFileDialog
from calibre.gui2.tweak_book.save import (SaveManager, save_container,
                                          find_first_existing_ancestor)
from calibre.gui2.tweak_book.preview import parse_worker
from calibre.gui2.tweak_book.toc import TOCEditor
from calibre.gui2.tweak_book.editor import editor_from_syntax, syntax_from_mime
from calibre.gui2.tweak_book.editor.insert_resource import get_resource_data, NewBook
from calibre.gui2.tweak_book.preferences import Preferences
from calibre.gui2.tweak_book.search import (validate_search_request,
                                            run_search)
from calibre.gui2.tweak_book.spell import (find_next as find_next_word,
                                           find_next_error)
from calibre.gui2.tweak_book.widgets import (RationalizeFolders, MultiSplit,
                                             ImportForeign, QuickOpen,
                                             InsertLink, InsertSemantics,
                                             BusyCursor, InsertTag, FilterCSS,
                                             AddCover)
from calibre.utils.config import JSONConfig
from calibre.utils.icu import numeric_sort_key
from calibre.utils.imghdr import identify

_diff_dialogs = []
last_used_transform_rules = []


def get_container(*args, **kwargs):
    """Create a container in tweak mode."""
    kwargs['tweak_mode'] = True
    return _gc(*args, **kwargs)


def setup_cssutils_serialization():
    """Configure cssutils based on user preferences."""
    scs(tprefs['editor_tab_stop_width'])


def in_thread_job(func):
    """Run a function with a busy cursor."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        with BusyCursor():
            return func(*args, **kwargs)
    return wrapper


def get_boss():
    """Return the global Boss instance."""
    return get_boss.boss


class Boss(QObject):
    """Main controller for the Tweak Book UI."""

    handle_completion_result_signal = pyqtSignal(object)

    def __init__(self, parent, notify=None):
        QObject.__init__(self, parent)
        self.global_undo = GlobalUndoHistory()
        self.container_count = 0
        self.tdir = None
        self.save_manager = SaveManager(parent, notify)
        self.save_manager.report_error.connect(self.report_save_error)
        self.save_manager.check_for_completion.connect(self.check_terminal_save)
        self.doing_terminal_save = False
        self.ignore_preview_to_editor_sync = False
        setup_cssutils_serialization()
        get_boss.boss = self
        self.gui = parent
        completion_worker().result_callback = self.handle_completion_result_signal.emit
        self.handle_completion_result_signal.connect(self.handle_completion_result,
                                                     Qt.QueuedConnection)
        self.completion_request_count = 0
        self.editor_cache = JSONConfig('editor-cache', base_path=cache_dir())
        d = self.editor_cache.defaults
        d['edit_book_state'] = {}
        d['edit_book_state_order'] = []

    def __call__(self, gui):
        """Connect UI signals to handler methods."""
        self.gui = gui
        self._connect_file_list_signals()
        self._connect_central_signals()
        self._connect_preview_signals()
        self._connect_check_book_signals()
        self._connect_toc_view_signals()
        self._connect_image_browser_signals()
        self._connect_checkpoints_signals()
        self._connect_saved_searches_signals()
        self._connect_spell_check_signals()
        self._connect_live_css_signals()
        self._connect_manage_fonts_signals()
        self._connect_reports_signals()

    # -------------------------------------------------------------------------
    # Signal connection helpers
    # -------------------------------------------------------------------------

    def _connect_file_list_signals(self):
        fl = self.gui.file_list
        fl.delete_requested.connect(self.delete_requested)
        fl.reorder_spine.connect(self.reorder_spine)
        fl.rename_requested.connect(self.rename_requested)
        fl.bulk_rename_requested.connect(self.bulk_rename_requested)
        fl.edit_file.connect(self.edit_file_requested)
        fl.merge_requested.connect(self.merge_requested)
        fl.mark_requested.connect(self.mark_requested)
        fl.export_requested.connect(self.export_requested)
        fl.replace_requested.connect(self.replace_requested)
        fl.link_stylesheets_requested.connect(self.link_stylesheets_requested)

    def _connect_central_signals(self):
        self.gui.central.current_editor_changed.connect(self.apply_current_editor_state)
        self.gui.central.close_requested.connect(self.editor_close_requested)
        self.gui.central.search_panel.search_triggered.connect(self.search)

    def _connect_preview_signals(self):
        self.gui.preview.sync_requested.connect(self.sync_editor_to_preview)
        self.gui.preview.split_start_requested.connect(self.split_start_requested)
        self.gui.preview.split_requested.connect(self.split_requested)
        self.gui.preview.link_clicked.connect(self.link_clicked)

    def _connect_check_book_signals(self):
        self.gui.check_book.item_activated.connect(self.check_item_activated)
        self.gui.check_book.check_requested.connect(self.check_requested)
        self.gui.check_book.fix_requested.connect(self.fix_requested)

    def _connect_toc_view_signals(self):
        self.gui.toc_view.navigate_requested.connect(self.link_clicked)
        self.gui.toc_view.refresh_requested.connect(self.commit_all_editors_to_container)

    def _connect_image_browser_signals(self):
        self.gui.image_browser.image_activated.connect(self.image_activated)

    def _connect_checkpoints_signals(self):
        self.gui.checkpoints.revert_requested.connect(self.revert_requested)
        self.gui.checkpoints.compare_requested.connect(self.compare_requested)

    def _connect_saved_searches_signals(self):
        self.gui.saved_searches.run_saved_searches.connect(self.run_saved_searches)
        self.gui.central.search_panel.save_search.connect(self.save_search)
        self.gui.central.search_panel.show_saved_searches.connect(self.show_saved_searches)

    def _connect_spell_check_signals(self):
        self.gui.spell_check.find_word.connect(self.find_word)
        self.gui.spell_check.refresh_requested.connect(self.commit_all_editors_to_container)
        self.gui.spell_check.word_replaced.connect(self.word_replaced)
        self.gui.spell_check.word_ignored.connect(self.word_ignored)
        self.gui.spell_check.change_requested.connect(self.word_change_requested)

    def _connect_live_css_signals(self):
        self.gui.live_css.goto_declaration.connect(self.goto_style_declaration)

    def _connect_manage_fonts_signals(self):
        self.gui.manage_fonts.container_changed.connect(self.apply_container_update_to_gui)
        self.gui.manage_fonts.embed_all_fonts.connect(self.manage_fonts_embed)
        self.gui.manage_fonts.subset_all_fonts.connect(self.manage_fonts_subset)

    def _connect_reports_signals(self):
        self.gui.reports.edit_requested.connect(self.reports_edit_requested)
        self.gui.reports.refresh_starting.connect(self.commit_all_editors_to_container)
        self.gui.reports.delete_requested.connect(self.delete_requested)

    # -------------------------------------------------------------------------
    # Properties
    # -------------------------------------------------------------------------

    @property
    def currently_editing(self):
        """Return the name of the file being edited currently or None."""
        return editor_name(self.gui.central.current_editor)

    # -------------------------------------------------------------------------
    # Preference handling
    # -------------------------------------------------------------------------

    def preferences(self):
        """Show the preferences dialog and apply changes."""
        orig_spell = tprefs['inline_spell_check']
        orig_size = tprefs['toolbar_icon_size']
        p = Preferences(self.gui)
        ret = p.exec_()
        if p.dictionaries_changed:
            dictionaries.clear_caches()
            dictionaries.initialize(force=True)
        if p.toolbars_changed:
            self.gui.populate_toolbars()
            for ed in editors.itervalues():
                if hasattr(ed, 'populate_toolbars'):
                    ed.populate_toolbars()
        if orig_size != tprefs['toolbar_icon_size']:
            self._update_toolbar_icon_sizes()
        if ret == p.Accepted:
            setup_cssutils_serialization()
            self.gui.apply_settings()
            self.refresh_file_list()
        if ret == p.Accepted or p.dictionaries_changed:
            for ed in editors.itervalues():
                ed.apply_settings(dictionaries_changed=p.dictionaries_changed)
        if orig_spell != tprefs['inline_spell_check']:
            self._refresh_spell_check_status()

    def _update_toolbar_icon_sizes(self):
        """Update toolbar icon sizes after a preference change."""
        for ed in editors.itervalues():
            if hasattr(ed, 'bars'):
                for bar in ed.bars:
                    bar.setIconSize(QSize(tprefs['toolbar_icon_size'],
                                          tprefs['toolbar_icon_size']))

    def _refresh_spell_check_status(self):
        """Refresh spell checking after a preference change."""
        from calibre.gui2.tweak_book.editor.syntax.html import refresh_spell_check_status
        refresh_spell_check_status()
        for ed in editors.itervalues():
            try:
                ed.editor.highlighter.rehighlight()
            except AttributeError:
                pass

    # -------------------------------------------------------------------------
    # Mark handling
    # -------------------------------------------------------------------------

    def mark_requested(self, name, action):
        """Mark a file as cover or titlepage."""
        self.commit_dirty_opf()
        c = current_container()
        if action == 'cover':
            mark_as_cover(c, name)
        elif action.startswith('titlepage:'):
            _, move_to_start = action.partition(':')[0::2]
            move_to_start = move_to_start == 'True'
            mark_as_titlepage(c, name, move_to_start=move_to_start)
        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
        self.gui.file_list.build(c)
        self.set_modified()

    # -------------------------------------------------------------------------
    # Temporary directory handling
    # -------------------------------------------------------------------------

    def mkdtemp(self, prefix=''):
        """Create a temporary directory for container operations."""
        self.container_count += 1
        return tempfile.mkdtemp(prefix='%s%05d-' % (prefix, self.container_count),
                                dir=self.tdir)

    # -------------------------------------------------------------------------
    # Open book workflow
    # -------------------------------------------------------------------------

    def _check_before_open(self):
        """Validate that the current book can be closed before opening another."""
        if self.gui.action_save.isEnabled():
            if not question_dialog(self.gui, _('Unsaved changes'), _(
                    'The current book has unsaved changes. If you open a new book, they will be lost.'
                    ' Are you sure you want to proceed?')):
                return False
        if self.save_manager.has_tasks:
            info_dialog(self.gui, _('Cannot open'),
                        _('The current book is being saved, you cannot open a new book until'
                          ' the saving is completed'), show=True)
            return False
        return True

    def new_book(self):
        """Create a new book from metadata."""
        if not self._check_before_open():
            return
        d = NewBook(self.gui)
        if d.exec_() == d.Accepted:
            fmt = d.fmt.lower()
            path = choose_save_file(self.gui, 'edit-book-new-book',
                                    _('Choose file location'),
                                    filters=[(fmt.upper(), (fmt,))],
                                    all_files=False)
            if path:
                if not path.lower().endswith('.' + fmt):
                    path += '.' + fmt
                from calibre.ebooks.oeb.polish.create import create_book
                create_book(d.mi, path, fmt=fmt)
                self.open_book(path=path)

    def import_book(self, path=None):
        """Import an external book into the editor."""
        if not self._check_before_open():
            return
        d = ImportForeign(self.gui)
        if hasattr(path, 'rstrip'):
            d.set_src(os.path.abspath(path))
        if d.exec_() == d.Accepted:
            for name in tuple(editors):
                self.close_editor(name)
            from calibre.ebooks.oeb.polish.import_book import import_book_as_epub
            src, dest = d.data
            self._clear_notify_data = True

            def _import(src_path, dest_path, tdir):
                import_book_as_epub(src_path, dest_path)
                return get_container(dest_path, tdir=tdir)

            self.gui.blocking_job('import_book',
                                  _('Importing book, please wait...'),
                                  self.book_opened,
                                  _import,
                                  src, dest,
                                  tdir=self.mkdtemp())

    def open_book(self, path=None, edit_file=None,
                  clear_notify_data=True, open_folder=False):
        """Open a book for editing."""
        path = self._resolve_path_argument(path, open_folder)
        if not path or not self._check_before_open():
            return
        if not os.path.exists(path):
            error_dialog(self.gui, _('File not found'), _(
                'The file %s does not exist.') % path, show=True)
            return
        if not self._validate_supported_format(path):
            return
        self._reset_state_before_open()
        self._edit_file_on_open = edit_file
        self._clear_notify_data = clear_notify_data
        self.gui.blocking_job('open_book',
                              _('Opening book, please wait...'),
                              self.book_opened,
                              get_container,
                              path,
                              tdir=self.mkdtemp())

    def _resolve_path_argument(self, path, open_folder):
        """Resolve the path argument for open_book."""
        if isinstance(path, (list, tuple)) and path:
            path = path[-1]
        if not hasattr(path, 'rpartition'):
            if open_folder:
                path = choose_dir(self.gui,
                                  'open-book-folder-for-tweaking',
                                  _('Choose book folder'))
                if path:
                    return [path]
            else:
                path = choose_files(self.gui,
                                    'open-book-for-tweaking',
                                    _('Choose book'),
                                    [(_('Books'), [x.lower() for x in SUPPORTED])],
                                    all_files=False,
                                    select_only_single_file=True)
                if not path:
                    return None
                return path[0]
        return path

    def _validate_supported_format(self, path):
        """Check if the file format is supported for tweaking."""
        isdir = os.path.isdir(path)
        ext = path.rpartition('.')[-1].upper()
        if ext not in SUPPORTED and not isdir:
            from calibre.ebooks.oeb.polish.import_book import IMPORTABLE
            if ext.lower() in IMPORTABLE:
                self.import_book(path)
                return False
            error_dialog(self.gui, _('Unsupported format'), _(
                'Tweaking is only supported for books in the %s formats.'
                ' Convert your book to one of these formats first.') % _(' and ').join(sorted(SUPPORTED)),
                         show=True)
            return False
        return True

    def _reset_state_before_open(self):
        """Reset UI and temporary state before opening a new book."""
        for name in tuple(editors):
            self.close_editor(name)
        self.gui.preview.clear()
        self.gui.live_css.clear()
        self.container_count = -1
        if self.tdir:
            shutil.rmtree(self.tdir, ignore_errors=True)
        self.tdir = PersistentTemporaryDirectory()

    def book_opened(self, job):
        """Handle the result of opening a book."""
        if job.traceback:
            self._handle_open_error(job.traceback)
            return
        if getattr(self, '_clear_notify_data', True):
            self.save_manager.clear_notify_data()
        self._post_open_initialisation(job.result)

    def _handle_open_error(self, traceback_text):
        """Display an error dialog for book opening failures."""
        if 'DRMError:' in traceback_text:
            from calibre.gui2.dialogs.drm_error import DRMErrorMessage
            DRMErrorMessage(self.gui).exec_()
            return
        if 'ObfuscationKeyMissing:' in traceback_text:
            error_dialog(self.gui, _('Failed to open book'), _(
                'Failed to open book, it has obfuscated fonts, but the obfuscation key is missing from the OPF.'
                ' Do an EPUB to EPUB conversion before trying to edit this book.'), show=True)
            return
        error_dialog(self.gui, _('Failed to open book'), _(
            'Failed to open book, click "Show details" for more information.'),
                     det_msg=traceback_text, show=True)

    def _post_open_initialisation(self, container):
        """Finalize UI updates after a book has been opened."""
        set_current_container(container)
        completion_worker().clear_caches()
        with BusyCursor():
            self.current_metadata = self.gui.current_metadata = container.mi
            lang = container.opf_xpath('//dc:language/text()') or [self.current_metadata.language]
            set_book_locale(lang[0])
            self.global_undo.open_book(container)
            self.gui.update_window_title()
            self.gui.file_list.current_edited_name = None
            self.gui.file_list.build(container, preserve_state=False)
            self.gui.action_save.setEnabled(False)
            self.update_global_history_actions()
            self._update_recent_books(container.path_to_ebook)
            if iswindows:
                self._add_to_windows_recent(container.path_to_ebook)
            self._handle_edit_file_on_open()
            self.gui.toc_view.update_if_visible()
            self.add_savepoint(_('Start of editing session'))

    def _update_recent_books(self, path):
        """Maintain the list of recent books."""
        recent = list(tprefs.get('recent-books', []))
        path = os.path.abspath(path)
        if path in recent:
            recent.remove(path)
        recent.insert(0, path)
        tprefs['recent-books'] = recent[:10]
        self.gui.update_recent_books()

    def _add_to_windows_recent(self, path):
        """Add the opened book to Windows recent documents."""
        try:
            from win32com.shell import shell, shellcon
            shell.SHAddToRecentDocs(shellcon.SHARD_PATHW, path)
        except Exception:
            import traceback
            traceback.print_exc()

    def _handle_edit_file_on_open(self):
        """Open a specific file after the book is loaded, if requested."""
        ef = getattr(self, '_edit_file_on_open', None)
        self._edit_file_on_open = None
        if ef:
            if isinstance(ef, type('')):
                ef = [ef]
            map(self.gui.file_list.request_edit, ef)
        else:
            if tprefs['restore_book_state']:
                self.restore_book_edit_state()

    # -------------------------------------------------------------------------
    # Global undo/redo handling
    # -------------------------------------------------------------------------

    def do_global_undo(self):
        """Undo the last global operation."""
        container = self.global_undo.undo()
        if container:
            set_current_container(container)
            self.apply_container_update_to_gui()

    def do_global_redo(self):
        """Redo the last undone global operation."""
        container = self.global_undo.redo()
        if container:
            set_current_container(container)
            self.apply_container_update_to_gui()

    def update_global_history_actions(self):
        """Enable/disable global undo/redo actions."""
        gu = self.global_undo
        for key, text in (('undo', _('&Revert to')), ('redo', _('&Revert to'))):
            action = getattr(self.gui, 'action_global_%s' % key)
            action.setEnabled(getattr(gu, 'can_' + key))
            action.setText(text + ' "%s"' % (getattr(gu, key + '_msg') or '...'))

    def add_savepoint(self, msg):
        """Create a restore checkpoint."""
        self.commit_all_editors_to_container()
        nc = clone_container(current_container(), self.mkdtemp())
        self.global_undo.add_savepoint(nc, msg)
        set_current_container(nc)
        self.update_global_history_actions()

    def rewind_savepoint(self):
        """Undo the creation of the most recent savepoint."""
        container = self.global_undo.rewind_savepoint()
        if container:
            set_current_container(container)
            self.update_global_history_actions()

    # -------------------------------------------------------------------------
    # File operations
    # -------------------------------------------------------------------------

    @in_thread_job
    def delete_requested(self, spine_items, other_items):
        """Delete selected files from the book."""
        self.add_savepoint(_('Before: Delete files'))
        self.commit_dirty_opf()
        c = current_container()
        c.remove_from_spine(spine_items)
        for name in other_items:
            c.remove_item(name)
        self.set_modified()
        self.gui.file_list.delete_done(spine_items, other_items)
        self._close_deleted_editors(spine_items, other_items)
        self._update_toc_after_deletion(c, spine_items, other_items)

    def _close_deleted_editors(self, spine_items, other_items):
        """Close editors for files that were deleted."""
        spine_names = [x for x, remove in spine_items if remove]
        for name in spine_names + list(other_items):
            if name in editors:
                self.close_editor(name)
        if not editors:
            self.gui.preview.clear()
            self.gui.live_css.clear()

    def _update_toc_after_deletion(self, container, spine_items, other_items):
        """Remove deleted items from the TOC."""
        changed = remove_names_from_toc(container,
                                        spine_items + list(other_items))
        if changed:
            self.gui.toc_view.update_if_visible()
            for toc in changed:
                if toc and toc in editors:
                    editors[toc].replace_data(container.raw_data(toc))
        if container.opf_name in editors:
            editors[container.opf_name].replace_data(container.raw_data(container.opf_name))

    def commit_dirty_opf(self):
        """Ensure the OPF file is saved if it has unsaved changes."""
        c = current_container()
        if c.opf_name in editors and not editors[c.opf_name].is_synced_to_container:
            self.commit_editor_to_container(c.opf_name)

    def reorder_spine(self, items):
        """Reorder the spine of the book."""
        self.add_savepoint(_('Before: Re-order text'))
        c = current_container()
        c.set_spine(items)
        self.set_modified()
        self.gui.file_list.build(current_container())
        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
        completion_worker().clear_caches('names')

    def add_file(self):
        """Add a new file to the book."""
        if not self.ensure_book(_('You must first open a book to tweak, before trying to create new files in it.')):
            return
        self.commit_dirty_opf()
        d = NewFileDialog(self.gui)
        if d.exec_() != d.Accepted:
            return
        added_name = self.do_add_file(d.file_name, d.file_data,
                                      using_template=d.using_template,
                                      edit_file=True)
        if d.file_name.rpartition('.')[2].lower() in ('ttf', 'otf', 'woff'):
            from calibre.gui2.tweak_book.manage_fonts import show_font_face_rule_for_font_file
            show_font_face_rule_for_font_file(d.file_data, added_name, self.gui)

    def do_add_file(self, file_name, data, using_template=False, edit_file=False):
        """Core logic for adding a file."""
        self.add_savepoint(_('Before: Add file %s') % self.gui.elided_text(file_name))
        c = current_container()
        adata = data.replace(b'%CURSOR%', b'') if using_template else data
        try:
            added_name = c.add_file(file_name, adata)
        except Exception:
            self.rewind_savepoint()
            raise
        self.gui.file_list.build(c)
        self.gui.file_list.select_name(file_name)
        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
        mt = c.mime_map[file_name]
        syntax = syntax_from_mime(file_name, mt)
        if syntax and edit_file:
            if using_template:
                self.edit_file(file_name, syntax, use_template=data.decode('utf-8'))
            else:
                self.edit_file(file_name, syntax)
        self.set_modified()
        completion_worker().clear_caches('names')
        return added_name

    def add_files(self):
        """Bulk import files into the book."""
        if not self.ensure_book(_('You must first open a book to tweak, before trying to create new files in it.')):
            return
        files = choose_files(self.gui, 'tweak-book-bulk-import-files', _('Choose files'))
        if not files:
            return
        folder_map = get_recommended_folders(current_container(), files)
        files = {src: ('/'.join((folder, os.path.basename(src))) if folder else os.path.basename(src))
                 for src, folder in folder_map.iteritems()}
        self.add_savepoint(_('Before Add files'))
        c = current_container()
        for path in sorted(files, key=numeric_sort_key):
            name = files[path]
            name = self._ensure_unique_name(c, name)
            try:
                with open(path, 'rb') as f:
                    c.add_file(name, f.read())
            except Exception:
                self.rewind_savepoint()
                raise
        self.gui.file_list.build(c)
        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
        self.set_modified()
        completion_worker().clear_caches('names')

    def _ensure_unique_name(self, container, name):
        """Generate a unique name if a conflict exists."""
        i = 0
        base, ext = name.rpartition('.')[0::2]
        while container.exists(name) or container.manifest_has_name(name) or container.has_name_case_insensitive(name):
            i += 1
            name = f'{base}_{i}.{ext}'
        return name

    def add_cover(self):
        """Add a cover image to the book."""
        d = AddCover(current_container(), self.gui)
        d.import_requested.connect(self.do_add_file)
        try:
            if d.exec_() == d.Accepted and d.file_name:
                report = []
                with BusyCursor():
                    self.add_savepoint(_('Before: Add cover'))
                    set_cover(current_container(), d.file_name,
                              report.append,
                              options={'existing_image': True,
                                       'keep_aspect': tprefs['add_cover_preserve_aspect_ratio']})
                    self.apply_container_update_to_gui()
        finally:
            d.import_requested.disconnect()

    def ensure_book(self, msg):
        """Ensure a book is currently open."""
        if current_container() is None:
            error_dialog(self.gui, _('No book open'), msg, show=True)
            return False
        return True

    # -------------------------------------------------------------------------
    # Table of contents handling
    # -------------------------------------------------------------------------

    def edit_toc(self):
        """Edit the book's Table of Contents."""
        if not self.ensure_book(_('You must open a book before trying to edit the Table of Contents.')):
            return
        self.add_savepoint(_('Before: Edit Table of Contents'))
        d = TOCEditor(title=self.current_metadata.title, parent=self.gui)
        if d.exec_() != d.Accepted:
            self.rewind_savepoint()
            return
        with BusyCursor():
            self.set_modified()
            self.update_editors_from_container()
            self.gui.toc_view.update_if_visible()
            self.gui.file_list.build(current_container())

    def insert_inline_toc(self):
        """Insert an inline Table of Contents."""
        self.commit_all_editors_to_container()
        self.add_savepoint(_('Before: Insert inline Table of Contents'))
        name = create_inline_toc(current_container())
        if not name:
            self.rewind_savepoint()
            error_dialog(self.gui, _('No Table of Contents'), _(
                'Cannot create an inline Table of Contents as this book has no existing'
                ' Table of Contents. You must first create a Table of Contents using the'
                ' Edit Table of Contents tool.'), show=True)
            return
        self.apply_container_update_to_gui()
        self.edit_file(name, 'html')

    # -------------------------------------------------------------------------
    # Polish and transformation utilities
    # -------------------------------------------------------------------------

    def polish(self, action, name, parent=None):
        """Run a polish action on the book."""
        from calibre.gui2.tweak_book.polish import get_customization, show_report
        customization = get_customization(action, name, parent or self.gui)
        if customization is None:
            return
        with BusyCursor():
            self.add_savepoint(_('Before: %s') % name)
            try:
                report, changed = tweak_polish(current_container(),
                                               {action: True},
                                               customization=customization)
            except Exception:
                self.rewind_savepoint()
                raise
            if changed:
                self.apply_container_update_to_gui()
        if not changed:
            self.rewind_savepoint()
        show_report(changed, self.current_metadata.title, report,
                    parent or self.gui, self.show_current_diff)

    def transform_styles(self):
        """Transform CSS styles using user-defined rules."""
        global last_used_transform_rules
        if not self.ensure_book(_('You must first open a book in order to transform styles.')):
            return
        from calibre.gui2.css_transform_rules import RulesDialog
        from calibre.ebooks.css_transform_rules import transform_container
        d = RulesDialog(self.gui)
        d.rules = last_used_transform_rules
        if d.exec_() != d.Accepted:
            return
        last_used_transform_rules = d.rules
        with BusyCursor():
            self.add_savepoint(_('Before style transformation'))
            try:
                changed = transform_container(current_container(),
                                              last_used_transform_rules)
            except Exception:
                self.rewind_savepoint()
                raise
            if changed:
                self.apply_container_update_to_gui()
            else:
                self.rewind_savepoint()
                info_dialog(self.gui, _('No changes'), _(
                    'No styles were changed.'), show=True)
                return
        self.show_current_diff()

    def get_external_resources(self):
        """Download external resources and replace them in the book."""
        if not self.ensure_book(_('You must first open a book in order to transform styles.')):
            return
        from calibre.gui2.tweak_book.download import DownloadResources
        with BusyCursor():
            self.add_savepoint(_('Before: Get external resources'))
        try:
            d = DownloadResources(self.gui)
            d.exec_()
        except Exception:
            self.rewind_savepoint()
            raise
        if d.resources_replaced:
            self.apply_container_update_to_gui()
            if d.show_diff:
                self.show_current_diff()
        else:
            self.rewind_savepoint()

    # -------------------------------------------------------------------------
    # Font management
    # -------------------------------------------------------------------------

    def manage_fonts(self):
        """Open the font management dialog."""
        self.commit_all_editors_to_container()
        self.gui.manage_fonts.display()

    def manage_fonts_embed(self):
        """Embed all fonts in the book."""
        self.polish('embed', _('Embed all fonts'), parent=self.gui.manage_fonts)
        self.gui.manage_fonts.refresh()

    def manage_fonts_subset(self):
        """Subset all fonts in the book."""
        self.polish('subset', _('Subset all fonts'), parent=self.gui.manage_fonts)

    # -------------------------------------------------------------------------
    # Renaming utilities
    # -------------------------------------------------------------------------

    def rationalize_folders(self):
        """Arrange files into folders based on user preferences."""
        c = current_container()
        if not c.SUPPORTS_FILENAMES:
            return error_dialog(self.gui, _('Not supported'), _(
                'The %s format does not support file and folder names internally, therefore'
                ' arranging files into folders is not allowed.') % c.book_type.upper(),
                show=True)
        d = RationalizeFolders(self.gui)
        if d.exec_() != d.Accepted:
            return
        self.commit_all_editors_to_container()
        name_map = rationalize_folders(c, d.folder_map)
        if not name_map:
            confirm(_(
                'The files in this book are already arranged into folders'), 'already-arranged-into-folders',
                self.gui, pixmap='dialog_information.png', title=_('Nothing to do'),
                show_cancel_button=False, config_set=tprefs,
                confirm_msg=_('Show this message &again'))
            return
        self.add_savepoint(_('Before: Arrange into folders'))
        self.gui.blocking_job('rationalize_folders',
                              _('Renaming and updating links...'),
                              partial(self.rename_done, name_map),
                              rename_files, current_container(), name_map)

    def rename_requested(self, oldname, newname):
        """Rename a single file."""
        self.commit_all_editors_to_container()
        if guess_type(oldname) != guess_type(newname):
            if not self._confirm_filetype_change(oldname, newname):
                return
        if urlnormalize(newname) != newname:
            if not self._confirm_url_unsafe(newname):
                return
        self.add_savepoint(_('Before: Rename %s') % oldname)
        name_map = {oldname: newname}
        self.gui.blocking_job('rename_file',
                              _('Renaming and updating links...'),
                              partial(self.rename_done, name_map,
                                      from_filelist=self.gui.file_list.current_name),
                              rename_files, current_container(), name_map)

    def bulk_rename_requested(self, name_map):
        """Rename multiple files at once."""
        self.add_savepoint(_('Before: Bulk rename'))
        self.gui.blocking_job('bulk_rename_files',
                              _('Renaming and updating links...'),
                              partial(self.rename_done, name_map,
                                      from_filelist=self.gui.file_list.current_name),
                              rename_files, current_container(), name_map)

    def _confirm_filetype_change(self, oldname, newname):
        """Ask the user to confirm a filetype change."""
        args = os.path.splitext(oldname) + os.path.splitext(newname)
        return confirm(_(
            'You are changing the file type of {0}<b>{1}</b> to {2}<b>{3}</b>.'
            ' Doing so can cause problems, are you sure?').format(*args),
            'confirm-filetype-change', parent=self.gui,
            title=_('Are you sure?'), config_set=tprefs)

    def _confirm_url_unsafe(self, newname):
        """Ask the user to confirm a URL-unsafe filename."""
        return confirm(_(
            'The name you have chosen {0} contains special characters, internally'
            ' it will look like: {1}Try to use only the English alphabet [a-z], numbers [0-9],'
            ' hyphens and underscores for file names. Other characters can cause problems for '
            ' different e-book viewers. Are you sure you want to proceed?').format(
                '<pre>%s</pre>' % newname,
                '<pre>%s</pre>' % urlnormalize(newname)),
            'confirm-urlunsafe-change', parent=self.gui,
            title=_('Are you sure?'), config_set=tprefs)

    def rename_done(self, name_map, job, from_filelist=None):
        """Handle the result of a rename operation."""
        if job.traceback:
            error_dialog(self.gui, _('Failed to rename files'),
                         _('Failed to rename files, click Show details for more information.'),
                         det_msg=job.traceback, show=True)
            return
        self.gui.file_list.build(current_container())
        self.set_modified()
        for old, new in name_map.iteritems():
            if old in editors:
                editors[new] = ed = editors.pop(old)
                ed.change_document_name(new)
                self.gui.central.rename_editor(editors[new], new)
            if self.gui.preview.current_name == old:
                self.gui.preview.current_name = new
        self.apply_container_update_to_gui()
        if from_filelist:
            self.gui.file_list.select_names(frozenset(name_map.itervalues()),
                                            current_name=name_map.get(from_filelist))
            self.gui.file_list.file_list.setFocus(Qt.PopupFocusReason)

    # -------------------------------------------------------------------------
    # Diff and comparison utilities
    # -------------------------------------------------------------------------

    def create_diff_dialog(self, revert_msg=_('&Revert changes'), show_open_in_editor=True):
        """Create and show a diff dialog."""
        global _diff_dialogs
        from calibre.gui2.tweak_book.diff.main import Diff

        def line_activated(name, lnum, right):
            if right:
                self.edit_file_requested(name, None, guess_type(name))
                if name in editors:
                    editor = editors[name]
                    editor.go_to_line(lnum)
                    editor.setFocus(Qt.OtherFocusReason)
                    self.gui.raise_()

        d = Diff(revert_button_msg=revert_msg, show_open_in_editor=show_open_in_editor)
        [x.break_cycles() for x in _diff_dialogs if not x.isVisible()]
        _diff_dialogs = [x for x in _diff_dialogs if x.isVisible()] + [d]
        d.show()
        d.raise_()
        d.setFocus(Qt.OtherFocusReason)
        d.setWindowModality(Qt.NonModal)
        if show_open_in_editor:
            d.line_activated.connect(line_activated)
        return d

    def show_current_diff(self, allow_revert=True, to_container=None):
        """Show differences from the last checkpoint."""
        self.commit_all_editors_to_container()
        d = self.create_diff_dialog()
        d.revert_requested.connect(partial(self.revert_requested,
                                            self.global_undo.previous_container))
        other = to_container or self.global_undo.previous_container
        d.container_diff(other, self.global_undo.current_container,
                         names=(self.global_undo.label_for_container(other),
                                self.global_undo.label_for_container(self.global_undo.current_container)))

    def compare_book(self):
        """Compare the current book with another."""
        self.commit_all_editors_to_container()
        c = current_container()
        path = choose_files(self.gui, 'select-book-for-comparison',
                            _('Choose book'), filters=[
                                (_('%s books') % c.book_type.upper(),
                                 (c.book_type,))],
                            select_only_single_file=True,
                            all_files=False)
        if path and path[0]:
            with TemporaryDirectory('_compare') as tdir:
                other = _gc(path[0], tdir=tdir, tweak_mode=True)
                d = self.create_diff_dialog(revert_msg=None)
                d.container_diff(other, c,
                                 names=(_('Other book'), _('Current book')))

    def revert_requested(self, container):
        """Revert the book to a previous container."""
        self.commit_all_editors_to_container()
        nc = self.global_undo.revert_to(container)
        set_current_container(nc)
        self.apply_container_update_to_gui()

    def compare_requested(self, container):
        """Show diff against a specific container."""
        self.show_current_diff(to_container=container)

    # -------------------------------------------------------------------------
    # Modification tracking
    # -------------------------------------------------------------------------

    def set_modified(self):
        """Mark the book as modified."""
        self.gui.action_save.setEnabled(True)

    # -------------------------------------------------------------------------
    # Completion handling
    # -------------------------------------------------------------------------

    def request_completion(self, name, completion_type, completion_data, query=None):
        """Request code completion for an editor."""
        if completion_type is None:
            completion_worker().clear_caches(completion_data)
            return
        request_id = (self.completion_request_count, name)
        self.completion_request_count += 1
        completion_worker().queue_completion(request_id,
                                             completion_type,
                                             completion_data,
                                             query)
        return request_id[0]

    def handle_completion_result(self, result):
        """Handle a completion result."""
        name = result.request_id[1]
        editor = editors.get(name)
        if editor:
            editor.handle_completion_result(result)

    # -------------------------------------------------------------------------
    # HTML fixing and pretty printing
    # -------------------------------------------------------------------------

    def fix_html(self, current):
        """Fix HTML either in the current editor or globally."""
        if current:
            ed = self.gui.central.current_editor
            if hasattr(ed, 'fix_html'):
                ed.fix_html()
        else:
            with BusyCursor():
                self.add_savepoint(_('Before: Fix HTML'))
                fix_all_html(current_container())
                self.update_editors_from_container()
                self.set_modified()

    def pretty_print(self, current):
        """Pretty print either the current editor or all files."""
        if current:
            ed = self.gui.central.current_editor
            ed.pretty_print(editor_name(ed))
        else:
            with BusyCursor():
                self.add_savepoint(_('Before: Beautify files'))
                pretty_all(current_container())
                self.update_editors_from_container()
                self.set_modified()
                QApplication.alert(self.gui)

    # -------------------------------------------------------------------------
    # Search and replace utilities
    # -------------------------------------------------------------------------

    def mark_selected_text(self):
        """Mark selected text for searching."""
        ed = self.gui.central.current_editor
        if ed:
            ed.mark_selected_text()
            if ed.has_marked_text:
                self.gui.central.search_panel.set_where('selected-text')
            else:
                self.gui.central.search_panel.unset_marked()

    def editor_action(self, action):
        """Perform an editor-specific action."""
        ed = self.gui.central.current_editor
        if not ed or not hasattr(ed, 'action_triggered'):
            return
        if action and action[0] == 'insert_resource':
            self._handle_insert_resource(ed, action)
        elif action and action[0] == 'insert_hyperlink':
            self._handle_insert_hyperlink(ed)
        elif action and action[0] == 'insert_tag':
            self._handle_insert_tag()
        else:
            ed.action_triggered(action)

    def _handle_insert_resource(self, editor, action):
        """Insert a resource (image or other) into the editor."""
        rtype = action[1]
        if rtype == 'image' and editor.syntax not in {'css', 'html'}:
            error_dialog(self.gui, _('Not supported'), _(
                'Inserting images is only supported for HTML and CSS files.'), show=True)
            return
        rdata = get_resource_data(rtype, self.gui)
        if rdata is None:
            return
        if rtype == 'image':
            chosen_name, chosen_image_is_external, fullpage, preserve_ar = rdata
            if chosen_image_is_external:
                with open(chosen_image_is_external[1], 'rb') as f:
                    current_container().add_file(chosen_image_is_external[0], f.read())
                self.refresh_file_list()
                chosen_name = chosen_image_is_external[0]
            href = current_container().name_to_href(chosen_name,
                                                    editor_name(editor))
            fmt, width, height = identify(current_container().raw_data(chosen_name,
                                                                      decode=False))
            editor.insert_image(href,
                                fullpage=fullpage,
                                preserve_aspect_ratio=preserve_ar,
                                width=width,
                                height=height)

    def _handle_insert_hyperlink(self, editor):
        """Insert a hyperlink into the editor."""
        self.commit_all_editors_to_container()
        d = InsertLink(current_container(),
                       editor_name(editor),
                       initial_text=editor.get_smart_selection(),
                       parent=self.gui)
        if d.exec_() == d.Accepted:
            editor.insert_hyperlink(d.href, d.text)

    def _handle_insert_tag(self):
        """Insert a generic tag into the editor."""
        d = InsertTag(parent=self.gui)
        if d.exec_() == d.Accepted:
            self.gui.central.current_editor.insert_tag(d.tag)

    def set_semantics(self):
        """Set semantics for the current book."""
        self.commit_all_editors_to_container()
        c = current_container()
        if c.book_type == 'azw3':
            error_dialog(self.gui, _('Not supported'), _(
                'Semantics are not supported for the AZW3 format.'), show=True)
            return
        d = InsertSemantics(c, parent=self.gui)
        if d.exec_() == d.Accepted and d.changed_type_map:
            self.add_savepoint(_('Before: Set Semantics'))
            d.apply_changes(current_container())
            self.apply_container_update_to_gui()

    def filter_css(self):
        """Filter CSS properties in the current file."""
        self.commit_all_editors_to_container()
        c = current_container()
        ed = self.gui.central.current_editor
        current_name = editor_name(ed)
        if current_name and c.mime_map[current_name] not in OEB_DOCS | OEB_STYLES:
            current_name = None
        d = FilterCSS(current_name=current_name, parent=self.gui)
        if d.exec_() == d.Accepted and d.filtered_properties:
            self.add_savepoint(_('Before: Filter style information'))
            with BusyCursor():
                changed = filter_css(current_container(),
                                     d.filtered_properties,
                                     names=d.filter_names)
            if changed:
                self.apply_container_update_to_gui()
                self.show_current_diff()
            else:
                self.rewind_savepoint()
                info_dialog(self.gui, _('No matches'), _(
                    'No matching style rules were found'), show=True)

    # -------------------------------------------------------------------------
    # UI helpers for search and navigation
    # -------------------------------------------------------------------------

    def show_find(self):
        """Show the find dialog."""
        self.gui.central.show_find()
        ed = self.gui.central.current_editor
        if ed and hasattr(ed, 'selected_text'):
            text = ed.selected_text
            if text and text.strip():
                self.gui.central.pre_fill_search(text)

    def show_text_search(self):
        """Show the text search dock."""
        self.gui.text_search_dock.show()
        self.gui.text_search.find.setFocus(Qt.OtherFocusReason)

    def search_action_triggered(self, action, overrides=None):
        """Handle a search action triggered from the UI."""
        ss = self.gui.saved_searches.isVisible()
        trigger_saved_search = ss and (not self.gui.central.search_panel.isVisible() or self.gui.saved_searches.has_focus())
        if trigger_saved_search:
            self.gui.saved_searches.trigger_action(action, overrides=overrides)
        else:
            self.search(action, overrides)

    def run_saved_searches(self, searches, action):
        """Execute saved searches."""
        ed = self.gui.central.current_editor
        name = editor_name(ed)
        searchable_names = self.gui.file_list.searchable_names
        if not searches or not validate_search_request(name,
                                                        searchable_names,
                                                        getattr(ed, 'has_marked_text', False),
                                                        searches[0],
                                                        self.gui):
            return
        ret = run_search(searches, action, ed, name, searchable_names,
                         self.gui, self.show_editor, self.edit_file,
                         self.show_current_diff, self.add_savepoint,
                         self.rewind_savepoint, self.set_modified)
        if ret is True and getattr(ed, 'has_line_numbers', False):
            ed.editor.setFocus(Qt.OtherFocusReason)
        else:
            self.gui.saved_searches.setFocus(Qt.OtherFocusReason)

    def search(self, action, overrides=None):
        """Run a search/replace operation."""
        sp = self.gui.central.search_panel
        sp.setVisible(True)
        ed = self.gui.central.current_editor
        name = editor_name(ed)
        state = sp.state
        if overrides:
            state.update(overrides)
        searchable_names = self.gui.file_list.searchable_names
        if not validate_search_request(name,
                                       searchable_names,
                                       getattr(ed, 'has_marked_text', False),
                                       state,
                                       self.gui):
            return
        ret = run_search(state, action, ed, name, searchable_names,
                         self.gui, self.show_editor, self.edit_file,
                         self.show_current_diff, self.add_savepoint,
                         self.rewind_savepoint, self.set_modified)
        if ret is True and getattr(ed, 'has_line_numbers', False):
            ed.editor.setFocus(Qt.OtherFocusReason)
        else:
            self.gui.saved_searches.setFocus(Qt.OtherFocusReason)

    def find_text(self, state):
        """Run a text search."""
        from calibre.gui2.tweak_book.text_search import run_text_search
        searchable_names = self.gui.file_list.searchable_names
        ed = self.gui.central.current_editor
        name = editor_name(ed)
        if not validate_search_request(name,
                                       searchable_names,
                                       getattr(ed, 'has_marked_text', False),
                                       state,
                                       self.gui):
            return
        ret = run_text_search(state, ed, name, searchable_names,
                              self.gui, self.show_editor, self.edit_file)
        if ret is True and getattr(ed, 'has_line_numbers', False):
            ed.editor.setFocus(Qt.OtherFocusReason)

    def find_word(self, word, locations):
        """Navigate to a word from the spell check dialog."""
        ed = self.gui.central.current_editor
        name = editor_name(ed)
        find_next_word(word, locations, ed, name, self.gui,
                       self.show_editor, self.edit_file)

    def next_spell_error(self):
        """Navigate to the next spelling error."""
        ed = self.gui.central.current_editor
        name = editor_name(ed)
        find_next_error(ed, name, self.gui, self.show_editor, self.edit_file)

    def word_change_requested(self, w, new_word):
        """Handle a request to change a word."""
        if self.commit_all_editors_to_container():
            self.gui.spell_check.change_word_after_update(w, new_word)
        else:
            self.gui.spell_check.do_change_word(w, new_word)

    def word_replaced(self, changed_names):
        """Update UI after words have been replaced."""
        self.set_modified()
        self.update_editors_from_container(names=set(changed_names))

    def word_ignored(self, word, locale):
        """Ignore a word for spell checking."""
        if tprefs['inline_spell_check']:
            for ed in editors.itervalues():
                try:
                    ed.editor.recheck_word(word, locale)
                except AttributeError:
                    pass

    # -------------------------------------------------------------------------
    # Link handling
    # -------------------------------------------------------------------------

    def editor_link_clicked(self, url):
        """Handle a link click from an editor."""
        ed = self.gui.central.current_editor
        name = editor_name(ed)
        if url.startswith('#'):
            target = name
        else:
            target = current_container().href_to_name(url, name)
        frag = url.partition('#')[-1]
        if current_container().has_name(target):
            self.link_clicked(target, frag, show_anchor_not_found=True)
        else:
            try:
                purl = urlparse(url)
            except ValueError:
                return
            if purl.scheme not in {'', 'file'}:
                open_url(QUrl(url))
            else:
                error_dialog(self.gui, _('Not found'), _(
                    'No file with the name %s was found in the book') % target,
                             show=True)

    def link_clicked(self, name, anchor, show_anchor_not_found=False):
        """Open a file or navigate to an anchor."""
        if not name:
            return
        if name in editors:
            editor = editors[name]
            self.gui.central.show_editor(editor)
        else:
            try:
                mt = current_container().mime_map[name]
            except KeyError:
                error_dialog(self.gui, _('Does not exist'), _(
                    'The file %s does not exist. If you were trying to click an item in'
                    ' the Table of Contents, you may'
                    ' need to refresh it by right-clicking and choosing "Refresh".') % name,
                             show=True)
                return
            syntax = syntax_from_mime(name, mt)
            if not syntax:
                error_dialog(self.gui, _('Unsupported file format'), _(
                    'Editing files of type %s is not supported' % mt), show=True)
                return
            editor = self.edit_file(name, syntax)
        if anchor and editor:
            if not editor.go_to_anchor(anchor) and show_anchor_not_found:
                error_dialog(self.gui, _('Not found'), _(
                    'The anchor %s was not found in this file') % anchor, show=True)

    # -------------------------------------------------------------------------
    # Check Book integration
    # -------------------------------------------------------------------------

    @in_thread_job
    def check_item_activated(self, item):
        """Handle activation of a check book result item."""
        is_mult = item.has_multiple_locations and getattr(item, 'current_location_index', None) is not None
        name = (item.all_locations[item.current_location_index][0]
                if is_mult else item.name)
        editor = None
        if name in editors:
            editor = editors[name]
            self.gui.central.show_editor(editor)
        else:
            try:
                editor = self.edit_file_requested(name, None,
                                                  current_container().mime_map[name])
            except KeyError:
                error_dialog(self.gui, _('File deleted'), _(
                    'The file {} has already been deleted, re-run Check Book to update the results.').format(name),
                             show=True)
        if getattr(editor, 'has_line_numbers', False):
            if is_mult:
                editor.go_to_line(*item.all_locations[item.current_location_index][1:3])
            else:
                editor.go_to_line(item.line, item.col)
            editor.set_focus()

    @in_thread_job
    def check_requested(self, *args):
        """Run the Check Book checks."""
        if current_container() is None:
            return
        self.commit_all_editors_to_container()
        c = self.gui.check_book
        c.parent().show()
        c.parent().raise_()
        c.run_checks(current_container())

    def spell_check_requested(self):
        """Show the spell check dialog."""
        if current_container() is None:
            return
        self.commit_all_editors_to_container()
        self.add_savepoint(_('Before: Spell Check'))
        self.gui.spell_check.show()

    @in_thread_job
    def fix_requested(self, errors):
        """Auto-fix errors reported by Check Book."""
        self.add_savepoint(_('Before: Auto-fix errors'))
        c = self.gui.check_book
        c.parent().show()
        c.parent().raise_()
        changed = c.fix_errors(current_container(), errors)
        if changed:
            self.apply_container_update_to_gui()
            self.set_modified()
        else:
            self.rewind_savepoint()

    @in_thread_job
    def merge_requested(self, category, names, master):
        """Merge multiple files into a master file."""
        self.add_savepoint(_('Before: Merge files into %s') % self.gui.elided_text(master))
        try:
            merge(current_container(), category, names, master)
        except AbortError:
            self.rewind_savepoint()
            raise
        self.apply_container_update_to_gui()
        if master in editors:
            self.show_editor(master)

    @in_thread_job
    def link_stylesheets_requested(self, names, sheets, remove):
        """Link or unlink stylesheets."""
        self.add_savepoint(_('Before: Link stylesheets'))
        changed_names = link_stylesheets(current_container(),
                                         names, sheets, remove)
        if changed_names:
            self.update_editors_from_container(names=changed_names)
            self.set_modified()

    @in_thread_job
    def export_requested(self, name, path):
        """Export a file from the book."""
        if name in editors and not editors[name].is_synced_to_container:
            self.commit_editor_to_container(name)
        with current_container().open(name, 'rb') as src, open(path, 'wb') as dest:
            shutil.copyfileobj(src, dest)

    @in_thread_job
    def replace_requested(self, name, path, basename, force_mt):
        """Replace a file in the book."""
        self.add_savepoint(_('Before: Replace %s') % name)
        replace_file(current_container(), name, path, basename, force_mt)
        self.apply_container_update_to_gui()

    # -------------------------------------------------------------------------
    # Image handling
    # -------------------------------------------------------------------------

    def browse_images(self):
        """Show the image browser."""
        self.gui.image_browser.refresh()
        self.gui.image_browser.show()
        self.gui.image_browser.raise_()

    # -------------------------------------------------------------------------
    # Report handling
    # -------------------------------------------------------------------------

    def show_reports(self):
        """Show the reports dialog."""
        if not self.ensure_book(_('You must first open a book in order to see the report.')):
            return
        self.gui.reports.refresh()
        self.gui.reports.show()
        self.gui.reports.raise_()

    def reports_edit_requested(self, name):
        """Edit a file from the reports view."""
        mt = current_container().mime_map.get(name, guess_type(name))
        self.edit_file_requested(name, None, mt)

    def image_activated(self, name):
        """Edit an image file."""
        mt = current_container().mime_map.get(name, guess_type(name))
        self.edit_file_requested(name, None, mt)

    def check_external_links(self):
        """Run external link checking."""
        if self.ensure_book(_('You must first open a book in order to check links.')):
            self.commit_all_editors_to_container()
            self.gui.check_external_links.show()

    # -------------------------------------------------------------------------
    # Image compression
    # -------------------------------------------------------------------------

    def compress_images(self):
        """Compress images in the book."""
        if not self.ensure_book(_('You must first open a book in order to compress images.')):
            return
        from calibre.gui2.tweak_book.polish import (show_report,
                                                    CompressImages,
                                                    CompressImagesProgress)
        d = CompressImages(self.gui)
        if d.exec_() != d.Accepted:
            return
        with BusyCursor():
            self.add_savepoint(_('Before: compress images'))
            d = CompressImagesProgress(names=d.names,
                                       jpeg_quality=d.jpeg_quality,
                                       parent=self.gui)
            if d.exec_() != d.Accepted:
                self.rewind_savepoint()
                return
            changed, report = d.result
            if changed is None and report:
                self.rewind_savepoint()
                error_dialog(self.gui, _('Unexpected error'), _(
                    'Failed to compress images, click "Show details" for more information'),
                    det_msg=report, show=True)
                return
            if changed:
                self.apply_container_update_to_gui()
            else:
                self.rewind_savepoint()
        show_report(changed, self.current_metadata.title, report,
                    self.gui, self.show_current_diff)

    # -------------------------------------------------------------------------
    # Editor synchronization
    # -------------------------------------------------------------------------

    def sync_editor_to_preview(self, name, sourceline_address):
        """Synchronize the editor to a preview location."""
        editor = self.edit_file(name, 'html')
        self.ignore_preview_to_editor_sync = True
        try:
            editor.goto_sourceline(*sourceline_address)
        finally:
            self.ignore_preview_to_editor_sync = False

    def sync_preview_to_editor(self):
        """Synchronize the preview to the current editor cursor."""
        if self.ignore_preview_to_editor_sync:
            return
        ed = self.gui.central.current_editor
        if ed:
            name = editor_name(ed)
            if name and getattr(ed, 'syntax', None) == 'html':
                self.gui.preview.sync_to_editor(name, ed.current_tag())

    def goto_style_declaration(self, data):
        """Navigate to a CSS declaration."""
        name = data['name']
        editor = self.edit_file(name, syntax=data['syntax'])
        self.gui.live_css.navigate_to_declaration(data, editor)

    # -------------------------------------------------------------------------
    # Editor lifecycle management
    # -------------------------------------------------------------------------

    def init_editor(self, name, editor, data=None, use_template=False):
        """Initialize a newly created editor."""
        editor.undo_redo_state_changed.connect(self.editor_undo_redo_state_changed)
        editor.data_changed.connect(self.editor_data_changed)
        editor.copy_available_state_changed.connect(self.editor_copy_available_state_changed)
        editor.cursor_position_changed.connect(self.sync_preview_to_editor)
        editor.cursor_position_changed.connect(self.update_cursor_position)
        if hasattr(editor, 'word_ignored'):
            editor.word_ignored.connect(self.word_ignored)
        if hasattr(editor, 'link_clicked'):
            editor.link_clicked.connect(self.editor_link_clicked)
        if getattr(editor, 'syntax', None) == 'html':
            editor.smart_highlighting_updated.connect(self.gui.live_css.sync_to_editor)
        if hasattr(editor, 'set_request_completion'):
            editor.set_request_completion(partial(self.request_completion, name), name)
        if data is not None:
            if use_template:
                editor.init_from_template(data)
            else:
                editor.data = data
                editor.is_synced_to_container = True
        editor.modification_state_changed.connect(self.editor_modification_state_changed)
        self.gui.central.add_editor(name, editor)

    def edit_file(self, name, syntax=None, use_template=None):
        """Open a file in an editor."""
        editor = editors.get(name)
        if editor is None:
            syntax = syntax or syntax_from_mime(name, guess_type(name))
            if use_template is None:
                data = current_container().raw_data(name)
                if isbytestring(data) and syntax in {'html', 'css', 'text', 'xml'}:
                    try:
                        data = data.decode('utf-8')
                    except UnicodeDecodeError:
                        return error_dialog(self.gui, _('Cannot decode'), _(
                            'Cannot edit %s as it appears to be in an unknown character encoding') % name,
                                             show=True)
            else:
                data = use_template
            editor = editors[name] = editor_from_syntax(syntax,
                                                        self.gui.editor_tabs)
            self.init_editor(name, editor, data, use_template=bool(use_template))
            if tprefs['pretty_print_on_open']:
                editor.pretty_print(name)
        self.show_editor(name)
        return editor

    def show_editor(self, name):
        """Display the editor for a given file."""
        self.gui.central.show_editor(editors[name])
        editors[name].set_focus()

    def edit_file_requested(self, name, syntax=None, mime=None):
        """Request editing of a file, creating an editor if needed."""
        if name in editors:
            self.gui.central.show_editor(editors[name])
            return editors[name]
        mime = mime or current_container().mime_map.get(name, guess_type(name))
        syntax = syntax or syntax_from_mime(name, mime)
        if not syntax:
            return error_dialog(self.gui, _('Unsupported file format'),
                                _('Editing files of type %s is not supported' % mime),
                                show=True)
        return self.edit_file(name, syntax)

    def quick_open(self):
        """Open a file quickly via the Quick Open dialog."""
        if not self.ensure_book(_('No book is currently open. You must first open a book to edit.')):
            return
        c = current_container()
        files = [name for name, mime in c.mime_map.iteritems()
                 if c.exists(name) and syntax_from_mime(name, mime) is not None]
        d = QuickOpen(files, parent=self.gui)
        if d.exec_() == d.Accepted and d.selected_result:
            self.edit_file_requested(d.selected_result, None,
                                     c.mime_map[d.selected_result])

    # -------------------------------------------------------------------------
    # Editor UI actions
    # -------------------------------------------------------------------------

    def do_editor_undo(self):
        ed = self.gui.central.current_editor
        if ed:
            ed.undo()

    def do_editor_redo(self):
        ed = self.gui.central.current_editor
        if ed:
            ed.redo()

    def do_editor_copy(self):
        ed = self.gui.central.current_editor
        if ed:
            ed.copy()

    def do_editor_cut(self):
        ed = self.gui.central.current_editor
        if ed:
            ed.cut()

    def do_editor_paste(self):
        ed = self.gui.central.current_editor
        if ed:
            ed.paste()

    def editor_data_changed(self, editor):
        """Refresh preview and TOC when editor data changes."""
        self.gui.preview.start_refresh_timer()
        for name, ed in editors.iteritems():
            if ed is editor:
                self.gui.toc_view.start_refresh_timer(name)
                break

    def editor_undo_redo_state_changed(self, *args):
        self.apply_current_editor_state()

    def editor_copy_available_state_changed(self, *args):
        self.apply_current_editor_state()

    def editor_modification_state_changed(self, is_modified):
        self.apply_current_editor_state()
        if is_modified:
            self.set_modified()

    def apply_current_editor_state(self):
        """Update UI actions based on the current editor."""
        ed = self.gui.central.current_editor
        self.gui.cursor_position_widget.update_position()
        if ed:
            actions['editor-undo'].setEnabled(ed.undo_available)
            actions['editor-redo'].setEnabled(ed.redo_available)
            actions['editor-copy'].setEnabled(ed.copy_available)
            actions['editor-cut'].setEnabled(ed.cut_available)
            actions['go-to-line-number'].setEnabled(ed.has_line_numbers)
            actions['fix-html-current'].setEnabled(ed.syntax == 'html')
            name = editor_name(ed)
            if name and getattr(ed, 'syntax', None) == 'html':
                if self.gui.preview.show(name):
                    self.sync_preview_to_editor()
            if name:
                self.gui.file_list.mark_name_as_current(name)
            if ed.has_line_numbers:
                self.gui.cursor_position_widget.update_position(*ed.cursor_position)
        else:
            actions['go-to-line-number'].setEnabled(False)
            self.gui.file_list.clear_currently_edited_name()

    def update_cursor_position(self):
        """Update the cursor position widget."""
        ed = self.gui.central.current_editor
        if getattr(ed, 'has_line_numbers', False):
            self.gui.cursor_position_widget.update_position(*ed.cursor_position)
        else:
            self.gui.cursor_position_widget.update_position()

    def editor_close_requested(self, editor):
        """Handle a request to close an editor."""
        name = editor_name(editor)
        if not name:
            return
        if not editor.is_synced_to_container:
            self.commit_editor_to_container(name)
        self.close_editor(name)

    def close_editor(self, name):
        """Close the editor for a given file."""
        editor = editors.pop(name)
        self.gui.central.close_editor(editor)
        editor.break_cycles()
        if not editors or getattr(self.gui.central.current_editor, 'syntax', None) != 'html':
            self.gui.preview.clear()
            self.gui.live_css.clear()

    def insert_character(self):
        """Show the insert character dialog."""
        self.gui.insert_char.show()

    def manage_snippets(self):
        """Open the snippet manager."""
        from calibre.gui2.tweak_book.editor.snippets import UserSnippets
        UserSnippets(self.gui).exec_()

    # -------------------------------------------------------------------------
    # Application shutdown
    # -------------------------------------------------------------------------

    def quit(self):
        """Handle application quit."""
        if self.doing_terminal_save:
            return False
        if self.save_manager.has_tasks:
            if question_dialog(self.gui, _('Are you sure?'), _(
                    'The current book is being saved in the background. Quitting now will'
                    ' <b>abort the save process</b>! Finish saving first?'),
                    yes_text=_('Finish &saving first'), no_text=_('&Quit immediately')):
                if self.save_manager.has_tasks:
                    self.start_terminal_save_indicator()
                return False
        if not self.confirm_quit():
            return False
        self.shutdown()
        QApplication.instance().quit()
        return True

    def confirm_quit(self):
        """Confirm quit when there are unsaved changes."""
        if self.gui.action_save.isEnabled():
            d = QDialog(self.gui)
            d.l = QGridLayout(d)
            d.setLayout(d.l)
            d.setWindowTitle(_('Unsaved changes'))
            d.i = QLabel('')
            d.i.setMaximumSize(QSize(64, 64))
            d.i.setPixmap(QIcon(I('dialog_warning.png')).pixmap(d.i.maximumSize()))
            d.l.addWidget(d.i, 0, 0)
            d.m = QLabel(_('There are unsaved changes, if you quit without saving, you will lose them.'))
            d.m.setWordWrap(True)
            d.l.addWidget(d.m, 1, 0, 1, 2)
            d.bb = QDialogButtonBox(QDialogButtonBox.Cancel)
            d.bb.rejected.connect(d.reject)
            d.bb.accepted.connect(d.accept)
            d.l.addWidget(d.bb, 2, 0, 1, 2)
            d.do_save = None

            def endit(x):
                d.do_save = x
                d.accept()
            b = d.bb.addButton(_('&Save and Quit'), QDialogButtonBox.ActionRole)
            b.setIcon(QIcon(I('save.png')))
            b.clicked.connect(lambda *args: endit(True))
            b = d.bb.addButton(_('&Quit without saving'), QDialogButtonBox.ActionRole)
            b.clicked.connect(lambda *args: endit(False))
            d.resize(d.sizeHint())
            if d.exec_() != d.Accepted or d.do_save is None:
                return False
            if d.do_save:
                self.gui.action_save.trigger()
                self.start_terminal_save_indicator()
                return False
        return True

    def start_terminal_save_indicator(self):
        """Show a blocking save indicator."""
        self.save_state()
        self.gui.blocking_job.set_msg(_('Saving, please wait...'))
        self.gui.blocking_job.start()
        self.doing_terminal_save = True

    def abort_terminal_save(self):
        """Abort a terminal save."""
        self.doing_terminal_save = False
        self.gui.blocking_job.stop()

    def check_terminal_save(self):
        """Check if terminal save completed and shutdown."""
        if self.doing_terminal_save and not self.save_manager.has_tasks:
            self.shutdown()
            QApplication.instance().quit()

    def shutdown(self):
        """Perform cleanup on shutdown."""
        self.save_state()
        completion_worker().shutdown()
        self.save_manager.check_for_completion.disconnect()
        self.gui.preview.stop_refresh_timer()
        self.gui.live_css.stop_update_timer()
        [x.reject() for x in _diff_dialogs]
        del _diff_dialogs[:]
        self.save_manager.shutdown()
        parse_worker.shutdown()
        self.save_manager.wait(0.1)

    def save_state(self):
        """Persist UI and editor state."""
        with self.editor_cache:
            self.save_book_edit_state()
        with tprefs:
            self.gui.save_state()

    def save_book_edit_state(self):
        """Save the current editing state for the book."""
        c = current_container()
        if c and c.path_to_ebook:
            tprefs = self.editor_cache
            mem = tprefs['edit_book_state']
            order = tprefs['edit_book_state_order']
            extra = len(order) - 99
            if extra > 0:
                order = [k for k in order[extra:] if k in mem]
                mem = {k: mem[k] for k in order}
            mem[c.path_to_ebook] = {
                'editors': {name: ed.current_editing_state for name, ed in editors.iteritems()},
                'currently_editing': self.currently_editing,
                'tab_order': self.gui.central.tab_order,
            }
            try:
                order.remove(c.path_to_ebook)
            except ValueError:
                pass
            order.append(c.path_to_ebook)
            tprefs['edit_book_state'] = mem
            tprefs['edit_book_state_order'] = order

    def restore_book_edit_state(self):
        """Restore the editing state for the current book."""
        c = current_container()
        if c and c.path_to_ebook:
            tprefs = self.editor_cache
            state = tprefs['edit_book_state'].get(c.path_to_ebook)
            if state:
                opened = set()
                eds = state.get('editors', {})
                for name in state.get('tab_order', ()):
                    if c.has_name(name):
                        try:
                            editor = self.edit_file_requested(name)
                            if editor:
                                opened.add(name)
                                es = eds.get(name)
                                if es is not None:
                                    editor.current_editing_state = es
                        except Exception:
                            import traceback
                            traceback.print_exc()
                ce = state.get('currently_editing')
                if ce in opened:
                    self.show_editor(ce)