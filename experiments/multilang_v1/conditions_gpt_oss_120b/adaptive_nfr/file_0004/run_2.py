# (c) 2012-2014, Michael DeHaan <michael.dehaan@gmail.com>
#
# This file is part of Ansible
#
# Ansible is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# at your option, any later version.
#
# Ansible is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Ansible.  If not, see <http://www.gnu.org/licenses/>.

import multiprocessing
import signal
import os
import pwd
import Queue
import random
import traceback
import tempfile
import time
import collections
import socket
import base64
import sys
import pipes
import jinja2
import subprocess
import getpass

import ansible.constants as C
import ansible.inventory
from ansible import utils
from ansible.utils import template
from ansible.utils import check_conditional
from ansible.utils import string_functions
from ansible import errors
from ansible import module_common
import poller
import connection
from return_data import ReturnData
from ansible.callbacks import DefaultRunnerCallbacks, vv
from ansible.module_common import ModuleReplacer
from ansible.module_utils.splitter import split_args, unquote
from ansible.cache import FactCache
from ansible.utils import update_hash
from ansible.utils.unicode import to_bytes

module_replacer = ModuleReplacer(strip_comments=False)

try:
    from hashlib import sha1
except ImportError:
    from sha import sha as sha1

HAS_ATFORK=True
try:
    from Crypto.Random import atfork
except ImportError:
    HAS_ATFORK=False

multiprocessing_runner = None

OUTPUT_LOCKFILE  = tempfile.TemporaryFile()
PROCESS_LOCKFILE = tempfile.TemporaryFile()

################################################

def _executor_hook(job_queue, result_queue, new_stdin):
    """Worker hook for multiprocessing execution."""
    if HAS_ATFORK:
        atfork()
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    while not job_queue.empty():
        try:
            host = job_queue.get(block=False)
            return_data = multiprocessing_runner._executor(host, new_stdin)
            result_queue.put(return_data)
        except Queue.Empty:
            pass
        except Exception as e:
            traceback.print_exc()

class HostVars(dict):
    ''' A special view of vars_cache that adds values from the inventory when needed. '''

    def __init__(self, vars_cache, inventory, vault_password=None):
        self.vars_cache = vars_cache
        self.inventory = inventory
        self.lookup = {}
        self.update(vars_cache)
        self.vault_password = vault_password

    def __getitem__(self, host):
        if host not in self.lookup:
            result = self.inventory.get_variables(host, vault_password=self.vault_password).copy()
            result.update(self.vars_cache.get(host, {}))
            self.lookup[host] = template.template('.', result, self.vars_cache)
        return self.lookup[host]

