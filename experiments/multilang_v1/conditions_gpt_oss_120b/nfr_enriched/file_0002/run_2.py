# This code is part of Ansible, but is an independent component.
# This particular file snippet, and this file snippet only, is BSD licensed.
# Modules you write using this snippet, which is embedded dynamically by Ansible
# still belong to the author of the module, and may assign their own license
# to the complete work.
# 
# Copyright (c), Michael DeHaan <michael.dehaan@gmail.com>, 2012-2013
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without modification, 
# are permitted provided that the following conditions are met:
#
#    * Redistributions of source code must retain the above copyright 
#      notice, this list of conditions and the following disclaimer.
#    * Redistributions in binary form must reproduce the above copyright notice, 
#      this list of conditions and the following disclaimer in the documentation 
#      and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO THE IMPLIED 
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. 
# IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, 
# INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT 
# LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; 
# BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, 
# STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE 
# USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#

# == BEGIN DYNAMICALLY INSERTED CODE ==

ANSIBLE_VERSION = "<<ANSIBLE_VERSION>>"

MODULE_ARGS = "<<INCLUDE_ANSIBLE_MODULE_ARGS>>"
MODULE_COMPLEX_ARGS = "<<INCLUDE_ANSIBLE_MODULE_COMPLEX_ARGS>>"

BOOLEANS_TRUE = ['yes', 'on', '1', 'true', 1]
BOOLEANS_FALSE = ['no', 'off', '0', 'false', 0]
BOOLEANS = BOOLEANS_TRUE + BOOLEANS_FALSE

SELINUX_SPECIAL_FS="<<SELINUX_SPECIAL_FILESYSTEMS>>"

import locale
import os
import re
import pipes
import shlex
import subprocess
import sys
import syslog
import types
import time
import select
import shutil
import stat
import tempfile
import traceback
import grp
import pwd
import platform
import errno

try:
    import json
    try:
        if not isinstance(json.loads, types.FunctionType) or not isinstance(json.dumps, types.FunctionType):
            raise ImportError
    except AttributeError:
        raise ImportError
except ImportError:
    try:
        import simplejson as json
    except ImportError:
        print('{"msg": "Error: ansible requires the stdlib json or simplejson module, neither was found!", "failed": true}')
        sys.exit(1)
    except SyntaxError:
        print('{"msg": "SyntaxError: probably due to installed simplejson being for a different python version", "failed": true}')
        sys.exit(1)

HAVE_SELINUX=False
try:
    import selinux
    HAVE_SELINUX=True
except ImportError:
    pass

HAVE_HASHLIB=False
try:
    from hashlib import sha1 as _sha1
    HAVE_HASHLIB=True
except ImportError:
    from sha import sha as _sha1

try:
    from hashlib import md5 as _md5
except ImportError:
    try:
        from md5 import md5 as _md5
    except ImportError:
        _md5 = None

try:
    from hashlib import sha256 as _sha256
except ImportError:
    pass

try:
    from systemd import journal
    has_journal = True
except ImportError:
    import syslog
    has_journal = False

try:
    from ast import literal_eval as _literal_eval
except ImportError:
    import compiler
    import compiler.ast as compiler_ast

    def _literal_eval(node_or_string):
        """
        Safely evaluate an expression node or a string containing a Python
        expression.  The string or node provided may only consist of the  following
        Python literal structures: strings, numbers, tuples, lists, dicts,  booleans,
        and None.
        """
        _safe_names = {'None': None, 'True': True, 'False': False}
        if isinstance(node_or_string, basestring):
            node_or_string = compiler.parse(node_or_string, mode='eval')
        if isinstance(node_or_string, compiler_ast.Expression):
            node_or_string = node_or_string.node

        def _convert(node):
            if isinstance(node, compiler_ast.Const) and isinstance(node.value, (basestring, int, float, long, complex)):
                return node.value
            elif isinstance(node, compiler_ast.Tuple):
                return tuple(map(_convert, node.nodes))
            elif isinstance(node, compiler_ast.List):
                return list(map(_convert, node.nodes))
            elif isinstance(node, compiler_ast.Dict):
                return dict((_convert(k), _convert(v)) for k, v in node.items())
            elif isinstance(node, compiler_ast.Name):
                if node.name in _safe_names:
                    return _safe_names[node.name]
            elif isinstance(node, compiler_ast.UnarySub):
                return -_convert(node.expr)
            raise ValueError('malformed string')
        return _convert(node_or_string)

FILE_COMMON_ARGUMENTS=dict(
    src = dict(),
    mode = dict(),
    owner = dict(),
    group = dict(),
    seuser = dict(),
    serole = dict(),
    selevel = dict(),
    setype = dict(),
    follow = dict(type='bool', default=False),
    content = dict(no_log=True),
    backup = dict(),
    force = dict(),
    remote_src = dict(),
    regexp = dict(),
    delimiter = dict(),
    directory_mode = dict(),
)

PASSWD_ARG_RE = re.compile(r'^[-]{0,2}pass[-]?(word|wd)?')

def get_platform():
    ''' what's the platform?  example: Linux is a platform. '''
    return platform.system()

def get_distribution():
    ''' return the distribution name '''
    if platform.system() == 'Linux':
        try:
            distribution = platform.linux_distribution()[0].capitalize()
            if not distribution and os.path.isfile('/etc/system-release'):
                distribution = platform.linux_distribution(supported_dists=['system'])[0].capitalize()
                if 'Amazon' in distribution:
                    distribution = 'Amazon'
                else:
                    distribution = 'OtherLinux'
        except:
            distribution = platform.dist()[0].capitalize()
    else:
        distribution = None
    return distribution

