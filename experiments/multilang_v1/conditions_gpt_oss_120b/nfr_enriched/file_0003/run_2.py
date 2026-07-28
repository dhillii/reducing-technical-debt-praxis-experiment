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

#############################################

from ansible.utils.template import template
from ansible import utils
from ansible import errors
from ansible.playbook.task import Task
from ansible.module_utils.splitter import split_args, unquote
from ansible.utils.unicode import to_bytes
import ansible.constants as C
import pipes
import shlex
import os
import sys
import uuid


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

    VALID_KEYS = frozenset(_pb_common + [
        'connection', 'include', 'max_fail_percentage', 'port', 'post_tasks',
        'pre_tasks', 'role_names', 'tasks', 'user',
    ])

    # *************************************************

    def __init__(self, playbook, ds, basedir, vault_password=None):
        """Constructor loads from a play datastructure."""
        self._validate_ds_keys(ds)
        self._initialize_basic_attrs(playbook, ds, basedir, vault_password)
        self._process_tags()
        self._prepare_load_vars()
        self._load_initial_vars_files()
        self._load_roles_and_update_vars_files(ds)
        self._template_ds()
        self._finalize_hosts_and_attrs()
        self._resolve_become_conflicts()
        self._finalize_tasks_handlers()
        self._late_merge_role_tags()
        self._play_hosts = None

    # *************************************************

    def _validate_ds_keys(self, ds):
        """Ensure all keys in the play definition are valid."""
        for key in ds.keys():
            if key not in Play.VALID_KEYS:
                raise errors.AnsibleError("%s is not a legal parameter of an Ansible Play" % key)

    def _initialize_basic_attrs(self, playbook, ds, basedir, vault_password):
        """Set up primary attributes from the play definition."""
        self.vars = ds.get('vars', {})
        self.vars_prompt = ds.get('vars_prompt', {})
        self.playbook = playbook
        self.vars = self._get_vars()
        self.vars_file_vars = {}
        self.role_vars = {}
        self.basedir = basedir
        self.roles = ds.get('roles', None)
        self.tags = ds.get('tags', None)
        self.vault_password = vault_password
        self.environment = ds.get('environment', {})

    def _process_tags(self):
        """Normalize the tags attribute to a list."""
        if self.tags is None:
            self.tags = []
        elif isinstance(self.tags, (str, unicode)):
            self.tags = self.tags.split(",")
        elif not isinstance(self.tags, list):
            self.tags = []

    def _prepare_load_vars(self):
        """Create a dictionary of variables used while loading tasks and handlers."""
        self._load_vars = {
            'playbook_dir': os.path.abspath(self.basedir)
        }
        if self.playbook.inventory.basedir() is not None:
            self._load_vars['inventory_dir'] = self.playbook.inventory.basedir()
        if self.playbook.inventory.src() is not None:
            self._load_vars['inventory_file'] = self.playbook.inventory.src()

    def _load_initial_vars_files(self):
        """Load vars_files before processing roles."""
        self.vars_files = ds.get('vars_files', [])
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        self._processed_vars_files = self._update_vars_files_for_host(None)

    def _load_roles_and_update_vars_files(self, ds):
        """Load roles and re‑process vars_files after role inclusion."""
        self.included_roles = []
        ds = self._load_roles(self.roles, ds)
        self.vars_files = utils.list_difference(ds.get('vars_files', []), self._processed_vars_files)
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        self._update_vars_files_for_host(None)
        self._ds = ds

    def _template_ds(self):
        """Template the play definition (excluding tasks/handlers)."""
        _tasks = self._ds.pop('tasks', [])
        _handlers = self._ds.pop('handlers', [])
        temp_vars = utils.combine_vars(self.vars, self.vars_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.playbook.extra_vars)
        try:
            self._ds = template(self.basedir, self._ds, temp_vars)
        except errors.AnsibleError as e:
            utils.warning("non fatal error while trying to template play variables: %s" % str(e))
        self._ds['tasks'] = _tasks
        self._ds['handlers'] = _handlers

    def _finalize_hosts_and_attrs(self):
        """Validate hosts and set remaining play attributes."""
        hosts = self._ds.get('hosts')
        if hosts is None:
            raise errors.AnsibleError('hosts declaration is required')
        if isinstance(hosts, list):
            try:
                hosts = ';'.join(hosts)
            except TypeError as e:
                raise errors.AnsibleError('improper host declaration: %s' % str(e))
        self.serial = str(self._ds.get('serial', 0))
        self.hosts = hosts
        self.name = self._ds.get('name', self.hosts)
        self._tasks = self._ds.get('tasks', [])
        self._handlers = self._ds.get('handlers', [])
        self.remote_user = self._ds.get('remote_user',
                                        self._ds.get('user', self.playbook.remote_user))
        self.remote_port = self._ds.get('port', self.playbook.remote_port)
        self.transport = self._ds.get('connection', self.playbook.transport)
        self.any_errors_fatal = utils.boolean(self._ds.get('any_errors_fatal', 'false'))
        self.accelerate = utils.boolean(self._ds.get('accelerate', 'false'))
        self.accelerate_port = self._ds.get('accelerate_port', None)
        self.accelerate_ipv6 = self._ds.get('accelerate_ipv6', False)
        self.max_fail_pct = int(self._ds.get('max_fail_percentage', 100))
        self.no_log = utils.boolean(self._ds.get('no_log', 'false'))
        self.force_handlers = utils.boolean(self._ds.get('force_handlers',
                                                         self.playbook.force_handlers))
        self.become = self._ds.get('become', self.playbook.become)
        self.become_method = self._ds.get('become_method', self.playbook.become_method)
        self.become_user = self._ds.get('become_user', self.playbook.become_user)
        self.gather_facts = self._ds.get('gather_facts', None)
        if self.gather_facts is not None:
            self.gather_facts = utils.boolean(self.gather_facts)
        self._load_vars['role_names'] = self._ds.get('role_names', [])

    def _resolve_become_conflicts(self):
        """Detect and raise errors for conflicting privilege escalation settings."""
        ds = self._ds
        if (ds.get('become') or ds.get('become_user')) and (ds.get('sudo') or ds.get('sudo_user')):
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("sudo", "sudo_user") cannot be used together')
        if (ds.get('become') or ds.get('become_user')) and (ds.get('su') or ds.get('su_user')):
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("su", "su_user") cannot be used together')
        if (ds.get('sudo') or ds.get('sudo_user')) and (ds.get('su') or ds.get('su_user')):
            raise errors.AnsibleError('sudo params ("sudo", "sudo_user") and su params ("su", "su_user") cannot be used together')
        if 'sudo' in ds:
            self.become = ds['sudo']
            self.become_method = 'sudo'
            if 'sudo_user' in ds:
                self.become_user = ds['sudo_user']
        elif 'su' in ds:
            self.become = True
            self.become = ds['su']
            self.become_method = 'su'
            if 'su_user' in ds:
                self.become_user = ds['su_user']

    def _finalize_tasks_handlers(self):
        """Load tasks and handlers after all variables are prepared."""
        self._tasks = self._load_tasks(self._ds.get('tasks', []), self._load_vars)
        self._handlers = self._load_tasks(self._ds.get('handlers', []), self._load_vars)

    # *************************************************

    def _get_role_path(self, role):
        """
        Returns the path on disk to the directory containing
        the role directories like tasks, templates, etc. Also
        returns any variables that were included with the role
        """
        orig_path = template(self.basedir, role, self.vars)

        role_vars = {}
        if isinstance(orig_path, dict):
            parsed_role = utils.role_yaml_parse(orig_path)
            role_name = parsed_role.get('role', parsed_role.get('name'))
            if role_name is None:
                raise errors.AnsibleError("expected a role name in dictionary: %s" % orig_path)
            role_vars = orig_path
        else:
            role_name = utils.role_spec_parse(orig_path)["name"]

        possible_paths = [
            utils.path_dwim(self.basedir, os.path.join('roles', role_name)),
            utils.path_dwim(self.basedir, role_name)
        ]

        if C.DEFAULT_ROLES_PATH:
            for loc in C.DEFAULT_ROLES_PATH.split(os.pathsep):
                loc = os.path.expanduser(loc)
                possible_paths.append(utils.path_dwim(loc, role_name))

        for path_option in possible_paths:
            if os.path.isdir(path_option):
                return path_option, role_vars

        raise errors.AnsibleError("cannot find role in %s" % " or ".join(possible_paths))

    def _build_role_dependencies(self, roles, dep_stack, passed_vars={}, level=0):
        """Recursively resolve role dependencies, respecting recursion limits."""
        if level > 20:
            raise errors.AnsibleError("too many levels of recursion while resolving role dependencies")
        for role in roles:
            role_path, role_vars = self._get_role_path(role)

            role_params = role_vars.copy()
            for item in ('role', 'tags', 'when'):
                role_params.pop(item, None)

            role_vars = utils.combine_vars(passed_vars, role_vars)

            vars_file = self._resolve_main(utils.path_dwim(self.basedir,
                                                          os.path.join(role_path, 'vars')))
            if os.path.isfile(vars_file):
                vars_data = utils.parse_yaml_from_file(vars_file,
                                                       vault_password=self.vault_password)
                if vars_data:
                    if not isinstance(vars_data, dict):
                        raise errors.AnsibleError("vars from '%s' are not a dict" % vars_file)
                    role_vars = utils.combine_vars(vars_data, role_vars)

            defaults_file = self._resolve_main(utils.path_dwim(self.basedir,
                                                              os.path.join(role_path, 'defaults')))
            defaults_data = {}
            if os.path.isfile(defaults_file):
                defaults_data = utils.parse_yaml_from_file(defaults_file,
                                                          vault_password=self.vault_password)

            meta_file = self._resolve_main(utils.path_dwim(self.basedir,
                                                          os.path.join(role_path, 'meta')))
            if os.path.isfile(meta_file):
                meta_data = utils.parse_yaml_from_file(meta_file,
                                                      vault_password=self.vault_password)
                if meta_data:
                    dependencies = meta_data.get('dependencies', []) or []
                    for dep in dependencies:
                        allow_dupes = False
                        dep_path, dep_vars = self._get_role_path(dep)

                        dep_params = dep_vars.copy()
                        for item in ('role', 'tags', 'when'):
                            dep_params.pop(item, None)

                        meta_path = self._resolve_main(utils.path_dwim(self.basedir,
                                                                      os.path.join(dep_path, 'meta')))
                        if os.path.isfile(meta_path):
                            meta_content = utils.parse_yaml_from_file(meta_path,
                                                                     vault_password=self.vault_password)
                            if meta_content:
                                allow_dupes = utils.boolean(meta_content.get('allow_duplicates', ''))

                        def merge_tags(var_obj):
                            old = dep_vars.get('tags', [])
                            if isinstance(old, basestring):
                                old = [old]
                            new = []
                            if isinstance(var_obj, dict):
                                new = var_obj.get('tags', [])
                                if isinstance(new, basestring):
                                    new = [new]
                            return list(set(old).union(set(new)))

                        dep_vars['tags'] = merge_tags(role_vars)
                        dep_vars['tags'] = merge_tags(passed_vars)

                        if "tags" in passed_vars:
                            for inc in dep_stack:
                                if inc[0] == dep and "tags" in inc[3]:
                                    inc[3]["tags"] = list(set(inc[3]["tags"]).union(set(passed_vars["tags"])))
                                elif inc[0] == dep:
                                    inc[3]["tags"] = passed_vars["tags"][:]

                        dep_vars = utils.combine_vars(passed_vars, dep_vars)
                        dep_vars = utils.combine_vars(role_vars, dep_vars)

                        dep_vars_file = self._resolve_main(utils.path_dwim(self.basedir,
                                                                         os.path.join(dep_path, 'vars')))
                        if os.path.isfile(dep_vars_file):
                            dep_vars_data = utils.parse_yaml_from_file(dep_vars_file,
                                                                     vault_password=self.vault_password)
                            if dep_vars_data:
                                dep_vars = utils.combine_vars(dep_vars, dep_vars_data)

                        dep_defaults_file = self._resolve_main(utils.path_dwim(self.basedir,
                                                                         os.path.join(dep_path, 'defaults')))
                        if os.path.isfile(dep_defaults_file):
                            dep_defaults_data = utils.parse_yaml_from_file(dep_defaults_file,
                                                                      vault_password=self.vault_password)

                        if not allow_dupes and dep in self.included_roles:
                            continue
                        if not allow_dupes:
                            self.included_roles.append(dep)

                        when_combined = []
                        for src in (passed_vars.get('when'), role_vars.get('when'), dep_vars.get('when')):
                            if isinstance(src, (basestring, bool)):
                                when_combined.append(src)
                            elif isinstance(src, list):
                                when_combined.extend(src)
                        if when_combined:
                            dep_vars['when'] = when_combined

                        self._build_role_dependencies([dep], dep_stack,
                                                      passed_vars=dep_vars,
                                                      level=level + 1)
                        dep_stack.append([dep, dep_path, dep_vars, dep_params, dep_defaults_data])

            if level == 0:
                self.included_roles.append(role)
                dep_stack.append([role, role_path, role_vars, role_params, defaults_data])
        return dep_stack

    def _load_role_vars_files(self, vars_files):
        """Load variables from role vars files."""
        role_vars = {}
        for filename in vars_files:
            if os.path.exists(filename):
                new_vars = utils.parse_yaml_from_file(filename,
                                                      vault_password=self.vault_password)
                if new_vars:
                    if not isinstance(new_vars, dict):
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % (filename, type(new_vars)))
                    role_vars = utils.combine_vars(role_vars, new_vars)
        return role_vars

    def _load_role_defaults(self, defaults_files):
        """Load default variables from role defaults files."""
        default_vars = {}
        for filename in defaults_files:
            if os.path.exists(filename):
                new_default_vars = utils.parse_yaml_from_file(filename,
                                                             vault_password=self.vault_password)
                if new_default_vars:
                    if not isinstance(new_default_vars, dict):
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % (filename, type(new_default_vars)))
                    default_vars = utils.combine_vars(default_vars, new_default_vars)
        return default_vars

    def _load_roles(self, roles, ds):
        """Integrate role definitions into the play data structure."""
        if roles is None:
            roles = []
        if not isinstance(roles, list):
            raise errors.AnsibleError("value of 'roles:' must be a list")

        new_tasks = []
        new_handlers = []
        role_vars_files = []
        defaults_files = []

        pre_tasks = ds.get('pre_tasks')
        if not isinstance(pre_tasks, list):
            pre_tasks = []
        new_tasks.extend(pre_tasks)
        new_tasks.append(dict(meta='flush_handlers'))

        roles = self._build_role_dependencies(roles, [], {})

        for idx, val in enumerate(roles):
            roles[idx][-3]['role_uuid'] = str(uuid.uuid4())
            roles[idx][-3]['role_path'] = roles[idx][1]

        role_names = []

        for role, role_path, role_vars, role_params, default_vars in roles:
            special_keys = ["sudo", "sudo_user", "when", "with_items", "su",
                            "su_user", "become", "become_user"]
            special_vars = {k: role_vars[k] for k in special_keys if k in role_vars}

            task_base = utils.path_dwim(self.basedir, os.path.join(role_path, 'tasks'))
            handler_base = utils.path_dwim(self.basedir, os.path.join(role_path, 'handlers'))
            vars_base = utils.path_dwim(self.basedir, os.path.join(role_path, 'vars'))
            meta_base = utils.path_dwim(self.basedir, os.path.join(role_path, 'meta'))
            defaults_base = utils.path_dwim(self.basedir, os.path.join(role_path, 'defaults'))

            task = self._resolve_main(task_base)
            handler = self._resolve_main(handler_base)
            vars_file = self._resolve_main(vars_base)
            meta_file = self._resolve_main(meta_base)
            defaults_file = self._resolve_main(defaults_base)

            library = utils.path_dwim(self.basedir, os.path.join(role_path, 'library'))

            missing = lambda f: not os.path.isfile(f)
            if all(missing(p) for p in (task, handler, vars_file, defaults_file, meta_file)) and not os.path.isdir(library):
                raise errors.AnsibleError(
                    "found role at %s, but cannot find %s or %s or %s or %s or %s or %s" %
                    (role_path, task, handler, vars_file, defaults_file, meta_file, library)
                )

            role_name = role['role'] if isinstance(role, dict) else utils.role_spec_parse(role)["name"]
            role_names.append(role_name)

            if os.path.isfile(task):
                nt = dict(include=pipes.quote(task), vars=role_vars,
                          role_params=role_params, default_vars=default_vars,
                          role_name=role_name)
                nt.update(special_vars)
                new_tasks.append(nt)

            if os.path.isfile(handler):
                nh = dict(include=pipes.quote(handler), vars=role_vars,
                          role_params=role_params, role_name=role_name)
                nh.update(special_vars)
                new_handlers.append(nh)

            if os.path.isfile(vars_file):
                role_vars_files.append(vars_file)
            if os.path.isfile(defaults_file):
                defaults_files.append(defaults_file)
            if os.path.isdir(library):
                utils.plugins.module_finder.add_directory(library)

        tasks = ds.get('tasks') or []
        post_tasks = ds.get('post_tasks') or []
        handlers = ds.get('handlers') or []
        vars_files = ds.get('vars_files') or []

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
        ds['role_names'] = role_names

        self.role_vars = self._load_role_vars_files(role_vars_files)
        self.default_vars = self._load_role_defaults(defaults_files)

        return ds

    # *************************************************

    def _resolve_main(self, basepath):
        """Flexibly handle variations in main filenames."""
        mains = (
            os.path.join(basepath, 'main'),
            os.path.join(basepath, 'main.yml'),
            os.path.join(basepath, 'main.yaml'),
            os.path.join(basepath, 'main.json'),
        )
        if sum(os.path.isfile(x) for x in mains) > 1:
            raise errors.AnsibleError("found multiple main files at %s, only one allowed" % basepath)
        for m in mains:
            if os.path.isfile(m):
                return m
        return mains[0]

    # *************************************************

    def _load_tasks(self, tasks, vars=None, role_params=None, default_vars=None,
                    become_vars=None, additional_conditions=None,
                    original_file=None, role_name=None):
        """Handle task and handler include statements."""
        results = []
        if tasks is None:
            tasks = []
        additional_conditions = additional_conditions or []
        vars = vars or {}
        role_params = role_params or {}
        default_vars = default_vars or {}
        become_vars = become_vars or {}

        old_conditions = list(additional_conditions)

        for x in tasks:
            included_additional_conditions = list(old_conditions)

            if not isinstance(x, dict):
                raise errors.AnsibleError("expecting dict; got: %s, error in %s" % (x, original_file))

            included_become_vars = {}
            for k in ["become", "become_user", "become_method", "become_exe",
                      "sudo", "su", "sudo_user", "su_user"]:
                if k in x:
                    included_become_vars[k] = x[k]
                elif k in become_vars:
                    included_become_vars[k] = become_vars[k]
                    x[k] = become_vars[k]

            task_vars = vars.copy()
            if original_file:
                task_vars['_original_file'] = original_file

            if x.get('meta') == 'flush_handlers':
                if role_name and 'role_name' not in x:
                    x['role_name'] = role_name
                results.append(Task(self, x, module_vars=task_vars,
                                    role_name=role_name, no_tags=False))
                continue

            if 'include' in x:
                tokens = split_args(to_bytes(x['include'], nonstring='simplerepr'))
                included_additional_conditions = list(additional_conditions)
                include_vars = {}
                for k, v in x.items():
                    if k.startswith("with_"):
                        offender = " (in %s)" % original_file if original_file else ""
                        utils.deprecated("include + with_items is a removed deprecated feature" + offender,
                                         "1.5", removed=True)
                    elif k.startswith("when_"):
                        utils.deprecated("\"when_<criteria>:\" is a removed deprecated feature, use the simplified 'when:' conditional directly",
                                         None, removed=True)
                    elif k == 'when':
                        if isinstance(v, (basestring, bool)):
                            included_additional_conditions.append(v)
                        elif isinstance(v, list):
                            included_additional_conditions.extend(v)
                    elif k in ("include", "vars", "role_params", "default_vars",
                               "sudo", "sudo_user", "role_name", "no_log",
                               "become", "become_user", "su", "su_user"):
                        continue
                    else:
                        include_vars[k] = v

                role_params = x.get('role_params', {})
                default_vars = x.get('default_vars', {})
                if not default_vars:
                    default_vars = self.default_vars
                else:
                    default_vars = utils.combine_vars(self.default_vars, default_vars)

                task_vars = utils.combine_vars(task_vars, include_vars)
                if 'vars' in x:
                    task_vars = utils.combine_vars(task_vars, x['vars'])

                new_role = x.get('role_name')
                mv = task_vars.copy()
                for t in tokens[1:]:
                    k, v = t.split("=", 1)
                    v = unquote(v)
                    mv[k] = template(self.basedir, v, mv)

                dirname = self.basedir if not original_file else os.path.dirname(original_file)

                temp_vars = utils.combine_vars(self.vars, self.vars_file_vars)
                temp_vars = utils.combine_vars(temp_vars, mv)
                temp_vars = utils.combine_vars(temp_vars, self.playbook.extra_vars)

                include_file = template(dirname, tokens[0], temp_vars)
                include_filename = utils.path_dwim(dirname, include_file)

                data = utils.parse_yaml_from_file(include_filename,
                                                  vault_password=self.vault_password)
                if new_role and data is not None:
                    for y in data:
                        if isinstance(y, dict) and 'include' in y:
                            y['role_name'] = new_role

                loaded = self._load_tasks(data, mv, role_params,
                                          default_vars, included_become_vars,
                                          list(included_additional_conditions),
                                          original_file=include_filename,
                                          role_name=new_role)
                results.extend(loaded)
            else:
                task = Task(self, x, module_vars=task_vars,
                            play_vars=self.vars,
                            play_file_vars=self.vars_file_vars,
                            role_vars=self.role_vars,
                            role_params=role_params,
                            default_vars=default_vars,
                            additional_conditions=list(additional_conditions),
                            role_name=role_name)
                results.append(task)

        for x in results:
            if self.tags is not None:
                x.tags.extend(self.tags)

        return results

    # *************************************************

    def tasks(self):
        """Return task objects for this play."""
        return self._tasks

    def handlers(self):
        """Return handler objects for this play."""
        return self._handlers

    # *************************************************

    def _get_vars(self):
        """Load the vars section from a play, handling prompts and extra vars."""
        if self.vars is None:
            self.vars = {}

        if not isinstance(self.vars, (dict, list)):
            raise errors.AnsibleError("'vars' section must contain only key/value pairs")

        vars = {}
        if isinstance(self.vars, list):
            for item in self.vars:
                if not hasattr(item, 'items'):
                    raise errors.AnsibleError("expecting a key-value pair in 'vars' section")
                k, v = list(item.items())[0]
                vars[k] = v
        else:
            vars.update(self.vars)

        if isinstance(self.vars_prompt, list):
            for var in self.vars_prompt:
                if 'name' not in var:
                    raise errors.AnsibleError("'vars_prompt' item is missing 'name:'")
                vname = var['name']
                prompt = var.get("prompt", vname)
                default = var.get("default")
                private = var.get("private", True)
                confirm = var.get("confirm", False)
                encrypt = var.get("encrypt")
                salt_size = var.get("salt_size")
                salt = var.get("salt")
                if vname not in self.playbook.extra_vars:
                    vars[vname] = self.playbook.callbacks.on_vars_prompt(
                        vname, private, prompt, encrypt, confirm,
                        salt_size, salt, default
                    )
        elif isinstance(self.vars_prompt, dict):
            for vname, prompt in self.vars_prompt.iteritems():
                prompt_msg = "%s: " % prompt
                if vname not in self.playbook.extra_vars:
                    vars[vname] = self.playbook.callbacks.on_vars_prompt(
                        varname=vname, private=True,
                        prompt=prompt_msg, default=None
                    )
        else:
            raise errors.AnsibleError("'vars_prompt' section is malformed, see docs")

        if isinstance(self.playbook.extra_vars, dict):
            vars = utils.combine_vars(vars, self.playbook.extra_vars)

        return vars

    # *************************************************

    def update_vars_files(self, hosts, vault_password=None):
        """Calculate vars_files, requiring setup to mix in ansible facts."""
        for h in hosts:
            self._update_vars_files_for_host(h, vault_password=vault_password)

    # *************************************************

    def compare_tags(self, tags):
        """Return matched and unmatched tags based on user input."""
        all_tags = []
        for task in self._tasks:
            if not task.meta:
                all_tags.extend(task.tags)
        for handler in self._handlers:
            all_tags.extend(handler.tags)

        all_set = set(all_tags)
        user_set = set(tags)

        matched = all_set.intersection(user_set)
        unmatched = all_set.difference(user_set)

        if 'always' in all_set:
            matched.update(['always'])
            unmatched = all_set.difference(['always'])

        if 'all' in user_set:
            matched = all_set
            unmatched = set()

        if 'tagged' in user_set:
            matched = all_set.difference(['untagged'])
            unmatched = {'untagged'}

        if 'untagged' in user_set and 'untagged' in all_set:
            matched.update(['untagged'])
            unmatched.difference_update(['untagged'])

        return matched, unmatched

    # *************************************************

    def _late_merge_role_tags(self):
        """Merge role tags into each task after all roles are loaded."""
        role_tags = {}
        for task in self._ds['tasks']:
            if 'role_name' in task:
                key = task['role_name'] + "-" + task['vars']['role_uuid']
                role_tags.setdefault(key, [])
                tags = task['vars'].get('tags', [])
                if isinstance(tags, basestring):
                    role_tags[key].extend(shlex.split(tags))
                else:
                    role_tags[key].extend(tags)

        for idx, val in enumerate(self._tasks):
            if getattr(val, 'role_name', None):
                key = val.role_name + "-" + val.module_vars['role_uuid']
                if key in role_tags:
                    self._tasks[idx].tags = sorted(set(self._tasks[idx].tags + role_tags[key]))

    # *************************************************

    def _update_vars_files_for_host(self, host, vault_password=None):
        """Process vars_files for a given host, updating caches as needed."""
        def generate_filenames(host, inject, filename):
            """Render the raw filename into templated forms."""
            filename2 = template(self.basedir, filename, self.vars)
            filename3 = filename2
            if host is not None:
                filename3 = template(self.basedir, filename2, inject)

            if utils.contains_vars(filename3) and host is not None:
                inject.update(self.vars)
                filename4 = template(self.basedir, filename3, inject)
                filename4 = utils.path_dwim(self.basedir, filename4)
            else:
                filename4 = utils.path_dwim(self.basedir, filename3)
            return filename2, filename3, filename4

        def update_vars_cache(host, data, target_filename=None):
            """Update a host's var cache with new data."""
            self.playbook.VARS_CACHE[host] = utils.combine_vars(
                self.playbook.VARS_CACHE.get(host, {}), data)
            if target_filename:
                self.playbook.callbacks.on_import_for_host(host, target_filename)

        def process_files(filename, filename2, filename3, filename4, host=None):
            """Determine where new vars should be stored."""
            data = utils.parse_yaml_from_file(filename4,
                                              vault_password=self.vault_password)
            if data:
                if not isinstance(data, dict):
                    raise errors.AnsibleError("%s must be stored as a dictionary/hash" % filename4)
                if host is not None:
                    target = None
                    if utils.contains_vars(filename2):
                        target = filename3 if not utils.contains_vars(filename3) else filename4
                    update_vars_cache(host, data, target_filename=target)
                else:
                    self.vars_file_vars = utils.combine_vars(self.vars_file_vars, data)
                return True
            return False

        if not isinstance(self.vars_files, list):
            self.vars_files = [self.vars_files]

        inject = {}
        if host is not None:
            inject.update(self.playbook.inventory.get_variables(host,
                                                               vault_password=vault_password))
            inject.update(self.playbook.SETUP_CACHE.get(host, {}))
            inject.update(self.playbook.VARS_CACHE.get(host, {}))
        else:
            inject = None

        processed = []
        for filename in self.vars_files:
            if isinstance(filename, list):
                found = False
                seq = []
                for real in filename:
                    f2, f3, f4 = generate_filenames(host, inject, real)
                    seq.append(f4)
                    if os.path.exists(f4):
                        found = True
                        if process_files(filename, f2, f3, f4, host=host):
                            processed.append(filename)
                    elif host is not None:
                        self.playbook.callbacks.on_not_import_for_host(host, f4)
                    if found:
                        break
                if not found and host is not None:
                    raise errors.AnsibleError(
                        "%s: FATAL, no files matched for vars_files import sequence: %s" %
                        (host, seq)
                    )
            else:
                f2, f3, f4 = generate_filenames(host, inject, filename)
                if utils.contains_vars(f4):
                    continue
                if process_files(filename, f2, f3, f4, host=host):
                    processed.append(filename)

        return processed