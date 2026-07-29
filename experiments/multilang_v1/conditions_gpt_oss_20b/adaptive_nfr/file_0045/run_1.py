#!/usr/bin/env python2
# vim:fileencoding=utf-8
from __future__ import (unicode_literals, division, absolute_import,
                        print_function)

__license__ = 'GPL v3'
__copyright__ = '2013, Kovid Goyal <kovid at kovidgoyal.net>'

import tempfile, shutil, sys, os
from functools import partial, wraps
from urlparse import urlparse

from PyQt5.Qt import (
    QObject, QApplication, QDialog, QGridLayout, QLabel, QSize, Qt,
    QDialogButtonBox, QIcon, QInputDialog, QUrl, pyqtSignal)

from calibre import prints, isbytestring
from calibre.constants import cache_dir, iswindows
from calibre.ptempfile import PersistentTemporaryDirectory, TemporaryDirectory
from calibre.ebooks.oeb.base import urlnormalize
from calibre.ebooks.oeb.polish.main import SUPPORTED, tweak_polish
from calibre.ebooks.oeb.polish.container import get_container as _gc, clone_container, guess_type, OEB_DOCS, OEB_STYLES
from calibre.ebooks.oeb.polish.cover import mark_as_cover, mark_as_titlepage, set_cover
from calibre.ebooks.oeb.polish.css import filter_css
from calibre.ebooks.oeb.polish.pretty import fix_all_html, pretty_all
from calibre.ebooks.oeb.polish.replace import rename_files, replace_file, get_recommended_folders, rationalize_folders
from calibre.ebooks.oeb.polish.split import split, merge, AbortError, multisplit
from calibre.ebooks.oeb.polish.toc import remove_names_from_toc, create_inline_toc
from calibre.ebooks.oeb.polish.utils import link_stylesheets, setup_cssutils_serialization as scs
from calibre.gui2 import error_dialog, choose_files, question_dialog, info_dialog, choose_save_file, open_url, choose_dir
from calibre.gui2.dialogs.confirm_delete import confirm
from calibre.gui2.tweak_book import (
    set_current_container, current_container, tprefs, actions, editors,
    set_book_locale, dictionaries, editor_name)
from calibre.gui2.tweak_book.completion.worker import completion_worker
from calibre.gui2.tweak_book.undo import GlobalUndoHistory
from calibre.gui2.tweak_book.file_list import NewFileDialog
from calibre.gui2.tweak_book.save import SaveManager, save_container, find_first_existing_ancestor
from calibre.gui2.tweak_book.preview import parse_worker
from calibre.gui2.tweak_book.toc import TOCEditor
from calibre.gui2.tweak_book.editor import editor_from_syntax, syntax_from_mime
from calibre.gui2.tweak_book.editor.insert_resource import get_resource_data, NewBook
from calibre.gui2.tweak_book.preferences import Preferences
from calibre.gui2.tweak_book.search import validate_search_request, run_search
from calibre.gui2.tweak_book.spell import find_next as find_next_word, find_next_error
from calibre.gui2.tweak_book.widgets import (
    RationalizeFolders, MultiSplit, ImportForeign, QuickOpen, InsertLink,
    InsertSemantics, BusyCursor, InsertTag, FilterCSS, AddCover)
from calibre.utils.config import JSONConfig
from calibre.utils.icu import numeric_sort_key
from calibre.utils.imghdr import identify

_diff_dialogs = []
last_used_transform_rules = []


def get_container(*args, **kwargs):
    kwargs['tweak_mode'] = True
    container = _gc(*args, **kwargs)
    return container


def setup_cssutils_serialization():
    scs(tprefs['editor_tab_stop_width'])


def in_thread_job(func):
    @wraps(func)
    def ans(*args, **kwargs):
        with BusyCursor():
            return func(*args, **kwargs)
    return ans


def get_boss():
    return get_boss.boss


