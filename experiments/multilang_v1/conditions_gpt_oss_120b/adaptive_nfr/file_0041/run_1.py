from __future__ import with_statement
__license__   = 'GPL v3'
__copyright__ = '2008, Kovid Goyal <kovid at kovidgoyal.net>'

import os
import re
import sys
import time
import traceback
import Queue
import cStringIO
import weakref
from threading import Thread, Event

from PyQt5.Qt import (
    QMenu, QAction, QActionGroup, QIcon, Qt, pyqtSignal, QDialog,
    QObject, QVBoxLayout, QDialogButtonBox, QCursor, QCoreApplication,
    QApplication, QEventLoop)

from calibre.customize.ui import (
    available_input_formats, available_output_formats,
    device_plugins, disabled_device_plugins)
from calibre.devices.interface import DevicePlugin, currently_connected_device
from calibre.devices.errors import (
    UserFeedback, OpenFeedback, OpenFailed, OpenActionNeeded,
    InitialConnectionError, FreeSpaceError, WrongDestinationError,
    BlacklistedDevice)
from calibre.ebooks.covers import cprefs, override_prefs, scale_cover, generate_cover
from calibre.gui2.dialogs.choose_format_device import ChooseFormatDeviceDialog
from calibre.utils.ipc.job import BaseJob
from calibre.devices.scanner import DeviceScanner
from calibre.gui2 import (
    config, error_dialog, Dispatcher, dynamic,
    warning_dialog, info_dialog, choose_dir, FunctionDispatcher,
    show_restart_warning, gprefs, question_dialog)
from calibre.ebooks.metadata import authors_to_string
from calibre import (
    preferred_encoding, prints, force_unicode, as_unicode,
    sanitize_file_name2)
from calibre.utils.filenames import ascii_filename
from calibre.devices.apple.driver import ITUNES_ASYNC
from calibre.devices.folder_device.driver import FOLDER_DEVICE
from calibre.constants import DEBUG
from calibre.utils.config import tweaks, device_prefs
from calibre.utils.img import scale_image
from calibre.library.save_to_disk import find_plugboard
from calibre.ptempfile import PersistentTemporaryFile, force_unicode as filename_to_unicode

class DeviceJob(BaseJob):
    def __init__(self, func, done, job_manager, args=None, kwargs=None,
                 description=''):
        if args is None:
            args = []
        if kwargs is None:
            kwargs = {}
        BaseJob.__init__(self, description)
        self.func = func
        self.callback_on_done = done
        if not isinstance(self.callback_on_done, (Dispatcher,
                                                   FunctionDispatcher)):
            self.callback_on_done = FunctionDispatcher(self.callback_on_done)
        self.args = args
        self.kwargs = kwargs
        self.exception = None
        self.job_manager = job_manager
        self._details = _('No details available.')
        self._aborted = False

    def start_work(self):
        if DEBUG:
            prints('Job:', self.id, self.description, 'started',
                   safe_encode=True)
        self.start_time = time.time()
        self.job_manager.changed_queue.put(self)

    def job_done(self):
        self.duration = time.time() - self.start_time
        self.percent = 1
        if DEBUG:
            prints('DeviceJob:', self.id, self.description,
                   'done, calling callback', safe_encode=True)
        try:
            self.callback_on_done(self)
        except Exception:
            pass
        if DEBUG:
            prints('DeviceJob:', self.id, self.description,
                   'callback returned', safe_encode=True)
        self.job_manager.changed_queue.put(self)

    def report_progress(self, percent, msg=''):
        self.notifications.put((percent, msg))
        self.job_manager.changed_queue.put(self)

    def run(self):
        self.start_work()
        try:
            self.result = self.func(*self.args, **self.kwargs)
            if self._aborted:
                return
        except (Exception, SystemExit) as err:
            if self._aborted:
                return
            self.failed = True
            ex = as_unicode(err)
            self._details = ex + '\n\n' + force_unicode(traceback.format_exc())
            self.exception = err
        finally:
            self.job_done()

    def abort(self, err):
        call_job_done = False
        if self.run_state == self.WAITING:
            self.start_work()
            call_job_done = True
        self._aborted = True
        self.failed = True
        self._details = unicode(err)
        self.exception = err
        if call_job_done:
            self.job_done()

    @property
    def log_file(self):
        return cStringIO.StringIO(self._details.encode('utf-8'))

def device_name_for_plugboards(device_class):
    if hasattr(device_class, 'DEVICE_PLUGBOARD_NAME'):
        return device_class.DEVICE_PLUGBOARD_NAME
    return device_class.__class__.__name__

class BusyCursor(object):
    def __enter__(self):
        QApplication.setOverrideCursor(QCursor(Qt.WaitCursor))

    def __exit__(self, *args):
        QApplication.restoreOverrideCursor()