def get_distribution_version():
    ''' return the distribution version '''
    if platform.system() == 'Linux':
        try:
            distribution_version = platform.linux_distribution()[1]
            if not distribution_version and os.path.isfile('/etc/system-release'):
                distribution_version = platform.linux_distribution(supported_dists=['system'])[1]
        except:
            distribution_version = platform.dist()[1]
    else:
        distribution_version = None
    return distribution_version

def load_platform_subclass(cls, *args, **kwargs):
    '''
    used by modules like User to have different implementations based on detected platform.  See User
    module for an example.
    '''
    this_platform = get_platform()
    distribution = get_distribution()
    subclass = None

    if distribution is not None:
        for sc in cls.__subclasses__():
            if sc.distribution is not None and sc.distribution == distribution and sc.platform == this_platform:
                subclass = sc
    if subclass is None:
        for sc in cls.__subclasses__():
            if sc.platform == this_platform and sc.distribution is None:
                subclass = sc
    if subclass is None:
        subclass = cls

    return super(cls, subclass).__new__(subclass)

def json_dict_unicode_to_bytes(d):
    ''' Recursively convert dict keys and values to byte str '''
    if isinstance(d, unicode):
        return d.encode('utf-8')
    elif isinstance(d, dict):
        return dict(map(json_dict_unicode_to_bytes, d.iteritems()))
    elif isinstance(d, list):
        return list(map(json_dict_unicode_to_bytes, d))
    elif isinstance(d, tuple):
        return tuple(map(json_dict_unicode_to_bytes, d))
    else:
        return d

def json_dict_bytes_to_unicode(d):
    ''' Recursively convert dict keys and values to unicode '''
    if isinstance(d, str):
        return unicode(d, 'utf-8')
    elif isinstance(d, dict):
        return dict(map(json_dict_bytes_to_unicode, d.iteritems()))
    elif isinstance(d, list):
        return list(map(json_dict_bytes_to_unicode, d))
    elif isinstance(d, tuple):
        return tuple(map(json_dict_bytes_to_unicode, d))
    else:
        return d

def heuristic_log_sanitize(data):
    ''' Remove strings that look like passwords from log messages '''
    output = []
    begin = len(data)
    prev_begin = begin
    sep = 1
    while sep:
        try:
            end = data.rindex('@', 0, begin)
        except ValueError:
            output.insert(0, data[0:begin])
            break
        sep = None
        sep_search_end = end
        while not sep:
            try:
                begin = data.rindex('://', 0, sep_search_end)
            except ValueError:
                begin = 0
            try:
                sep = data.index(':', begin + 3, end)
            except ValueError:
                if begin == 0:
                    output.insert(0, data[0:begin])
                    break
                sep_search_end = begin
                continue
        if sep:
            output.insert(0, data[end:prev_begin])
            output.insert(0, '********')
            output.insert(0, data[begin:sep + 1])
            prev_begin = begin
    return ''.join(output)