class Boss(QObject):

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
        self.handle_completion_result_signal.connect(self.handle_completion_result, Qt.QueuedConnection)
        self.completion_request_count = 0
        self.editor_cache = JSONConfig('editor-cache', base_path=cache_dir())
        d = self.editor_cache.defaults
        d['edit_book_state'] = {}
        d['edit_book_state_order'] = []

    def __call__(self, gui):
        self.gui = gui
        fl = gui.file_list
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
        self.gui.central.current_editor_changed.connect(self.apply_current_editor_state)
        self.gui.central.close_requested.connect(self.editor_close_requested)
        self.gui.central.search_panel.search_triggered.connect(self.search)
        self.gui.text_search.find_text.connect(self.find_text)
        self.gui.preview.sync_requested.connect(self.sync_editor_to_preview)
        self.gui.preview.split_start_requested.connect(self.split_start_requested)
        self.gui.preview.split_requested.connect(self.split_requested)
        self.gui.preview.link_clicked.connect(self.link_clicked)
        self.gui.check_book.item_activated.connect(self.check_item_activated)
        self.gui.check_book.check_requested.connect(self.check_requested)
        self.gui.check_book.fix_requested.connect(self.fix_requested)
        self.gui.toc_view.navigate_requested.connect(self.link_clicked)
        self.gui.toc_view.refresh_requested.connect(self.commit_all_editors_to_container)
        self.gui.image_browser.image_activated.connect(self.image_activated)
        self.gui.checkpoints.revert_requested.connect(self.revert_requested)
        self.gui.checkpoints.compare_requested.connect(self.compare_requested)
        self.gui.saved_searches.run_saved_searches.connect(self.run_saved_searches)
        self.gui.central.search_panel.save_search.connect(self.save_search)
        self.gui.central.search_panel.show_saved_searches.connect(self.show_saved_searches)
        self.gui.spell_check.find_word.connect(self.find_word)
        self.gui.spell_check.refresh_requested.connect(self.commit_all_editors_to_container)
        self.gui.spell_check.word_replaced.connect(self.word_replaced)
        self.gui.spell_check.word_ignored.connect(self.word_ignored)
        self.gui.spell_check.change_requested.connect(self.word_change_requested)
        self.gui.live_css.goto_declaration.connect(self.goto_style_declaration)
        self.gui.manage_fonts.container_changed.connect(self.apply_container_update_to_gui)
        self.gui.manage_fonts.embed_all_fonts.connect(self.manage_fonts_embed)
        self.gui.manage_fonts.subset_all_fonts.connect(self.manage_fonts_subset)
        self.gui.reports.edit_requested.connect(self.reports_edit_requested)
        self.gui.reports.refresh_starting.connect(self.commit_all_editors_to_container)
        self.gui.reports.delete_requested.connect(self.delete_requested)

    @property
    def currently_editing(self):
        ' Return the name of the file being edited currently or None if no file is being edited '
        return editor_name(self.gui.central.current_editor)

    def preferences(self):
        orig_spell = tprefs['inline_spell_check']
        orig_size = tprefs['toolbar_icon_size']
        p = Preferences(self.gui)
        ret = p.exec_()
        if p.dictionaries_changed:
            dictionaries.clear_caches()
            dictionaries.initialize(force=True)  # Reread user dictionaries
        if p.toolbars_changed:
            self.gui.populate_toolbars()
            for ed in editors.itervalues():
                if hasattr(ed, 'populate_toolbars'):
                    ed.populate_toolbars()
        if orig_size != tprefs['toolbar_icon_size']:
            for ed in editors.itervalues():
                if hasattr(ed, 'bars'):
                    for bar in ed.bars:
                        bar.setIconSize(QSize(tprefs['toolbar_icon_size'], tprefs['toolbar_icon_size']))

        if ret == p.Accepted:
            setup_cssutils_serialization()
            self.gui.apply_settings()
            self.refresh_file_list()
        if ret == p.Accepted or p.dictionaries_changed:
            for ed in editors.itervalues():
                ed.apply_settings(dictionaries_changed=p.dictionaries_changed)
        if orig_spell != tprefs['inline_spell_check']:
            from calibre.gui2.tweak_book.editor.syntax.html import refresh_spell_check_status
            refresh_spell_check_status()
            for ed in editors.itervalues():
                try:
                    ed.editor.highlighter.rehighlight()
                except AttributeError:
                    pass

    def mark_requested(self, name, action):
        self.commit_dirty_opf()
        c = current_container()
        if action == 'cover':
            mark_as_cover(current_container(), name)
        elif action.startswith('titlepage:'):
            action, move_to_start = action.partition(':')[0::2]
            move_to_start = move_to_start == 'True'
            mark_as_titlepage(current_container(), name, move_to_start=move_to_start)

        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
        self.gui.file_list.build(c)
        self.set_modified()

    def mkdtemp(self, prefix=''):
        self.container_count += 1
        return tempfile.mkdtemp(prefix='%s%05d-' % (prefix, self.container_count), dir=self.tdir)

    def _check_before_open(self):
        if self.gui.action_save.isEnabled():
            if not question_dialog(self.gui, _('Unsaved changes'), _(
                'The current book has unsaved changes. If you open a new book, they will be lost.'
                ' Are you sure you want to proceed?')):
                return
        if self.save_manager.has_tasks:
            return info_dialog(self.gui, _('Cannot open'),
                        _('The current book is being saved, you cannot open a new book until'
                          ' the saving is completed'), show=True)
        return True

    def new_book(self):
        if not self._check_before_open():
            return
        d = NewBook(self.gui)
        if d.exec_() == d.Accepted:
            fmt = d.fmt.lower()
            path = choose_save_file(self.gui, 'edit-book-new-book', _('Choose file location'),
                                    filters=[(fmt.upper(), (fmt,))], all_files=False)
            if path is not None:
                if not path.lower().endswith('.' + fmt):
                    path = path + '.' + fmt
                from calibre.ebooks.oeb.polish.create import create_book
                create_book(d.mi, path, fmt=fmt)
                self.open_book(path=path)

    def import_book(self, path=None):
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

            def func(src, dest, tdir):
                import_book_as_epub(src, dest)
                return get_container(dest, tdir=tdir)
            self.gui.blocking_job('import_book', _('Importing book, please wait...'), self.book_opened, func, src, dest, tdir=self.mkdtemp())

    def open_book(self, path=None, edit_file=None, clear_notify_data=True, open_folder=False):
        '''
        Open the e-book at ``path`` for editing. Will show an error if the e-book is not in a supported format or the current book has unsaved changes.

        :param edit_file: The name of a file inside the newly opened book to start editing. Can also be a list of names.
        '''
        if isinstance(path, (list, tuple)) and path:
            # Can happen from an file_event_hook on OS X when drag and dropping
            # onto the icon in the dock or using open -a
            path = path[-1]
        if not self._check_before_open():
            return
        if not hasattr(path, 'rpartition'):
            if open_folder:
                path = choose_dir(self.gui, 'open-book-folder-for-tweaking', _('Choose book folder'))
                if path:
                    path = [path]
            else:
                path = choose_files(self.gui, 'open-book-for-tweaking', _('Choose book'),
                                [(_('Books'), [x.lower() for x in SUPPORTED])], all_files=False, select_only_single_file=True)

            if not path:
                return
            path = path[0]

        if not os.path.exists(path):
            return error_dialog(self.gui, _('File not found'), _(
                'The file %s does not exist.') % path, show=True)
        isdir = os.path.isdir(path)
        ext = path.rpartition('.')[-1].upper()
        if ext not in SUPPORTED and not isdir:
            from calibre.ebooks.oeb.polish.import_book import IMPORTABLE
            if ext.lower() in IMPORTABLE:
                return self.import_book(path)
            return error_dialog(self.gui, _('Unsupported format'),
                _('Tweaking is only supported for books in the %s formats.'
                  ' Convert your book to one of these formats first.') % _(' and ').join(sorted(SUPPORTED)),
                show=True)

        for name in tuple(editors):
            self.close_editor(name)
        self.gui.preview.clear()
        self.gui.live_css.clear()
        self.container_count = -1
        if self.tdir:
            shutil.rmtree(self.tdir, ignore_errors=True)
        self.tdir = PersistentTemporaryDirectory()
        self._edit_file_on_open = edit_file
        self._clear_notify_data = clear_notify_data
        self.gui.blocking_job('open_book', _('Opening book, please wait...'), self.book_opened, get_container, path, tdir=self.mkdtemp())

    def book_opened(self, job):
        ef = getattr(self, '_edit_file_on_open', None)
        cn = getattr(self, '_clear_notify_data', True)
        self._edit_file_on_open = None

        if job.traceback is not None:
            if 'DRMError:' in job.traceback:
                from calibre.gui2.dialogs.drm_error import DRMErrorMessage
                return DRMErrorMessage(self.gui).exec_()
            if 'ObfuscationKeyMissing:' in job.traceback:
                return error_dialog(self.gui, _('Failed to open book'), _(
                    'Failed to open book, it has obfuscated fonts, but the obfuscation key is missing from the OPF.'
                    ' Do an EPUB to EPUB conversion before trying to edit this book.'), show=True)

            return error_dialog(self.gui, _('Failed to open book'),
                    _('Failed to open book, click "Show details" for more information.'),
                                det_msg=job.traceback, show=True)
        if cn:
            self.save_manager.clear_notify_data()
        self.gui.check_book.clear_at_startup()
        dictionaries.clear_ignored(), dictionaries.clear_caches()
        parse_worker.clear()
        container = job.result
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
            recent_books = list(tprefs.get('recent-books', []))
            path = os.path.abspath(container.path_to_ebook)
            if path in recent_books:
                recent_books.remove(path)
            recent_books.insert(0, path)
            tprefs['recent-books'] = recent_books[:10]
            self.gui.update_recent_books()
            if iswindows:
                try:
                    from win32com.shell import shell, shellcon
                    shell.SHAddToRecentDocs(shellcon.SHARD_PATHW, path)
                except Exception:
                    import traceback
                    traceback.print_exc()
            if ef:
                if isinstance(ef, type('')):
                    ef = [ef]
                map(self.gui.file_list.request_edit, ef)
            else:
                if tprefs['restore_book_state']:
                    self.restore_book_edit_state()
            self.gui.toc_view.update_if_visible()
            self.add_savepoint(_('Start of editing session'))

    def update_editors_from_container(self, container=None, names=None):
        c = container or current_container()
        for name, ed in tuple(editors.iteritems()):
            if c.has_name(name):
                if names is None or name in names:
                    ed.replace_data(c.raw_data(name))
                    ed.is_synced_to_container = True
            else:
                self.close_editor(name)

    def refresh_file_list(self):
        container = current_container()
        self.gui.file_list.build(container)
        completion_worker().clear_caches('names')

    def apply_container_update_to_gui(self, mark_as_modified=True):
        '''
        Update all the components of the user interface to reflect the latest data in the current book container.

        :param mark_as_modified: If True, the book will be marked as modified, so the user will be prompted to save it
            when quitting.
        '''
        self.refresh_file_list()
        self.update_global_history_actions()
        self.update_editors_from_container()
        if mark_as_modified:
            self.set_modified()
        self.gui.toc_view.update_if_visible()
        completion_worker().clear_caches()
        self.gui.preview.start_refresh_timer()

    @in_thread_job
    def delete_requested(self, spine_items, other_items):
        self.add_savepoint(_('Before: Delete files'))
        self.commit_dirty_opf()
        c = current_container()
        c.remove_from_spine(spine_items)
        for name in other_items:
            c.remove_item(name)
        self.set_modified()
        self.gui.file_list.delete_done(spine_items, other_items)
        spine_names = [x for x, remove in spine_items if remove]
        completion_worker().clear_caches('names')
        for name in spine_names + list(other_items):
            if name in editors:
                self.close_editor(name)
        if not editors:
            self.gui.preview.clear()
            self.gui.live_css.clear()
        changed = remove_names_from_toc(current_container(), spine_names + list(other_items))
        if changed:
            self.gui.toc_view.update_if_visible()
            for toc in changed:
                if toc and toc in editors:
                    editors[toc].replace_data(c.raw_data(toc))
        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))

    def commit_dirty_opf(self):
        c = current_container()
        if c.opf_name in editors and not editors[c.opf_name].is_synced_to_container:
            self.commit_editor_to_container(c.opf_name)

    def reorder_spine(self, items):
        self.add_savepoint(_('Before: Re-order text'))
        c = current_container()
        c.set_spine(items)
        self.set_modified()
        self.gui.file_list.build(current_container())  # needed as the linear flag may have changed on some items
        if c.opf_name in editors:
            editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
        completion_worker().clear_caches('names')

    def add_file(self):
        if not self.ensure_book(_('You must first open a book to tweak, before trying to create new files in it.')):
            return
        self.commit_dirty_opf()
        d = NewFileDialog(self.gui)
        if d.exec_() != d.Accepted:
            return
        added_name = self.do_add_file(d.file_name, d.file_data, using_template=d.using_template, edit_file=True)
        if d.file_name.rpartition('.')[2].lower() in ('ttf', 'otf', 'woff'):
            from calibre.gui2.tweak_book.manage_fonts import show_font_face_rule_for_font_file
            show_font_face_rule_for_font_file(d.file_data, added_name, self.gui)

    def do_add_file(self, file_name, data, using_template=False, edit_file=False):
        self.add_savepoint(_('Before: Add file %s') % self.gui.elided_text(file_name))
        c = current_container()
        adata = data.replace(b'%CURSOR%', b'') if using_template else data
        try:
            added_name = c.add_file(file_name, adata)
        except:
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
        if not self.ensure_book(_('You must first open a book to tweak, before trying to create new files in it.')):
            return

        files = choose_files(self.gui, 'tweak-book-bulk-import-files', _('Choose files'))
        if files:
            folder_map = get_recommended_folders(current_container(), files)
            files = {x:('/'.join((folder, os.path.basename(x))) if folder else os.path.basename(x))
                     for x, folder in folder_map.iteritems()}
            self.add_savepoint(_('Before Add files'))
            c = current_container()
            for path in sorted(files, key=numeric_sort_key):
                name = files[path]
                i = 0
                while c.exists(name) or c.manifest_has_name(name) or c.has_name_case_insensitive(name):
                    i += 1
                    name, ext = name.rpartition('.')[0::2]
                    name = '%s_%d.%s' % (name, i, ext)
                try:
                    with open(path, 'rb') as f:
                        c.add_file(name, f.read())
                except:
                    self.rewind_savepoint()
                    raise
            self.gui.file_list.build(c)
            if c.opf_name in editors:
                editors[c.opf_name].replace_data(c.raw_data(c.opf_name))
            self.set_modified()
            completion_worker().clear_caches('names')

    def add_cover(self):
        d = AddCover(current_container(), self.gui)
        d.import_requested.connect(self.do_add_file)
        try:
            if d.exec_() == d.Accepted and d.file_name is not None:
                report = []
                with BusyCursor():
                    self.add_savepoint(_('Before: Add cover'))
                    set_cover(current_container(), d.file_name, report.append, options={
                        'existing_image':True, 'keep_aspect':tprefs['add_cover_preserve_aspect_ratio']})
                    self.apply_container_update_to_gui()
        finally:
            d.import_requested.disconnect()

    def ensure_book(self, msg):
        if current_container() is None:
            error_dialog(self.gui, _('No book open'), msg, show=True)
            return False
        return True

    def edit_toc(self):
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
        self.commit_all_editors_to_container()
        self.add_savepoint(_('Before: Insert inline Table of Contents'))
        name = create_inline_toc(current_container())
        if name is None:
            self.rewind_savepoint()
            return error_dialog(self.gui, _('No Table of Contents'), _(
                'Cannot create an inline Table of Contents as this book has no existing'
                ' Table of Contents. You must first create a Table of Contents using the'
                ' Edit Table of Contents tool.'), show=True)
        self.apply_container_update_to_gui()
        self.edit_file(name, 'html')

    def polish(self, action, name, parent=None):
        from calibre.gui2.tweak_book.polish import get_customization, show_report
        customization = get_customization(action, name, parent or self.gui)
        if customization is None:
            return
        with BusyCursor():
            self.add_savepoint(_('Before: %s') % name)
            try:
                report, changed = tweak_polish(current_container(), {action:True}, customization=customization)
            except:
                self.rewind_savepoint()
                raise
            if changed:
                self.apply_container_update_to_gui()
        if not changed:
            self.rewind_savepoint()
        show_report(changed, self.current_metadata.title, report, parent or self.gui, self.show_current_diff)

    def transform_styles(self):
        global last_used_transform_rules
        if not self.ensure_book(_('You must first open a book in order to transform styles.')):
            return
        from calibre.gui2.css_transform_rules import RulesDialog
        from calibre.ebooks.css_transform_rules import transform_container
        d = RulesDialog(self.gui)
        d.rules = last_used_transform_rules
        ret = d.exec_()
        last_used_transform_rules = d.rules
        if ret != d.Accepted:
            return
        with BusyCursor():
            self.add_savepoint(_('Before style transformation'))
            try:
                changed = transform_container(current_container(), last_used_transform_rules)
            except:
                self.rewind_savepoint()
                raise
            if changed:
                self.apply_container_update_to_gui()
        if not changed:
            self.rewind_savepoint()
            info_dialog(self.gui, _('No changes'), _(
                'No styles were changed.'), show=True)
            return
        self.show_current_diff()

    def get_external_resources(self):
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

    def manage_fonts(self):
        self.commit_all_editors_to_container()
        self.gui.manage_fonts.display()

    def manage_fonts_embed(self):
        self.polish('embed', _('Embed all fonts'), parent=self.gui.manage_fonts)
        self.gui.manage_fonts.refresh()

    def manage_fonts_subset(self):
        self.polish('subset', _('Subset all fonts'), parent=self.gui.manage_fonts)

    # Renaming {{{

    def rationalize_folders(self):
        c = current_container()
        if not c.SUPPORTS_FILENAMES:
            return error_dialog(self.gui, _('Not supported'),
                _('The %s format does not support file and folder names internally, therefore'
                  ' arranging files into folders is not allowed.') % c.book_type.upper(), show=True)
        d = RationalizeFolders(self.gui)
        if d.exec_() != d.Accepted:
            return
        self.commit_all_editors_to_container()
        name_map = rationalize_folders(c, d.folder_map)
        if not name_map:
            confirm(_(
                'The files in this book are already arranged into folders'), 'already-arranged-into-folders',
                self.gui, pixmap='dialog_information.png', title=_('Nothing to do'), show_cancel_button=False,
                config_set=tprefs, confirm_msg=_('Show this message &again'))
            return
        self.add_savepoint(_('Before: Arrange into folders'))
        self.gui.blocking_job(
            'rationalize_folders', _('Renaming and updating links...'), partial(self.rename_done, name_map),
            rename_files, current_container(), name_map)

    def rename_requested(self, oldname, newname):
        self.commit_all_editors_to_container()
        if guess_type(oldname) != guess_type(newname):
            args = os.path.splitext(oldname) + os.path.splitext(newname)
            if not confirm(
                _('You are changing the file type of {0}<b>{1}</b> to {2}<b>{3}</b>.'
                  ' Doing so can cause problems, are you sure?').format(*args),
                'confirm-filetype-change', parent=self.gui, title=_('Are you sure?'),
                config_set=tprefs):
                return
        if urlnormalize(newname) != newname:
            if not confirm(
                _('The name you have chosen {0} contains special characters, internally'
                  ' it will look like: {1}Try to use only the English alphabet [a-z], numbers [0-9],'
                  ' hyphens and underscores for file names. Other characters can cause problems for '
                  ' different e-book viewers. Are you sure you want to proceed?').format(
                      '<pre>%s</pre>'%newname, '<pre>%s</pre>' % urlnormalize(newname)),
                'confirm-urlunsafe-change', parent=self.gui, title=_('Are you sure?'), config_set=tprefs):
                return
        self.add_savepoint(_('Before: Rename %s') % oldname)
        name_map = {oldname:newname}
        self.gui.blocking_job(
            'rename_file', _('Renaming and updating links...'), partial(self.rename_done, name_map, from_filelist=self.gui.file_list.current_name),
            rename_files, current_container(), name_map)

    def bulk_rename_requested(self, name_map):
        self.add_savepoint(_('Before: Bulk rename'))
        self.gui.blocking_job(
            'bulk_rename_files', _('Renaming and updating links...'), partial(self.rename_done, name_map, from_filelist=self.gui.file_list.current_name),
            rename_files, current_container(), name_map)

    def rename_done(self, name_map, job, from_filelist=None):
        if job.traceback is not None:
            return error_dialog(self.gui, _('Failed to rename files'),
                    _('Failed to rename files, click Show details for more information.'),
                                det_msg=job.traceback, show=True)
        self.gui.file_list.build(current_container())
        self.set_modified()
        for oldname, newname in name_map.iteritems():
            if oldname in editors:
                editors[newname] = ed = editors.pop(oldname)
                ed.change_document_name(newname)
                self.gui.central.rename_editor(editors[newname], newname)
            if self.gui.preview.current_name == oldname:
                self.gui.preview.current_name = newname
        self.apply_container_update_to_gui()
        if from_filelist:
            self.gui.file_list.select_names(frozenset(name_map.itervalues()), current_name=name_map.get(from_filelist))
            self.gui.file_list.file_list.setFocus(Qt.PopupFocusReason)

    # }}}

    # Global history {{{
    def do_global_undo(self):
        container = self.global_undo.undo()
        if container is not None:
            set_current_container(container)
            self.apply_container_update_to_gui()

    def do_global_redo(self):
        container = self.global_undo.redo()
        if container is not None:
            set_current_container(container)
            self.apply_container_update_to_gui()

    def update_global_history_actions(self):
        gu = self.global_undo
        for x, text in (('undo', _('&Revert to')), ('redo', _('&Revert to'))):
            ac = getattr(self.gui, 'action_global_%s' % x)
            ac.setEnabled(getattr(gu, 'can_' + x))
            ac.setText(text + ' "%s"'%(getattr(gu, x + '_msg') or '...'))

    def add_savepoint(self, msg):
        ' Create a restore checkpoint with the name specified as ``msg`` '
        self.commit_all_editors_to_container()
        nc = clone_container(current_container(), self.mkdtemp())
        self.global_undo.add_savepoint(nc, msg)
        set_current_container(nc)
        self.update_global_history_actions()

    def rewind_savepoint(self):
        ' Undo the previous creation of a restore checkpoint, useful if you create a checkpoint, then abort the operation with no changes '
        container = self.global_undo.rewind_savepoint()
        if container is not None:
            set_current_container(container)
            self.update_global_history_actions()

    def create_diff_dialog(self, revert_msg=_('&Revert changes'), show_open_in_editor=True):
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
        d.show(), d.raise_(), d.setFocus(Qt.OtherFocusReason), d.setWindowModality(Qt.NonModal)
        if show_open_in_editor:
            d.line_activated.connect(line_activated)
        return d

    def show_current_diff(self, allow_revert=True, to_container=None):
        '''
        Show the changes to the book from its last checkpointed state

        :param allow_revert: If True the diff dialog will have a button to allow the user to revert all changes
        :param to_container: A container object to compare the current container to. If None, the previously checkpointed container is used
        '''
        self.commit_all_editors_to_container()
        d = self.create_diff_dialog()
        d.revert_requested.connect(partial(self.revert_requested, self.global_undo.previous_container))
        other = to_container or self.global_undo.previous_container
        d.container_diff(other, self.global_undo.current_container,
                         names=(self.global_undo.label_for_container(other), self.global_undo.label_for_container(self.global_undo.current_container)))

    def compare_book(self):
        self.commit_all_editors_to_container()
        c = current_container()
        path = choose_files(self.gui, 'select-book-for-comparison', _('Choose book'), filters=[
            (_('%s books') % c.book_type.upper(), (c.book_type,))], select_only_single_file=True, all_files=False)
        if path and path[0]:
            with TemporaryDirectory('_compare') as tdir:
                other = _gc(path[0], tdir=tdir, tweak_mode=True)
                d = self.create_diff_dialog(revert_msg=None)
                d.container_diff(other, c,
                                 names=(_('Other book'), _('Current book')))

    def revert_requested(self, container):
        self.commit_all_editors_to_container()
        nc = self.global_undo.revert_to(container)
        set_current_container(nc)
        self.apply_container_update_to_gui()

    def compare_requested(self, container):
        self.show_current_diff(to_container=container)

    # }}}

    def set_modified(self):
        ' Mark the book as having been modified '
        self.gui.action_save.setEnabled(True)

    def request_completion(self, name, completion_type, completion_data, query=None):
        if completion_type is None:
            completion_worker().clear_caches(completion_data)
            return
        request_id = (self.completion_request_count, name)
        self.completion_request_count += 1
        completion_worker().queue_completion(request_id, completion_type, completion_data, query)
        return request_id[0]

    def handle_completion_result(self, result):
        name = result.request_id[1]
        editor = editors.get(name)
        if editor is not None:
            editor.handle_completion_result(result)

    def fix_html(self, current):
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

    def mark_selected_text(self):
        ed = self.gui.central.current_editor
        if ed is not None:
            ed.mark_selected_text()
            if ed.has_marked_text:
                self.gui.central.search_panel.set_where('selected-text')
            else:
                self.gui.central.search_panel.unset_marked()

    # Editor basic controls {{{
    def do_editor_undo(self):
        ed = self.gui.central.current_editor
        if ed is not None:
            ed.undo()

    def do_editor_redo(self):
        ed = self.gui.central.current_editor
        if ed is not None:
            ed.redo()

    def do_editor_copy(self):
        ed = self.gui.central.current_editor
        if ed is not None:
            ed.copy()

    def do_editor_cut(self):
        ed = self.gui.central.current_editor
        if ed is not None:
            ed.cut()

    def do_editor_paste(self):
        ed = self.gui.central.current_editor
        if ed is not None:
            ed.paste()

    def editor_data_changed(self, editor):
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
    # }}}

    def apply_current_editor_state(self):
        ed = self.gui.central.current_editor
        self.gui.cursor_position_widget.update_position()
        if ed is not None:
            actions['editor-undo'].setEnabled(ed.undo_available)
            actions['editor-redo'].setEnabled(ed.redo_available)
            actions['editor-copy'].setEnabled(ed.copy_available)
            actions['editor-cut'].setEnabled(ed.cut_available)
            actions['go-to-line-number'].setEnabled(ed.has_line_numbers)
            actions['fix-html-current'].setEnabled(ed.syntax == 'html')
            name = editor_name(ed)
            if name is not None and getattr(ed, 'syntax', None) == 'html':
                if self.gui.preview.show(name):
                    # The file being displayed by the preview has changed.
                    # Set the preview's position to the current cursor
                    # position in the editor, in case the editors' cursor
                    # position has not changed, since the last time it was
                    # focused. This is not inefficient since multiple requests
                    # to sync are de-bounced with a 100 msec wait.
                    self.sync_preview_to_editor()
            if name is not None:
                self.gui.file_list.mark_name_as_current(name)
            if ed.has_line_numbers:
                self.gui.cursor_position_widget.update_position(*ed.cursor_position)
        else:
            actions['go-to-line-number'].setEnabled(False)
            self.gui.file_list.clear_currently_edited_name()

    def update_cursor_position(self):
        ed = self.gui.central.current_editor
        if getattr(ed, 'has_line_numbers', False):
            self.gui.cursor_position_widget.update_position(*ed.cursor_position)
        else:
            self.gui.cursor_position_widget.update_position()

    def editor_close_requested(self, editor):
        name = editor_name(editor)
        if not name:
            return
        if not editor.is_synced_to_container:
            self.commit_editor_to_container(name)
        self.close_editor(name)

    def close_editor(self, name):
        ' Close the editor that is editing the file specified by ``name`` '
        editor = editors.pop(name)
        self.gui.central.close_editor(editor)
        editor.break_cycles()
        if not editors or getattr(self.gui.central.current_editor, 'syntax', None) != 'html':
            self.gui.preview.clear()
            self.gui.live_css.clear()

    def insert_character(self):
        self.gui.insert_char.show()

    def manage_snippets(self):
        from calibre.gui2.tweak_book.editor.snippets import UserSnippets
        UserSnippets(self.gui).exec_()

    # Shutdown {{{

    def quit(self):
        if self.doing_terminal_save:
            return False
        if self.save_manager.has_tasks:
            if question_dialog(
                self.gui, _('Are you sure?'), _(
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
            d.l.addWidget(d.m, 0, 1)
            d.bb = QDialogButtonBox(QDialogButtonBox.Cancel)
            d.bb.rejected.connect(d.reject)
            d.bb.accepted.connect(d.accept)
            d.l.addWidget(d.bb, 1, 0, 1, 2)
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
        self.save_state()
        self.gui.blocking_job.set_msg(_('Saving, please wait...'))
        self.gui.blocking_job.start()
        self.doing_terminal_save = True

    def abort_terminal_save(self):
        self.doing_terminal_save = False
        self.gui.blocking_job.stop()

    def check_terminal_save(self):
        if self.doing_terminal_save and not self.save_manager.has_tasks:  # terminal save could have been aborted
            self.shutdown()
            QApplication.instance().quit()

    def shutdown(self):
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
        with self.editor_cache:
            self.save_book_edit_state()
        with tprefs:
            self.gui.save_state()

    def save_book_edit_state(self):
        c = current_container()
        if c and c.path_to_ebook:
            tprefs = self.editor_cache
            mem = tprefs['edit_book_state']
            order = tprefs['edit_book_state_order']
            extra = len(order) - 99
            if extra > 0:
                order = [k for k in order[extra:] if k in mem]
                mem = {k:mem[k] for k in order}
            mem[c.path_to_ebook] = {
                'editors':{name:ed.current_editing_state for name, ed in editors.iteritems()},
                'currently_editing':self.currently_editing,
                'tab_order':self.gui.central.tab_order,
            }
            try:
                order.remove(c.path_to_ebook)
            except ValueError:
                pass
            order.append(c.path_to_ebook)
            tprefs['edit_book_state'] = mem
            tprefs['edit_book_state_order'] = order

    def restore_book_edit_state(self):
        c = current_container()
        if c and c.path_to_ebook:
            tprefs = self.editor_cache
            state = tprefs['edit_book_state'].get(c.path_to_ebook)
            if state is not None:
                opened = set()
                eds = state.get('editors', {})
                for name in state.get('tab_order', ()):
                    if c.has_name(name):
                        try:
                            editor = self.edit_file_requested(name)
                            if editor is not None:
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
    # }}}
<|call|>