class RunnerConfig(object):
    """Container for Runner initialization parameters."""
    def __init__(self,
                 host_list=C.DEFAULT_HOST_LIST,
                 module_path=None,
                 module_name=C.DEFAULT_MODULE_NAME,
                 module_args=C.DEFAULT_MODULE_ARGS,
                 forks=C.DEFAULT_FORKS,
                 timeout=C.DEFAULT_TIMEOUT,
                 pattern=C.DEFAULT_PATTERN,
                 remote_user=C.DEFAULT_REMOTE_USER,
                 remote_pass=C.DEFAULT_REMOTE_PASS,
                 remote_port=None,
                 private_key_file=C.DEFAULT_PRIVATE_KEY_FILE,
                 background=0,
                 basedir=None,
                 setup_cache=None,
                 vars_cache=None,
                 transport=C.DEFAULT_TRANSPORT,
                 conditional='True',
                 callbacks=None,
                 module_vars=None,
                 play_vars=None,
                 play_file_vars=None,
                 role_vars=None,
                 role_params=None,
                 default_vars=None,
                 extra_vars=None,
                 is_playbook=False,
                 inventory=None,
                 subset=None,
                 check=False,
                 diff=False,
                 environment=None,
                 complex_args=None,
                 error_on_undefined_vars=C.DEFAULT_UNDEFINED_VAR_BEHAVIOR,
                 accelerate=False,
                 accelerate_ipv6=False,
                 accelerate_port=None,
                 vault_pass=None,
                 run_hosts=None,
                 no_log=False,
                 run_once=False,
                 become=False,
                 become_method=C.DEFAULT_BECOME_METHOD,
                 become_user=C.DEFAULT_BECOME_USER,
                 become_pass=C.DEFAULT_BECOME_PASS,
                 become_exe=C.DEFAULT_BECOME_EXE):
        self.host_list = host_list
        self.module_path = module_path
        self.module_name = module_name
        self.module_args = module_args
        self.forks = forks
        self.timeout = timeout
        self.pattern = pattern
        self.remote_user = remote_user
        self.remote_pass = remote_pass
        self.remote_port = remote_port
        self.private_key_file = private_key_file
        self.background = background
        self.basedir = basedir
        self.setup_cache = setup_cache
        self.vars_cache = vars_cache
        self.transport = transport
        self.conditional = conditional
        self.callbacks = callbacks
        self.module_vars = module_vars
        self.play_vars = play_vars
        self.play_file_vars = play_file_vars
        self.role_vars = role_vars
        self.role_params = role_params
        self.default_vars = default_vars
        self.extra_vars = extra_vars
        self.is_playbook = is_playbook
        self.inventory = inventory
        self.subset = subset
        self.check = check
        self.diff = diff
        self.environment = environment
        self.complex_args = complex_args
        self.error_on_undefined_vars = error_on_undefined_vars
        self.accelerate = accelerate
        self.accelerate_ipv6 = accelerate_ipv6
        self.accelerate_port = accelerate_port
        self.vault_pass = vault_pass
        self.run_hosts = run_hosts
        self.no_log = no_log
        self.run_once = run_once
        self.become = become
        self.become_method = become_method
        self.become_user = become_user
        self.become_pass = become_pass
        self.become_exe = become_exe