class DeviceManager(Thread):
    def __init__(self, connected_slot, job_manager, open_feedback_slot,
                 open_feedback_msg, allow_connect_slot,
                 after_callback_feedback_slot, sleep_time=2):
        Thread.__init__(self)
        self.setDaemon(True)
        self.devices = list(device_plugins())
        self.disabled_device_plugins = list(disabled_device_plugins())
        self.managed_devices = [x for x in self.devices if not x.MANAGES_DEVICE_PRESENCE]
        self.unmanaged_devices = [x for x in self.devices if x.MANAGES_DEVICE_PRESENCE]
        self.sleep_time = sleep_time
        self.connected_slot = connected_slot
        self.allow_connect_slot = allow_connect_slot
        self.jobs = Queue.Queue(0)
        self.job_steps = Queue.Queue(0)
        self.keep_going = True
        self.job_manager = job_manager
        self.reported_errors = set()
        self.current_job = None
        self.scanner = DeviceScanner()
        self.connected_device = None
        self.connected_device_kind = None
        self.ejected_devices = set()
        self.mount_connection_requests = Queue.Queue(0)
        self.open_feedback_slot = open_feedback_slot
        self.open_feedback_only_once_seen = set()
        self.after_callback_feedback_slot = after_callback_feedback_slot
        self.open_feedback_msg = open_feedback_msg
        self._device_information = None
        self.current_library_uuid = None
        self.call_shutdown_on_disconnect = False
        self.devices_initialized = Event()
        self.dynamic_plugins = {}

    def report_progress(self, *args):
        pass

    @property
    def is_device_connected(self):
        return self.connected_device is not None

    @property
    def is_device_present(self):
        return self.connected_device is not None and self.connected_device not in self.ejected_devices

    @property
    def device(self):
        return self.connected_device

    def do_connect(self, connected_devices, device_kind):
        for dev, detected_device in connected_devices:
            if dev.OPEN_FEEDBACK_MESSAGE is not None:
                self.open_feedback_slot(dev.OPEN_FEEDBACK_MESSAGE)
            try:
                dev.reset(detected_device=detected_device,
                          report_progress=self.report_progress)
                dev.open(detected_device, self.current_library_uuid)
            except OpenFeedback as e:
                if dev not in self.ejected_devices:
                    self.open_feedback_msg(dev.get_gui_name(), e)
                    self.ejected_devices.add(dev)
                continue
            except OpenFailed:
                raise
            except Exception:
                tb = traceback.format_exc()
                if DEBUG or tb not in self.reported_errors:
                    self.reported_errors.add(tb)
                    prints('Unable to open device', str(dev))
                    prints(tb)
                continue
            self.after_device_connect(dev, device_kind)
            return True
        return False

    def after_device_connect(self, dev, device_kind):
        allow_connect = True
        try:
            uid = dev.get_device_uid()
        except NotImplementedError:
            uid = None
        asked = gprefs.get('ask_to_manage_device', [])
        if dev.ASK_TO_ALLOW_CONNECT and uid and uid not in asked:
            if not self.allow_connect_slot(dev.get_gui_name(), dev.icon):
                allow_connect = False
            asked.append(uid)
            gprefs.set('ask_to_manage_device', asked)
        if not allow_connect:
            dev.ignore_connected_device(uid)
            return
        self.connected_device = currently_connected_device._device = dev
        self.connected_device.specialize_global_preferences(device_prefs)
        self.connected_device_kind = device_kind
        self.connected_slot(True, device_kind)

    def connected_device_removed(self):
        while True:
            try:
                job = self.jobs.get_nowait()
                job.abort(Exception(_('Device no longer connected.')))
            except Queue.Empty:
                break
        try:
            self.connected_device.post_yank_cleanup()
        except Exception:
            pass
        if self.connected_device in self.ejected_devices:
            self.ejected_devices.remove(self.connected_device)
        else:
            self.connected_slot(False, self.connected_device_kind)
        if self.call_shutdown_on_disconnect:
            self.connected_device.shutdown()
            self.call_shutdown_on_disconnect = False
        device_prefs.set_overrides()
        self.connected_device = currently_connected_device._device = None
        self._device_information = None

    def detect_device(self):
        self.scanner.scan()
        if self.is_device_connected:
            self._handle_connected_device()
        else:
            self._handle_unconnected_device()

    def _handle_connected_device(self):
        if self.connected_device.MANAGES_DEVICE_PRESENCE:
            cd = self.connected_device.detect_managed_devices(self.scanner.devices)
            if cd is None:
                self.connected_device_removed()
        else:
            connected, _ = self.scanner.is_device_connected(
                self.connected_device, only_presence=True)
            if not connected:
                if DEBUG:
                    self.scanner.is_device_connected(
                        self.connected_device, only_presence=True, debug=True)
                self.connected_device_removed()

    def _handle_unconnected_device(self):
        for dev in self.unmanaged_devices:
            cd = self._detect_managed(dev)
            if cd is not None:
                if self._open_unmanaged(dev, cd):
                    return
        possibly_connected_devices = self._collect_possible_devices()
        if possibly_connected_devices:
            self._attempt_connection(possibly_connected_devices)

    def _detect_managed(self, dev):
        try:
            return dev.detect_managed_devices(self.scanner.devices)
        except Exception:
            prints('Error during device detection for %s:' % dev)
            traceback.print_exc()
            return None

    def _open_unmanaged(self, dev, cd):
        try:
            dev.open(cd, self.current_library_uuid)
        except BlacklistedDevice as e:
            prints('Ignoring blacklisted device: %s' % as_unicode(e))
        except OpenActionNeeded as e:
            if e.only_once_id not in self.open_feedback_only_once_seen:
                self.open_feedback_only_once_seen.add(e.only_once_id)
                self.open_feedback_msg(e.device_name, e)
        except Exception:
            prints('Error while trying to open %s (Driver: %s)' % (cd, dev))
            traceback.print_exc()
        else:
            self.after_device_connect(dev, 'unmanaged-device')
            return True
        return False

    def _collect_possible_devices(self):
        devices = []
        for device in self.managed_devices:
            if device in self.ejected_devices:
                continue
            try:
                possibly_connected, detected_device = self.scanner.is_device_connected(device)
            except InitialConnectionError as e:
                self.open_feedback_msg(device.get_gui_name(), e)
                continue
            if possibly_connected:
                devices.append((device, detected_device))
        return devices

    def _attempt_connection(self, candidates):
        if not self.do_connect(candidates, device_kind='device'):
            if DEBUG:
                prints('Connect to device failed, retrying in 5 seconds...')
            time.sleep(5)
            if not self.do_connect(candidates, device_kind='device'):
                if DEBUG:
                    prints('Device connect failed again, giving up')

    def mount_device(self, kls, kind, path):
        self.mount_connection_requests.put((kls, kind, path))

    def umount_device(self, *args):
        if self.is_device_connected and not self.job_manager.has_device_jobs():
            if self.connected_device_kind in {'unmanaged-device', 'device'}:
                self.connected_device.eject()
                if self.connected_device_kind != 'unmanaged-device':
                    self.ejected_devices.add(self.connected_device)
                self.connected_slot(False, self.connected_device_kind)
            elif hasattr(self.connected_device, 'unmount_device'):
                self.connected_device.unmount_device()

    def next(self):
        if not self.job_steps.empty():
            try:
                return self.job_steps.get_nowait()
            except Queue.Empty:
                pass
        if not self.jobs.empty():
            try:
                return self.jobs.get_nowait()
            except Queue.Empty:
                pass

    def run_startup(self, dev):
        name = 'unknown'
        try:
            name = dev.__class__.__name__
            dev.startup()
        except Exception:
            prints('Startup method for device %s threw exception' % name)
            traceback.print_exc()

    def run(self):
        for d in self.devices:
            self.run_startup(d)
            n = d.is_dynamically_controllable()
            if n:
                self.dynamic_plugins[n] = d
        self.devices_initialized.set()
        while self.keep_going:
            kls = None
            while True:
                try:
                    kls, device_kind, folder_path = self.mount_connection_requests.get_nowait()
                except Queue.Empty:
                    break
            if kls is not None:
                self._handle_mount(kls, device_kind, folder_path)
            else:
                self.detect_device()
            self._process_jobs()
            if self.keep_going:
                time.sleep(self.sleep_time)
        for p in self.devices:
            try:
                p.shutdown()
            except Exception:
                pass

    def _handle_mount(self, kls, device_kind, folder_path):
        try:
            dev = kls(folder_path)
            self.run_startup(dev)
            self.call_shutdown_on_disconnect = True
            self.do_connect([[dev, None]], device_kind=device_kind)
        except Exception:
            prints('Unable to open %s as device (%s)' % (device_kind, folder_path))
            traceback.print_exc()

    def _process_jobs(self):
        do_sleep = True
        while True:
            job = self.next()
            if job is None:
                break
            do_sleep = False
            self.current_job = job
            if self.device is not None:
                self.device.set_progress_reporter(job.report_progress)
            job.run()
            self.current_job = None
            feedback = getattr(self.device, 'user_feedback_after_callback', None)
            if feedback is not None:
                self.device.user_feedback_after_callback = None
                self.after_callback_feedback_slot(feedback)
        if do_sleep:
            time.sleep(self.sleep_time)

    def create_job_step(self, func, done, description, to_job,
                        args=None, kwargs=None):
        if args is None:
            args = []
        if kwargs is None:
            kwargs = {}
        job = DeviceJob(func, done, self.job_manager,
                        args=args, kwargs=kwargs, description=description)
        self.job_manager.add_job(job)
        if (done is None or isinstance(done, FunctionDispatcher)) and \
                (to_job is not None and to_job == self.current_job):
            self.job_steps.put(job)
        else:
            self.jobs.put(job)
        return job

    def create_job(self, func, done, description, args=None, kwargs=None):
        return self.create_job_step(func, done, description, None, args, kwargs)

    def has_card(self):
        try:
            return bool(self.device.card_prefix())
        except Exception:
            return False

    def _debug_detection(self):
        from calibre.devices import debug
        return debug(plugins=self.devices,
                     disabled_plugins=self.disabled_device_plugins)

    def debug_detection(self, done):
        if self.is_device_connected:
            raise ValueError('Device is currently detected in calibre, cannot debug device detection')
        self.create_job(self._debug_detection, done,
                        _('Debug device detection'))

    def _get_device_information(self):
        info = self.device.get_device_information(end_session=False)
        if len(info) < 5:
            info = tuple(list(info) + [{}])
        info = [i.replace('\x00', '').replace('\x01', '') if isinstance(i, basestring) else i
                for i in info]
        cp = self.device.card_prefix(end_session=False)
        fs = self.device.free_space()
        self._device_information = {'info': info, 'prefixes': cp, 'freespace': fs}
        return info, cp, fs

    def get_device_information(self, done, add_as_step_to_job=None):
        return self.create_job_step(self._get_device_information, done,
                                    description=_('Get device information'),
                                    to_job=add_as_step_to_job)

    def _set_library_information(self, library_name, library_uuid, field_metadata):
        self.device.set_library_info(library_name, library_uuid, field_metadata)

    def set_library_information(self, done, library_name, library_uuid,
                                field_metadata, add_as_step_to_job=None):
        return self.create_job_step(self._set_library_information, done,
                                    args=[library_name, library_uuid, field_metadata],
                                    description=_('Set library information'),
                                    to_job=add_as_step_to_job)

    def slow_driveinfo(self):
        info = self._device_information['info']
        if not info[4] and self.device.SLOW_DRIVEINFO:
            info = list(info)
            info[4] = self.device.get_driveinfo()
            self._device_information['info'] = tuple(info)

    def get_current_device_information(self):
        return self._device_information

    def _books(self):
        mainlist = self.device.books(oncard=None, end_session=False)
        cardalist = self.device.books(oncard='carda')
        cardblist = self.device.books(oncard='cardb')
        return (mainlist, cardalist, cardblist)

    def books(self, done, add_as_step_to_job=None):
        return self.create_job_step(self._books, done,
                                    description=_('Get list of books on device'),
                                    to_job=add_as_step_to_job)

    def _prepare_addable_books(self, paths):
        return self.device.prepare_addable_books(paths)

    def prepare_addable_books(self, done, paths, add_as_step_to_job=None):
        return self.create_job_step(self._prepare_addable_books, done,
                                    args=[paths],
                                    description=_('Prepare files for transfer from device'),
                                    to_job=add_as_step_to_job)

    def _annotations(self, path_map):
        return self.device.get_annotations(path_map)

    def annotations(self, done, path_map, add_as_step_to_job=None):
        return self.create_job_step(self._annotations, done,
                                    args=[path_map],
                                    description=_('Get annotations from device'),
                                    to_job=add_as_step_to_job)

    def _sync_booklists(self, booklists):
        self.device.sync_booklists(booklists, end_session=False)
        return self.device.card_prefix(end_session=False), self.device.free_space()

    def sync_booklists(self, done, booklists, plugboards, add_as_step_to_job=None):
        if hasattr(self.connected_device, 'set_plugboards') and \
                callable(self.connected_device.set_plugboards):
            self.connected_device.set_plugboards(plugboards, find_plugboard)
        return self.create_job_step(self._sync_booklists, done,
                                    args=[booklists],
                                    description=_('Send metadata to device'),
                                    to_job=add_as_step_to_job)

    def upload_collections(self, done, booklist, on_card, add_as_step_to_job=None):
        return self.create_job_step(booklist.rebuild_collections, done,
                                   args=[booklist, on_card],
                                   description=_('Send collections to device'),
                                   to_job=add_as_step_to_job)

    def _upload_books(self, files, names, on_card=None, metadata=None, plugboards=None):
        from calibre.ebooks.metadata.meta import set_metadata
        if hasattr(self.connected_device, 'set_plugboards') and \
                callable(self.connected_device.set_plugboards):
            self.connected_device.set_plugboards(plugboards, find_plugboard)
        if metadata and files and len(metadata) == len(files):
            for f, mi in zip(files, metadata):
                if isinstance(f, unicode):
                    ext = f.rpartition('.')[-1].lower()
                    cpb = find_plugboard(
                        device_name_for_plugboards(self.connected_device),
                        ext, plugboards)
                    if ext:
                        try:
                            if DEBUG:
                                prints('Setting metadata in:', mi.title,
                                       'at:', f, file=sys.__stdout__)
                            with lopen(f, 'r+b') as stream:
                                newmi = mi.deepcopy_metadata() if cpb else mi
                                if cpb:
                                    newmi.template_to_attribute(mi, cpb)
                                nuke_comments = getattr(self.connected_device,
                                                        'NUKE_COMMENTS', None)
                                if nuke_comments is not None:
                                    mi.comments = nuke_comments
                                set_metadata(stream, newmi, stream_type=ext)
                        except Exception:
                            if DEBUG:
                                prints(traceback.format_exc(), file=sys.__stdout__)
        try:
            return self.device.upload_books(files, names, on_card,
                                            metadata=metadata, end_session=False)
        finally:
            if metadata:
                for mi in metadata:
                    try:
                        if mi.cover:
                            os.remove(mi.cover)
                    except Exception:
                        pass

    def upload_books(self, done, files, names, on_card=None, titles=None,
                     metadata=None, plugboards=None, add_as_step_to_job=None):
        desc = ngettext('Upload one book to the device',
                        'Upload {} books to the device',
                        len(names)).format(len(names))
        if titles:
            desc += u':' + u', '.join(titles)
        return self.create_job_step(self._upload_books, done,
                                    to_job=add_as_step_to_job,
                                    args=[files, names],
                                    kwargs={'on_card': on_card,
                                            'metadata': metadata,
                                            'plugboards': plugboards},
                                    description=desc)

    def add_books_to_metadata(self, locations, metadata, booklists):
        self.device.add_books_to_metadata(locations, metadata, booklists)

    def _delete_books(self, paths):
        self.device.delete_books(paths, end_session=True)

    def delete_books(self, done, paths, add_as_step_to_job=None):
        return self.create_job_step(self._delete_books, done,
                                    args=[paths],
                                    description=_('Delete books from device'),
                                    to_job=add_as_step_to_job)

    def remove_books_from_metadata(self, paths, booklists):
        self.device.remove_books_from_metadata(paths, booklists)

    def _save_books(self, paths, target):
        for path in paths:
            name = sanitize_file_name2(os.path.basename(path))
            dest = os.path.join(target, name)
            if os.path.abspath(dest) != os.path.abspath(path):
                with lopen(dest, 'wb') as f:
                    self.device.get_file(path, f)

    def save_books(self, done, paths, target, add_as_step_to_job=None):
        return self.create_job_step(self._save_books, done,
                                    args=[paths, target],
                                    description=_('Download books from device'),
                                    to_job=add_as_step_to_job)

    def _view_book(self, path, target):
        with lopen(target, 'wb') as f:
            self.device.get_file(path, f)
        return target

    def view_book(self, done, path, target, add_as_step_to_job=None):
        return self.create_job_step(self._view_book, done,
                                    args=[path, target],
                                    description=_('View book on device'),
                                    to_job=add_as_step_to_job)

    def set_current_library_uuid(self, uuid):
        self.current_library_uuid = uuid

    def set_driveinfo_name(self, location_code, name):
        if self.connected_device:
            self.connected_device.set_driveinfo_name(location_code, name)

    def _call_request(self, name, method, *args, **kwargs):
        d = self.dynamic_plugins.get(name, None)
        if d:
            return getattr(d, method)(*args, **kwargs)
        return kwargs.get('default', None)

    def start_plugin(self, name):
        return self._call_request(name, 'start_plugin')

    def stop_plugin(self, name):
        self._call_request(name, 'stop_plugin')

    def get_option(self, name, opt_string, default=None):
        return self._call_request(name, 'get_option', opt_string, default=default)

    def set_option(self, name, opt_string, opt_value):
        self._call_request(name, 'set_option', opt_string, opt_value)

    def is_running(self, name):
        return bool(self._call_request(name, 'is_running'))

    def is_enabled(self, name):
        try:
            return bool(self.dynamic_plugins.get(name, None))
        except Exception:
            return False

