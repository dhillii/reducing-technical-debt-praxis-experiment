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
        ''' constructor loads from a play datastructure '''
        self._validate_keys(ds)
        self._load_initial_vars(ds, basedir, vault_password)
        self._load_roles(ds)
        self._load_tasks_and_handlers(ds)
        self._validate_play_settings(ds)

    def _validate_keys(self, ds):
        for x in ds.keys():
            if x not in Play.VALID_KEYS:
                raise errors.AnsibleError("%s is not a legal parameter of an Ansible Play" % x)

    def _load_initial_vars(self, ds, basedir, vault_password):
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

    def _load_roles(self, ds):
        self.included_roles = []
        ds = self._load_roles_recursive(self.roles, ds, {}, 0)
        self.role_vars = self._load_role_vars_files(ds.get('vars_files', []))
        self.default_vars = self._load_role_defaults(ds.get('defaults_files', []))

    def _load_roles_recursive(self, roles, ds, passed_vars, level):
        if level > 20:
            raise errors.AnsibleError("too many levels of recursion while resolving role dependencies")
        for role in roles:
            role_path, role_vars = self._get_role_path(role)
            role_vars = utils.combine_vars(passed_vars, role_vars)
            ds = self._load_role(ds, role_path, role_vars)
            dependencies = self._get_dependencies(role_path)
            if dependencies:
                ds = self._load_roles_recursive(dependencies, ds, role_vars, level + 1)
        return ds

    def _load_role(self, ds, role_path, role_vars):
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

        if os.path.isfile(task):
            ds['tasks'].append(dict(include=pipes.quote(task), vars=role_vars))
        if os.path.isfile(handler):
            ds['handlers'].append(dict(include=pipes.quote(handler), vars=role_vars))
        if os.path.isfile(vars_file):
            ds['vars_files'].append(vars_file)
        if os.path.isfile(defaults_file):
            ds['defaults_files'].append(defaults_file)
        return ds

    def _get_dependencies(self, role_path):
        meta = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(role_path, 'meta')))
        if os.path.isfile(meta):
            data = utils.parse_yaml_from_file(meta, vault_password=self.vault_password)
            if data:
                return data.get('dependencies',[])
        return []

    def _load_tasks_and_handlers(self, ds):
        self._tasks      = self._load_tasks(ds.get('tasks', []))
        self._handlers   = self._load_tasks(ds.get('handlers', []))

    def _validate_play_settings(self, ds):
        if ds.get('hosts') is None:
            raise errors.AnsibleError('hosts declaration is required')
        self.serial           = str(ds.get('serial', 0))
        self.hosts            = ds.get('hosts')
        self.name             = ds.get('name', self.hosts)
        self.remote_user      = ds.get('remote_user', ds.get('user', self.playbook.remote_user))
        self.remote_port      = ds.get('port', self.playbook.remote_port)
        self.transport        = ds.get('connection', self.playbook.transport)
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

    def _get_role_path(self, role):
        orig_path = template(self.basedir,role,self.vars)

        role_vars = {}
        if type(orig_path) == dict:
            parsed_role = utils.role_yaml_parse(orig_path)
            role_name = parsed_role.get('role', parsed_role.get('name'))
            if role_name is None:
                raise errors.AnsibleError("expected a role name in dictionary: %s" % orig_path)
            role_vars = orig_path
        else:
            role_name = utils.role_spec_parse(orig_path)["name"]

        role_path = None

        possible_paths = [
            utils.path_dwim(self.basedir, os.path.join('roles', role_name)),
            utils.path_dwim(self.basedir, role_name)
        ]

        if C.DEFAULT_ROLES_PATH:
            search_locations = C.DEFAULT_ROLES_PATH.split(os.pathsep)
            for loc in search_locations:
                loc = os.path.expanduser(loc)
                possible_paths.append(utils.path_dwim(loc, role_name))

        for path_option in possible_paths:
            if os.path.isdir(path_option):
                role_path = path_option
                break

        if role_path is None:
            raise errors.AnsibleError("cannot find role in %s" % " or ".join(possible_paths))

        return (role_path, role_vars)

    def _load_tasks(self, tasks):
        results = []
        for x in tasks:
            if 'meta' in x:
                if x['meta'] == 'flush_handlers':
                    results.append(Task(self, x))
                    continue
            task = Task(self, x)
            results.append(task)
        return results

    def _load_role_vars_files(self, vars_files):
        role_vars = {}
        for filename in vars_files:
            if os.path.exists(filename):
                new_vars = utils.parse_yaml_from_file(filename, vault_password=self.vault_password)
                if new_vars:
                    if type(new_vars) != dict:
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % (filename, type(new_vars)))
                    role_vars = utils.combine_vars(role_vars, new_vars)

        return role_vars

    def _load_role_defaults(self, defaults_files):
        default_vars = {}
        for filename in defaults_files:
            if os.path.exists(filename):
                new_default_vars = utils.parse_yaml_from_file(filename, vault_password=self.vault_password)
                if new_default_vars:
                    if type(new_default_vars) != dict:
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % (filename, type(new_default_vars)))
                    default_vars = utils.combine_vars(default_vars, new_default_vars)

        return default_vars

    def _resolve_main(self, basepath):
        mains = (
                 os.path.join(basepath, 'main'),
                 os.path.join(basepath, 'main.yml'),
                 os.path.join(basepath, 'main.yaml'),
                 os.path.join(basepath, 'main.json'),
                )
        if sum([os.path.isfile(x) for x in mains]) > 1:
            raise errors.AnsibleError("found multiple main files at %s, only one allowed" % (basepath))
        else:
            for m in mains:
                if os.path.isfile(m):
                    return m 
            return mains[0] 

    def _get_vars(self):
        if self.vars is None:
            self.vars = {}

        if type(self.vars) not in [dict, list]:
            raise errors.AnsibleError("'vars' section must contain only key/value pairs")

        vars = {}

        if type(self.vars) == list:
            for item in self.vars:
                if getattr(item, 'items', None) is None:
                    raise errors.AnsibleError("expecting a key-value pair in 'vars' section")
                k, v = item.items()[0]
                vars[k] = v
        else:
            vars.update(self.vars)

        if type(self.vars_prompt) == list:
            for var in self.vars_prompt:
                if not 'name' in var:
                    raise errors.AnsibleError("'vars_prompt' item is missing 'name:'")

                vname = var['name']
                prompt = var.get("prompt", vname)
                default = var.get("default", None)
                private = var.get("private", True)

                confirm = var.get("confirm", False)
                encrypt = var.get("encrypt", None)
                salt_size = var.get("salt_size", None)
                salt = var.get("salt", None)

                if vname not in self.playbook.extra_vars:
                    vars[vname] = self.playbook.callbacks.on_vars_prompt(
                                     vname, private, prompt, encrypt, confirm, salt_size, salt, default
                                  )

        elif type(self.vars_prompt) == dict:
            for (vname, prompt) in self.vars_prompt.iteritems():
                prompt_msg = "%s: " % prompt
                if vname not in self.playbook.extra_vars:
                    vars[vname] = self.playbook.callbacks.on_vars_prompt(
                                     varname=vname, private=True, prompt=prompt_msg, default=None
                                  )

        else:
            raise errors.AnsibleError("'vars_prompt' section is malformed, see docs")

        if type(self.playbook.extra_vars) == dict:
            vars = utils.combine_vars(vars, self.playbook.extra_vars)

        return vars

    def update_vars_files(self, hosts, vault_password=None):
        for h in hosts:
            self._update_vars_files_for_host(h, vault_password=vault_password)

    def _update_vars_files_for_host(self, host, vault_password=None):
        def generate_filenames(host, inject, filename):
            filename2 = template(self.basedir, filename, self.vars)
            filename3 = filename2
            if host is not None:
                filename3 = template(self.basedir, filename2, inject)
            filename4 = utils.path_dwim(self.basedir, filename3)
            return filename2, filename3, filename4

        def update_vars_cache(host, data, target_filename=None):
            self.playbook.VARS_CACHE[host] = utils.combine_vars(self.playbook.VARS_CACHE.get(host, {}), data)
            if target_filename:
                self.playbook.callbacks.on_import_for_host(host, target_filename)

        def process_files(filename, filename2, filename3, filename4, host=None):
            data = utils.parse_yaml_from_file(filename4, vault_password=self.vault_password)
            if data:
                if type(data) != dict:
                    raise errors.AnsibleError("%s must be stored as a dictionary/hash" % filename4)
                if host is not None:
                    target_filename = None
                    if utils.contains_vars(filename2):
                        if not utils.contains_vars(filename3):
                            target_filename = filename3
                        else:
                            target_filename = filename4
                    update_vars_cache(host, data, target_filename=target_filename)
                else:
                    self.vars_file_vars = utils.combine_vars(self.vars_file_vars, data)
                return True
            return False

        if host is not None:
            inject = {}
            inject.update(self.playbook.inventory.get_variables(host, vault_password=vault_password))
            inject.update(self.playbook.SETUP_CACHE.get(host, {}))
            inject.update(self.playbook.VARS_CACHE.get(host, {}))
        else:
            inject = None

        processed = []
        for filename in self.vars_files:
            if type(filename) == list:
                found = False
                sequence = []
                for real_filename in filename:
                    filename2, filename3, filename4 = generate_filenames(host, inject, real_filename)
                    sequence.append(filename4)
                    if os.path.exists(filename4):
                        found = True
                        if process_files(filename, filename2, filename3, filename4, host=host):
                            processed.append(filename)
                    elif host is not None:
                        self.playbook.callbacks.on_not_import_for_host(host, filename4)
                    if found:
                        break
                if not found and host is not None:
                    raise errors.AnsibleError(
                        "%s: FATAL, no files matched for vars_files import sequence: %s" % (host, sequence)
                    )
            else:
                filename2, filename3, filename4 = generate_filenames(host, inject, filename)
                if utils.contains_vars(filename4):
                    continue
                if process_files(filename, filename2, filename3, filename4, host=host):
                    processed.append(filename)

        return processed

    def compare_tags(self, tags):
        all_tags = []
        for task in self._tasks:
            if not task.meta:
                all_tags.extend(task.tags)
        for handler in self._handlers:
            all_tags.extend(handler.tags)

        all_tags_set = set(all_tags)
        tags_set = set(tags)

        matched_tags = all_tags_set.intersection(tags_set)
        unmatched_tags = all_tags_set.difference(tags_set)

        a = set(['always'])
        u = set(['untagged'])
        if 'always' in all_tags_set:
            matched_tags = matched_tags.union(a)
            unmatched_tags = all_tags_set.difference(a)

        if 'all' in tags_set:
            matched_tags = matched_tags.union(all_tags_set)
            unmatched_tags = set()

        if 'tagged' in tags_set:
            matched_tags = all_tags_set.difference(u)
            unmatched_tags = u

        if 'untagged' in tags_set and 'untagged' in all_tags_set:
            matched_tags = matched_tags.union(u)
            unmatched_tags = unmatched_tags.difference(u)

        return matched_tags, unmatched_tags

    def _late_merge_role_tags(self):
        role_tags = {}
        for task in self._ds['tasks']:
            if 'role_name' in task:
                this_role = task['role_name'] + "-" + task['vars']['role_uuid']

                if this_role not in role_tags:
                    role_tags[this_role] = []

                if 'tags' in task['vars']:
                    if isinstance(task['vars']['tags'], basestring):
                        role_tags[this_role] += shlex.split(task['vars']['tags'])
                    else:
                        role_tags[this_role] += task['vars']['tags']

        for idx, val in enumerate(self._tasks):
            if getattr(val, 'role_name', None) is not None:
                this_role = val.role_name + "-" + val.module_vars['role_uuid']
                if this_role in role_tags:
                    self._tasks[idx].tags = sorted(set(self._tasks[idx].tags + role_tags[this_role]))

    def tasks(self):
        return self._tasks

    def handlers(self):
        return self._handlers