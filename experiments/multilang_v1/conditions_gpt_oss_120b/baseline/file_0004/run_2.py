# (c) 2012-2014, Michael DeHaan <michael.dehaan@gmail.com>
#
# This file is part of Ansible
#
# Ansible is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
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

    # attempt workaround of https://github.com/newsapps/beeswithmachineguns/issues/17
    # this function also not present in CentOS 6
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
        except Exception:
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


class Runner(object):
    ''' core API interface to ansible '''

    # see bin/ansible for how this is used...

    def __init__(self,
        host_list=C.DEFAULT_HOST_LIST,      # ex: /etc/ansible/hosts, legacy usage
        module_path=None,                   # ex: /usr/share/ansible
        module_name=C.DEFAULT_MODULE_NAME,  # ex: copy
        module_args=C.DEFAULT_MODULE_ARGS,  # ex: "src=/tmp/a dest=/tmp/b"
        forks=C.DEFAULT_FORKS,              # parallelism level
        timeout=C.DEFAULT_TIMEOUT,          # SSH timeout
        pattern=C.DEFAULT_PATTERN,          # which hosts?  ex: 'all', 'acme.example.org'
        remote_user=C.DEFAULT_REMOTE_USER,  # ex: 'username'
        remote_pass=C.DEFAULT_REMOTE_PASS,  # ex: 'password123' or None if using key
        remote_port=None,                   # if SSH on different ports
        private_key_file=C.DEFAULT_PRIVATE_KEY_FILE, # if not using keys/passwords
        background=0,                       # async poll every X seconds, else 0 for non-async
        basedir=None,                       # directory of playbook, if applicable
        setup_cache=None,                   # used to share fact data w/ other tasks
        vars_cache=None,                    # used to store variables about hosts
        transport=C.DEFAULT_TRANSPORT,      # 'ssh', 'paramiko', 'local'
        conditional='True',                 # run only if this fact expression evals to true
        callbacks=None,                     # used for output
        module_vars=None,                   # a playbooks internals thing
        play_vars=None,                     #
        play_file_vars=None,                #
        role_vars=None,                     #
        role_params=None,                   #
        default_vars=None,                  #
        extra_vars=None,                    # extra vars specified with he playbook(s)
        is_playbook=False,                  # running from playbook or not?
        inventory=None,                     # reference to Inventory object
        subset=None,                        # subset pattern
        check=False,                        # don't make any changes, just try to probe for potential changes
        diff=False,                         # whether to show diffs for template files that change
        environment=None,                   # environment variables (as dict) to use inside the command
        complex_args=None,                  # structured data in addition to module_args, must be a dict
        error_on_undefined_vars=C.DEFAULT_UNDEFINED_VAR_BEHAVIOR, # ex. False
        accelerate=False,                   # use accelerated connection
        accelerate_ipv6=False,              # accelerated connection w/ IPv6
        accelerate_port=None,               # port to use with accelerated connection
        vault_pass=None,
        run_hosts=None,                     # an optional list of pre-calculated hosts to run on
        no_log=False,                       # option to enable/disable logging for a given task
        run_once=False,                     # option to enable/disable host bypass loop for a given task
        become=False,                         # whether to run privelege escalation or not
        become_method=C.DEFAULT_BECOME_METHOD,
        become_user=C.DEFAULT_BECOME_USER,      # ex: 'root'
        become_pass=C.DEFAULT_BECOME_PASS,      # ex: 'password123' or None
        become_exe=C.DEFAULT_BECOME_EXE,        # ex: /usr/local/bin/sudo
        ):

        # used to lock multiprocess inputs and outputs at various levels
        self.output_lockfile  = OUTPUT_LOCKFILE
        self.process_lockfile = PROCESS_LOCKFILE

        if not complex_args:
            complex_args = {}

        # storage & defaults
        self.check            = check
        self.diff             = diff
        self.setup_cache      = utils.default(setup_cache, lambda: ansible.cache.FactCache())
        self.vars_cache       = utils.default(vars_cache, lambda: collections.defaultdict(dict))
        self.basedir          = utils.default(basedir, lambda: os.getcwd())
        self.callbacks        = utils.default(callbacks, lambda: DefaultRunnerCallbacks())
        self.generated_jid    = str(random.randint(0, 999999999999))
        self.transport        = transport
        self.inventory        = utils.default(inventory, lambda: ansible.inventory.Inventory(host_list))

        self.module_vars      = utils.default(module_vars, lambda: {})
        self.play_vars        = utils.default(play_vars, lambda: {})
        self.play_file_vars   = utils.default(play_file_vars, lambda: {})
        self.role_vars        = utils.default(role_vars, lambda: {})
        self.role_params      = utils.default(role_params, lambda: {})
        self.default_vars     = utils.default(default_vars, lambda: {})
        self.extra_vars       = utils.default(extra_vars, lambda: {})

        self.always_run       = None
        self.connector        = connection.Connector(self)
        self.conditional      = conditional
        self.delegate_to      = None
        self.module_name      = module_name
        self.forks            = int(forks)
        self.pattern          = pattern
        self.module_args      = module_args
        self.timeout          = timeout
        self.remote_user      = remote_user
        self.remote_pass      = remote_pass
        self.remote_port      = remote_port
        self.private_key_file = private_key_file
        self.background       = background
        self.become           = become
        self.become_method    = become_method
        self.become_user_var  = become_user
        self.become_user      = None
        self.become_pass      = become_pass
        self.become_exe       = become_exe
        self.is_playbook      = is_playbook
        self.environment      = environment
        self.complex_args     = complex_args
        self.error_on_undefined_vars = error_on_undefined_vars
        self.accelerate       = accelerate
        self.accelerate_port  = accelerate_port
        self.accelerate_ipv6  = accelerate_ipv6
        self.callbacks.runner = self
        self.omit_token       = '__omit_place_holder__%s' % sha1(os.urandom(64)).hexdigest()
        self.vault_pass       = vault_pass
        self.no_log           = no_log
        self.run_once         = run_once

        if self.transport == 'smart':
            # If the transport is 'smart', check to see if certain conditions
            # would prevent us from using ssh, and fallback to paramiko.
            # 'smart' is the default since 1.2.1/1.3
            self.transport = "ssh"
            if sys.platform.startswith('darwin') and self.remote_pass:
                # due to a current bug in sshpass on OSX, which can trigger
                # a kernel panic even for non-privileged users, we revert to
                # paramiko on that OS when a SSH password is specified
                self.transport = "paramiko"
            else:
                # see if SSH can support ControlPersist if not use paramiko
                try:
                    cmd = subprocess.Popen(['ssh','-o','ControlPersist'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    (out, err) = cmd.communicate()
                    if "Bad configuration option" in err:
                        self.transport = "paramiko"
                except OSError:
                    self.transport = "paramiko"

        # save the original transport, in case it gets
        # changed later via options like accelerate
        self.original_transport = self.transport

        # misc housekeeping
        if subset and self.inventory._subset is None:
            # don't override subset when passed from playbook
            self.inventory.subset(subset)

        # If we get a pre-built list of hosts to run on, from say a playbook, use them.
        # Also where we will store the hosts to run on once discovered
        self.run_hosts = run_hosts

        if self.transport == 'local':
            self.remote_user = pwd.getpwuid(os.geteuid())[0]

        if module_path is not None:
            for i in module_path.split(os.pathsep):
                utils.plugins.module_finder.add_directory(i)

        utils.plugins.push_basedir(self.basedir)

        # ensure we are using unique tmp paths
        random.seed()
    # *****************************************************

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
        for (k,v) in complex_args.iteritems():
            if isinstance(v, basestring):
                module_args = "%s=%s %s" % (k, pipes.quote(v), module_args)
        return module_args

    # *****************************************************

    def _transfer_str(self, conn, tmp, name, data):
        ''' transfer string to remote file '''

        if type(data) == dict:
            data = utils.jsonify(data)

        afd, afile = tempfile.mkstemp()
        afo = os.fdopen(afd, 'w')
        try:
            if not isinstance(data, unicode):
                #ensure the data is valid UTF-8
                data.decode('utf-8')
            else:
                data = data.encode('utf-8')
            afo.write(data)
        except:
            raise errors.AnsibleError("failure encoding into utf-8")
        afo.flush()
        afo.close()

        remote = conn.shell.join_path(tmp, name)
        try:
            conn.put_file(afile, remote)
        finally:
            os.unlink(afile)
        return remote

    # *****************************************************

    def _compute_environment_string(self, conn, inject=None):
        ''' what environment variables to use when running the command? '''

        enviro = {}
        if self.environment:
            enviro = template.template(self.basedir, self.environment, inject, convert_bare=True)
            enviro = utils.safe_eval(enviro)
            if type(enviro) != dict:
                raise errors.AnsibleError("environment must be a dictionary, received %s" % enviro)

        return conn.shell.env_prefix(**enviro)

    # *****************************************************

    def _compute_delegate(self, password, remote_inject):

        """ Build a dictionary of all attributes for the delegate host """

        delegate = {}

        # allow delegated host to be templated
        delegate['inject'] = remote_inject.copy()

        # set any interpreters
        interpreters = []
        for i in delegate['inject']:
            if i.startswith("ansible_") and i.endswith("_interpreter"):
                interpreters.append(i)
        for i in interpreters:
            del delegate['inject'][i]
        port = C.DEFAULT_REMOTE_PORT

        # get the vars for the delegate by its name
        try:
            this_info = delegate['inject']['hostvars'][self.delegate_to]
        except:
            # make sure the inject is empty for non-inventory hosts
            this_info = {}

        # get the real ssh_address for the delegate
        # and allow ansible_ssh_host to be templated
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

        # Last chance to get private_key_file from global variables.
        # this is useful if delegated host is not defined in the inventory
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

        # inventory > playbook > original_host

        actual_user = inject.get('ansible_ssh_user', self.remote_user)
        thisuser = None

        try:
            if host in inject['hostvars']:
                if inject['hostvars'][host].get('ansible_ssh_user'):
                    # user for delegate host in inventory
                    thisuser = inject['hostvars'][host].get('ansible_ssh_user')
            else:
                # look up the variables for the host directly from inventory
                host_vars = self.inventory.get_variables(host, vault_password=self.vault_pass)
                if 'ansible_ssh_user' in host_vars:
                    thisuser = host_vars['ansible_ssh_user']
        except errors.AnsibleError, e:
            # the hostname was not found in the inventory, so
            # we just ignore this and try the next method
            pass
        except TypeError, e:
            # Someone is trying to pass a list or some other 'non string' as a host.
            raise errors.AnsibleError("Invalid type for delegate_to: %s" % str(e))

        if thisuser is None and self.remote_user:
            # user defined by play/runner
            thisuser = self.remote_user

        if thisuser is not None:
            actual_user = thisuser
        else:
            # fallback to the inventory user of the play host
            #actual_user = inject.get('ansible_ssh_user', actual_user)
            actual_user = inject.get('ansible_ssh_user', self.remote_user)

        return actual_user

    def _count_module_args(self, args, allow_dupes=False):
        '''
        Count the number of k=v pairs in the supplied module args. This is
        basically a specialized version of parse_kv() from utils with a few
        minor changes.
        '''
        options = {}
        if args is not None:
            try:
                vargs = split_args(args)
            except Exception, e:
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


    # *****************************************************

    def _execute_module(self, conn, tmp, module_name, args,
        async_jid=None, async_module=None, async_limit=None, inject=None, persist_files=False, complex_args=None, delete_remote_tmp=True):

        ''' transfer and run a module along with its arguments on the remote side'''

        # hack to support fireball mode
        if module_name == 'fireball':
            args = "%s password=%s" % (args, base64.b64encode(str(utils.key_for_hostname(conn.host))))
            if 'port' not in args:
                args += " port=%s" % C.ZEROMQ_PORT

        (
        module_style,
        shebang,
        module_data
        ) = self._configure_module(conn, module_name, args, inject, complex_args)

        # a remote tmp path may be necessary and not already created
        if self._late_needs_tmp_path(conn, tmp, module_style):
            tmp = self._make_tmp_path(conn)

        remote_module_path = conn.shell.join_path(tmp, module_name)

        if (module_style != 'new'
           or async_jid is not None
           or not conn.has_pipelining
           or not C.ANSIBLE_SSH_PIPELINING
           or C.DEFAULT_KEEP_REMOTE_FILES
           or self.become_method == 'su'):
            self._transfer_str(conn, tmp, module_name, module_data)

        environment_string = self._compute_environment_string(conn, inject)

        if "tmp" in tmp and (self.become and self.become_user != 'root'):
            # deal with possible umask issues once you become another user
            self._remote_chmod(conn, 'a+r', remote_module_path, tmp)

        cmd = ""
        in_data = None
        if module_style != 'new':
            if 'CHECKMODE=True' in args:
                # if module isn't using AnsibleModuleCommon infrastructure we can't be certain it knows how to
                # do --check mode, so to be safe we will not run it.
                return ReturnData(conn=conn, result=dict(skipped=True, msg="cannot yet run check mode against old-style modules"))
            elif 'NO_LOG' in args:
                return ReturnData(conn=conn, result=dict(skipped=True, msg="cannot use no_log: with old-style modules"))

            args = template.template(self.basedir, args, inject)

            # decide whether we need to transfer JSON or key=value
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
                # deal with possible umask issues once become another user
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
                # not sudoing or sudoing to root, so can cleanup files in the same step
                rm_tmp = tmp

        cmd = conn.shell.build_module_command(environment_string, shebang, cmd, rm_tmp)
        cmd = cmd.strip()

        sudoable = True
        if module_name == "accelerate":
            # always run the accelerate module as the user
            # specified in the play, not the become_user
            sudoable = False

        res = self._low_level_exec_command(conn, cmd, tmp, become=self.become, sudoable=sudoable, in_data=in_data)

        if "tmp" in tmp and not C.DEFAULT_KEEP_REMOTE_FILES and not persist_files and delete_remote_tmp:
            if self.become and self.become_user != 'root':
            # not becoming root, so maybe can't delete files as that other user
            # have to clean up temp files as original user in a second step
                cmd2 = conn.shell.remove(tmp, recurse=True)
                self._low_level_exec_command(conn, cmd2, tmp, sudoable=False)

        data = utils.parse_json(res['stdout'], from_remote=True, no_exceptions=True)
        if 'parsed' in data and data['parsed'] == False:
            data['msg'] += res['stderr']
        return ReturnData(conn=conn, result=data)

    # *****************************************************

    def _executor(self, host, new_stdin):
        ''' handler for multiprocessing library '''

        try:
            fileno = sys.stdin.fileno()
        except ValueError:
            fileno = None

        try:
            self._new_stdin = new_stdin
            if not new_stdin and fileno is not None:
                try:
                    self._new_stdin = os.fdopen(os.dup(fileno))
                except OSError, e:
                    # couldn't dupe stdin, most likely because it's
                    # not a valid file descriptor, so we just rely on
                    # using the one that was passed in
                    pass

            exec_rc = self._executor_internal(host, new_stdin)
            if type(exec_rc) != ReturnData:
                raise Exception("unexpected return type: %s" % type(exec_rc))
            # redundant, right?
            if not exec_rc.comm_ok:
                self.callbacks.on_unreachable(host, exec_rc.result)
            return exec_rc
        except errors.AnsibleError, ae:
            msg = to_bytes(ae)
            self.callbacks.on_unreachable(host, msg)
            return ReturnData(host=host, comm_ok=False, result=dict(failed=True, msg=msg))
        except Exception:
            msg = traceback.format_exc()
            self.callbacks.on_unreachable(host, msg)
            return ReturnData(host=host, comm_ok=False, result=dict(failed=True, msg=msg))

    # *****************************************************

    def get_combined_cache(self):
        # merge the VARS and SETUP caches for this host
        combined_cache = self.setup_cache.copy()
        return utils.merge_hash(combined_cache, self.vars_cache)

    def get_inject_vars(self, host):
        host_variables = self.inventory.get_variables(host, vault_password=self.vault_pass)
        combined_cache = self.get_combined_cache()

        # use combined_cache and host_variables to template the module_vars
        # we update the inject variables with the data we're about to template
        # since some of the variables we'll be replacing may be contained there too
        module_vars_inject = utils.combine_vars(host_variables, combined_cache.get(host, {}))
        module_vars_inject = utils.combine_vars(self.module_vars, module_vars_inject)
        module_vars_inject = utils.combine_vars(module_vars_inject, self.extra_vars)
        module_vars = template.template(self.basedir, self.module_vars, module_vars_inject)

        # remove bad variables from the module vars, which may be in there due
        # the way role declarations are specified in playbooks
        if 'tags' in module_vars:
            del module_vars['tags']
        if 'when' in module_vars:
            del module_vars['when']

        # start building the dictionary of injected variables
        inject = {}

        # default vars are the lowest priority
        inject = utils.combine_vars(inject, self.default_vars)
        # next come inventory variables for the host
        inject = utils.combine_vars(inject, host_variables)
        # then the setup_cache which contains facts gathered
        inject = utils.combine_vars(inject, self.setup_cache.get(host, {}))
        # next come variables from vars and vars files
        inject = utils.combine_vars(inject, self.play_vars)
        inject = utils.combine_vars(inject, self.play_file_vars)
        # next come variables from role vars/main.yml files
        inject = utils.combine_vars(inject, self.role_vars)
        # then come the module variables
        inject = utils.combine_vars(inject, module_vars)
        # followed by vars_cache things (set_fact, include_vars, and
        # vars_files which had host-specific templating done)
        inject = utils.combine_vars(inject, self.vars_cache.get(host, {}))
        # role parameters next
        inject = utils.combine_vars(inject, self.role_params)
        # and finally -e vars are the highest priority
        inject = utils.combine_vars(inject, self.extra_vars)
        # and then special vars
        inject.setdefault('ansible_ssh_user', self.remote_user)
        inject['group_names']  = host_variables.get('group_names', [])
        inject['groups']       = self.inventory.groups_list()
        inject['vars']         = self.module_vars
        inject['defaults']     = self.default_vars
        inject['environment']  = self.environment
        inject['playbook_dir'] = os.path.abspath(self.basedir)
        inject['omit']         = self.omit_token
        inject['combined_cache'] = combined_cache

        return inject

    def _executor_internal(self, host, new_stdin):
        ''' executes any module one or more times '''

        # We build the proper injected dictionary for all future
        # templating operations in this run
        inject = self.get_inject_vars(host)

        # Then we selectively merge some variable dictionaries down to a
        # single dictionary, used to template the HostVars for this host
        temp_vars = self.inventory.get_variables(host, vault_password=self.vault_pass)
        temp_vars = utils.combine_vars(temp_vars, inject['combined_cache'] )
        temp_vars = utils.combine_vars(temp_vars, {'groups': inject['groups']})
        temp_vars = utils.combine_vars(temp_vars, self.play_vars)
        temp_vars = utils.combine_vars(temp_vars, self.play_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.extra_vars)

        hostvars = HostVars(temp_vars, self.inventory, vault_password=self.vault_pass)

        # and we save the HostVars in the injected dictionary so they
        # may be referenced from playbooks/templates
        inject['hostvars'] = hostvars

        host_connection = inject.get('ansible_connection', self.transport)
        if host_connection in [ 'paramiko', 'ssh', 'accelerate' ]:
            port = hostvars.get('ansible_ssh_port', self.remote_port)
            if port is None:
                port = C.DEFAULT_REMOTE_PORT
        else:
            # fireball, local, etc
            port = self.remote_port

        if self.inventory.basedir() is not None:
            inject['inventory_dir'] = self.inventory.basedir()

        if self.inventory.src() is not None:
            inject['inventory_file'] = self.inventory.src()

        # could be already set by playbook code
        inject.setdefault('ansible_version', utils.version_info(gitinfo=False))

        # allow with_foo to work in playbooks...
        items = None
        items_plugin = self.module_vars.get('items_lookup_plugin', None)

        if items_plugin is not None and items_plugin in utils.plugins.lookup_loader:

            basedir = self.basedir
            if '_original_file' in inject:
                basedir = os.path.dirname(inject['_original_file'])
                filesdir = os.path.join(basedir, '..', 'files')
                if os.path.exists(filesdir):
                    basedir = filesdir

            try:
                items_terms = self.module_vars.get('items_lookup_terms', '')
                items_terms = template.template(basedir, items_terms, inject)
                items = utils.plugins.lookup_loader.get(items_plugin, runner=self, basedir=basedir).run(items_terms, inject=inject)
            except errors.AnsibleUndefinedVariable, e:
                if 'has no attribute' in str(e):
                    # the undefined variable was an attribute of a variable that does
                    # exist, so try and run this through the conditional check to see
                    # if the user wanted to skip something on being undefined
                    if utils.check_conditional(self.conditional, self.basedir, inject, fail_on_undefined=True):
                        # the conditional check passed, so we have to fail here
                        raise
                    else:
                        # the conditional failed, so we skip this task
                        result = utils.jsonify(dict(changed=False, skipped=True))
                        self.callbacks.on_skipped(host, None)
                        return ReturnData(host=host, result=result)
            except errors.AnsibleError, e:
                raise
            except Exception, e:
                raise errors.AnsibleError("Unexpected error while executing task: %s" % str(e))

            # strip out any jinja2 template syntax within
            # the data returned by the lookup plugin
            items = utils._clean_data_struct(items, from_remote=True)
            if items is None:
                items = []
            else:
                if type(items) != list:
                    raise errors.AnsibleError("lookup plugins have to return a list: %r" % items)

                if len(items) and utils.is_list_of_strings(items) and self.module_name in ( 'apt', 'yum', 'pkgng', 'zypper', 'dnf' ):
                    # hack for apt, yum, and pkgng so that with_items maps back into a single module call
                    use_these_items = []
                    for x in items:
                        inject['item'] = x
                        if not self.conditional or utils.check_conditional(self.conditional, self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars):
                            use_these_items.append(x)
                    inject['item'] = ",".join(use_these_items)
                    items = None

        def _safe_template_complex_args(args, inject):
            # Ensure the complex args here are a dictionary, but
            # first template them if they contain a variable

            returned_args = args
            if isinstance(args, basestring):
                # If the complex_args were evaluated to a dictionary and there are
                # more keys in the templated version than the evaled version, some
                # param inserted additional keys (the template() call also runs
                # safe_eval on the var if it looks like it's a datastructure). If the
                # evaled_args are not a dict, it's most likely a whole variable (ie.
                # args: {{var}}), in which case there's no way to detect the proper
                # count of params in the dictionary.

                templated_args = template.template(self.basedir, args, inject, convert_bare=True)
                evaled_args = utils.safe_eval(args)

                if isinstance(evaled_args, dict) and len(evaled_args) > 0 and len(evaled_args) != len(templated_args):
                    raise errors.AnsibleError("a variable tried to insert extra parameters into the args for this task")

                # set the returned_args to the templated_args
                returned_args = templated_args

            # and a final check to make sure the complex args are a dict
            if returned_args is not None and not isinstance(returned_args, dict):
                raise errors.AnsibleError("args must be a dictionary, received %s" % returned_args)

            return returned_args

        # logic to decide how to run things depends on whether with_items is used
        if items is None:
            complex_args = _safe_template_complex_args(self.complex_args, inject)
            return self._executor_internal_inner(host, self.module_name, self.module_args, inject, port, complex_args=complex_args)
        elif len(items) > 0:

            # executing using with_items, so make multiple calls
            # TODO: refactor

            if self.background > 0:
                raise errors.AnsibleError("lookup plugins (with_*) cannot be used with async tasks")

            all_comm_ok = True
            all_changed = False
            all_failed = False
            results = []
            for x in items:
                # use a fresh inject for each item
                this_inject = inject.copy()