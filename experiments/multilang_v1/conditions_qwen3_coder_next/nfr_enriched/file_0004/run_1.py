result_queue.put(return_data)
        except Queue.Empty:
            pass
        except:
            traceback.print_exc()

class HostVars(dict):

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

    def __init__(self, ...):

    def _complex_args_hack(self, complex_args, module_args):

    def _transfer_str(self, conn, tmp, name, data):

    def _compute_environment_string(self, conn, inject=None):

    def _compute_delegate(self, password, remote_inject):

    def _compute_delegate_user(self, host, inject):

    def _count_module_args(self, args, allow_dupes=False):

    def _execute_module(self, conn, tmp, module_name, args, ...):

    def _executor(self, host, new_stdin):

    def get_combined_cache(self):

    def get_inject_vars(self, host):

    def _executor_internal(self, host, new_stdin):

    def _executor_internal_inner(self, host, module_name, module_args, inject, port, ...):

    def _early_needs_tmp_path(self, module_name, handler):

    def _late_needs_tmp_path(self, conn, tmp, module_style):

    def _low_level_exec_command(self, conn, cmd, tmp, ...):

    def _remote_chmod(self, conn, mode, path, tmp, sudoable=False, become=False):

    def _remote_expand_user(self, conn, path, tmp):

    def _remote_checksum(self, conn, tmp, path, inject):

    def _make_tmp_path(self, conn):

    def _remove_tmp_path(self, conn, tmp_path):

    def _copy_module(self, conn, tmp, module_name, module_args, inject, complex_args=None):

    def _configure_module(self, conn, module_name, module_args, inject, complex_args=None):

    def _parallel_exec(self, hosts):

    def _partition_results(self, results):

    def run(self):

    def run_async(self, time_limit):

    def noop_on_check(self, inject)

def _handle_executor_exception(exc_type, exc_value, exc_traceback, host, callbacks):
    """Handle non-AnsibleError exceptions in the executor."""
    msg = ''.join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    callbacks.on_unreachable(host, msg)
    return ReturnData(host=host, comm_ok=False, result=dict(failed=True, msg=msg))

class _ExecutorExceptionHandler(object):
    """Context manager to properly handle exceptions during module execution."""

    def __init__(self, host, callbacks):
        self.host = host
        self.callbacks = callbacks

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            return False
        if exc_type is errors.AnsibleError:
            msg = to_bytes(exc_val)
            self.callbacks.on_unreachable(self.host, msg)
            return False
        if exc_type is Exception:
            # Handle generic exceptions
            result = _handle_executor_exception(exc_type, exc_val, exc_tb, self.host, self.callbacks)
            # suppress the exception
            return True
        # Non-exception types should propagate normally
        return False

class HostVars(dict):

class Runner(object):

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
                    pass

            with _ExecutorExceptionHandler(host, self.callbacks):
                exec_rc = self._executor_internal(host, new_stdin)
                if type(exec_rc) != ReturnData:
                    raise Exception("unexpected return type: %s" % type(exec_rc))
                if not exec_rc.comm_ok:
                    self.callbacks.on_unreachable(host, exec_rc.result)
                return exec_rc