class AnsibleModule(object):
    def __init__(self, argument_spec, bypass_checks=False, no_log=False,
                 check_invalid_arguments=True, mutually_exclusive=None, required_together=None,
                 required_one_of=None, add_file_common_args=False, supports_check_mode=False):
        self.argument_spec = argument_spec
        self.supports_check_mode = supports_check_mode
        self.check_mode = False
        self.no_log = no_log
        self.cleanup_files = []
        self.run_command_environ_update = {}
        self.aliases = {}

        if add_file_common_args:
            for k, v in FILE_COMMON_ARGUMENTS.iteritems():
                if k not in self.argument_spec:
                    self.argument_spec[k] = v

        self._check_locale()
        (self.params, self.args) = self._load_params()
        self._legal_inputs = ['CHECKMODE', 'NO_LOG']
        self.aliases = self._handle_aliases()

        if check_invalid_arguments:
            self._check_invalid_arguments()
        self._check_for_check_mode()
        self._check_for_no_log()

        if not bypass_checks:
            self._check_mutually_exclusive(mutually_exclusive)

        self._set_defaults(pre=True)

        if not bypass_checks:
            self._check_required_arguments()
            self._check_argument_values()
            self._check_argument_types()
            self._check_required_together(required_together)
            self._check_required_one_of(required_one_of)

        self._set_defaults(pre=False)
        if not self.no_log:
            self._log_invocation()
        self._set_cwd()

    def load_file_common_arguments(self, params):
        '''Collect common file arguments for modules dealing with files.'''
        path = params.get('path', params.get('dest', None))
        if path is None:
            return {}
        path = os.path.expanduser(path)

        if params.get('follow', False) and os.path.islink(path):
            path = os.path.realpath(path)

        mode = params.get('mode', None)
        owner = params.get('owner', None)
        group = params.get('group', None)

        seuser = params.get('seuser', None)
        serole = params.get('serole', None)
        setype = params.get('setype', None)
        selevel = params.get('selevel', None)
        secontext = [seuser, serole, setype]

        if self.selinux_mls_enabled():
            secontext.append(selevel)

        default_secontext = self.selinux_default_context(path)
        for i in range(len(default_secontext)):
            if i is not None and secontext[i] == '_default':
                secontext[i] = default_secontext[i]

        return dict(
            path=path, mode=mode, owner=owner, group=group,
            seuser=seuser, serole=serole, setype=setype,
            selevel=selevel, secontext=secontext,
        )

    def selinux_mls_enabled(self):
        if not HAVE_SELINUX:
            return False
        return selinux.is_selinux_mls_enabled() == 1

    def selinux_enabled(self):
        if not HAVE_SELINUX:
            seenabled = self.get_bin_path('selinuxenabled')
            if seenabled is not None:
                (rc, out, err) = self.run_command(seenabled)
                if rc == 0:
                    self.fail_json(msg="Aborting, target uses selinux but python bindings (libselinux-python) aren't installed!")
            return False
        return selinux.is_selinux_enabled() == 1

    def selinux_initial_context(self):
        context = [None, None, None]
        if self.selinux_mls_enabled():
            context.append(None)
        return context

    def _to_filesystem_str(self, path):
        '''Return filesystem path as a str, handling unicode.'''
        if isinstance(path, unicode):
            path = path.encode("utf-8")
        return path

    def selinux_default_context(self, path, mode=0):
        context = self.selinux_initial_context()
        if not HAVE_SELINUX or not self.selinux_enabled():
            return context
        try:
            ret = selinux.matchpathcon(self._to_filesystem_str(path), mode)
        except OSError:
            return context
        if ret[0] == -1:
            return context
        return ret[1].split(':', 3)

    def selinux_context(self, path):
        context = self.selinux_initial_context()
        if not HAVE_SELINUX or not self.selinux_enabled():
            return context
        try:
            ret = selinux.lgetfilecon_raw(self._to_filesystem_str(path))
        except OSError, e:
            if e.errno == errno.ENOENT:
                self.fail_json(path=path, msg='path %s does not exist' % path)
            else:
                self.fail_json(path=path, msg='failed to retrieve selinux context')
        if ret[0] == -1:
            return context
        return ret[1].split(':', 3)

    def user_and_group(self, filename):
        filename = os.path.expanduser(filename)
        st = os.lstat(filename)
        return (st.st_uid, st.st_gid)

    def find_mount_point(self, path):
        path = os.path.abspath(os.path.expanduser(os.path.expandvars(path)))
        while not os.path.ismount(path):
            path = os.path.dirname(path)
        return path

    def is_special_selinux_path(self, path):
        """Return (True, context) if path is on a special SELinux filesystem."""
        try:
            f = open('/proc/mounts', 'r')
            mount_data = f.readlines()
            f.close()
        except:
            return (False, None)
        path_mount_point = self.find_mount_point(path)
        for line in mount_data:
            device, mount_point, fstype, options, rest = line.split(' ', 4)
            if path_mount_point == mount_point:
                for fs in SELINUX_SPECIAL_FS.split(','):
                    if fs in fstype:
                        return (True, self.selinux_context(path_mount_point))
        return (False, None)

    def set_default_selinux_context(self, path, changed):
        if not HAVE_SELINUX or not self.selinux_enabled():
            return changed
        context = self.selinux_default_context(path)
        return self.set_context_if_different(path, context, False)

    def set_context_if_different(self, path, context, changed):
        if not HAVE_SELINUX or not self.selinux_enabled():
            return changed
        cur_context = self.selinux_context(path)
        new_context = list(cur_context)
        is_special_se, sp_context = self.is_special_selinux_path(path)
        if is_special_se:
            new_context = sp_context
        else:
            for i in range(len(cur_context)):
                if i < len(context):
                    if context[i] is not None and context[i] != cur_context[i]:
                        new_context[i] = context[i]
                    if context[i] is None:
                        new_context[i] = cur_context[i]
        if cur_context != new_context:
            if self.check_mode:
                return True
            try:
                rc = selinux.lsetfilecon(self._to_filesystem_str(path), str(':'.join(new_context)))
            except OSError:
                self.fail_json(path=path, msg='invalid selinux context', new_context=new_context, cur_context=cur_context, input_was=context)
            if rc != 0:
                self.fail_json(path=path, msg='set selinux context failed')
            changed = True
        return changed

    def set_owner_if_different(self, path, owner, changed):
        path = os.path.expanduser(path)
        if owner is None:
            return changed
        orig_uid, _ = self.user_and_group(path)
        try:
            uid = int(owner)
        except ValueError:
            try:
                uid = pwd.getpwnam(owner).pw_uid
            except KeyError:
                self.fail_json(path=path, msg='chown failed: failed to look up user %s' % owner)
        if orig_uid != uid:
            if self.check_mode:
                return True
            try:
                os.lchown(path, uid, -1)
            except OSError:
                self.fail_json(path=path, msg='chown failed')
            changed = True
        return changed

    def set_group_if_different(self, path, group, changed):
        path = os.path.expanduser(path)
        if group is None:
            return changed
        _, orig_gid = self.user_and_group(path)
        try:
            gid = int(group)
        except ValueError:
            try:
                gid = grp.getgrnam(group).gr_gid
            except KeyError:
                self.fail_json(path=path, msg='chgrp failed: failed to look up group %s' % group)
        if orig_gid != gid:
            if self.check_mode:
                return True
            try:
                os.lchown(path, -1, gid)
            except OSError:
                self.fail_json(path=path, msg='chgrp failed')
            changed = True
        return changed

    def set_mode_if_different(self, path, mode, changed):
        path = os.path.expanduser(path)
        path_stat = os.lstat(path)
        if mode is None:
            return changed
        if not isinstance(mode, int):
            try:
                mode = int(mode, 8)
            except Exception:
                try:
                    mode = self._symbolic_mode_to_octal(path_stat, mode)
                except Exception, e:
                    self.fail_json(path=path, msg="mode must be in octal or symbolic form", details=str(e))
                if mode != stat.S_IMODE(mode):
                    self.fail_json(path=path, msg="Invalid mode supplied, only permission info is allowed", details=mode)
        prev_mode = stat.S_IMODE(path_stat.st_mode)
        if prev_mode != mode:
            if self.check_mode:
                return True
            try:
                if hasattr(os, 'lchmod'):
                    os.lchmod(path, mode)
                else:
                    if not os.path.islink(path):
                        os.chmod(path, mode)
                    else:
                        underlying_stat = os.stat(path)
                        os.chmod(path, mode)
                        new_underlying_stat = os.stat(path)
                        if underlying_stat.st_mode != new_underlying_stat.st_mode:
                            os.chmod(path, stat.S_IMODE(underlying_stat.st_mode))
            except OSError, e:
                if os.path.islink(path) and e.errno == errno.EPERM:
                    pass
                elif e.errno in (errno.ENOENT, errno.ELOOP):
                    pass
                else:
                    raise e
            except Exception, e:
                self.fail_json(path=path, msg='chmod failed', details=str(e))
            new_mode = stat.S_IMODE(os.lstat(path).st_mode)
            if new_mode != prev_mode:
                changed = True
        return changed

    def _symbolic_mode_to_octal(self, path_stat, symbolic_mode):
        new_mode = stat.S_IMODE(path_stat.st_mode)
        mode_re = re.compile(r'^(?P<users>[ugoa]+)(?P<operator>[-+=])(?P<perms>[rwxXst]*|[ugo])$')
        for mode in symbolic_mode.split(','):
            match = mode_re.match(mode)
            if match:
                users = match.group('users')
                operator = match.group('operator')
                perms = match.group('perms')
                if users == 'a':
                    users = 'ugo'
                for user in users:
                    mode_to_apply = self._get_octal_mode_from_symbolic_perms(path_stat, user, perms)
                    new_mode = self._apply_operation_to_mode(user, operator, mode_to_apply, new_mode)
            else:
                raise ValueError("bad symbolic permission for mode: %s" % mode)
        return new_mode

    def _apply_operation_to_mode(self, user, operator, mode_to_apply, current_mode):
        if operator == '=':
            mask = {'u': stat.S_IRWXU | stat.S_ISUID,
                    'g': stat.S_IRWXG | stat.S_ISGID,
                    'o': stat.S_IRWXO | stat.S_ISVTX}[user]
            inverse_mask = mask ^ 07777
            return (current_mode & inverse_mask) | mode_to_apply
        if operator == '+':
            return current_mode | mode_to_apply
        return current_mode - (current_mode & mode_to_apply)

    def _get_octal_mode_from_symbolic_perms(self, path_stat, user, perms):
        prev_mode = stat.S_IMODE(path_stat.st_mode)
        is_directory = stat.S_ISDIR(path_stat.st_mode)
        has_x_permissions = (prev_mode & 00111) > 0
        apply_X_permission = is_directory or has_x_permissions
        X_perms = {'u': {'X': stat.S_IXUSR if apply_X_permission else 0},
                   'g': {'X': stat.S_IXGRP if apply_X_permission else 0},
                   'o': {'X': stat.S_IXOTH if apply_X_permission else 0}}
        user_perms_to_modes = {
            'u': {'r': stat.S_IRUSR, 'w': stat.S_IWUSR, 'x': stat.S_IXUSR,
                  's': stat.S_ISUID, 't': 0,
                  'u': prev_mode & stat.S_IRWXU,
                  'g': (prev_mode & stat.S_IRWXG) << 3,
                  'o': (prev_mode & stat.S_IRWXO) << 6},
            'g': {'r': stat.S_IRGRP, 'w': stat.S_IWGRP, 'x': stat.S_IXGRP,
                  's': stat.S_ISGID, 't': 0,
                  'u': (prev_mode & stat.S_IRWXU) >> 3,
                  'g': prev_mode & stat.S_IRWXG,
                  'o': (prev_mode & stat.S_IRWXO) << 3},
            'o': {'r': stat.S_IROTH, 'w': stat.S_IWOTH, 'x': stat.S_IXOTH,
                  's': 0, 't': stat.S_ISVTX,
                  'u': (prev_mode & stat.S_IRWXU) >> 6,
                  'g': (prev_mode & stat.S_IRWXG) >> 3,
                  'o': prev_mode & stat.S_IRWXO}
        }
        for key, value in X_perms.items():
            user_perms_to_modes[key].update(value)
        return reduce(lambda mode, perm: mode | user_perms_to_modes[user][perm], perms, 0)

    def set_fs_attributes_if_different(self, file_args, changed):
        changed = self.set_context_if_different(file_args['path'], file_args['secontext'], changed)
        changed = self.set_owner_if_different(file_args['path'], file_args['owner'], changed)
        changed = self.set_group_if_different(file_args['path'], file_args['group'], changed)
        changed = self.set_mode_if_different(file_args['path'], file_args['mode'], changed)
        return changed

    def set_directory_attributes_if_different(self, file_args, changed):
        return self.set_fs_attributes_if_different(file_args, changed)

    def set_file_attributes_if_different(self, file_args, changed):
        return self.set_fs_attributes_if_different(file_args, changed)

    def add_path_info(self, kwargs):
        '''Add file metadata to result dictionaries.'''
        path = kwargs.get('path', kwargs.get('dest', None))
        if path is None:
            return kwargs
        if os.path.exists(path):
            uid, gid = self.user_and_group(path)
            kwargs['uid'] = uid
            kwargs['gid'] = gid
            try:
                kwargs['owner'] = pwd.getpwuid(uid)[0]
            except KeyError:
                kwargs['owner'] = str(uid)
            try:
                kwargs['group'] = grp.getgrgid(gid)[0]
            except KeyError:
                kwargs['group'] = str(gid)
            st = os.lstat(path)
            kwargs['mode'] = oct(stat.S_IMODE(st[stat.ST_MODE]))
            if os.path.islink(path):
                kwargs['state'] = 'link'
            elif os.path.isdir(path):
                kwargs['state'] = 'directory'
            elif os.stat(path).st_nlink > 1:
                kwargs['state'] = 'hard'
            else:
                kwargs['state'] = 'file'
            if HAVE_SELINUX and self.selinux_enabled():
                kwargs['secontext'] = ':'.join(self.selinux_context(path))
            kwargs['size'] = st[stat.ST_SIZE]
        else:
            kwargs['state'] = 'absent'
        return kwargs

    def _check_locale(self):
        '''Validate current locale, fallback to C if invalid.'''
        try:
            locale.setlocale(locale.LC_ALL, '')
        except locale.Error:
            locale.setlocale(locale.LC_ALL, 'C')
            os.environ['LANG'] = 'C'
            os.environ['LC_CTYPE'] = 'C'
        except Exception, e:
            self.fail_json(msg="An unknown error was encountered while attempting to validate the locale: %s" % e)

    def _handle_aliases(self):
        aliases_results = {}
        for (k, v) in self.argument_spec.iteritems():
            self._legal_inputs.append(k)
            aliases = v.get('aliases', None)
            default = v.get('default', None)
            required = v.get('required', False)
            if default is not None and required:
                self.fail_json(msg="internal error: required and default are mutually exclusive for %s" % k)
            if aliases is None:
                continue
            if type(aliases) != list:
                self.fail_json(msg='internal error: aliases must be a list')
            for alias in aliases:
                self._legal_inputs.append(alias)
                aliases_results[alias] = k
                if alias in self.params:
                    self.params[k] = self.params[alias]
        return aliases_results

    def _check_for_check_mode(self):
        for (k, v) in self.params.iteritems():
            if k == 'CHECKMODE':
                if not self.supports_check_mode:
                    self.exit_json(skipped=True, msg="remote module does not support check mode")
                self.check_mode = True

    def _check_for_no_log(self):
        for (k, v) in self.params.iteritems():
            if k == 'NO_LOG':
                self.no_log = self.boolean(v)

    def _check_invalid_arguments(self):
        for (k, v) in self.params.iteritems():
            if k not in self._legal_inputs:
                self.fail_json(msg="unsupported parameter for module: %s" % k)

    def _count_terms(self, check):
        return sum(1 for term in check if term in self.params)

    def _check_mutually_exclusive(self, spec):
        if spec is None:
            return
        for check in spec:
            if self._count_terms(check) > 1:
                self.fail_json(msg="parameters are mutually exclusive: %s" % check)

    def _check_required_one_of(self, spec):
        if spec is None:
            return
        for check in spec:
            if self._count_terms(check) == 0:
                self.fail_json(msg="one of the following is required: %s" % ','.join(check))

    def _check_required_together(self, spec):
        if spec is None:
            return
        for check in spec:
            counts = [self._count_terms([field]) for field in check]
            if any(c > 0 for c in counts) and any(c == 0 for c in counts):
                self.fail_json(msg="parameters are required together: %s" % check)

    def _check_required_arguments(self):
        missing = [k for (k, v) in self.argument_spec.iteritems() if v.get('required', False) and k not in self.params]
        if missing:
            self.fail_json(msg="missing required arguments: %s" % ",".join(missing))

    def _check_argument_values(self):
        for (k, v) in self.argument_spec.iteritems():
            choices = v.get('choices', None)
            if choices is None:
                continue
            if isinstance(choices, list) and k in self.params and self.params[k] not in choices:
                choices_str = ",".join(str(c) for c in choices)
                msg = "value of %s must be one of: %s, got: %s" % (k, choices_str, self.params[k])
                self.fail_json(msg=msg)

    def safe_eval(self, expr, locals=None, include_exceptions=False):
        '''Safely evaluate a Python expression without imports or method calls.'''
        if not isinstance(expr, basestring):
            return (expr, None) if include_exceptions else expr
        if re.search(r'\w\.\w+\(', expr) or re.search(r'import \w+', expr):
            return (expr, None) if include_exceptions else expr
        try:
            result = _literal_eval(expr) if not locals else _literal_eval(expr, None, locals)
            return (result, None) if include_exceptions else result
        except Exception, e:
            return (expr, e) if include_exceptions else expr

    def _check_argument_types(self):
        for (k, v) in self.argument_spec.iteritems():
            wanted = v.get('type', None)
            if wanted is None or k not in self.params:
                continue
            value = self.params[k]
            is_invalid = False
            if wanted == 'str':
                if not isinstance(value, basestring):
                    self.params[k] = str(value)
            elif wanted == 'list':
                if not isinstance(value, list):
                    if isinstance(value, basestring):
                        self.params[k] = value.split(",")
                    elif isinstance(value, (int, float)):
                        self.params[k] = [str(value)]
                    else:
                        is_invalid = True
            elif wanted == 'dict':
                if not isinstance(value, dict):
                    if isinstance(value, basestring):
                        if value.startswith("{"):
                            try:
                                self.params[k] = json.loads(value)
                            except:
                                result, exc = self.safe_eval(value, dict(), include_exceptions=True)
                                if exc is not None:
                                    self.fail_json(msg="unable to evaluate dictionary for %s" % k)
                                self.params[k] = result
                        elif '=' in value:
                            self.params[k] = dict([x.strip().split("=", 1) for x in value.split(",")])
                        else:
                            self.fail_json(msg="dictionary requested, could not parse JSON or key=value")
                    else:
                        is_invalid = True
            elif wanted == 'bool':
                if not isinstance(value, bool):
                    if isinstance(value, basestring):
                        self.params[k] = self.boolean(value)
                    else:
                        is_invalid = True
            elif wanted == 'int':
                if not isinstance(value, int):
                    if isinstance(value, basestring):
                        self.params[k] = int(value)
                    else:
                        is_invalid = True
            elif wanted == 'float':
                if not isinstance(value, float):
                    if isinstance(value, basestring):
                        self.params[k] = float(value)
                    else:
                        is_invalid = True
            else:
                self.fail_json(msg="implementation error: unknown type %s requested for %s" % (wanted, k))
            if is_invalid:
                self.fail_json(msg="argument %s is of invalid type: %s, required: %s" % (k, type(value), wanted))

    def _set_defaults(self, pre=True):
        for (k, v) in self.argument_spec.iteritems():
            default = v.get('default', None)
            if pre:
                if default is not None and k not in self.params:
                    self.params[k] = default
            else:
                if k not in self.params:
                    self.params[k] = default

    def _load_params(self):
        '''Parse module arguments from environment variables.'''
        args = MODULE_ARGS
        items = shlex.split(args)
        params = {}
        for x in items:
            try:
                k, v = x.split("=", 1)
            except Exception, e:
                self.fail_json(msg="this module requires key=value arguments (%s)" % items)
            if k in params:
                self.fail_json(msg="duplicate parameter: %s (value=%s)" % (k, v))
            params[k] = v
        params2 = json_dict_unicode_to_bytes(json.loads(MODULE_COMPLEX_ARGS))
        params2.update(params)
        return (params2, args)

    def _log_invocation(self):
        '''Log module invocation, sanitizing passwords.'''
        log_args = {}
        passwd_keys = ['password', 'login_password']
        for param in self.params:
            canon = self.aliases.get(param, param)
            arg_opts = self.argument_spec.get(canon, {})
            no_log = arg_opts.get('no_log', False)
            if self.boolean(no_log):
                log_args[param] = 'NOT_LOGGING_PARAMETER'
            elif param in passwd_keys:
                log_args[param] = 'NOT_LOGGING_PASSWORD'
            else:
                val = self.params[param]
                if not isinstance(val, basestring):
                    val = str(val)
                elif isinstance(val, unicode):
                    val = val.encode('utf-8')
                log_args[param] = heuristic_log_sanitize(val)
        module = 'ansible-%s' % os.path.basename(__file__)
        msg_parts = []
        for arg in log_args:
            val = log_args[arg]
            if not isinstance(val, basestring):
                val = str(val)
            elif isinstance(val, unicode):
                val = val.encode('utf-8')
            msg_parts.append('%s=%s ' % (arg, val))
        msg = 'Invoked with %s' % ''.join(msg_parts) if msg_parts else 'Invoked'
        if isinstance(msg, unicode):
            msg = msg.encode('utf-8')
        if has_journal:
            journal_args = [("MODULE", os.path.basename(__file__))]
            for arg in log_args:
                journal_args.append((arg.upper(), str(log_args[arg])))
            try:
                journal.send("%s %s" % (module, msg), **dict(journal_args))
            except IOError, e:
                syslog.openlog(str(module), 0, syslog.LOG_USER)
                syslog.syslog(syslog.LOG_NOTICE, msg)
        else:
            syslog.openlog(str(module), 0, syslog.LOG_USER)
            syslog.syslog(syslog.LOG_NOTICE, msg)

    def _set_cwd(self):
        try:
            cwd = os.getcwd()
            if not os.access(cwd, os.F_OK | os.R_OK):
                raise
            return cwd
        except:
            for cwd in [os.path.expandvars('$HOME'), tempfile.gettempdir()]:
                try:
                    if os.access(cwd, os.F_OK | os.R_OK):
                        os.chdir(cwd)
                        return cwd
                except:
                    pass
        return None

    def get_bin_path(self, arg, required=False, opt_dirs=[]):
        '''Find executable in PATH or optional directories.'''
        sbin_paths = ['/sbin', '/usr/sbin', '/usr/local/sbin']
        paths = [d for d in opt_dirs if d and os.path.exists(d)]
        paths += os.environ.get('PATH', '').split(os.pathsep)
        for p in sbin_paths:
            if p not in paths and os.path.exists(p):
                paths.append(p)
        for d in paths:
            path = os.path.join(d, arg)
            if os.path.exists(path) and self.is_executable(path):
                if required:
                    return path
                return path
        if required:
            self.fail_json(msg='Failed to find required executable %s' % arg)
        return None

    def boolean(self, arg):
        '''Convert various representations to boolean.'''
        if arg is None or isinstance(arg, bool):
            return arg
        if isinstance(arg, types.StringTypes):
            arg = arg.lower()
        if arg in BOOLEANS_TRUE:
            return True
        if arg in BOOLEANS_FALSE:
            return False
        self.fail_json(msg='Boolean %s not in either boolean list' % arg)

    def jsonify(self, data):
        for encoding in ("utf-8", "latin-1", "unicode_escape"):
            try:
                return json.dumps(data, encoding=encoding)
            except TypeError:
                return json.dumps(data)
            except UnicodeDecodeError:
                continue
        self.fail_json(msg='Invalid unicode encoding encountered')

    def from_json(self, data):
        return json.loads(data)

    def add_cleanup_file(self, path):
        if path not in self.cleanup_files:
            self.cleanup_files.append(path)

    def do_cleanup_files(self):
        for path in self.cleanup_files:
            self.cleanup(path)

    def exit_json(self, **kwargs):
        '''Return successful result.'''
        self.add_path_info(kwargs)
        kwargs.setdefault('changed', False)
        self.do_cleanup_files()
        print self.jsonify(kwargs)
        sys.exit(0)

    def fail_json(self, **kwargs):
        '''Return error result.'''
        self.add_path_info(kwargs)
        assert 'msg' in kwargs, "implementation error -- msg to explain the error is required"
        kwargs['failed'] = True
        self.do_cleanup_files()
        print self.jsonify(kwargs)
        sys.exit(1)

    def is_executable(self, path):
        '''Check if path is executable.'''
        mode = os.stat(path)[stat.ST_MODE]
        return bool(mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH))

    def digest_from_file(self, filename, digest_method):
        '''Return hex digest of file using provided digest method.'''
        if not os.path.exists(filename):
            return None
        if os.path.isdir(filename):
            self.fail_json(msg="attempted to take checksum of directory: %s" % filename)
        digest = digest_method
        blocksize = 64 * 1024
        with open(filename, 'rb') as infile:
            while True:
                block = infile.read(blocksize)
                if not block:
                    break
                digest.update(block)
        return digest.hexdigest()

    def md5(self, filename):
        '''Return MD5 digest; may be unavailable in FIPS mode.'''
        if not _md5:
            raise ValueError('MD5 not available.  Possibly running in FIPS mode')
        return self.digest_from_file(filename, _md5())

    def sha1(self, filename):
        '''Return SHA1 digest.'''
        return self.digest_from_file(filename, _sha1())

    def sha256(self, filename):
        '''Return SHA-256 digest; requires hashlib.'''
        if not HAVE_HASHLIB:
            self.fail_json(msg="SHA-256 checksums require hashlib, which is available in Python 2.5 and higher")
        return self.digest_from_file(filename, _sha256())

    def backup_local(self, fn):
        '''Create timestamped backup of a file.'''
        ext = time.strftime("%Y-%m-%d@%H:%M:%S~", time.localtime(time.time()))
        backupdest = '%s.%s' % (fn, ext)
        try:
            shutil.copy2(fn, backupdest)
        except (shutil.Error, IOError), e:
            self.fail_json(msg='Could not make backup of %s to %s: %s' % (fn, backupdest, e))
        return backupdest

    def cleanup(self, tmpfile):
        if os.path.exists(tmpfile):
            try:
                os.unlink(tmpfile)
            except OSError, e:
                sys.stderr.write("could not cleanup %s: %s" % (tmpfile, e))

    def atomic_move(self, src, dest):
        '''Atomically move src to dest, preserving attributes and SELinux context.'''
        context = None
        dest_stat = None
        if os.path.exists(dest):
            try:
                dest_stat = os.stat(dest)
                os.chmod(src, dest_stat.st_mode & 07777)
                os.chown(src, dest_stat.st_uid, dest_stat.st_gid)
            except OSError, e:
                if e.errno != errno.EPERM:
                    raise
            if self.selinux_enabled():
                context = self.selinux_context(dest)
        else:
            if self.selinux_enabled():
                context = self.selinux_default_context(dest)
        creating = not os.path.exists(dest)
        try:
            login_name = os.getlogin()
        except OSError:
            login_name = os.environ.get('LOGNAME', None)
        switched_user = login_name and login_name != pwd.getpwuid(os.getuid())[0] or os.environ.get('SUDO_USER')
        try:
            os.rename(src, dest)
        except (IOError, OSError), e:
            if e.errno not in [errno.EPERM, errno.EXDEV, errno.EACCES, errno.ETXTBSY]:
                self.fail_json(msg='Could not replace file: %s to %s: %s' % (src, dest, e))
            dest_dir = os.path.dirname(dest)
            dest_file = os.path.basename(dest)
            try:
                tmp_dest = tempfile.NamedTemporaryFile(prefix=".ansible_tmp", dir=dest_dir, suffix=dest_file)
            except (OSError, IOError), e:
                self.fail_json(msg='The destination directory (%s) is not writable by the current user.' % dest_dir)
            try:
                if switched_user and os.getuid() != 0:
                    shutil.copy2(src, tmp_dest.name)
                else:
                    shutil.move(src, tmp_dest.name)
                if self.selinux_enabled():
                    self.set_context_if_different(tmp_dest.name, context, False)
                if dest_stat:
                    tmp_stat = os.stat(tmp_dest.name)
                    if tmp_stat.st_uid != dest_stat.st_uid or tmp_stat.st_gid != dest_stat.st_gid:
                        os.chown(tmp_dest.name, dest_stat.st_uid, dest_stat.st_gid)
                os.rename(tmp_dest.name, dest)
            except (shutil.Error, OSError, IOError), e:
                self.cleanup(tmp_dest.name)
                self.fail_json(msg='Could not replace file: %s to %s: %s' % (src, dest, e))
        if creating:
            umask = os.umask(0)
            os.umask(umask)
            os.chmod(dest, 0666 & ~umask)
            if switched_user:
                os.chown(dest, os.getuid(), os.getgid())
        if self.selinux_enabled():
            self.set_context_if_different(dest, context, False)

    def run_command(self, args, check_rc=False, close_fds=True, executable=None, data=None,
                    binary_data=False, path_prefix=None, cwd=None, use_unsafe_shell=False,
                    prompt_regex=None, environ_update=None):
        '''Execute a command and return (rc, stdout, stderr).'''
        args, shell = self._prepare_args(args, use_unsafe_shell)
        clean_args = self._sanitize_args(args, data, shell)
        old_env = self._apply_environ_updates(environ_update, path_prefix)
        try:
            rc, stdout, stderr = self._execute_process(args, clean_args, data, binary_data,
                                                       cwd, check_rc, prompt_regex)
        finally:
            self._restore_environ(old_env)
        return (rc, stdout, stderr)

    def _prepare_args(self, args, use_unsafe_shell):
        shell = False
        if isinstance(args, list):
            if use_unsafe_shell:
                args = " ".join([pipes.quote(x) for x in args])
                shell = True
        elif isinstance(args, basestring) and use_unsafe_shell:
            shell = True
        elif isinstance(args, basestring):
            args = shlex.split(args.encode('utf-8'))
        else:
            self.fail_json(rc=257, cmd=args, msg="Argument 'args' to run_command must be list or string")
        return args, shell

    def _sanitize_args(self, args, data, shell):
        if isinstance(args, basestring):
            b_args = args.encode('utf-8') if isinstance(args, unicode) else args
            to_clean_args = shlex.split(b_args)
        else:
            to_clean_args = args
        clean_args = []
        is_passwd = False
        for arg in to_clean_args:
            if is_passwd:
                is_passwd = False
                clean_args.append('********')
                continue
            if PASSWD_ARG_RE.match(arg):
                sep_idx = arg.find('=')
                if sep_idx > -1:
                    clean_args.append('%s=********' % arg[:sep_idx])
                    continue
                else:
                    is_passwd = True
            clean_args.append(heuristic_log_sanitize(arg))
        return ' '.join(pipes.quote(arg) for arg in clean_args)

    def _apply_environ_updates(self, environ_update, path_prefix):
        old_env_vals = {}
        for key, val in self.run_command_environ_update.items():
            old_env_vals[key] = os.environ.get(key, None)
            os.environ[key] = val
        if environ_update:
            for key, val in environ_update.items():
                old_env_vals[key] = os.environ.get(key, None)
                os.environ[key] = val
        if path_prefix:
            old_env_vals['PATH'] = os.environ['PATH']
            os.environ['PATH'] = "%s:%s" % (path_prefix, os.environ['PATH'])
        return old_env_vals

    def _restore_environ(self, old_env_vals):
        for key, val in old_env_vals.items():
            if val is None:
                del os.environ[key]
            else:
                os.environ[key] = val

    def _execute_process(self, args, clean_args, data, binary_data, cwd, check_rc, prompt_regex):
        st_in = subprocess.PIPE if data else None
        kwargs = dict(
            executable=None,
            shell=False,
            close_fds=True,
            stdin=st_in,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=os.environ,
        )
        if cwd and os.path.isdir(cwd):
            kwargs['cwd'] = cwd
        prev_dir = os.getcwd()
        if cwd and os.path.isdir(cwd):
            try:
                os.chdir(cwd)
            except (OSError, IOError), e:
                self.fail_json(rc=e.errno, msg="Could not open %s, %s" % (cwd, str(e)))
        try:
            cmd = subprocess.Popen(args, **kwargs)
            stdout, stderr = self._read_process_output(cmd, data, binary_data, prompt_regex)
            rc = cmd.returncode
        except (OSError, IOError), e:
            self.fail_json(rc=e.errno, msg=str(e), cmd=clean_args)
        except:
            self.fail_json(rc=257, msg=traceback.format_exc(), cmd=clean_args)
        finally:
            os.chdir(prev_dir)
        if rc != 0 and check_rc:
            msg = heuristic_log_sanitize(stderr.rstrip())
            self.fail_json(cmd=clean_args, rc=rc, stdout=stdout, stderr=stderr, msg=msg)
        return rc, stdout, stderr

    def _read_process_output(self, cmd, data, binary_data, prompt_regex):
        stdout = ''
        stderr = ''
        rpipes = [cmd.stdout, cmd.stderr]
        if data:
            if not binary_data:
                data += '\n'
            cmd.stdin.write(data)
            cmd.stdin.close()
        prompt_re = re.compile(prompt_regex, re.MULTILINE) if prompt_regex else None
        while True:
            rfd, _, _ = select.select(rpipes, [], rpipes, 1)
            if cmd.stdout in rfd:
                dat = os.read(cmd.stdout.fileno(), 9000)
                stdout += dat
                if dat == '':
                    rpipes.remove(cmd.stdout)
            if cmd.stderr in rfd:
                dat = os.read(cmd.stderr.fileno(), 9000)
                stderr += dat
                if dat == '':
                    rpipes.remove(cmd.stderr)
            if prompt_re and prompt_re.search(stdout) and not data:
                return (257, stdout, "A prompt was encountered while running a command, but no input data was specified")
            if (not rpipes or not rfd) and cmd.poll() is not None:
                break
            if not rpipes and cmd.poll() is None:
                cmd.wait()
                break
        cmd.stdout.close()
        cmd.stderr.close()
        return stdout, stderr

    def append_to_file(self, filename, text):
        filename = os.path.expandvars(os.path.expanduser(filename))
        with open(filename, 'a') as fh:
            fh.write(text)

    def pretty_bytes(self, size):
        ranges = (
            (1 << 70, 'ZB'),
            (1 << 60, 'EB'),
            (1 << 50, 'PB'),
            (1 << 40, 'TB'),
            (1 << 30, 'GB'),
            (1 << 20, 'MB'),
            (1 << 10, 'KB'),
            (1, 'Bytes')
        )
        for limit, suffix in ranges:
            if size >= limit:
                break
        return '%.2f %s' % (float(size) / limit, suffix)

def get_module_path():
    return os.path.dirname(os.path.realpath(__file__))