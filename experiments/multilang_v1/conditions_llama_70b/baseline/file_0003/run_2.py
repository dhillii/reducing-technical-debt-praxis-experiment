class Play(object):

    _pb_common = [
        'accelerate', 'accelerate_ipv6', 'accelerate_port', 'any_errors_fatal', 'become',
        'become_method', 'become_user', 'environment', 'force_handlers', 'gather_facts',
        'handlers', 'hosts', 'name', 'no_log', 'remote_user', 'roles', 'serial', 'su', 
        'su_user', 'sudo', 'sudo_user', 'tags', 'vars', 'vars_files', 'vars_prompt', 
        'vault_password',
    ]

    __slots__ = _pb_common + [
        '_ds', '_handlers', '_play_hosts', '_tasks', 'any_errors_fatal', 'basedir',
        'default_vars', 'included_roles', 'max_fail_pct', 'playbook', 'remote_port',
        'role_vars', 'transport', 'vars_file_vars',
    ]

    # to catch typos and so forth -- these are userland names
    # and don't line up 1:1 with how they are stored
    VALID_KEYS = frozenset(_pb_common + [
        'connection', 'include', 'max_fail_percentage', 'port', 'post_tasks',
        'pre_tasks', 'role_names', 'tasks', 'user',
    ])

    def __init__(self, playbook, ds, basedir, vault_password=None):
        self._validate_input(ds)
        self._load_play_data(playbook, ds, basedir, vault_password)
        self._load_roles(ds)
        self._load_tasks_and_handlers(ds)

    def _validate_input(self, ds):
        for x in ds.keys():
            if x not in Play.VALID_KEYS:
                raise errors.AnsibleError("%s is not a legal parameter of an Ansible Play" % x)

    def _load_play_data(self, playbook, ds, basedir, vault_password=None):
        self.vars             = ds.get('vars', {})
        self.vars_prompt      = ds.get('vars_prompt', {})
        self.playbook         = playbook
        self.vars             = self._get_vars()
        self.vars_file_vars   = dict() 
        self.role_vars        = dict() 
        self.basedir          = basedir
        self.roles            = ds.get('roles', None)
        self.tags             = ds.get('tags', None)
        self.vault_password   = vault_password
        self.environment      = ds.get('environment', {})

        if self.tags is None:
            self.tags = []
        elif isinstance(self.tags, str):
            self.tags = self.tags.split(",")
        elif not isinstance(self.tags, list):
            self.tags = []

        load_vars = dict()
        load_vars['playbook_dir'] = os.path.abspath(self.basedir)
        if self.playbook.inventory.basedir() is not None:
            load_vars['inventory_dir'] = self.playbook.inventory.basedir()
        if self.playbook.inventory.src() is not None:
            load_vars['inventory_file'] = self.playbook.inventory.src()

        self.vars_files = ds.get('vars_files', [])
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        processed_vars_files = self._update_vars_files_for_host(None)

        temp_vars = utils.combine_vars(self.vars, self.vars_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.playbook.extra_vars)

        try:
            ds = template(basedir, ds, temp_vars)
        except errors.AnsibleError as e:
            utils.warning("non fatal error while trying to template play variables: %s" % (str(e)))

        self._ds = ds

        hosts = ds.get('hosts')
        if hosts is None:
            raise errors.AnsibleError('hosts declaration is required')
        elif isinstance(hosts, list):
            try:
                hosts = ';'.join(hosts)
            except TypeError as e:
                raise errors.AnsibleError('improper host declaration: %s' % str(e))

        self.serial           = str(ds.get('serial', 0))
        self.hosts            = hosts
        self.name             = ds.get('name', self.hosts)
        self._tasks           = ds.get('tasks', [])
        self._handlers        = ds.get('handlers', [])
        self.remote_user      = ds.get('remote_user', ds.get('user', self.playbook.remote_user))
        self.remote_port      = ds.get('port', self.playbook.remote_port)
        self.transport        = ds.get('connection', self.playbook.transport)
        self.remote_port      = self.remote_port
        self.any_errors_fatal = utils.boolean(ds.get('any_errors_fatal', 'false'))
        self.accelerate       = utils.boolean(ds.get('accelerate', 'false'))
        self.accelerate_port  = ds.get('accelerate_port', None)
        self.accelerate_ipv6  = ds.get('accelerate_ipv6', False)
        self.max_fail_pct     = int(ds.get('max_fail_percentage', 100))
        self.no_log           = utils.boolean(ds.get('no_log', 'false'))
        self.force_handlers   = utils.boolean(ds.get('force_handlers', self.playbook.force_handlers))

        if (ds.get('become') or ds.get('become_user')) and (ds.get('sudo') or ds.get('sudo_user')):
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("sudo", "sudo_user") cannot be used together')
        if (ds.get('become') or ds.get('become_user')) and (ds.get('su') or ds.get('su_user')):
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("su", "su_user") cannot be used together')
        if (ds.get('sudo') or ds.get('sudo_user')) and (ds.get('su') or ds.get('su_user')):
            raise errors.AnsibleError('sudo params ("sudo", "sudo_user") and su params ("su", "su_user") cannot be used together')

        self.become           = ds.get('become', self.playbook.become)
        self.become_method    = ds.get('become_method', self.playbook.become_method)
        self.become_user      = ds.get('become_user', self.playbook.become_user)

        if 'sudo' in ds:
            self.become=ds['sudo']
            self.become_method='sudo'
            if 'sudo_user' in ds:
                self.become_user=ds['sudo_user']
        elif 'su' in ds:
            self.become=True
            self.become=ds['su']
            self.become_method='su'
            if 'su_user' in ds:
                self.become_user=ds['su_user']

        self.gather_facts = ds.get('gather_facts', None)
        if self.gather_facts is not None:
            self.gather_facts = utils.boolean(self.gather_facts)

    def _load_roles(self, ds):
        self.included_roles = []
        ds = self._load_roles_from_datastructure(ds)
        self.vars_files = utils.list_difference(ds.get('vars_files', []), self._update_vars_files_for_host(None))
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        self._update_vars_files_for_host(None)

    def _load_roles_from_datastructure(self, ds):
        if self.roles is None:
            self.roles = []
        if not isinstance(self.roles, list):
            raise errors.AnsibleError("value of 'roles:' must be a list")

        new_tasks       = []
        new_handlers    = []
        role_vars_files = []
        defaults_files  = []

        pre_tasks = ds.get('pre_tasks', None)
        if not isinstance(pre_tasks, list):
            pre_tasks = []
        for x in pre_tasks:
            new_tasks.append(x)

        roles = self._build_role_dependencies(self.roles, [], {})

        for (role, role_path, role_vars, role_params, default_vars) in roles:
            task_basepath     = utils.path_dwim(self.basedir, os.path.join(role_path, 'tasks'))
            handler_basepath  = utils.path_dwim(self.basedir, os.path.join(role_path, 'handlers'))
            vars_basepath     = utils.path_dwim(self.basedir, os.path.join(role_path, 'vars'))
            meta_basepath     = utils.path_dwim(self.basedir, os.path.join(role_path, 'meta'))
            defaults_basepath = utils.path_dwim(self.basedir, os.path.join(role_path, 'defaults'))

            task      = self._resolve_main(task_basepath)
            handler   = self._resolve_main(handler_basepath)
            vars_file = self._resolve_main(vars_basepath)
            meta_file = self._resolve_main(meta_basepath)
            defaults_file = self._resolve_main(defaults_basepath)

            library   = utils.path_dwim(self.basedir, os.path.join(role_path, 'library'))

            missing = lambda f: not os.path.isfile(f)
            if missing(task) and missing(handler) and missing(vars_file) and missing(defaults_file) and missing(meta_file) and not os.path.isdir(library):
                raise errors.AnsibleError("found role at %s, but cannot find %s or %s or %s or %s or %s or %s" % (role_path, task, handler, vars_file, defaults_file, meta_file, library))

            if isinstance(role, dict):
                role_name = role['role']
            else:
                role_name = utils.role_spec_parse(role)["name"]

            if os.path.isfile(task):
                nt = dict(include=pipes.quote(task), vars=role_vars, role_params=role_params, default_vars=default_vars, role_name=role_name)
                new_tasks.append(nt)
            if os.path.isfile(handler):
                nt = dict(include=pipes.quote(handler), vars=role_vars, role_params=role_params, role_name=role_name)
                new_handlers.append(nt)
            if os.path.isfile(vars_file):
                role_vars_files.append(vars_file)
            if os.path.isfile(defaults_file):
                defaults_files.append(defaults_file)
            if os.path.isdir(library):
                utils.plugins.module_finder.add_directory(library)

        tasks      = ds.get('tasks', None)
        post_tasks = ds.get('post_tasks', None)
        handlers   = ds.get('handlers', None)
        vars_files = ds.get('vars_files', None)

        if not isinstance(tasks, list):
            tasks = []
        if not isinstance(handlers, list):
            handlers = []
        if not isinstance(vars_files, list):
            vars_files = []
        if not isinstance(post_tasks, list):
            post_tasks = []

        new_tasks.extend(tasks)
        new_tasks.append(dict(meta='flush_handlers'))
        new_tasks.extend(post_tasks)
        new_tasks.append(dict(meta='flush_handlers'))

        new_handlers.extend(handlers)

        ds['tasks'] = new_tasks
        ds['handlers'] = new_handlers
        ds['role_names'] = [role_name for (role, role_path, role_vars, role_params, default_vars) in roles]

        self.role_vars = self._load_role_vars_files(role_vars_files)
        self.default_vars = self._load_role_defaults(defaults_files)

        return ds

    def _load_tasks_and_handlers(self, ds):
        load_vars = dict()
        load_vars['playbook_dir'] = os.path.abspath(self.basedir)
        if self.playbook.inventory.basedir() is not None:
            load_vars['inventory_dir'] = self.playbook.inventory.basedir()
        if self.playbook.inventory.src() is not None:
            load_vars['inventory_file'] = self.playbook.inventory.src()

        self._tasks      = self._load_tasks(self._ds.get('tasks', []), load_vars)
        self._handlers   = self._load_tasks(self._ds.get('handlers', []), load_vars)

        self._late_merge_role_tags()

    # ... rest of the class remains the same ...