class RunnerConfig:
    def __init__(self, host_list, module_path, module_name, module_args, forks, timeout, pattern, remote_user, remote_pass, remote_port, private_key_file, background, basedir, setup_cache, vars_cache, transport, conditional, callbacks, module_vars, play_vars, play_file_vars, role_vars, role_params, default_vars, extra_vars, is_playbook, inventory, subset, check, diff, environment, complex_args, error_on_undefined_vars, accelerate, accelerate_ipv6, accelerate_port, vault_pass, run_hosts, no_log, run_once, become, become_method, become_user, become_pass, become_exe):
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
    def __init__(self, config):
        self.config = config
        self.output_lockfile = OUTPUT_LOCKFILE
        self.process_lockfile = PROCESS_LOCKFILE

    def _executor_hook(self, job_queue, result_queue, new_stdin):
        try:
            host = job_queue.get(block=False)
            return_data = self._executor(host, new_stdin)
            result_queue.put(return_data)
        except Queue.Empty:
            pass
        except Exception as e:
            traceback.print_exc()
            raise e

    def _executor(self, host, new_stdin):
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

            exec_rc = self._executor_internal(host, new_stdin)
            if type(exec_rc) != ReturnData:
                raise Exception("unexpected return type: %s" % type(exec_rc))
            return exec_rc
        except errors.AnsibleError, ae:
            msg = to_bytes(ae)
            self.config.callbacks.on_unreachable(host, msg)
            return ReturnData(host=host, comm_ok=False, result=dict(failed=True, msg=msg))
        except Exception as e:
            msg = traceback.format_exc()
            self.config.callbacks.on_unreachable(host, msg)
            return ReturnData(host=host, comm_ok=False, result=dict(failed=True, msg=msg))

    def _executor_internal(self, host, new_stdin):
        inject = self.get_inject_vars(host)
        temp_vars = self.config.inventory.get_variables(host, vault_password=self.config.vault_pass)
        temp_vars = utils.combine_vars(temp_vars, inject['combined_cache'] )
        temp_vars = utils.combine_vars(temp_vars, {'groups': inject['groups']})
        temp_vars = utils.combine_vars(temp_vars, self.config.play_vars)
        temp_vars = utils.combine_vars(temp_vars, self.config.play_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.config.extra_vars)

        hostvars = HostVars(temp_vars, self.config.inventory, vault_password=self.config.vault_pass)

        inject['hostvars'] = hostvars

        host_connection = inject.get('ansible_connection', self.config.transport)
        if host_connection in [ 'paramiko', 'ssh', 'accelerate' ]:
            port = hostvars.get('ansible_ssh_port', self.config.remote_port)
            if port is None:
                port = C.DEFAULT_REMOTE_PORT
        else:
            port = self.config.remote_port

        if self.config.inventory.basedir() is not None:
            inject['inventory_dir'] = self.config.inventory.basedir()

        if self.config.inventory.src() is not None:
            inject['inventory_file'] = self.config.inventory.src()

        inject.setdefault('ansible_version', utils.version_info(gitinfo=False))

        items = None
        items_plugin = self.config.module_vars.get('items_lookup_plugin', None)

        if items_plugin is not None and items_plugin in utils.plugins.lookup_loader:

            basedir = self.config.basedir
            if '_original_file' in inject:
                basedir = os.path.dirname(inject['_original_file'])
                filesdir = os.path.join(basedir, '..', 'files')
                if os.path.exists(filesdir):
                    basedir = filesdir

            try:
                items_terms = self.config.module_vars.get('items_lookup_terms', '')
                items_terms = template.template(basedir, items_terms, inject)
                items = utils.plugins.lookup_loader.get(items_plugin, runner=self, basedir=basedir).run(items_terms, inject=inject)
            except errors.AnsibleUndefinedVariable, e:
                if 'has no attribute' in str(e):
                    if utils.check_conditional(self.config.conditional, self.config.basedir, inject, fail_on_undefined=True):
                        raise
                    else:
                        result = utils.jsonify(dict(changed=False, skipped=True))
                        self.config.callbacks.on_skipped(host, None)
                        return ReturnData(host=host, result=result)
            except errors.AnsibleError, e:
                raise
            except Exception, e:
                raise errors.AnsibleError("Unexpected error while executing task: %s" % str(e))

            items = utils._clean_data_struct(items, from_remote=True)
            if items is None:
                items = []
            else:
                if type(items) != list:
                    raise errors.AnsibleError("lookup plugins have to return a list: %r" % items)

                if len(items) and utils.is_list_of_strings(items) and self.config.module_name in ( 'apt', 'yum', 'pkgng', 'zypper', 'dnf' ):
                    use_these_items = []
                    for x in items:
                        inject['item'] = x
                        if not self.config.conditional or utils.check_conditional(self.config.conditional, self.config.basedir, inject, fail_on_undefined=self.config.error_on_undefined_vars):
                            use_these_items.append(x)
                    inject['item'] = ",".join(use_these_items)
                    items = None

        def _safe_template_complex_args(args, inject):
            returned_args = args
            if isinstance(args, basestring):
                templated_args = template.template(self.config.basedir, args, inject, convert_bare=True)
                evaled_args = utils.safe_eval(args)

                if isinstance(evaled_args, dict) and len(evaled_args) > 0 and len(evaled_args) != len(templated_args):
                    raise errors.AnsibleError("a variable tried to insert extra parameters into the args for this task")

                returned_args = templated_args

            if returned_args is not None and not isinstance(returned_args, dict):
                raise errors.AnsibleError("args must be a dictionary, received %s" % returned_args)

            return returned_args

        if items is None:
            complex_args = _safe_template_complex_args(self.config.complex_args, inject)
            return self._executor_internal_inner(host, self.config.module_name, self.config.module_args, inject, port, complex_args=complex_args)
        elif len(items) > 0:

            if self.config.background > 0:
                raise errors.AnsibleError("lookup plugins (with_*) cannot be used with async tasks")

            all_comm_ok = True
            all_changed = False
            all_failed = False
            results = []
            for x in items:
                this_inject = inject.copy()
                this_inject['item'] = x

                complex_args = _safe_template_complex_args(self.config.complex_args, this_inject)

                result = self._executor_internal_inner(
                     host,
                     self.config.module_name,
                     self.config.module_args,
                     this_inject,
                     port,
                     complex_args=complex_args
                )

                if 'stdout' in result.result and 'stdout_lines' not in result.result:
                    result.result['stdout_lines'] = result.result['stdout'].splitlines()

                results.append(result.result)
                if result.comm_ok == False:
                    all_comm_ok = False
                    all_failed = True
                    break
                for x in results:
                    if x.get('changed') == True:
                        all_changed = True
                    if (x.get('failed') == True) or ('failed_when_result' in x and [x['failed_when_result']] or [('rc' in x) and (x['rc'] != 0)])[0]:
                        all_failed = True
                        break
            msg = 'All items completed'
            if all_failed:
                msg = "One or more items failed."
            rd_result = dict(failed=all_failed, changed=all_changed, results=results, msg=msg)
            if not all_failed:
                del rd_result['failed']
            return ReturnData(host=host, comm_ok=all_comm_ok, result=rd_result)
        else:
            self.config.callbacks.on_skipped(host, None)
            return ReturnData(host=host, comm_ok=True, result=dict(changed=False, skipped=True))

    def _executor_internal_inner(self, host, module_name, module_args, inject, port, is_chained=False, complex_args=None):
        become_user = template.template(self.config.basedir, self.config.become_user_var, inject) if self.config.become_user_var else None
        module_name  = template.template(self.config.basedir, module_name, inject)

        handler = utils.plugins.action_loader.get(module_name, self)

        if type(self.config.conditional) != list:
            self.config.conditional = [ self.config.conditional ]

        for cond in self.config.conditional:

            if not utils.check_conditional(cond, self.config.basedir, inject, fail_on_undefined=self.config.error_on_undefined_vars):
                result = dict(changed=False, skipped=True)
                if self.config.no_log:
                    result = utils.censor_unlogged_data(result)
                    self.config.callbacks.on_skipped(host, result)
                else:
                    self.config.callbacks.on_skipped(host, inject.get('item',None))
                return ReturnData(host=host, result=utils.jsonify(result))

        conn = None
        actual_host = inject.get('ansible_ssh_host', host)
        actual_host = template.template(self.config.basedir, actual_host, inject, fail_on_undefined=True)
        actual_port = port
        actual_user = inject.get('ansible_ssh_user', self.config.remote_user)
        actual_pass = inject.get('ansible_ssh_pass', self.config.remote_pass)
        actual_transport = inject.get('ansible_connection', self.config.transport)
        actual_private_key_file = inject.get('ansible_ssh_private_key_file', self.config.private_key_file)
        actual_private_key_file = template.template(self.config.basedir, actual_private_key_file, inject, fail_on_undefined=True)

        self.config.become = utils.boolean(inject.get('ansible_become', inject.get('ansible_sudo', inject.get('ansible_su', self.config.become))))
        self.config.become_user = inject.get('ansible_become_user', inject.get('ansible_sudo_user', inject.get('ansible_su_user',self.config.become_user)))
        self.config.become_pass = inject.get('ansible_become_pass', inject.get('ansible_sudo_pass', inject.get('ansible_su_pass', self.config.become_pass)))
        self.config.become_exe = inject.get('ansible_become_exe', inject.get('ansible_sudo_exe', self.config.become_exe))
        self.config.become_method = inject.get('ansible_become_method', self.config.become_method)

        if actual_private_key_file is not None:
            actual_private_key_file = os.path.expanduser(actual_private_key_file)

        if self.config.accelerate and actual_transport != 'local':
            actual_transport = "accelerate"
            if not self.config.accelerate_port:
                self.config.accelerate_port = C.ACCELERATE_PORT

        actual_port = inject.get('ansible_ssh_port', port)

        self.config.delegate_to = inject.get('delegate_to', None)
        if self.config.delegate_to:
            self.config.delegate_to = template.template(self.config.basedir, self.config.delegate_to, inject)

        if self.config.delegate_to is not None:
            delegate = self._compute_delegate(actual_pass, inject)
            actual_transport = delegate['transport']
            actual_host = delegate['ssh_host']
            actual_port = delegate['port']
            actual_user = delegate['user']
            actual_pass = delegate['pass']
            actual_private_key_file = delegate['private_key_file']
            self.config.become_pass = delegate.get('become_pass',delegate.get('sudo_pass'))
            inject = delegate['inject']
            inject['delegate_to'] = self.config.delegate_to

        actual_user = template.template(self.config.basedir, actual_user, inject)
        try:
            actual_pass = template.template(self.config.basedir, actual_pass, inject)
            self.config.become_pass = template.template(self.config.basedir, self.config.become_pass, inject)
        except:
            pass

        inject['ansible_ssh_user'] = actual_user

        try:
            if actual_transport == 'accelerate':
                actual_port = [actual_port, self.config.accelerate_port]
            elif actual_port is not None:
                actual_port = int(template.template(self.config.basedir, actual_port, inject))
        except ValueError, e:
            result = dict(failed=True, msg="FAILED: Configured port \"%s\" is not a valid port, expected integer" % actual_port)
            return ReturnData(host=host, comm_ok=False, result=result)

        try:
            if self.config.delegate_to or host != actual_host:
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

        num_args_pre = self._count_module_args(module_args, allow_dupes=True)
        module_args = template.template(self.config.basedir, module_args, inject, fail_on_undefined=self.config.error_on_undefined_vars)
        num_args_post = self._count_module_args(module_args)
        if num_args_pre != num_args_post:
            raise errors.AnsibleError("A variable inserted a new parameter into the module args. " + \
                                      "Be sure to quote variables if they contain equal signs (for example: \"{{var}}\").")
        if '#USE_SHELL' in module_args:
            raise errors.AnsibleError("A variable tried to add #USE_SHELL to the module arguments.")
        complex_args = template.template(self.config.basedir, complex_args, inject, fail_on_undefined=self.config.error_on_undefined_vars)

        args = split_args(module_args)
        final_args = []
        for arg in args:
            if '=' in arg:
                k,v = arg.split('=', 1)
                if unquote(v) != self.config.omit_token:
                    final_args.append(arg)
            else:
                final_args.append(arg)
        module_args = ' '.join(final_args)

        result = handler.run(conn, tmp, module_name, module_args, inject, complex_args)
        conn.close()

        if not result.comm_ok:
            self.config.callbacks.on_unreachable(host, result.result)
        else:
            data = result.result

            if 'item' in inject:
                result.result['item'] = inject['item']

            result.result['invocation'] = dict(
                module_args=module_args,
                module_name=module_name,
                module_complex_args=complex_args,
            )

            changed_when = self.config.module_vars.get('changed_when')
            failed_when = self.config.module_vars.get('failed_when')
            if (changed_when is not None or failed_when is not None) and self.config.background == 0:
                register = self.config.module_vars.get('register')
                if register is not None:
                    if 'stdout' in data:
                        data['stdout_lines'] = data['stdout'].splitlines()
                    inject[register] = data
                if (module_name == 'async_status' and "finished" in data) or module_name != 'async_status':
                    if changed_when is not None and 'skipped' not in data:
                        data['changed'] = utils.check_conditional(changed_when, self.config.basedir, inject, fail_on_undefined=self.config.error_on_undefined_vars)
                    if failed_when is not None and 'skipped' not in data:
                        data['failed_when_result'] = data['failed'] = utils.check_conditional(failed_when, self.config.basedir, inject, fail_on_undefined=self.config.error_on_undefined_vars)


            if is_chained:
                return result
            if 'skipped' in data:
                self.config.callbacks.on_skipped(host, inject.get('item',None))

            if self.config.no_log:
                data = utils.censor_unlogged_data(data)

            if not result.is_successful():
                ignore_errors = self.config.module_vars.get('ignore_errors', False)
                self.config.callbacks.on_failed(host, data, ignore_errors)
            else:
                if self.config.diff:
                    self.config.callbacks.on_file_diff(host, result.diff)
                self.config.callbacks.on_ok(host, data)

        return result

    def _early_needs_tmp_path(self, module_name, handler):
        if module_name in utils.plugins.action_loader:
          return getattr(handler, 'TRANSFERS_FILES', False)
        return False

    def _late_needs_tmp_path(self, conn, tmp, module_style):
        if "tmp" in tmp:
            return False
        if not conn.has_pipelining or not C.ANSIBLE_SSH_PIPELINING or C.DEFAULT_KEEP_REMOTE_FILES or self.config.become_method == 'su':
            return True
        if not conn.has_pipelining:
            return True
        if module_style != "new":
            return True
        return False

    def _low_level_exec_command(self, conn, cmd, tmp, sudoable=False, executable=None, become=False, in_data=None):
        if cmd:
            if executable is None:
                executable = C.DEFAULT_EXECUTABLE

            become_user = self.config.become_user

            rc, stdin, stdout, stderr = conn.exec_command(cmd, tmp, become_user=become_user, sudoable=sudoable, executable=executable, in_data=in_data)

            if type(stdout) not in [ str, unicode ]:
                out = ''.join(stdout.readlines())
            else:
                out = stdout

            if type(stderr) not in [ str, unicode ]:
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
            if self.config.become and self.config.become_user:
                expand_path = '~%s' % self.config.become_user

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
                delegate = template.template(self.config.basedir, delegate, inject)
                if delegate in inject['hostvars']:
                    host = delegate

        if host:
            python_interp = inject['hostvars'][host].get('ansible_python_interpreter', 'python')
        else:
            python_interp = 'python'

        cmd = conn.shell.checksum(path, python_interp)

        if self.config.become_method == 'sudo':
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
        if self.config.become and self.config.become_user != 'root':
            use_system_tmp = True

        tmp_mode = None
        if self.config.remote_user != 'root' or (self.config.become and self.config.become_user != 'root'):
            tmp_mode = 'a+rx'

        cmd = conn.shell.mkdtemp(basefile, use_system_tmp, tmp_mode)
        result = self._low_level_exec_command(conn, cmd, None, sudoable=False)

        if result['rc'] != 0:
            if result['rc'] == 5:
                output = 'Authentication failure.'
            elif result['rc'] == 255 and self.config.transport in ['ssh']:
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
            raise errors.AnsibleError('failed to resolve remote temporary directory from %s: `%s` returned empty string' % (basefile, cmd))
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
        module_path = utils.plugins.module_finder.find_plugin(module_name)
        if module_path is None:
            module_path2 = utils.plugins.module_finder.find_plugin('ping')
            if module_path2 is not None:
                raise errors.AnsibleFileNotFound("module %s not found in configured module paths" % (module_name))
            else:
                raise errors.AnsibleFileNotFound("module %s not found in configured module paths.  Additionally, core modules are missing. If this is a checkout, run 'git submodule update --init --recursive' to correct this problem." % (module_name))

        module_data, module_style, module_shebang = module_replacer.modify_module(module_path, complex_args, module_args, inject)

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
        for i in range(self.config.forks):
            new_stdin = None
            if fileno is not None:
                try:
                    new_stdin = os.fdopen(os.dup(fileno))
                except OSError, e:
                    pass
            prc = multiprocessing.Process(target=_executor_hook, args=(job_queue, result_queue, new_stdin))
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

        for host in self.config.run_hosts:
            if not (host in results2['dark'] or host in results2['contacted']):
                results2["dark"][host] = {}
        return results2

    def run(self):
        if not self.config.run_hosts:
            self.config.run_hosts = self.config.inventory.list_hosts(self.config.pattern)
        hosts = self.config.run_hosts
        if len(hosts) == 0:
            self.config.callbacks.on_no_hosts()
            return dict(contacted={}, dark={})

        global multiprocessing_runner
        multiprocessing_runner = self
        results = None

        p = utils.plugins.action_loader.get(self.config.module_name, self)

        if self.config.forks == 0 or self.config.forks > len(hosts):
            self.config.forks = len(hosts)

        if (p and (getattr(p, 'BYPASS_HOST_LOOP', None)) or self.config.run_once):

            self.host_set = hosts
            if self.config.delegate_to is not None and self.config.delegate_to in hosts:
                host = self.config.delegate_to
            else:
                host = hosts[0]

            result_data = self._executor(host, None).result
            results = [ ReturnData(host=h, result=result_data, comm_ok=True) for h in hosts ]
            del self.host_set

        elif self.config.forks > 1:
            try:
                results = self._parallel_exec(hosts)
            except IOError, ie:
                if ie.errno == 32:
                    raise errors.AnsibleError("interrupted")
                raise
        else:
            results = [ self._executor(h, None) for h in hosts ]

        return self._partition_results(results)

    def run_async(self, time_limit):
        self.config.background = time_limit
        results = self.run()
        return results, poller.AsyncPoller(results, self)

    def noop_on_check(self, inject):
        if self.config.always_run is None:
            self.config.always_run = self.config.module_vars.get('always_run', False)
            self.config.always_run = check_conditional(self.config.always_run, self.config.basedir, inject, fail_on_undefined=True)

        return (self.config.check and not self.config.always_run)

def _executor_hook(job_queue, result_queue, new_stdin):
    try:
        host = job_queue.get(block=False)
        return_data = multiprocessing_runner._executor(host, new_stdin)
        result_queue.put(return_data)
    except Queue.Empty:
        pass
    except Exception as e:
        traceback.print_exc()
        raise e