class DeviceAction(QAction):
    a_s = pyqtSignal(object)

    def __init__(self, dest, delete, specific, icon_path, text, parent=None):
        QAction.__init__(self, QIcon(icon_path), text, parent)
        self.dest = dest
        self.delete = delete
        self.specific = specific
        self.triggered.connect(self.emit_triggered)

    def emit_triggered(self, *args):
        self.a_s.emit(self)

    def __repr__(self):
        return f'{self.__class__.__name__}:{self.dest}:{self.delete}:{self.specific}'

class DeviceMenu(QMenu):
    fetch_annotations = pyqtSignal()
    disconnect_mounted_device = pyqtSignal()
    sync = pyqtSignal(object, object, object)

    def __init__(self, parent=None):
        QMenu.__init__(self, parent)
        self.group = QActionGroup(self)
        self._actions = []
        self._memory = []
        self.set_default_menu = QMenu(_('Set default send to device action'))
        self.set_default_menu.setIcon(QIcon(I('config.png')))
        basic_actions = [
            ('main:', False, False, I('reader.png'), _('Send to main memory')),
            ('carda:0', False, False, I('sd.png'), _('Send to storage card A')),
            ('cardb:0', False, False, I('sd.png'), _('Send to storage card B')),
        ]
        delete_actions = [
            ('main:', True, False, I('reader.png'), _('Main Memory')),
            ('carda:0', True, False, I('sd.png'), _('Storage Card A')),
            ('cardb:0', True, False, I('sd.png'), _('Storage Card B')),
        ]
        specific_actions = [
            ('main:', False, True, I('reader.png'), _('Main Memory')),
            ('carda:0', False, True, I('sd.png'), _('Storage Card A')),
            ('cardb:0', False, True, I('sd.png'), _('Storage Card B')),
        ]
        later_menus = []
        for menu in (self, self.set_default_menu):
            for actions, desc in (
                (basic_actions, ''),
                (specific_actions, _('Send specific format to')),
                (delete_actions, _('Send and delete from library')),
            ):
                mdest = menu if actions is basic_actions else QMenu(desc)
                if actions is not basic_actions:
                    self._memory.append(mdest)
                    later_menus.append(mdest)
                    if menu is self.set_default_menu:
                        menu.addMenu(mdest)
                        menu.addSeparator()
                for dest, delete, specific, icon, text in actions:
                    action = DeviceAction(dest, delete, specific, icon, text, self)
                    self._memory.append(action)
                    if menu is self.set_default_menu:
                        action.setCheckable(True)
                        self.group.addAction(action)
                    else:
                        action.a_s.connect(self.action_triggered)
                        self._actions.append(action)
                    mdest.addAction(action)
                if actions is basic_actions:
                    menu.addSeparator()
        da = config['default_send_to_device_action']
        for action in self.group.actions():
            if repr(action) == da:
                action.setChecked(True)
                break
        else:
            action = list(self.group.actions())[0]
            action.setChecked(True)
            config['default_send_to_device_action'] = repr(action)
        self.group.triggered.connect(self.change_default_action)
        self.addSeparator()
        self.addMenu(later_menus[0])
        self.addSeparator()
        mitem = self.addAction(QIcon(I('eject.png')), _('Eject device'))
        mitem.setEnabled(False)
        mitem.triggered.connect(lambda x: self.disconnect_mounted_device.emit())
        self.disconnect_mounted_device_action = mitem
        self.addSeparator()
        self.addMenu(self.set_default_menu)
        self.addSeparator()
        self.addMenu(later_mmenus[1])
        self.addSeparator()
        annot = self.addAction(_('Fetch annotations (experimental)'))
        annot.setEnabled(False)
        annot.triggered.connect(lambda x: self.fetch_annotations.emit())
        self.annotation_action = annot
        self.enable_device_actions(False)

    def change_default_action(self, action):
        config['default_send_to_device_action'] = repr(action)
        action.setChecked(True)

    def action_triggered(self, action):
        self.sync.emit(action.dest, action.delete, action.specific)

    def trigger_default(self, *args):
        r = config['default_send_to_device_action']
        for action in self._actions:
            if repr(action) == r:
                self.action_triggered(action)
                break

    def enable_device_actions(self, enable, card_prefix=(None, None), device=None):
        for action in self._actions:
            if action.dest in ('main:', 'carda:0', 'cardb:0'):
                if not enable:
                    action.setEnabled(False)
                else:
                    if action.dest == 'main:':
                        action.setEnabled(True)
                    elif action.dest == 'carda:0':
                        action.setEnabled(card_prefix[0] is not None)
                    elif action.dest == 'cardb:0':
                        action.setEnabled(card_prefix[1] is not None)
        annot_enable = enable and getattr(device, 'SUPPORTS_ANNOTATIONS', False)
        self.annotation_action.setEnabled(annot_enable)

