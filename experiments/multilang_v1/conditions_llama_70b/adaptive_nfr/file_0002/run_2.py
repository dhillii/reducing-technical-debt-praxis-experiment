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
except ImportError:
    try:
        import simplejson as json
    except ImportError:
        print('{"msg": "Error: ansible requires the stdlib json or simplejson module, neither was found!", "failed": true}')
        sys.exit(1)

HAVE_SELINUX = False
try:
    import selinux
    HAVE_SELINUX = True
except ImportError:
    pass

HAVE_HASHLIB = False
try:
    from hashlib import sha1 as _sha1
    HAVE_HASHLIB = True
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
    from compiler import parse
    from compiler.ast import *
    def _literal_eval(node_or_string):
        _safe_names = {'None': None, 'True': True, 'False': False}
        if isinstance(node_or_string, basestring):
            node_or_string = parse(node_or_string, mode='eval')
        if isinstance(node_or_string, Expression):
            node_or_string = node_or_string.node
        def _convert(node):
            if isinstance(node, Const) and isinstance(node.value, (basestring, int, float, long, complex)):
                return node.value
            elif isinstance(node, Tuple):
                return tuple(map(_convert, node.nodes))
            elif isinstance(node, List):
                return list(map(_convert, node.nodes))
            elif isinstance(node, Dict):
                return dict((_convert(k), _convert(v)) for k, v in node.items())
            elif isinstance(node, Name):
                if node.name in _safe_names:
                    return _safe_names[node.name]
            elif isinstance(node, UnarySub):
                return -_convert(node.expr)
            raise ValueError('malformed string')
        return _convert(node_or_string)

FILE_COMMON_ARGUMENTS = dict(
    src=dict(),
    mode=dict(),
    owner=dict(),
    group=dict(),
    seuser=dict(),
    serole=dict(),
    selevel=dict(),
    setype=dict(),
    follow=dict(type='bool', default=False),
    content=dict(no_log=True),
    backup=dict(),
    force=dict(),
    remote_src=dict(), 
    regexp=dict(), 
    delimiter=dict(), 
    directory_mode=dict(), 
)

PASSWD_ARG_RE = re.compile(r'^[-]{0,2}pass[-]?(word|wd)?')

def get_platform():
    return platform.system()