class _ExecutorHookExceptionHandler(object):
    """Context manager to handle exceptions in _executor_hook."""

    def __init__(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            return False
        if exc_type is Queue.Empty:
            return True
        if exc_type is Exception:
            traceback.print_exc()
            return True
        return False

class HostVars(dict):

class Runner(object):

def _executor_hook(job_queue, result_queue, new_stdin):

    if HAS_ATFORK:
        atfork()

    signal.signal(signal.SIGINT, signal.SIG_IGN)
    while not job_queue.empty():
        with _ExecutorHookExceptionHandler():
            host = job_queue.get(block=False)
            return_data = multiprocessing_runner._executor(host, new_stdin)
            result_queue.put(return_data)

class HostVars(dict):

class Runner(object):

def _safe_template_complex_args(args, inject,_basedir, module_name):
    """
    Safely template complex_args, ensuring resulting data remains a dictionary.
    """
    if isinstance(args, basestring):
        templated_args = template.template(basedir, args, inject, convert_bare=True)
        evaled_args = utils.safe_eval(args)

        if isinstance(evaled_args, dict) and len(evaled_args) > 0 and len(evaled_args) != len(templated_args):
            raise errors.AnsibleError("a variable tried to insert extra parameters into the args for this task")

        args = templated_args

    if args is not None and not isinstance(args, dict):
        raise errors.AnsibleError("args must be a dictionary, received %s" % args)

    return args

def _execute_with_items(runner, host, items, inject, port, complex_args):
    """
    Execute module with items using with_items syntax.
    """
    # ... existing implementation ...
    pass

def _execute_single(runner, host, module_name, module_args, inject, port, complex_args):
    """
    Execute module without items.
    """
    return runner._executor_internal_inner(host, module_name, module_args, inject, port, complex_args=complex_args)

class HostVars(dict):

class Runner(object):

    def _executor_internal(self, host, new_stdin):
        ''' executes any module one or more times '''

        inject = self.get_inject_vars(host)

        temp_vars = self.inventory.get_variables(host, vault_password=self.vault_pass)
        temp_vars = utils.combine_vars(temp_vars, inject['combined_cache'])
        temp_vars = utils.combine_vars(temp_vars, {'groups': inject['groups']})
        temp_vars = utils.combine_vars(temp_vars, self.play_vars)
        temp_vars = utils.combine_vars(temp_vars, self.play_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.extra_vars)

        hostvars = HostVars(temp_vars, self.inventory, vault_password=self.vault_pass)

        inject['hostvars'] = hostvars

        host_connection = inject.get('ansible_connection', self.transport)
        if host_connection in [ 'paramiko', 'ssh', 'accelerate' ]:
            port = hostvars.get('ansible_ssh_port', self.remote_port)
            if port is None:
                port = C.DEFAULT_REMOTE_PORT
        else:
            port = self.remote_port

        if self.inventory.basedir() is not None:
            inject['inventory_dir'] = self.inventory.basedir()

        if self.inventory.src() is not None:
            inject['inventory_file'] = self.inventory.src()

        inject.setdefault('ansible_version', utils.version_info(gitinfo=False))

        items = None
        items_plugin = self.module_vars.get('items_lookup_plugin', None)

        if items_plugin and items_plugin in utils.plugins.lookup_loader:
            # extract items logic...
            pass

        # Process complex args
        complex_args = _safe_template_complex_args(self.complex_args, inject, self.basedir, self.module_name)

        if items is None:
            return _execute_single(self, host, self.module_name, self.module_args, inject, port, complex_args)
        elif len(items) > 0:
            return _execute_with_items(self, host, items, inject, port, complex_args)
        else:
            self.callbacks.on_skipped(host, None)
            return ReturnData(host=host, comm_ok=True, result=dict(changed=False, skipped=True))

class HostVars(dict):

class Runner(object):

    def _executor_internal_inner(self, host, module_name, module_args, inject, port, is_chained=False, complex_args=None):
        ''' decides how to invoke a module '''

        # late processing of parameterized become_user (with_items,..)
        if self.become_user_var is not None:
            self.become_user = template.template(self.basedir, self.become_user_var, inject)

        # module_name may be dynamic (but cannot contain {{ ansible_ssh_user }})
        module_name = template.template(self.basedir, module_name, inject)

        if module_name in utils.plugins.action_loader:
            if self.background != 0:
                raise errors.AnsibleError("async mode is not supported with the %s module" % module_name)
            handler = utils.plugins.action_loader.get(module_name, self)
        elif self.background == 0:
            handler = utils.plugins.action_loader.get('normal', self)
        else:
            handler = utils.plugins.action_loader.get('async', self)

        if type(self.conditional) != list:
            self.conditional = [self.conditional]

        for cond in self.conditional:

            if not utils.check_conditional(cond, self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars):
                result = dict(changed=False, skipped=True)
                if self.no_log:
                    result = utils.censor_unlogged_data(result)
                    self.callbacks.on_skipped(host, result)
                else:
                    self.callbacks.on_skipped(host, inject.get('item',None))
                return ReturnData(host=host, result=utils.jsonify(result))

        if getattr(handler, 'setup', None) is not None:
            handler.setup(module_name, inject)
        conn = None
        actual_host = inject.get('ansible_ssh_host', host)
        actual_host = template.template(self.basedir, actual_host, inject, fail_on_undefined=True)
        actual_port = port
        actual_user = inject.get('ansible_ssh_user', self.remote_user)
        actual_pass = inject.get('ansible_ssh_pass', self.remote_pass)
        actual_transport = inject.get('ansible_connection', self.transport)
        actual_private_key_file = inject.get('ansible_ssh_private_key_file', self.private_key_file)
        actual_private_key_file = template.template(self.basedir, actual_private_key_file, inject, fail_on_undefined=True)

        self.become = utils.boolean(inject.get('ansible_become', inject.get('ansible_sudo', inject.get('ansible_su', self.become))))
        self.become_user = inject.get('ansible_become_user', inject.get('ansible_sudo_user', inject.get('ansible_su_user',self.become_user)))
        self.become_pass = inject.get('ansible_become_pass', inject.get('ansible_sudo_pass', inject.get('ansible_su_pass', self.become_pass)))
        self.become_exe = inject.get('ansible_become_exe', inject.get('ansible_sudo_exe', self.become_exe))
        self.become_method = inject.get('ansible_become_method', self.become_method)

        if self.become and self.become_user is None:
            self.become_user = 'root'

        if actual_private_key_file is not None:
            actual_private_key_file = os.path.expanduser(actual_private_key_file)

        if self.accelerate and actual_transport != 'local':
            if inject.get('ansible_ssh_host', None):
                self.accelerate_inventory_host = host
            else:
                self.accelerate_inventory_host = None
            actual_transport = "accelerate"
            if not self.accelerate_port:
                self.accelerate_port = C.ACCELERATE_PORT

        actual_port = inject.get('ansible_ssh_port', port)

        self.delegate_to = inject.get('delegate_to', None)
        if self.delegate_to:
            self.delegate_to = template.template(self.basedir, self.delegate_to, inject)

        if self.delegate_to is not None:
            delegate = self._compute_delegate(actual_pass, inject)
            actual_transport = delegate['transport']
            actual_host = delegate['ssh_host']
            actual_port = delegate['port']
            actual_user = delegate['user']
            actual_pass = delegate['pass']
            actual_private_key_file = delegate['private_key_file']
            self.become_pass = delegate.get('become_pass',delegate.get('sudo_pass'))
            inject = delegate['inject']
            inject['delegate_to'] = self.delegate_to

        actual_user = template.template(self.basedir, actual_user, inject)
        try:
            actual_pass = template.template(self.basedir, actual_pass, inject)
            self.become_pass = template.template(self.basedir, self.become_pass, inject)
        except:
            pass

        inject['ansible_ssh_user'] = actual_user

        try:
            if actual_transport == 'accelerate':
                actual_port = [actual_port, self.accelerate_port]
            elif actual_port is not None:
                actual_port = int(template.template(self.basedir, actual_port, inject))
        except ValueError, e:
            result = dict(failed=True, msg="FAILED: Configured port \"%s\" is not a valid port, expected integer" % actual_port)
            return ReturnData(host=host, comm_ok=False, result=result)

        try:
            if self.delegate_to or host != actual_host:
                delegate_host = host
            else:
                delegate_host = None
            conn = self.connector.connect(actual_host, actual_port, actual_user, actual_pass, actual_transport, actual_private_key_file, delegate_host)

            default_shell = getattr(conn, 'default_shell', '')
            shell_type = inject.get('ansible_shell_type')
            if not shell_type:
                if default_shell:
                    shell_type = default_shell
                else:
                    shell_type = os.path.basename(C.DEFAULT_EXECUTABLE)

            shell_plugin = utils.plugins.shell_loader.get(shell_type)
            if shell_plugin is None:
                shell_plugin = utils.plugins.shell_loader.get('sh')
            conn.shell = shell_plugin

        except errors.AnsibleConnectionFailed, e:
            result = dict(failed=True, msg="FAILED: %s" % str(e))
            return ReturnData(host=host, comm_ok=False, result=result)

        tmp = ''

        if self._early_needs_tmp_path(module_name, handler):
            tmp = self._make_tmp_path(conn)

        if isinstance(module_args, dict):
            module_args = utils.serialize_args(module_args)

        try:
            num_args_pre = self._count_module_args(module_args, allow_dupes=True)
            module_args = template.template(self.basedir, module_args, inject, fail_on_undefined=self.error_on_undefined_vars)
            num_args_post = self._count_module_args(module_args)
            if num_args_pre != num_args_post:
                raise errors.AnsibleError("A variable inserted a new parameter into the module args. " + \
                                          "Be sure to quote variables if they contain equal signs (for example: \"{{var}}\").")
            if '#USE_SHELL' in module_args:
                raise errors.AnsibleError("A variable tried to add #USE_SHELL to the module arguments.")
            complex_args = template.template(self.basedir, complex_args, inject, fail_on_undefined=self.error_on_undefined_vars)
        except jinja2.exceptions.UndefinedError, e:
            raise errors.AnsibleUndefinedVariable("One or more undefined variables: %s" % str(e))

        if complex_args:
            complex_args = dict(filter(lambda x: x[1] != self.omit_token, complex_args.iteritems()))

        args = split_args(module_args)
        final_args = []
        for arg in args:
            if '=' in arg:
                k,v = arg.split('=', 1)
                if unquote(v) != self.omit_token:
                    final_args.append(arg)
            else:
                final_args.append(arg)
        module_args = ' '.join(final_args)

        result = handler.run(conn, tmp, module_name, module_args, inject, complex_args)

        until = self.module_vars.get('until', None)
        if until is not None and result.comm_ok:
            inject[self.module_vars.get('register')] = result.result

            cond = template.template(self.basedir, until, inject, expand_lists=False)
            if not utils.check_conditional(cond,  self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars):
                retries = template.template(self.basedir, self.module_vars.get('retries'), inject, expand_lists=False)
                delay   = self.module_vars.get('delay')
                for x in range(1, int(retries) + 1):
                    delay = template.template(self.basedir, delay, inject, expand_lists=False)
                    delay = float(delay)
                    time.sleep(delay)
                    tmp = ''
                    if self._early_needs_tmp_path(module_name, handler):
                        tmp = self._make_tmp_path(conn)
                    result = handler.run(conn, tmp, module_name, module_args, inject, complex_args)
                    result.result['attempts'] = x
                    vv("Result from run %i is: %s" % (x, result.result))
                    inject[self.module_vars.get('register')] = result.result
                    cond = template.template(self.basedir, until, inject, expand_lists=False)
                    if utils.check_conditional(cond, self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars):
                        break
                if result.result['attempts'] == retries and not utils.check_conditional(cond, self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars):
                    result.result['failed'] = True
                    result.result['msg'] = "Task failed as maximum retries was encountered"
            else:
                result.result['attempts'] = 0
        conn.close()

        if not result.comm_ok:
            self.callbacks.on_unreachable(host, result.result)
        else:
            data = result.result

            if hasattr(sys.stdout, "isatty"):
                if "stdout" in data and sys.stdout.isatty():
                    if not string_functions.isprintable(data['stdout']):
                        data['stdout'] = ''.join(c for c in data['stdout'] if string_functions.isprintable(c))

            if 'item' in inject:
                result.result['item'] = inject['item']

            result.result['invocation'] = dict(
                module_args=module_args,
                module_name=module_name,
                module_complex_args=complex_args,
            )

            changed_when = self.module_vars.get('changed_when')
            failed_when = self.module_vars.get('failed_when')
            if (changed_when is not None or failed_when is not None) and self.background == 0:
                register = self.module_vars.get('register')
                if register is not None:
                    if 'stdout' in data:
                        data['stdout_lines'] = data['stdout'].splitlines()
                    inject[register] = data
                if (module_name == 'async_status' and "finished" in data) or module_name != 'async_status':
                    if changed_when is not None and 'skipped' not in data:
                        data['changed'] = utils.check_conditional(changed_when, self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars)
                    if failed_when is not None and 'skipped' not in data:
                        data['failed_when_result'] = data['failed'] = utils.check_conditional(failed_when, self.basedir, inject, fail_on_undefined=self.error_on_undefined_vars)

            if is_chained:
                return result
            if 'skipped' in data:
                self.callbacks.on_skipped(host, inject.get('item',None))

            if self.no_log:
                data = utils.censor_unlogged_data(data)

            if not result.is_successful():
                ignore_errors = self.module_vars.get('ignore_errors', False)
                self.callbacks.on_failed(host, data, ignore_errors)
            else:
                if self.diff:
                    self.callbacks.on_file_diff(host, result.diff)
                self.callbacks.on_ok(host, data)

        return result

class HostVars(dict):

class Runner(object):

    def _early_needs_tmp_path(self, module_name, handler):
        if module_name in utils.plugins.action_loader:
            return getattr(handler, 'TRANSFERS_FILES', False)
        return False

    def _late_needs_tmp_path(self, conn, tmp, module_style):
        if "tmp" in tmp:
            return False
        if not conn.has_pipelining or not C.ANSIBLE_SSH_PIPELINING or C.DEFAULT_KEEP_REMOTE_FILES or self.become_method == 'su':
            return True
        if not conn.has_pipelining or module_style != "new":
            return True
        return False

    def _low_level_exec_command(self, conn, cmd, tmp, sudoable=False, executable=None, become=False, in_data=None):

        if cmd:
            if executable is None:
                executable = C.DEFAULT_EXECUTABLE

            become_user = self.become_user

            this_user = getattr(conn, 'user', getpass.getuser())
            if (not become and this_user == become_user):
                sudoable = False
                become = False

            rc, stdin, stdout, stderr = conn.exec_command(cmd,
                                                          tmp,
                                                          become_user=become_user,
                                                          sudoable=sudoable,
                                                          executable=executable,
                                                          in_data=in_data)

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

        return dict(rc=None, stdout='', stderr='')

    def _remote_chmod(self, conn, mode, path, tmp, sudoable=False, become=False):
        cmd = conn.shell.chmod(mode, path)
        return self._low_level_exec_command(conn, cmd, tmp, sudoable=sudoable, become=become)

    def _remote_expand_user(self, conn, path, tmp):
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

        if self.become_method == 'sudo':
            sudoable = True
        else:
            sudoable = False
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
        if "-tmp-" in tmp_path:
            cmd = conn.shell.remove(tmp_path, recurse=True)
            self._low_level_exec_command(conn, cmd, None, sudoable=False)

    def _copy_module(self, conn, tmp, module_name, module_args, inject, complex_args=None):
        module_style, module_shebang, module_data = self._configure_module(conn, module_name, module_args, inject, complex_args)
        module_remote_path = conn.shell.join_path(tmp, module_name)
        self._transfer_str(conn, tmp, module_name, module_data)
        return (module_remote_path, module_style, module_shebang)

    def _configure_module(self, conn, module_name, module_args, inject, complex_args=None):
        module_suffixes = getattr(conn, 'default_suffixes', None)
        module_path = utils.plugins.module_finder.find_plugin(module_name, module_suffixes)
        if module_path is None:
            module_path2 = utils.plugins.module_finder.find_plugin('ping', module_suffixes)
            if module_path2 is not None:
                raise errors.AnsibleFileNotFound("module %s not found in configured module paths" % (module_name))
            else:
                raise errors.AnsibleFileNotFound("module %s not found in configured module paths.  Additionally, core modules are missing. If this is a checkout, run 'git submodule update --init --recursive' to correct this problem." % (module_name))

        (module_data, module_style, module_shebang) = module_replacer.modify_module(module_path, complex_args, module_args, inject)
        return (module_style, module_shebang, module_data)

    def _parallel_exec(self, hosts):
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
                except OSError, e:
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
            results = [ReturnData(host=h, result=result_data, comm_ok=True) for h in hosts]
            del self.host_set

        elif self.forks > 1:
            try:
                results = self._parallel_exec(hosts)
            except IOError, ie:
                print ie.errno
                if ie.errno == 32:
                    raise errors.AnsibleError("interrupted")
                raise
        else:
            results = [self._executor(h, None) for h in hosts]

        return self._partition_results(results)

    def run_async(self, time_limit):
        self.background = time_limit
        results = self.run()
        return results, poller.AsyncPoller(results, self)

    def noop_on_check(self, inject):
        if self.always_run is None:
            self.always_run = self.module_vars.get('always_run', False)
            self.always_run = check_conditional(
                self.always_run, self.basedir, inject, fail_on_undefined=True)

        return (self.check and not self.always_run)