class Runner(object):
    ''' core API interface to ansible '''

    def __init__(self, *args, **kwargs):
        """Backward compatible initializer."""
        if args and isinstance(args[0], RunnerConfig):
            config = args[0]
        else:
            config = RunnerConfig(**kwargs)
        self._initialize_from_config(config)

    def _initialize_from_config(self, config):
        self.output_lockfile  = OUTPUT_LOCKFILE
        self.process_lockfile = PROCESS_LOCKFILE

        if not config.complex_args:
            config.complex_args = {}

        self.check            = config.check
        self.diff             = config.diff
        self.setup_cache      = utils.default(config.setup_cache, lambda: ansible.cache.FactCache())
        self.vars_cache       = utils.default(config.vars_cache, lambda: collections.defaultdict(dict))
        self.basedir          = utils.default(config.basedir, lambda: os.getcwd())
        self.callbacks        = utils.default(config.callbacks, lambda: DefaultRunnerCallbacks())
        self.generated_jid    = str(random.randint(0, 999999999999))
        self.transport        = config.transport
        self.inventory        = utils.default(config.inventory, lambda: ansible.inventory.Inventory(config.host_list))

        self.module_vars      = utils.default(config.module_vars, lambda: {})
        self.play_vars        = utils.default(config.play_vars, lambda: {})
        self.play_file_vars   = utils.default(config.play_file_vars, lambda: {})
        self.role_vars        = utils.default(config.role_vars, lambda: {})
        self.role_params      = utils.default(config.role_params, lambda: {})
        self.default_vars     = utils.default(config.default_vars, lambda: {})
        self.extra_vars       = utils.default(config.extra_vars, lambda: {})

        self.always_run       = None
        self.connector        = connection.Connector(self)
        self.conditional      = config.conditional
        self.delegate_to      = None
        self.module_name      = config.module_name
        self.forks            = int(config.forks)
        self.pattern          = config.pattern
        self.module_args      = config.module_args
        self.timeout          = config.timeout
        self.remote_user      = config.remote_user
        self.remote_pass      = config.remote_pass
        self.remote_port      = config.remote_port
        self.private_key_file = config.private_key_file
        self.background       = config.background
        self.become           = config.become
        self.become_method    = config.become_method
        self.become_user_var  = config.become_user
        self.become_user      = None
        self.become_pass      = config.become_pass
        self.become_exe       = config.become_exe
        self.is_playbook      = config.is_playbook
        self.environment      = config.environment
        self.complex_args     = config.complex_args
        self.error_on_undefined_vars = config.error_on_undefined_vars
        self.accelerate       = config.accelerate
        self.accelerate_port  = config.accelerate_port
        self.accelerate_ipv6  = config.accelerate_ipv6
        self.callbacks.runner = self
        self.omit_token       = '__omit_place_holder__%s' % sha1(os.urandom(64)).hexdigest()
        self.vault_pass       = config.vault_pass
        self.no_log           = config.no_log
        self.run_once         = config.run_once

        if self.transport == 'smart':
            self.transport = "ssh"
            if sys.platform.startswith('darwin') and self.remote_pass:
                self.transport = "paramiko"
            else:
                try:
                    cmd = subprocess.Popen(['ssh','-o','ControlPersist'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    (out, err) = cmd.communicate()
                    if "Bad configuration option" in err:
                        self.transport = "paramiko"
                except OSError:
                    self.transport = "paramiko"

        self.original_transport = self.transport

        if config.subset and self.inventory._subset is None:
            self.inventory.subset(config.subset)

        self.run_hosts = config.run_hosts

        if self.transport == 'local':
            self.remote_user = pwd.getpwuid(os.geteuid())[0]

        if config.module_path is not None:
            for i in config.module_path.split(os.pathsep):
                utils.plugins.module_finder.add_directory(i)

        utils.plugins.push_basedir(self.basedir)
        random.seed()

    def _complex_args_hack(self, complex_args, module_args):
        """
        ansible-playbook both allows specifying key=value string arguments and complex arguments
        however not all modules use our python common module system and cannot
        access these.  An example might be a Bash module.  This hack allows users to still pass "args"
        as a hash of simple scalars to those arguments and is short term.  We could technically
        just feed JSON to the module, but that makes it hard on Bash consumers.  The way this is implemented
        it does mean values in 'args' have LOWER priority than those on the key=value line, allowing
        args to provide yet another way to have pluggable defaults.
        """
        if complex_args is None:
            return module_args
        if not isinstance(complex_args, dict):
            raise errors.AnsibleError("complex arguments are not a dictionary: %s" % complex_args)
        for (k, v) in complex_args.iteritems():
            if isinstance(v, basestring):
                module_args = "%s=%s %s" % (k, pipes.quote(v), module_args)
        return module_args

    def _transfer_str(self, conn, tmp, name, data):
        ''' transfer string to remote file '''
        if type(data) == dict:
            data = utils.jsonify(data)

        afd, afile = tempfile.mkstemp()
        afo = os.fdopen(afd, 'w')
        try:
            if not isinstance(data, unicode):
                data.decode('utf-8')
            else:
                data = data.encode('utf-8')
            afo.write(data)
        except Exception:
            raise errors.AnsibleError("failure encoding into utf-8")
        afo.flush()
        afo.close()

        remote = conn.shell.join_path(tmp, name)
        try:
            conn.put_file(afile, remote)
        finally:
            os.unlink(afile)
        return remote

    def _compute_environment_string(self, conn, inject=None):
        ''' what environment variables to use when running the command? '''
        enviro = {}
        if self.environment:
            enviro = template.template(self.basedir, self.environment, inject, convert_bare=True)
            enviro = utils.safe_eval(enviro)
            if type(enviro) != dict:
                raise errors.AnsibleError("environment must be a dictionary, received %s" % enviro)
        return conn.shell.env_prefix(**enviro)

    def _compute_delegate(self, password, remote_inject):
        """ Build a dictionary of all attributes for the delegate host """
        delegate = {}
        delegate['inject'] = remote_inject.copy()
        interpreters = []
        for i in delegate['inject']:
            if i.startswith("ansible_") and i.endswith("_interpreter"):
                interpreters.append(i)
        for i in interpreters:
            del delegate['inject'][i]
        port = C.DEFAULT_REMOTE_PORT
        try:
            this_info = delegate['inject']['hostvars'][self.delegate_to]
        except Exception:
            this_info = {}
        delegate['ssh_host'] = template.template(
                                   self.basedir,
                                   this_info.get('ansible_ssh_host', self.delegate_to),
                                   this_info,
                                   fail_on_undefined=True
                               )
        delegate['port'] = this_info.get('ansible_ssh_port', port)
        delegate['user'] = self._compute_delegate_user(self.delegate_to, delegate['inject'])
        delegate['pass'] = this_info.get('ansible_ssh_pass', password)
        delegate['private_key_file'] = this_info.get('ansible_ssh_private_key_file', self.private_key_file)
        delegate['transport'] = this_info.get('ansible_connection', self.transport)
        delegate['become_pass'] = this_info.get('ansible_become_pass', this_info.get('ansible_ssh_pass', self.become_pass))
        if delegate['private_key_file'] is None:
            delegate['private_key_file'] = remote_inject.get('ansible_ssh_private_key_file', None)
        if delegate['private_key_file'] is not None:
            delegate['private_key_file'] = os.path.expanduser(delegate['private_key_file'])
        for i in this_info:
            if i.startswith("ansible_") and i.endswith("_interpreter"):
                delegate['inject'][i] = this_info[i]
        return delegate

    def _compute_delegate_user(self, host, inject):
        """ Calculate the remote user based on an order of preference """
        actual_user = inject.get('ansible_ssh_user', self.remote_user)
        thisuser = None
        try:
            if host in inject['hostvars']:
                if inject['hostvars'][host].get('ansible_ssh_user'):
                    thisuser = inject['hostvars'][host].get('ansible_ssh_user')
            else:
                host_vars = self.inventory.get_variables(host, vault_password=self.vault_pass)
                if 'ansible_ssh_user' in host_vars:
                    thisuser = host_vars['ansible_ssh_user']
        except errors.AnsibleError:
            pass
        except TypeError as e:
            raise errors.AnsibleError("Invalid type for delegate_to: %s" % str(e))
        if thisuser is None and self.remote_user:
            thisuser = self.remote_user
        if thisuser is not None:
            actual_user = thisuser
        else:
            actual_user = inject.get('ansible_ssh_user', self.remote_user)
        return actual_user

    def _count_module_args(self, args, allow_dupes=False):
        '''
        Count the number of k=v pairs in the supplied module args.
        '''
        options = {}
        if args is not None:
            try:
                vargs = split_args(args)
            except Exception as e:
                if "unbalanced jinja2 block or quotes" in str(e):
                    raise errors.AnsibleError("error parsing argument string '%s', try quoting the entire line." % args)
                else:
                    raise
            for x in vargs:
                quoted = x.startswith('"') and x.endswith('"') or x.startswith("'") and x.endswith("'")
                if "=" in x and not quoted:
                    k, v = x.split("=",1)
                    is_shell_module = self.module_name in ('command', 'shell')
                    is_shell_param = k in ('creates', 'removes', 'chdir', 'executable')
                    if k in options and not allow_dupes:
                        if not(is_shell_module and not is_shell_param):
                            raise errors.AnsibleError("a duplicate parameter was found in the argument string (%s)" % k)
                    if is_shell_module and is_shell_param or not is_shell_module:
                        options[k] = v
        return len(options)

    class ExecuteModuleParams(object):
        """Parameter object for _execute_module."""
        def __init__(self, conn, tmp, module_name, args,
                     async_jid=None, async_module=None, async_limit=None,
                     inject=None, persist_files=False, complex_args=None,
                     delete_remote_tmp=True):
            self.conn = conn
            self.tmp = tmp
            self.module_name = module_name
            self.args = args
            self.async_jid = async_jid
            self.async_module = async_module
            self.async_limit = async_limit
            self.inject = inject
            self.persist_files = persist_files
            self.complex_args = complex_args
            self.delete_remote_tmp = delete_remote_tmp

    def _execute_module(self, conn, tmp, module_name, args,
                        async_jid=None, async_module=None, async_limit=None,
                        inject=None, persist_files=False, complex_args=None,
                        delete_remote_tmp=True):
        """Legacy wrapper for execute_module with full signature."""
        params = self.ExecuteModuleParams(conn, tmp, module_name, args,
                                          async_jid, async_module, async_limit,
                                          inject, persist_files, complex_args,
                                          delete_remote_tmp)
        return self._execute_module_internal(params)

    def _execute_module_internal(self, params):
        ''' transfer and run a module along with its arguments on the remote side'''
        conn = params.conn
        tmp = params.tmp
        module_name = params.module_name
        args = params.args
        async_jid = params.async_jid
        async_module = params.async_module
        async_limit = params.async_limit
        inject = params.inject
        persist_files = params.persist_files
        complex_args = params.complex_args
        delete_remote_tmp = params.delete_remote_tmp

        if module_name == 'fireball':
            args = "%s password=%s" % (args, base64.b64encode(str(utils.key_for_hostname(conn.host))))
            if 'port' not in args:
                args += " port=%s" % C.ZEROMQ_PORT

        (module_style, shebang, module_data) = self._configure_module(conn, module_name, args, inject, complex_args)

        if self._late_needs_tmp_path(conn, tmp, module_style):
            tmp = self._make_tmp_path(conn)

        remote_module_path = conn.shell.join_path(tmp, module_name)

        if (module_style != 'new' or async_jid is not None or not conn.has_pipelining
                or not C.ANSIBLE_SSH_PIPELINING or C.DEFAULT_KEEP_REMOTE_FILES
                or self.become_method == 'su'):
            self._transfer_str(conn, tmp, module_name, module_data)

        environment_string = self._compute_environment_string(conn, inject)

        if "tmp" in tmp and (self.become and self.become_user != 'root'):
            self._remote_chmod(conn, 'a+r', remote_module_path, tmp)

        cmd = ""
        in_data = None
        if module_style != 'new':
            if 'CHECKMODE=True' in args:
                return ReturnData(conn=conn, result=dict(skipped=True, msg="cannot yet run check mode against old-style modules"))
            elif 'NO_LOG' in args:
                return ReturnData(conn=conn, result=dict(skipped=True, msg="cannot use no_log: with old-style modules"))

            args = template.template(self.basedir, args, inject)

            argsfile = None
            if module_style == 'non_native_want_json':
                if complex_args:
                    complex_args.update(utils.parse_kv(args))
                    argsfile = self._transfer_str(conn, tmp, 'arguments', utils.jsonify(complex_args))
                else:
                    argsfile = self._transfer_str(conn, tmp, 'arguments', utils.jsonify(utils.parse_kv(args)))
            else:
                argsfile = self._transfer_str(conn, tmp, 'arguments', args)

            if self.become and self.become_user != 'root':
                self._remote_chmod(conn, 'a+r', argsfile, tmp)

            if async_jid is None:
                cmd = "%s %s" % (remote_module_path, argsfile)
            else:
                cmd = " ".join([str(x) for x in [remote_module_path, async_jid, async_limit, async_module, argsfile]])
        else:
            if async_jid is None:
                if conn.has_pipelining and C.ANSIBLE_SSH_PIPELINING and not C.DEFAULT_KEEP_REMOTE_FILES and not self.become_method == 'su':
                    in_data = module_data
                else:
                    cmd = "%s" % (remote_module_path)
            else:
                cmd = " ".join([str(x) for x in [remote_module_path, async_jid, async_limit, async_module]])

        if not shebang:
            raise errors.AnsibleError("module is missing interpreter line")

        rm_tmp = None
        if "tmp" in tmp and not C.DEFAULT_KEEP_REMOTE_FILES and not persist_files and delete_remote_tmp:
            if not self.become or self.become_user == 'root':
                rm_tmp = tmp

        cmd = conn.shell.build_module_command(environment_string, shebang, cmd, rm_tmp)
        cmd = cmd.strip()

        sudoable = True
        if module_name == "accelerate":
            sudoable = False

        res = self._low_level_exec_command(conn, cmd, tmp, become=self.become, sudoable=sudoable, in_data=in_data)

        if "tmp" in tmp and not C.DEFAULT_KEEP_REMOTE_FILES and not persist_files and delete_remote_tmp:
            if self.become and self.become_user != 'root':
                cmd2 = conn.shell.remove(tmp, recurse=True)
                self._low_level_exec_command(conn, cmd2, tmp, sudoable=False)

        data = utils.parse_json(res['stdout'], from_remote=True, no_exceptions=True)
        if 'parsed' in data and data['parsed'] == False:
            data['msg'] += res['stderr']
        return ReturnData(conn=conn, result=data)

    class LowLevelExecParams(object):
        """Parameter object for low level command execution."""
        def __init__(self, conn, cmd, tmp, sudoable=False,
                     executable=None, become=False, in_data=None):
            self.conn = conn
            self.cmd = cmd
            self.tmp = tmp
            self.sudoable = sudoable
            self.executable = executable
            self.become = become
            self.in_data = in_data

    def _low_level_exec_command(self, conn, cmd, tmp, sudoable=False,
                                executable=None, become=False, in_data=None):
        """Legacy wrapper for low level execution."""
        params = self.LowLevelExecParams(conn, cmd, tmp, sudoable, executable, become, in_data)
        return self._low_level_exec_command_internal(params)

    def _low_level_exec_command_internal(self, params):
        ''' execute a command string over SSH, return the output '''
        conn = params.conn
        cmd = params.cmd
        tmp = params.tmp
        sudoable = params.sudoable
        executable = params.executable
        become = params.become
        in_data = params.in_data

        if not cmd:
            return dict(rc=None, stdout='', stderr='')

        if executable is None:
            executable = C.DEFAULT_EXECUTABLE

        become_user = self.become_user
        this_user = getattr(conn, 'user', getpass.getuser())
        if not become and this_user == become_user:
            sudoable = False
            become = False

        rc, stdin, stdout, stderr = conn.exec_command(
            cmd, tmp, become_user=become_user, sudoable=sudoable,
            executable=executable, in_data=in_data)

        if type(stdout) not in [str, unicode]:
            out = ''.join(stdout.readlines())
        else:
            out = stdout

        if type(stderr) not in [str, unicode]:
            err = ''.join(stderr.readlines())
        else:
            err = stderr

        if rc is not None:
            return dict(rc=rc, stdout=out, stderr=err)
        else:
            return dict(stdout=out, stderr=err)

    def _remote_chmod(self, conn, mode, path, tmp, sudoable=False, become=False):
        ''' issue a remote chmod command '''
        cmd = conn.shell.chmod(mode, path)
        return self._low_level_exec_command(conn, cmd, tmp, sudoable=sudoable, become=become)

    def _remote_expand_user(self, conn, path, tmp):
        ''' takes a remote path and performs tilde expansion on the remote host '''
        if not path.startswith('~'):
            return path

        split_path = path.split(os.path.sep, 1)
        expand_path = split_path[0]
        if expand_path == '~':
            if self.become and self.become_user:
                expand_path = '~%s' % self.become_user

        cmd = conn.shell.expand_user(expand_path)
        data = self._low_level_exec_command(conn, cmd, tmp, sudoable=False, become=False)
        initial_fragment = utils.last_non_blank_line(data['stdout'])

        if not initial_fragment:
            return path

        if len(split_path) > 1:
            return conn.shell.join_path(initial_fragment, *split_path[1:])
        else:
            return initial_fragment

    def _remote_checksum(self, conn, tmp, path, inject):
        ''' takes a remote checksum and returns 1 if no file '''
        host = inject['inventory_hostname']
        if 'delegate_to' in inject:
            delegate = inject['delegate_to']
            if delegate:
                host = None
                delegate = template.template(self.basedir, delegate, inject)
                if delegate in inject['hostvars']:
                    host = delegate

        if host:
            python_interp = inject['hostvars'][host].get('ansible_python_interpreter', 'python')
        else:
            python_interp = 'python'

        cmd = conn.shell.checksum(path, python_interp)
        sudoable = self.become_method == 'sudo'
        data = self._low_level_exec_command(conn, cmd, tmp, sudoable=sudoable)
        data2 = utils.last_non_blank_line(data['stdout'])
        try:
            if data2 == '':
                return "INVALIDCHECKSUM"
            else:
                return data2.split()[0]
        except IndexError:
            sys.stderr.write("warning: Calculating checksum failed unusually, please report this to the list so it can be fixed\n")
            sys.stderr.write("command: %s\n" % cmd)
            sys.stderr.write("----\n")
            sys.stderr.write("output: %s\n" % data)
            sys.stderr.write("----\n")
            return "INVALIDCHECKSUM"

    def _make_tmp_path(self, conn):
        ''' make and return a temporary path on a remote box '''
        basefile = 'ansible-tmp-%s-%s' % (time.time(), random.randint(0, 2**48))
        use_system_tmp = False
        if self.become and self.become_user != 'root':
            use_system_tmp = True

        tmp_mode = None
        if self.remote_user != 'root' or (self.become and self.become_user != 'root'):
            tmp_mode = 'a+rx'

        cmd = conn.shell.mkdtemp(basefile, use_system_tmp, tmp_mode)
        result = self._low_level_exec_command(conn, cmd, None, sudoable=False)

        if result['rc'] != 0:
            if result['rc'] == 5:
                output = 'Authentication failure.'
            elif result['rc'] == 255 and self.transport in ['ssh']:
                if utils.VERBOSITY > 3:
                    output = 'SSH encountered an unknown error. The output was:\n%s' % (result['stdout']+result['stderr'])
                else:
                    output = 'SSH encountered an unknown error during the connection. We recommend you re-run the command using -vvvv, which will enable SSH debugging output to help diagnose the issue'
            elif 'No space left on device' in result['stderr']:
                output = result['stderr']
            else:
                output = 'Authentication or permission failure.  In some cases, you may have been able to authenticate and did not have permissions on the remote directory. Consider changing the remote temp path in ansible.cfg to a path rooted in "/tmp". Failed command was: %s, exited with result %d' % (cmd, result['rc'])
            if 'stdout' in result and result['stdout'] != '':
                output = output + ": %s" % result['stdout']
            raise errors.AnsibleError(output)

        rc = conn.shell.join_path(utils.last_non_blank_line(result['stdout']).strip(), '')
        if rc == '/':
            raise errors.AnsibleError('failed to resolve remote temporary directory from %s: `%s` returned empty string' % (basetmp, cmd))
        return rc

    def _remove_tmp_path(self, conn, tmp_path):
        ''' Remove a tmp_path. '''
        if "-tmp-" in tmp_path:
            cmd = conn.shell.remove(tmp_path, recurse=True)
            self._low_level_exec_command(conn, cmd, None, sudoable=False)

    class CopyModuleParams(object):
        """Parameter object for _copy_module."""
        def __init__(self, conn, tmp, module_name, module_args, inject, complex_args=None):
            self.conn = conn
            self.tmp = tmp
            self.module_name = module_name
            self.module_args = module_args
            self.inject = inject
            self.complex_args = complex_args

    def _copy_module(self, conn, tmp, module_name, module_args, inject, complex_args=None):
        """Legacy wrapper for copy_module."""
        params = self.CopyModuleParams(conn, tmp, module_name, module_args, inject, complex_args)
        return self._copy_module_internal(params)

    def _copy_module_internal(self, params):
        ''' transfer a module over SFTP, does not run it '''
        (module_style, module_shebang, module_data) = self._configure_module(
            params.conn, params.module_name, params.module_args,
            params.inject, params.complex_args)
        module_remote_path = params.conn.shell.join_path(params.tmp, params.module_name)
        self._transfer_str(params.conn, params.tmp, params.module_name, module_data)
        return (module_remote_path, module_style, module_shebang)

    def _configure_module(self, conn, module_name, module_args, inject, complex_args=None):
        ''' find module and configure it '''
        module_suffixes = getattr(conn, 'default_suffixes', None)
        module_path = utils.plugins.module_finder.find_plugin(module_name, module_suffixes)
        if module_path is None:
            module_path2 = utils.plugins.module_finder.find_plugin('ping', module_suffixes)
            if module_path2 is not None:
                raise errors.AnsibleFileNotFound("module %s not found in configured module paths" % (module_name))
            else:
                raise errors.AnsibleFileNotFound("module %s not found in configured module paths.  Additionally, core modules are missing. If this is a checkout, run 'git submodule update --init --recursive' to correct this problem." % (module_name))
        (module_data, module_style, module_shebang) = module_replacer.modify_module(
            module_path, complex_args, module_args, inject
        )
        return (module_style, module_shebang, module_data)

    def _parallel_exec(self, hosts):
        ''' handles mulitprocessing when more than 1 fork is required '''
        manager = multiprocessing.Manager()
        job_queue = manager.Queue()
        for host in hosts:
            job_queue.put(host)
        result_queue = manager.Queue()

        try:
            fileno = sys.stdin.fileno()
        except ValueError:
            fileno = None

        workers = []
        for i in range(self.forks):
            new_stdin = None
            if fileno is not None:
                try:
                    new_stdin = os.fdopen(os.dup(fileno))
                except OSError:
                    pass
            prc = multiprocessing.Process(target=_executor_hook,
                args=(job_queue, result_queue, new_stdin))
            prc.start()
            workers.append(prc)

        try:
            for worker in workers:
                worker.join()
        except KeyboardInterrupt:
            for worker in workers:
                worker.terminate()
                worker.join()

        results = []
        try:
            while not result_queue.empty():
                results.append(result_queue.get(block=False))
        except socket.error:
            raise errors.AnsibleError("<interrupted>")
        return results

    def _partition_results(self, results):
        ''' separate results by ones we contacted & ones we didn't '''
        if results is None:
            return None
        results2 = dict(contacted={}, dark={})
        for result in results:
            host = result.host
            if host is None:
                raise Exception("internal error, host not set")
            if result.communicated_ok():
                results2["contacted"][host] = result.result
            else:
                results2["dark"][host] = result.result
        for host in self.run_hosts:
            if not (host in results2['dark'] or host in results2['contacted']):
                results2["dark"][host] = {}
        return results2

    def run(self):
        ''' xfer & run module on all matched hosts '''
        if not self.run_hosts:
            self.run_hosts = self.inventory.list_hosts(self.pattern)
        hosts = self.run_hosts
        if len(hosts) == 0:
            self.callbacks.on_no_hosts()
            return dict(contacted={}, dark={})

        global multiprocessing_runner
        multiprocessing_runner = self
        results = None

        p = utils.plugins.action_loader.get(self.module_name, self)

        if self.forks == 0 or self.forks > len(hosts):
            self.forks = len(hosts)

        if (p and (getattr(p, 'BYPASS_HOST_LOOP', None)) or self.run_once):
            self.host_set = hosts
            if self.delegate_to is not None and self.delegate_to in hosts:
                host = self.delegate_to
            else:
                host = hosts[0]
            result_data = self._executor(host, None).result
            results = [ ReturnData(host=h, result=result_data, comm_ok=True) for h in hosts ]
            del self.host_set
        elif self.forks > 1:
            try:
                results = self._parallel_exec(hosts)
            except IOError as ie:
                print ie.errno
                if ie.errno == 32:
                    raise errors.AnsibleError("interrupted")
                raise
        else:
            results = [ self._executor(h, None) for h in hosts ]

        return self._partition_results(results)

    def run_async(self, time_limit):
        ''' Run this module asynchronously and return a poller. '''
        self.background = time_limit
        results = self.run()
        return results, poller.AsyncPoller(results, self)

    def noop_on_check(self, inject):
        ''' Should the runner run in check mode or not ? '''
        if self.always_run is None:
            self.always_run = self.module_vars.get('always_run', False)
            self.always_run = check_conditional(
                self.always_run, self.basedir, inject, fail_on_undefined=True)
        return (self.check and not self.always_run)