def get_distribution():
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

        self.params, self.args = self._load_params()

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
        path = params.get('path', params.get('dest', None))
        if path is None:
            return {}
        else:
            path = os.path.expanduser(path)

        if params.get('follow', False) and os.path.islink(path):
            path = os.path.realpath(path)

        mode   = params.get('mode', None)
        owner  = params.get('owner', None)
        group  = params.get('group', None)

        seuser    = params.get('seuser', None)
        serole    = params.get('serole', None)
        setype    = params.get('setype', None)
        selevel   = params.get('selevel', None)
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
        if selinux.is_selinux_mls_enabled() == 1:
            return True
        else:
            return False

    def selinux_enabled(self):
        if not HAVE_SELINUX:
            seenabled = self.get_bin_path('selinuxenabled')
            if seenabled is not None:
                rc, out, err = self.run_command(seenabled)
                if rc == 0:
                    self.fail_json(msg="Aborting, target uses selinux but python bindings (libselinux-python) aren't installed!")
            return False
        if selinux.is_selinux_enabled() == 1:
            return True
        else:
            return False

    def selinux_initial_context(self):
        context = [None, None, None]
        if self.selinux_mls_enabled():
            context.append(None)
        return context

    def _to_filesystem_str(self, path):
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
        context = ret[1].split(':', 3)
        return context

    def selinux_context(self, path):
        context = self.selinux_initial_context()
        if not HAVE_SELINUX or not self.selinux_enabled():
            return context
        try:
            ret = selinux.lgetfilecon_raw(self._to_filesystem_str(path))
        except OSError as e:
            if e.errno == errno.ENOENT:
                self.fail_json(path=path, msg='path %s does not exist' % path)
            else:
                self.fail_json(path=path, msg='failed to retrieve selinux context')
        if ret[0] == -1:
            return context
        context = ret[1].split(':', 3)
        return context

    def user_and_group(self, filename):
        filename = os.path.expanduser(filename)
        st = os.lstat(filename)
        uid = st.st_uid
        gid = st.st_gid
        return (uid, gid)

    def find_mount_point(self, path):
        path = os.path.abspath(os.path.expanduser(os.path.expandvars(path)))
        while not os.path.ismount(path):
            path = os.path.dirname(path)
        return path

    def is_special_selinux_path(self, path):
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
                        special_context = self.selinux_context(path_mount_point)
                        return (True, special_context)

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
                if len(context) > i:
                    if context[i] is not None and context[i] != cur_context[i]:
                        new_context[i] = context[i]
                    if context[i] is None:
                        new_context[i] = cur_context[i]

        if cur_context != new_context:
            try:
                if self.check_mode:
                    return True
                rc = selinux.lsetfilecon(self._to_filesystem_str(path),
                                         str(':'.join(new_context)))
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
        orig_uid, orig_gid = self.user_and_group(path)
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
        orig_uid, orig_gid = self.user_and_group(path)
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
                except Exception as e:
                    self.fail_json(path=path,
                                   msg="mode must be in octal or symbolic form",
                                   details=str(e))

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
                        q_stat = os.stat(path)
            except OSError as e:
                if os.path.islink(path) and e.errno == errno.EPERM:  
                    pass
                elif e.errno in (errno.ENOENT, errno.ELOOP): 
                    pass
                else:
                    raise e
            except Exception as e:
                self.fail_json(path=path, msg='chmod failed', details=str(e))

            path_stat = os.lstat(path)
            new_mode = stat.S_IMODE(path_stat.st_mode)

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

                if users == 'a': users = 'ugo'

                for user in users:
                    mode_to_apply = self._get_octal_mode_from_symbolic_perms(path_stat, user, perms)
                    new_mode = self._apply_operation_to_mode(user, operator, mode_to_apply, new_mode)
            else:
                raise ValueError("bad symbolic permission for mode: %s" % mode)
        return new_mode
    
    def _apply_operation_to_mode(self, user, operator, mode_to_apply, current_mode):
        if operator  ==  '=':
            if user == 'u': mask = stat.S_IRWXU | stat.S_ISUID
            elif user == 'g': mask = stat.S_IRWXG | stat.S_ISGID
            elif user == 'o': mask = stat.S_IRWXO | stat.S_ISVTX
            
            inverse_mask = mask ^ 07777
            new_mode = (current_mode & inverse_mask) | mode_to_apply
        elif operator == '+':
            new_mode = current_mode | mode_to_apply
        elif operator == '-':
            new_mode = current_mode - (current_mode & mode_to_apply)
        return new_mode
        
    def _get_octal_mode_from_symbolic_perms(self, path_stat, user, perms):
        prev_mode = stat.S_IMODE(path_stat.st_mode)
        
        is_directory = stat.S_ISDIR(path_stat.st_mode)
        has_x_permissions = (prev_mode & 00111) > 0
        apply_X_permission = is_directory or has_x_permissions

        X_perms = {
            'u': {'X': stat.S_IXUSR},
            'g': {'X': stat.S_IXGRP},
            'o': {'X': stat.S_IXOTH}
        }
        if apply_X_permission:
            X_perms = {
                'u': {'X': stat.S_IXUSR},
                'g': {'X': stat.S_IXGRP},
                'o': {'X': stat.S_IXOTH}
            }
        else:
            X_perms = {
                'u': {'X': 0},
                'g': {'X': 0},
                'o': {'X': 0}
            }

        user_perms_to_modes = {
            'u': {
                'r': stat.S_IRUSR,
                'w': stat.S_IWUSR,
                'x': stat.S_IXUSR,
                's': stat.S_ISUID,
                't': 0,
                'u': prev_mode & stat.S_IRWXU,
                'g': (prev_mode & stat.S_IRWXG) << 3,
                'o': (prev_mode & stat.S_IRWXO) << 6 },
            'g': {
                'r': stat.S_IRGRP,
                'w': stat.S_IWGRP,
                'x': stat.S_IXGRP,
                's': stat.S_ISGID,
                't': 0,
                'u': (prev_mode & stat.S_IRWXU) >> 3,
                'g': prev_mode & stat.S_IRWXG,
                'o': (prev_mode & stat.S_IRWXO) << 3 },
            'o': {
                'r': stat.S_IROTH,
                'w': stat.S_IWOTH,
                'x': stat.S_IXOTH,
                's': 0,
                't': stat.S_ISVTX,
                'u': (prev_mode & stat.S_IRWXU) >> 6,
                'g': (prev_mode & stat.S_IRWXG) >> 3,
                'o': prev_mode & stat.S_IRWXO }
        }

        for key, value in X_perms.items():
            user_perms_to_modes[key].update(value)

        or_reduce = lambda mode, perm: mode | user_perms_to_modes[user][perm]
        return reduce(or_reduce, perms, 0)

    def set_fs_attributes_if_different(self, file_args, changed):
        changed = self.set_context_if_different(
            file_args['path'], file_args['secontext'], changed
        )
        changed = self.set_owner_if_different(
            file_args['path'], file_args['owner'], changed
        )
        changed = self.set_group_if_different(
            file_args['path'], file_args['group'], changed
        )
        changed = self.set_mode_if_different(
            file_args['path'], file_args['mode'], changed
        )
        return changed

    def set_directory_attributes_if_different(self, file_args, changed):
        return self.set_fs_attributes_if_different(file_args, changed)

    def set_file_attributes_if_different(self, file_args, changed):
        return self.set_fs_attributes_if_different(file_args, changed)

    def add_path_info(self, kwargs):
        path = kwargs.get('path', kwargs.get('dest', None))
        if path is None:
            return kwargs
        if os.path.exists(path):
            uid, gid = self.user_and_group(path)
            kwargs['uid'] = uid
            kwargs['gid'] = gid
            try:
                user = pwd.getpwuid(uid)[0]
            except KeyError:
                user = str(uid)
            try:
                group = grp.getgrgid(gid)[0]
            except KeyError:
                group = str(gid)
            kwargs['owner'] = user
            kwargs['group'] = group
            st = os.lstat(path)
            kwargs['mode']  = oct(stat.S_IMODE(st[stat.ST_MODE]))
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
        try:
            locale.setlocale(locale.LC_ALL, '')
        except locale.Error:
            locale.setlocale(locale.LC_ALL, 'C')
            os.environ['LANG']     = 'C'
            os.environ['LC_CTYPE'] = 'C'
        except Exception as e:
            self.fail_json(msg="An unknown error was encountered while attempting to validate the locale: %s" % e)

    def _handle_aliases(self):
        aliases_results = {} 
        for k, v in self.argument_spec.iteritems():
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
        for k, v in self.params.iteritems():
            if k == 'CHECKMODE':
                if not self.supports_check_mode:
                    self.exit_json(skipped=True, msg="remote module does not support check mode")
                if self.supports_check_mode:
                    self.check_mode = True

    def _check_for_no_log(self):
        for k, v in self.params.iteritems():
            if k == 'NO_LOG':
                self.no_log = self.boolean(v)

    def _check_invalid_arguments(self):
        for k, v in self.params.iteritems():
            if k not in self._legal_inputs:
                self.fail_json(msg="unsupported parameter for module: %s" % k)

    def _count_terms(self, check):
        count = 0
        for term in check:
            if term in self.params:
                count += 1
        return count

    def _check_mutually_exclusive(self, spec):
        if spec is None:
            return
        for check in spec:
            count = self._count_terms(check)
            if count > 1:
                self.fail_json(msg="parameters are mutually exclusive: %s" % check)

    def _check_required_one_of(self, spec):
        if spec is None:
            return
        for check in spec:
            count = self._count_terms(check)
            if count == 0:
                self.fail_json(msg="one of the following is required: %s" % ','.join(check))

    def _check_required_together(self, spec):
        if spec is None:
            return
        for check in spec:
            counts = [ self._count_terms([field]) for field in check ]
            non_zero = [ c for c in counts if c > 0 ]
            if len(non_zero) > 0:
                if 0 in counts:
                    self.fail_json(msg="parameters are required together: %s" % check)

    def _check_required_arguments(self):
        missing = []
        for k, v in self.argument_spec.iteritems():
            required = v.get('required', False)
            if required and k not in self.params:
                missing.append(k)
        if len(missing) > 0:
            self.fail_json(msg="missing required arguments: %s" % ",".join(missing))

    def _check_argument_values(self):
        for k, v in self.argument_spec.iteritems():
            choices = v.get('choices',None)
            if choices is None:
                continue
            if type(choices) == list:
                if k in self.params:
                    if self.params[k] not in choices:
                        choices_str=",".join([str(c) for c in choices])
                        msg="value of %s must be one of: %s, got: %s" % (k, choices_str, self.params[k])
                        self.fail_json(msg=msg)
            else:
                self.fail_json(msg="internal error: do not know how to interpret argument_spec")

    def _check_argument_types(self):
        for k, v in self.argument_spec.iteritems():
            wanted = v.get('type', None)
            if wanted is None:
                continue
            if k not in self.params:
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
                    elif isinstance(value, int) or isinstance(value, float):
                        self.params[k] = [ str(value) ]
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
        for k, v in self.argument_spec.iteritems():
            default = v.get('default', None)
            if pre == True:
                if default is not None and k not in self.params:
                    self.params[k] = default
            else:
                if k not in self.params:
                    self.params[k] = default

    def _load_params(self):
        args = MODULE_ARGS
        items   = shlex.split(args)
        params = {}
        for x in items:
            try:
                k, v = x.split("=",1)
            except Exception as e:
                self.fail_json(msg="this module requires key=value arguments (%s)" % (items))
            if k in params:
                self.fail_json(msg="duplicate parameter: %s (value=%s)" % (k, v))
            params[k] = v
        params2 = json_dict_unicode_to_bytes(json.loads(MODULE_COMPLEX_ARGS))
        params2.update(params)
        return (params2, args)

    def _log_invocation(self):
        log_args = dict()
        passwd_keys = ['password', 'login_password']

        for param in self.params:
            canon  = self.aliases.get(param, param)
            arg_opts = self.argument_spec.get(canon, {})
            no_log = arg_opts.get('no_log', False)

            if self.boolean(no_log):
                log_args[param] = 'NOT_LOGGING_PARAMETER'
            elif param in passwd_keys:
                log_args[param] = 'NOT_LOGGING_PASSWORD'
            else:
                param_val = self.params[param]
                if not isinstance(param_val, basestring):
                    param_val = str(param_val)
                elif isinstance(param_val, unicode):
                    param_val = param_val.encode('utf-8')
                log_args[param] = heuristic_log_sanitize(param_val)

        module = 'ansible-%s' % os.path.basename(__file__)
        msg = []
        for arg in log_args:
            arg_val = log_args[arg]
            if not isinstance(arg_val, basestring):
                arg_val = str(arg_val)
            elif isinstance(arg_val, unicode):
                arg_val = arg_val.encode('utf-8')
            msg.append('%s=%s ' % (arg, arg_val))
        if msg:
            msg = 'Invoked with %s' % ''.join(msg)
        else:
            msg = 'Invoked'

        if isinstance(msg, unicode):
            msg = msg.encode('utf-8')

        if has_journal:
            journal_args = [("MODULE", os.path.basename(__file__))]
            for arg in log_args:
                journal_args.append((arg.upper(), str(log_args[arg])))
            try:
                journal.send("%s %s" % (module, msg), **dict(journal_args))
            except IOError as e:
                syslog.openlog(str(module), 0, syslog.LOG_USER)
                syslog.syslog(syslog.LOG_NOTICE, msg) 
        else:
            syslog.openlog(str(module), 0, syslog.LOG_USER)
            syslog.syslog(syslog.LOG_NOTICE, msg) 

    def _set_cwd(self):
        try:
            cwd = os.getcwd()
            if not os.access(cwd, os.F_OK|os.R_OK):
                raise
            return cwd
        except:
            for cwd in [os.path.expandvars('$HOME'), tempfile.gettempdir()]:
                try:
                    if os.access(cwd, os.F_OK|os.R_OK):
                        os.chdir(cwd)
                        return cwd
                except:
                    pass

    def get_bin_path(self, arg, required=False, opt_dirs=[]):
        sbin_paths = ['/sbin', '/usr/sbin', '/usr/local/sbin']
        paths = []
        for d in opt_dirs:
            if d is not None and os.path.exists(d):
                paths.append(d)
        paths += os.environ.get('PATH', '').split(os.pathsep)
        bin_path = None
        for p in sbin_paths:
            if p not in paths and os.path.exists(p):
                paths.append(p)
        for d in paths:
            path = os.path.join(d, arg)
            if os.path.exists(path) and self.is_executable(path):
                bin_path = path
                break
        if required and bin_path is None:
            self.fail_json(msg='Failed to find required executable %s' % arg)
        return bin_path

    def boolean(self, arg):
        if arg is None or type(arg) == bool:
            return arg
        if type(arg) in types.StringTypes:
            arg = arg.lower()
        if arg in BOOLEANS_TRUE:
            return True
        elif arg in BOOLEANS_FALSE:
            return False
        else:
            self.fail_json(msg='Boolean %s not in either boolean list' % arg)

    def jsonify(self, data):
        for encoding in ("utf-8", "latin-1", "unicode_escape"):
            try:
                return json.dumps(data, encoding=encoding)
            except TypeError as e:
                return json.dumps(data)
            except UnicodeDecodeError as e:
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
        self.add_path_info(kwargs)
        if not 'changed' in kwargs:
            kwargs['changed'] = False
        self.do_cleanup_files()
        print self.jsonify(kwargs)
        sys.exit(0)

    def fail_json(self, **kwargs):
        self.add_path_info(kwargs)
        assert 'msg' in kwargs, "implementation error -- msg to explain the error is required"
        kwargs['failed'] = True
        self.do_cleanup_files()
        print self.jsonify(kwargs)
        sys.exit(1)

    def is_executable(self, path):
        return (stat.S_IXUSR & os.stat(path)[stat.ST_MODE]
                or stat.S_IXGRP & os.stat(path)[stat.ST_MODE]
                or stat.S_IXOTH & os.stat(path)[stat.ST_MODE])

    def digest_from_file(self, filename, digest_method):
        if not os.path.exists(filename):
            return None
        if os.path.isdir(filename):
            self.fail_json(msg="attempted to take checksum of directory: %s" % filename)
        digest = digest_method
        blocksize = 64 * 1024
        infile = open(filename, 'rb')
        block = infile.read(blocksize)
        while block:
            digest.update(block)
            block = infile.read(blocksize)
        infile.close()
        return digest.hexdigest()

    def md5(self, filename):
        if not _md5:
            raise ValueError('MD5 not available.  Possibly running in FIPS mode')
        return self.digest_from_file(filename, _md5())

    def sha1(self, filename):
        return self.digest_from_file(filename, _sha1())

    def sha256(self, filename):
        if not HAVE_HASHLIB:
            self.fail_json(msg="SHA-256 checksums require hashlib, which is available in Python 2.5 and higher")
        return self.digest_from_file(filename, _sha256())

    def backup_local(self, fn):
        ext = time.strftime("%Y-%m-%d@%H:%M:%S~", time.localtime(time.time()))
        backupdest = '%s.%s' % (fn, ext)

        try:
            shutil.copy2(fn, backupdest)
        except (shutil.Error, IOError) as e:
            self.fail_json(msg='Could not make backup of %s to %s: %s' % (fn, backupdest, e))
        return backupdest

    def cleanup(self, tmpfile):
        if os.path.exists(tmpfile):
            try:
                os.unlink(tmpfile)
            except OSError as e:
                sys.stderr.write("could not cleanup %s: %s" % (tmpfile, e))

    def atomic_move(self, src, dest):
        context = None
        dest_stat = None
        if os.path.exists(dest):
            try:
                dest_stat = os.stat(dest)
                os.chmod(src, dest_stat.st_mode & 07777)
                os.chown(src, dest_stat.st_uid, dest_stat.st_gid)
            except OSError as e:
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
        except (IOError,OSError) as e:
            if e.errno not in [errno.EPERM, errno.EXDEV, errno.EACCES, errno.ETXTBSY]:
                self.fail_json(msg='Could not replace file: %s to %s: %s' % (src, dest, e))

            dest_dir = os.path.dirname(dest)
            dest_file = os.path.basename(dest)
            try:
                tmp_dest = tempfile.NamedTemporaryFile(
                    prefix=".ansible_tmp", dir=dest_dir, suffix=dest_file)
            except (OSError, IOError) as e:
                self.fail_json(msg='The destination directory (%s) is not writable by the current user.' % dest_dir)

            try:
                if switched_user and os.getuid() != 0:
                    shutil.copy2(src, tmp_dest.name)
                else:
                    shutil.move(src, tmp_dest.name)
                if self.selinux_enabled():
                    self.set_context_if_different(
                        tmp_dest.name, context, False)
                try:
                    tmp_stat = os.stat(tmp_dest.name)
                    if dest_stat and (tmp_stat.st_uid != dest_stat.st_uid or tmp_stat.st_gid != dest_stat.st_gid):
                        os.chown(tmp_dest.name, dest_stat.st_uid, dest_stat.st_gid)
                except OSError as e:
                    if e.errno != errno.EPERM:
                        raise
                os.rename(tmp_dest.name, dest)
            except (shutil.Error, OSError, IOError) as e:
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

    def run_command(self, args, check_rc=False, close_fds=True, executable=None, data=None, binary_data=False, path_prefix=None, cwd=None, use_unsafe_shell=False, prompt_regex=None, environ_update=None):
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
            msg = "Argument 'args' to run_command must be list or string"
            self.fail_json(rc=257, cmd=args, msg=msg)

        prompt_re = None
        if prompt_regex:
            try:
                prompt_re = re.compile(prompt_regex, re.MULTILINE)
            except re.error:
                self.fail_json(msg="invalid prompt regular expression given to run_command")

        if not shell:
            args = [ os.path.expandvars(os.path.expanduser(x)) for x in args ]

        rc = 0
        msg = None
        st_in = None

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

        clean_args = []
        is_passwd = False
        for arg in args:
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
        clean_args = ' '.join(pipes.quote(arg) for arg in clean_args)

        if data:
            st_in = subprocess.PIPE

        kwargs = dict(
            executable=executable,
            shell=shell,
            close_fds=close_fds,
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
            except (OSError, IOError) as e:
                self.fail_json(rc=e.errno, msg="Could not open %s, %s" % (cwd, str(e)))

        try:
            cmd = subprocess.Popen(args, **kwargs)

            stdout = ''
            stderr = ''
            rpipes = [cmd.stdout, cmd.stderr]

            if data:
                if not binary_data:
                    data += '\n'
                cmd.stdin.write(data)
                cmd.stdin.close()

            while True:
                rfd, wfd, efd = select.select(rpipes, [], rpipes, 1)
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
                if prompt_re:
                    if prompt_re.search(stdout) and not data:
                         return (257, stdout, "A prompt was encountered while running a command, but no input data was specified")
                if not rpipes or not rfd and cmd.poll() is not None:
                    break
                elif not rpipes and cmd.poll() == None:
                    cmd.wait()
            cmd.stdout.close()
            cmd.stderr.close()

            rc = cmd.returncode
        except (OSError, IOError) as e:
            self.fail_json(rc=e.errno, msg=str(e), cmd=clean_args)
        except:
            self.fail_json(rc=257, msg=traceback.format_exc(), cmd=clean_args)

        for key, val in old_env_vals.items():
            if val is None:
                del os.environ[key]
            else:
                os.environ[key] = val

        if rc != 0 and check_rc:
            msg = heuristic_log_sanitize(stderr.rstrip())
            self.fail_json(cmd=clean_args, rc=rc, stdout=stdout, stderr=stderr, msg=msg)

        os.chdir(prev_dir)

        return (rc, stdout, stderr)

    def append_to_file(self, filename, str):
        filename = os.path.expandvars(os.path.expanduser(filename))
        fh = open(filename, 'a')
        fh.write(str)
        fh.close()

    def pretty_bytes(self,size):
        ranges = (
                (1<<70L, 'ZB'),
                (1<<60L, 'EB'),
                (1<<50L, 'PB'),
                (1<<40L, 'TB'),
                (1<<30L, 'GB'),
                (1<<20L, 'MB'),
                (1<<10L, 'KB'),
                (1, 'Bytes')
            )
        for limit, suffix in ranges:
            if size >= limit:
                break
        return '%.2f %s' % (float(size)/ limit, suffix)

def get_module_path():
    return os.path.dirname(os.path.realpath(__file__))