class DeviceSignals(QObject):
    device_metadata_available = pyqtSignal()
    device_connection_changed = pyqtSignal(object)

device_signals = DeviceSignals()

class DeviceMixin(object):
    def __init__(self, *args, **kwargs):
        pass

    def init_device_mixin(self):
        self.device_error_dialog = error_dialog(self, _('Error'),
                                                _('Error communicating with device'), ' ')
        self.device_error_dialog.setModal(Qt.NonModal)
        self.device_manager = DeviceManager(
            FunctionDispatcher(self.device_detected),
            self.job_manager,
            Dispatcher(self.status_bar.show_message),
            Dispatcher(self.show_open_feedback),
            FunctionDispatcher(self.allow_connect),
            Dispatcher(self.after_callback_feedback))
        self.device_manager.start()
        self.device_manager.devices_initialized.wait()
        if tweaks['auto_connect_to_folder']:
            self.connect_to_folder_named(tweaks['auto_connect_to_folder'])

    def allow_connect(self, name, icon):
        return question_dialog(self, _('Manage the %s' % name),
                               _('Detected the <b>%s</b>. Do you want calibre to manage it?' % name),
                               show_copy_button=False,
                               override_icon=QIcon(icon))

    def after_callback_feedback(self, feedback):
        title, msg, det_msg = feedback
        info_dialog(self, feedback['title'], feedback['msg'],
                    det_msg=feedback['det_msg']).show()

    def debug_detection(self, done):
        self.debug_detection_callback = weakref.ref(done)
        self.device_manager.debug_detection(FunctionDispatcher(self.debug_detection_done))

    def debug_detection_done(self, job):
        d = self.debug_detection_callback()
        if d is not None:
            d(job)

    def show_open_feedback(self, devname, e):
        try:
            self.__of_dev_mem__ = d = e.custom_dialog(self)
        except NotImplementedError:
            self.__of_dev_mem__ = d = info_dialog(self, devname, e.feedback_msg)
        d.show()

    def auto_convert_question(self, msg, autos):
        autos = u'\n'.join(map(unicode, map(force_unicode, autos)))
        return self.ask_a_yes_no_question(
            _('No suitable formats'), msg,
            ans_when_user_unavailable=True,
            det_msg=autos, skip_dialog_name='auto_convert_before_send')

    def set_default_thumbnail(self, height):
        ratio = height / float(cprefs['cover_height'])
        self.default_thumbnail_prefs = prefs = override_prefs(cprefs)
        scale_cover(prefs, ratio)

    def connect_to_folder_named(self, folder):
        if os.path.isdir(folder):
            self.device_manager.mount_device(kls=FOLDER_DEVICE, kind='folder',
                                            path=folder)

    def connect_to_folder(self):
        dir = choose_dir(self, 'Select Device Folder',
                         _('Select folder to open as device'))
        if dir:
            self.device_manager.mount_device(kls=FOLDER_DEVICE, kind='folder',
                                            path=dir)

    def connect_to_itunes(self):
        self.device_manager.mount_device(kls=ITUNES_ASYNC, kind='itunes',
                                        path=None)

    def disconnect_mounted_device(self):
        self.device_manager.umount_device()

    def configure_connected_device(self):
        if not self.device_manager.is_device_connected:
            return
        if self.job_manager.has_device_jobs(queued_also=True):
            return error_dialog(self, _('Running jobs'),
                                _('Cannot configure the device while there are running device jobs.'), show=True)
        dev = self.device_manager.connected_device
        prefname = f'plugin config dialog:{dev.type}:{dev.name}'
        geom = gprefs.get(prefname, None)
        cw = dev.config_widget()
        config_dialog = QDialog(self)
        config_dialog.setWindowTitle(_('Configure %s' % dev.get_gui_name()))
        config_dialog.setWindowIcon(QIcon(I('config.png')))
        layout = QVBoxLayout(config_dialog)
        config_dialog.setLayout(layout)
        bb = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        bb.accepted.connect(config_dialog.accept)
        bb.rejected.connect(config_dialog.reject)
        layout.addWidget(cw)
        layout.addWidget(bb)
        config_dialog.resize(config_dialog.sizeHint())
        if geom is not None:
            config_dialog.restoreGeometry(geom)

        def validate():
            if cw.validate():
                QDialog.accept(config_dialog)
        config_dialog.accept = validate
        if config_dialog.exec_() == config_dialog.Accepted:
            dev.save_settings(cw)
            gprefs[prefname] = bytearray(config_dialog.saveGeometry())
            if show_restart_warning(_('Restart calibre for the changes to %s to be applied.' % dev.get_gui_name()),
                                   parent=self):
                self.quit(restart=True)

    def _sync_action_triggered(self, *args):
        if hasattr(self, '_sync_menu'):
            self._sync_menu.trigger_default()

    def create_device_menu(self):
        self._sync_menu = DeviceMenu(self)
        self.iactions['Send To Device'].qaction.setMenu(self._sync_menu)
        self.iactions['Connect Share'].build_email_entries()
        self._sync_menu.sync.connect(self.dispatch_sync_event)
        self._sync_menu.fetch_annotations.connect(
            self.iactions['Fetch Annotations'].fetch_annotations)
        self.iactions['Connect Share'].set_state(self.device_connected, None)
        self._sync_menu.disconnect_mounted_device_action.setEnabled(self.device_connected)

    def device_job_exception(self, job):
        if isinstance(getattr(job, 'exception', None), UserFeedback):
            ex = job.exception
            func = {UserFeedback.ERROR: error_dialog,
                    UserFeedback.WARNING: warning_dialog,
                    UserFeedback.INFO: info_dialog}[ex.level]
            func(self, _('Failed'), ex.msg,
                 det_msg=ex.details if ex.details else '', show=True)
            return
        try:
            if 'Could not read 32 bytes on the control bus.' in unicode(job.details):
                error_dialog(self, _('Error talking to device'),
                             _('There was a temporary error talking to the device. Please unplug and reconnect the device or reboot.')).show()
                return
        except Exception:
            pass
        if getattr(job, 'exception', None).__class__.__name__ == 'MTPInvalidSendPathError':
            try:
                from calibre.gui2.device_drivers.mtp_config import SendError
                SendError(self, job.exception).exec_()
                return
            except Exception:
                traceback.print_exc()
        try:
            prints(job.details, file=sys.stderr)
        except Exception:
            pass
        if not self.device_error_dialog.isVisible():
            self.device_error_dialog.set_details(job.details)
            self.device_error_dialog.show()

    def set_device_menu_items_state(self, connected):
        self.iactions['Connect Share'].set_state(connected,
                                                 self.device_manager.device)
        if connected:
            self._sync_menu.disconnect_mounted_device_action.setEnabled(True)
            self._sync_menu.enable_device_actions(True,
                                                   self.device_manager.device.card_prefix(),
                                                   self.device_manager.device)
            self.eject_action.setEnabled(True)
        else:
            self._sync_menu.disconnect_mounted_device_action.setEnabled(False)
            self._sync_menu.enable_device_actions(False)
            self.eject_action.setEnabled(False)

    def device_detected(self, connected, device_kind):
        if connected and not self.device_manager.is_device_connected:
            connected = False
        self.set_device_menu_items_state(connected)
        if connected:
            self.device_connected = device_kind
            self.device_manager.get_device_information(
                FunctionDispatcher(self.info_read))
            self.set_default_thumbnail(
                self.device_manager.device.THUMBNAIL_HEIGHT)
            self.status_bar.show_message(_('Device: ') +
                                         self.device_manager.device.get_gui_name() +
                                         _(' detected.'), 3000)
            self.library_view.set_device_connected(self.device_connected)
            self.refresh_ondevice(reset_only=True)
        else:
            self.device_connected = None
            self.status_bar.device_disconnected()
            for v in (self.memory_view, self.card_a_view, self.card_b_view):
                v.save_state()
            if self.current_view() != self.library_view:
                self.book_details.reset_info()
            self.location_manager.update_devices()
            self.bars_manager.update_bars(reveal_bar=True)
            self.library_view.set_device_connected(self.device_connected)
            for v in (self.memory_view, self.card_a_view, self.card_b_view):
                v.set_database([])
            self.refresh_ondevice()
        device_signals.device_connection_changed.emit(connected)

    def info_read(self, job):
        if job.failed:
            return self.device_job_exception(job)
        info, cp, fs = job.result
        self.location_manager.update_devices(cp, fs,
                                             self.device_manager.device.icon)
        self.bars_manager.update_bars(reveal_bar=True)
        self.status_bar.device_connected(info[0])
        db = self.current_db
        self.device_manager.set_library_information(
            None, os.path.basename(db.library_path),
            db.library_id, db.field_metadata,
            add_as_step_to_job=job)
        self.device_manager.books(FunctionDispatcher(self.metadata_downloaded),
                                  add_as_step_to_job=job)

    def metadata_downloaded(self, job):
        if job.failed:
            self.device_job_exception(job)
            return
        self.device_manager.slow_driveinfo()
        if DEBUG:
            prints('DeviceJob: metadata_downloaded: Starting set_books_in_library')
        self.set_books_in_library(job.result, reset=True,
                                  add_as_step_to_job=job)
        if DEBUG:
            prints('DeviceJob: metadata_downloaded: updating views')
        mainlist, cardalist, cardblist = job.result
        self.memory_view.set_database(mainlist)
        self.memory_view.set_editable(self.device_manager.device.CAN_SET_METADATA,
                                      self.device_manager.device.BACKLOADING_ERROR_MESSAGE is None)
        self.card_a_view.set_database(cardalist)
        self.card_a_view.set_editable(self.device_manager.device.CAN_SET_METADATA,
                                      self.device_manager.device.BACKLOADING_ERROR_MESSAGE is None)
        self.card_b_view.set_database(cardblist)
        self.card_b_view.set_editable(self.device_manager.device.CAN_SET_METADATA,
                                      self.device_manager.device.BACKLOADING_ERROR_MESSAGE is None)
        if DEBUG:
            prints('DeviceJob: metadata_downloaded: syncing')
        self.sync_news()
        self.sync_catalogs()
        if DEBUG:
            prints('DeviceJob: metadata_downloaded: refreshing ondevice')
        self.refresh_ondevice()
        if DEBUG:
            prints('DeviceJob: metadata_downloaded: sending metadata_available signal')
        device_signals.device_metadata_available.emit()

    def refresh_ondevice(self, reset_only=False):
        with self.library_view.preserve_state():
            self.book_on_device(None, reset=True)
            if not reset_only:
                self.library_view.model().refresh_ondevice()

    def remove_paths(self, paths):
        return self.device_manager.delete_books(
            FunctionDispatcher(self.books_deleted), paths)

    def books_deleted(self, job):
        cv, row = self.current_view(), -1
        if cv is not self.library_view:
            row = cv.currentIndex().row()
        for view in (self.memory_view, self.card_a_view, self.card_b_view):
            view.model().deletion_done(job, job.failed)
        if job.failed:
            self.device_job_exception(job)
            return
        dm = self.iactions['Remove Books'].delete_memory
        if job in dm:
            paths, model = dm.pop(job)
            self.device_manager.remove_books_from_metadata(paths,
                                                          self.booklists())
            model.paths_deleted(paths)
        if not self.set_books_in_library(self.booklists(), reset=True,
                                         add_as_step_to_job=job,
                                         do_device_sync=False):
            self.upload_booklists(job)
        self.refresh_ondevice()
        if row > -1:
            cv.set_current_row(row)
        try:
            if not self.current_view().currentIndex().isValid():
                self.current_view().set_current_row()
            self.current_view().refresh_book_details()
        except Exception:
            traceback.print_exc()

    def dispatch_sync_event(self, dest, delete, specific):
        rows = self.library_view.selectionModel().selectedRows()
        if not rows:
            error_dialog(self, _('No books'), _('No books selected to send')).exec_()
            return
        fmt = None
        if specific:
            if not (self.device_connected and self.device_manager and self.device_manager.device):
                error_dialog(self, _('No device'), _('No device connected'), show=True)
                return
            formats = []
            aval_out_formats = available_output_formats()
            format_count = {}
            for row in rows:
                fmts = self.library_view.model().db.formats(row.row())
                if fmts:
                    for f in fmts.split(','):
                        f = f.lower()
                        format_count[f] = format_count.get(f, 0) + 1
            for f in self.device_manager.device.settings().format_map:
                if f in format_count:
                    formats.append((f,
                                    _('%(num)i of %(total)i books') % dict(num=format_count[f],
                                                                           total=len(rows)),
                                    f in aval_out_formats))
                elif f in aval_out_formats:
                    formats.append((f, _('0 of %i books') % len(rows), True))
            d = ChooseFormatDeviceDialog(self, _('Choose format to send to device'), formats)
            if d.exec_() != QDialog.Accepted:
                return
            if d.format():
                fmt = d.format().lower()
        dest_root = dest.partition(':')[0]
        if dest_root in ('main', 'carda', 'cardb'):
            if not self.device_connected or not self.device_manager:
                error_dialog(self, _('No device'), _('Cannot send: No device is connected')).exec_()
                return
            if dest_root in ('carda', 'cardb') and not self.device_manager.has_card():
                error_dialog(self, _('No card'), _('Cannot send: Device has no storage card')).exec_()
                return
            on_card = None if dest_root == 'main' else dest_root
            self.sync_to_device(on_card, delete, fmt)
        elif dest_root == 'mail':
            sub_dest_parts = dest.partition(':')[2].split(';')
            while len(sub_dest_parts) < 3:
                sub_dest_parts.append('')
            to, fmts, subject = sub_dest_parts[0], sub_dest_parts[1], ';'.join(sub_dest_parts[2:])
            fmts = [x.strip().lower() for x in fmts.split(',')]
            self.send_by_mail(to, fmts, delete, subject=subject)
        elif dest_root == 'choosemail':
            from calibre.gui2.email import select_recipients
            data = select_recipients(self)
            if data:
                self.send_multiple_by_mail(data, delete)

    def cover_to_thumbnail(self, data):
        if self.device_manager.device and \
                hasattr(self.device_manager.device, 'THUMBNAIL_WIDTH'):
            try:
                return scale_image(data,
                                   self.device_manager.device.THUMBNAIL_WIDTH,
                                   self.device_manager.device.THUMBNAIL_HEIGHT,
                                   preserve_aspect_ratio=False)
            except Exception:
                pass
            return
        ht = getattr(self.device_manager.device, 'THUMBNAIL_HEIGHT',
                     DevicePlugin.THUMBNAIL_HEIGHT)
        try:
            return scale_image(data, ht, ht,
                               compression_quality=self.device_manager.device.THUMBNAIL_COMPRESSION_QUALITY)
        except Exception:
            pass

    def sync_catalogs(self, send_ids=None, do_auto_convert=True):
        if not self.device_connected:
            return
        settings = self.device_manager.device.settings()
        ids = list(dynamic.get('catalogs_to_be_synced', set())) if send_ids is None else send_ids
        ids = [i for i in ids if self.library_view.model().db.has_id(i)]
        with BusyCursor():
            files, auto_ids = self.library_view.model().get_preferred_formats_from_ids(
                ids, settings.format_map, exclude_auto=do_auto_convert)
        auto = self._collect_auto_ids(auto_ids, settings, do_auto_convert)
        if auto:
            fmt = self._choose_auto_format(settings)
            if fmt:
                autos = [self.library_view.model().db.title(i, index_is_id=True) for i in auto]
                if self.auto_convert_question(
                        _('Auto convert the following books before uploading to the device?'), autos):
                    self.iactions['Convert Books'].auto_convert_catalogs(auto, fmt)
        files = [f for f in files if f]
        if not files:
            dynamic.set('catalogs_to_be_synced', set())
            return
        metadata = self.library_view.model().metadata_for(ids)
        names = self._build_names(metadata, files)
        dynamic.set('catalogs_to_be_synced', set())
        space = {self.location_manager.free[0]: None,
                 self.location_manager.free[1]: 'carda',
                 self.location_manager.free[2]: 'cardb'}
        on_card = space.get(sorted(space.keys(), reverse=True)[0], None)
        self.upload_books(files, names, metadata, on_card=on_card, memory=[files, []])
        self.status_bar.show_message(_('Sending catalogs to device.'), 5000)

    def _collect_auto_ids(self, auto_ids, settings, do_auto_convert):
        auto = []
        if do_auto_convert and auto_ids:
            for id_ in auto_ids:
                dbfmts = self.library_view.model().db.formats(id_, index_is_id=True)
                formats = [] if dbfmts is None else [f.lower() for f in dbfmts.split(',')]
                if set(formats).intersection(available_input_formats()) and \
                        set(settings.format_map).intersection(available_output_formats()):
                    auto.append(id_)
        return auto

    def _choose_auto_format(self, settings):
        for fmt in settings.format_map:
            if fmt in set(settings.format_map).intersection(set(available_output_formats())):
                return fmt
        return None

    def _build_names(self, metadata, files):
        names = []
        for mi, f in zip(metadata, files):
            prefix = ascii_filename(mi.title)
            if not isinstance(prefix, unicode):
                prefix = prefix.decode(preferred_encoding, 'replace')
            prefix = ascii_filename(prefix)
            names.append(f'{prefix}_{id(mi)}{os.path.splitext(f)[1]}')
        return names

    def sync_news(self, send_ids=None, do_auto_convert=True):
        if not self.device_connected:
            return
        del_on_upload = config['delete_news_from_library_on_upload']
        settings = self.device_manager.device.settings()
        ids = list(self.news_to_be_synced) if send_ids is None else send_ids
        ids = [i for i in ids if self.library_view.model().db.has_id(i)]
        with BusyCursor():
            files, auto_ids = self.library_view.model().get_preferred_formats_from_ids(
                ids, settings.format_map, exclude_auto=do_auto_convert)
        auto = self._collect_auto_ids(auto_ids, settings, do_auto_convert)
        if auto:
            fmt = self._choose_auto_format(settings)
            if fmt:
                autos = [self.library_view.model().db.title(i, index_is_id=True) for i in auto]
                if self.auto_convert_question(
                        _('Auto convert the following books before uploading to the device?'), autos):
                    self.iactions['Convert Books'].auto_convert_news(auto, fmt)
        files = [f for f in files if f]
        if not files:
            self.news_to_be_synced = set()
            return
        metadata = self.library_view.model().metadata_for(ids)
        names = self._build_names(metadata, files)
        self.news_to_be_synced = set()
        if config['upload_news_to_device'] and files:
            remove = ids if del_on_upload else []
            space = {self.location_manager.free[0]: None,
                     self.location_manager.free[1]: 'carda',
                     self.location_manager.free[2]: 'cardb'}
            on_card = space.get(sorted(space.keys(), reverse=True)[0], None)
            self.upload_books(files, names, metadata, on_card=on_card, memory=[files, remove])
            self.status_bar.show_message(_('Sending news to device.'), 5000)

    def sync_to_device(self, on_card, delete_from_library,
                       specific_format=None, send_ids=None, do_auto_convert=True):
        ids = [self.library_view.model().id(r)
               for r in self.library_view.selectionModel().selectedRows()] if send_ids is None else send_ids
        if not (self.device_manager and ids and self.device_manager.is_device_connected):
            return
        settings = self.device_manager.device.settings()
        with BusyCursor():
            files, auto_ids = self.library_view.model().get_preferred_formats_from_ids(
                ids, settings.format_map, specific_format=specific_format,
                exclude_auto=do_auto_convert)
        if do_auto_convert:
            ok_ids = set(ids) - set(auto_ids)
            ids = [i for i in ids if i in ok_ids]
        else:
            auto_ids = []
        metadata = self.library_view.model().metadata_for(ids)
        names = self._build_names(metadata, files)
        good_files = [f for f in files if f]
        remove = ids if delete_from_library else []
        self.upload_books(good_files, names, metadata, on_card, memory=[files, remove])
        self.status_bar.show_message(_('Sending books to device.'), 5000)
        if auto_ids:
            self._handle_auto_convert(auto_ids, settings, specific_format)

    def _handle_auto_convert(self, auto_ids, settings, specific_format):
        auto = []
        for id_ in auto_ids:
            if specific_format is None:
                formats = self.library_view.model().db.formats(id_, index_is_id=True)
                formats = formats.split(',') if formats else []
                formats = [f.lower().strip() for f in formats]
                if set(formats).intersection(available_input_formats()) and \
                        set(settings.format_map).intersection(available_output_formats()):
                    auto.append(id_)
            else:
                if specific_format in set(settings.format_map).intersection(set(available_output_formats())):
                    auto.append(id_)
        if auto:
            fmt = specific_format if specific_format in set(settings.format_map).intersection(set(available_output_formats())) else self._choose_auto_format(settings)
            if fmt:
                autos = [self.library_view.model().db.title(i, index_is_id=True) for i in auto]
                if self.auto_convert_question(
                        _('Auto convert the following books before uploading to the device?'), autos):
                    self.iactions['Convert Books'].auto_convert(auto, on_card, fmt)

    def upload_dirtied_booklists(self):
        plugboards = self.library_view.model().db.prefs.get('plugboards', {})
        self.device_manager.sync_booklists(Dispatcher(lambda x: x),
                                           self.booklists(), plugboards)

    def upload_booklists(self, add_as_step_to_job=None):
        plugboards = self.library_view.model().db.prefs.get('plugboards', {})
        self.device_manager.sync_booklists(FunctionDispatcher(self.metadata_synced),
                                           self.booklists(), plugboards,
                                           add_as_step_to_job=add_as_step_to_job)

    def metadata_synced(self, job):
        if job.failed:
            self.device_job_exception(job)
            return
        cp, fs = job.result
        self.location_manager.update_devices(cp, fs,
                                             self.device_manager.device.icon)
        cv, row = self.current_view(), -1
        if cv is not self.library_view:
            row = cv.currentIndex().row()
        self.memory_view.reset()
        self.card_a_view.reset()
        self.card_b_view.reset()
        if row > -1:
            cv.set_current_row(row)

    def _upload_collections(self, job):
        if job.failed:
            self.device_job_exception(job)

    def upload_collections(self, booklist, view=None, oncard=None):
        return self.device_manager.upload_collections(self._upload_collections,
                                                      booklist, oncard)

    def upload_books(self, files, names, metadata, on_card=None, memory=None):
        titles = [i.title for i in metadata]
        plugboards = self.library_view.model().db.prefs.get('plugboards', {})
        job = self.device_manager.upload_books(
            FunctionDispatcher(self.books_uploaded),
            files, names, on_card=on_card,
            metadata=metadata, titles=titles, plugboards=plugboards)
        self.upload_memory[job] = (metadata, on_card, memory, files)

    def books_uploaded(self, job):
        metadata, on_card, memory, files = self.upload_memory.pop(job)
        if job.exception:
            self._handle_upload_exception(job, metadata)
            return
        self.device_manager.add_books_to_metadata(job.result,
                                                  metadata, self.booklists())
        if memory and memory[1]:
            self.library_view.model().delete_books_by_id(memory[1])
        if not self.set_books_in_library(self.booklists(), reset=True,
                                         add_as_step_to_job=job,
                                         do_device_sync=False):
            self.upload_booklists(job)
        self.refresh_ondevice()
        view = self.card_a_view if on_card == 'carda' else \
            self.card_b_view if on_card == 'cardb' else self.memory_view
        view.model().resort(reset=False)
        view.model().research()
        if files:
            for f in files:
                try:
                    rem = not getattr(self.device_manager.device,
                                      'KEEP_TEMP_FILES_AFTER_UPLOAD', False)
                    if rem and 'caltmpfmt.' in f:
                        os.remove(f)
                except Exception:
                    pass

    def _handle_upload_exception(self, job, metadata):
        ex = job.exception
        if isinstance(ex, FreeSpaceError):
            where = 'in main memory.' if 'memory' in str(ex) else 'on the storage card.'
            titles = '\n'.join([f'<li>{mi.title}</li>' for mi in metadata])
            d = error_dialog(self, _('No space on device'),
                             f'<p>Cannot upload books to device there is no more free space available {where}</p>\n<ul>{titles}</ul>')
            d.exec_()
        elif isinstance(ex, WrongDestinationError):
            error_dialog(self, _('Incorrect destination'), unicode(ex), show=True)
        else:
            self.device_job_exception(job)

    def update_metadata_on_device(self):
        self.set_books_in_library(self.booklists(), reset=True, force_send=True)
        self.refresh_ondevice()

    def set_current_library_information(self, library_name, library_uuid, field_metadata):
        self.device_manager.set_current_library_uuid(library_uuid)
        if self.device_manager.is_device_connected:
            self.device_manager.set_library_information(None, library_name,
                                                         library_uuid, field_metadata)

    def book_on_device(self, id, reset=False):
        loc = [None, None, None, 0, set()]
        if reset:
            self.book_db_id_cache = None
            self.book_db_id_counts = None
            self.book_db_uuid_path_map = None
            return loc
        if not self.device_manager.is_device_connected or not hasattr(self, 'db_book_uuid_cache'):
            return loc
        if self.book_db_id_cache is None:
            self._initialize_book_caches()
        for i, present in enumerate(self.book_db_id_cache):
            if id in present:
                loc[i] = True
                loc[3] = self.book_db_id_counts.get(id, 0)
                loc[4] |= self.book_db_uuid_path_map.get(id, set())
        return loc

    def _initialize_book_caches(self):
        self.book_db_id_cache = []
        self.book_db_id_counts = {}
        self.book_db_uuid_path_map = {}
        for i, lst in enumerate(self.booklists()):
            self.book_db_id_cache.append(set())
            for book in lst:
                db_id = getattr(book, 'application_id', None)
                if db_id is not None:
                    self.book_db_id_cache[i].add(db_id)
                    self.book_db_id_counts[db_id] = self.book_db_id_counts.get(db_id, 0) + 1
                    if getattr(book, 'lpath', False):
                        self.book_db_uuid_path_map.setdefault(db_id, set()).add(book.lpath)

    def update_thumbnail(self, book):
        if book.cover and os.access(book.cover, os.R_OK):
            with lopen(book.cover, 'rb') as f:
                book.thumbnail = self.cover_to_thumbnail(f.read())
        else:
            cprefs = self.default_thumbnail_prefs
            book.thumbnail = (cprefs['cover_width'], cprefs['cover_height'],
                              generate_cover(book, prefs=cprefs))

    def set_books_in_library(self, booklists, reset=False, add_as_step_to_job=None,
                             force_send=False, do_device_sync=True):
        if not self.device_manager.is_device_connected:
            return False
        try:
            db = self.library_view.model().db
        except Exception:
            return False
        if reset or not hasattr(self, 'db_book_title_cache'):
            self._build_library_caches(db)
        update_metadata = (device_prefs['manage_device_metadata'] == 'on_connect' or force_send)
        get_covers = update_metadata and getattr(self.device_manager.device, 'WANTS_UPDATED_THUMBNAILS', False)
        desired_thumbnail_height = getattr(self.device_manager.device, 'THUMBNAIL_HEIGHT', 0) if get_covers else 0
        book_ids_to_refresh = set()
        book_formats_to_send = []
        books_with_future_dates = []
        first_call = True
        total = sum(1 for bl in booklists for b in bl if b)
        with BusyCursor():
            for idx, booklist in enumerate(booklists):
                for current_book_count, book in enumerate(booklist):
                    if current_book_count % 100 == 0:
                        self.status_bar.show_message(
                            _('Analyzing books on the device: %d%% finished') %
                            int((float(current_book_count) / total) * 100.0),
                            show_notification=False)
                    if current_book_count % 10 == 0:
                        QCoreApplication.processEvents(
                            flags=QEventLoop.ExcludeUserInputEvents |
                                  QEventLoop.ExcludeSocketNotifiers)
                    self._process_single_book(book, db, update_metadata,
                                              get_covers, desired_thumbnail_height,
                                              first_call, book_ids_to_refresh,
                                              book_formats_to_send,
                                              books_with_future_dates)
                    first_call = False
        if update_metadata:
            if self.device_manager.is_device_connected:
                plugboards = self.library_view.model().db.prefs.get('plugboards', {})
                self.device_manager.sync_booklists(
                    FunctionDispatcher(self.metadata_synced), booklists,
                    plugboards, add_as_step_to_job)
        if book_ids_to_refresh:
            try:
                self.library_view.model().refresh_ids(book_ids_to_refresh,
                                                      current_row=self.library_view.currentIndex().row())
            except Exception:
                traceback.print_exc()
        if book_formats_to_send:
            self._upload_book_formats(book_formats_to_send, db)
        if books_with_future_dates:
            self._show_future_dates_error(books_with_future_dates)
        return update_metadata

    def _build_library_caches(self, db):
        self.db_book_title_cache = {}
        self.db_book_uuid_cache = {}
        for id_ in db.data.iterallids():
            title = self._clean_string(db.title(id_, index_is_id=True))
            entry = self.db_book_title_cache.setdefault(title, {'authors': {}, 'author_sort': {}, 'db_ids': {}})
            authors = self._clean_string(db.authors(id_, index_is_id=True))
            if authors:
                entry['authors'][authors] = id_
            author_sort = db.author_sort(id_, index_is_id=True)
            if author_sort:
                entry['author_sort'][self._clean_string(author_sort)] = id_
            entry['db_ids'][id_] = id_
            self.db_book_uuid_cache[db.uuid(id_, index_is_id=True)] = id_

    def _clean_string(self, x):
        if not x:
            return ''
        return re.sub(r'(?u)\W|[_]', '', x.lower())

    def _process_single_book(self, book, db, update_metadata,
                             get_covers, desired_thumbnail_height,
                             first_call, book_ids_to_refresh,
                             book_formats_to_send, books_with_future_dates):
        if not book:
            return
        book.in_library = None
        uuid = getattr(book, 'uuid', None)
        if uuid in self.db_book_uuid_cache:
            id_ = self.db_book_uuid_cache[uuid]
            if self._should_update_book(id_, book, db, get_covers,
                                        desired_thumbnail_height, first_call):
                self._update_book_metadata(id_, book, db, get_covers, desired_thumbnail_height)
            book.in_library = 'UUID'
            book.application_id = id_
            return
        title_key = self._clean_string(book.title)
        cache_entry = self.db_book_title_cache.get(title_key)
        if cache_entry:
            self._match_by_metadata(book, cache_entry, db)
        else:
            book.application_id = None
        if not getattr(book, 'author_sort', None) and book.authors:
            book.author_sort = self.library_view.model().db.author_sort_from_authors(book.authors)

    def _should_update_book(self, id_, book, db, get_covers,
                            desired_thumbnail_height, first_call):
        if not self.device_manager.is_device_connected:
            return False
        try:
            sync_result = self.device_manager.device.synchronize_with_db(
                db, id_, book, first_call)
            set_of_ids, (fmt_name, date_bad) = sync_result
            if date_bad:
                books_with_future_dates.append(book.title)
            elif fmt_name:
                book_formats_to_send.append((id_, fmt_name))
            if set_of_ids:
                book_ids_to_refresh.update(set_of_ids)
                return True
            return (db.metadata_last_modified(id_, index_is_id=True) !=
                    getattr(book, 'last_modified', None) or
                    (isinstance(getattr(book, 'thumbnail', None), (list, tuple)) and
                     max(book.thumbnail[0], book.thumbnail[1]) != desired_thumbnail_height))
        except Exception:
            return True

    def _update_book_metadata(self, id_, book, db, get_covers, desired_thumbnail_height):
        mi = db.get_metadata(id_, index_is_id=True, get_cover=get_covers)
        book.smart_update(mi, replace_metadata=True)
        if get_covers and desired_thumbnail_height:
            self.update_thumbnail(book)

    def _match_by_metadata(self, book, cache_entry, db):
        app_id = getattr(book, 'application_id', None)
        if app_id in cache_entry['db_ids']:
            self._update_book_metadata(app_id, book, db, False, 0)
            book.in_library = 'APP_ID'
            return
        db_id = getattr(book, 'db_id', None)
        if db_id in cache_entry['db_ids']:
            self._update_book_metadata(db_id, book, db, False, 0)
            book.in_library = 'DB_ID'
            book.application_id = db_id
            return
        book.application_id = None
        if book.authors:
            authors_str = self._clean_string(authors_to_string(book.authors))
            if authors_str in cache_entry['authors']:
                id_ = cache_entry['authors'][authors_str]
                self._update_book_metadata(id_, book, db, False, 0)
                book.in_library = 'AUTHOR'
                book.application_id = id_
            elif authors_str in cache_entry['author_sort']:
                id_ = cache_entry['author_sort'][authors_str]
                self._update_book_metadata(id_, book, db, False, 0)
                book.in_library = 'AUTH_SORT'
                book.application_id = id_

    def _upload_book_formats(self, book_formats_to_send, db):
        files, names, metadata = [], [], []
        for id_, fmt_name in book_formats_to_send:
            ext = os.path.splitext(fmt_name)[1][1:]
            fmt_info = db.new_api.format_metadata(id_, ext)
            if fmt_info:
                try:
                    pt = PersistentTemporaryFile(suffix='caltmpfmt.' + ext)
                    db.new_api.copy_format_to(id_, ext, pt)
                    pt.close()
                    files.append(filename_to_unicode(os.path.abspath(pt.name)))
                    names.append(fmt_name)
                    mi = db.new_api.get_metadata(id_, get_cover=True)
                    self.update_thumbnail(mi)
                    metadata.append(mi)
                except Exception:
                    prints('Problem creating temporary file for', fmt_name)
                    traceback.print_exc()
        if files:
            self.upload_books(files, names, metadata)

    def _show_future_dates_error(self, books):
        d = error_dialog(self, _('Book format sync problem'),
                         _('Some book formats in your library cannot be '
                           'synced because they have dates in the future'),
                         det_msg='\n'.join(books),
                         show=False,
                         show_copy_button=True)
        d.show()