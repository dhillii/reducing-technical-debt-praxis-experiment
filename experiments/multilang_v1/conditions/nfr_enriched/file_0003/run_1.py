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

    # to catch typos and so forth -- these are userland names
    # and don't line up 1:1 with how they are stored
    VALID_KEYS = frozenset(_pb_common + [
        'connection', 'include', 'max_fail_percentage', 'port', 'post_tasks',
        'pre_tasks', 'role_names', 'tasks', 'user',
    ])

    # *************************************************

    def __init__(self, playbook, ds, basedir, vault_password=None):
        ''' constructor loads from a play datastructure '''

        self._validate_play_keys(ds)
        self._initialize_base_attributes(playbook, ds, basedir, vault_password)
        self._initialize_tags(ds)
        self._setup_load_vars()
        self._process_vars_files()
        self._load_and_process_roles(ds)
        self._extract_and_template_tasks_handlers(ds)
        self._initialize_play_attributes(ds)
        self._validate_privilege_escalation(ds)
        self._setup_become_attributes(ds)
        self._setup_gather_facts(ds)
        self._finalize_tasks_and_handlers()

    def _validate_play_keys(self, ds):
        """Validate that all keys in the play datastructure are recognized."""
        for x in ds.keys():
            if x not in Play.VALID_KEYS:
                raise errors.AnsibleError("%s is not a legal parameter of an Ansible Play" % x)

    def _initialize_base_attributes(self, playbook, ds, basedir, vault_password):
        """Initialize basic play attributes from datastructure."""
        self.vars = ds.get('vars', {})
        self.vars_prompt = ds.get('vars_prompt', {})
        self.playbook = playbook
        self.vars = self._get_vars()
        self.vars_file_vars = dict()
        self.role_vars = dict()
        self.basedir = basedir
        self.roles = ds.get('roles', None)
        self.tags = ds.get('tags', None)
        self.vault_password = vault_password
        self.environment = ds.get('environment', {})

    def _initialize_tags(self, ds):
        """Normalize tags to a list."""
        if self.tags is None:
            self.tags = []
        elif type(self.tags) in [str, unicode]:
            self.tags = self.tags.split(",")
        elif type(self.tags) != list:
            self.tags = []

    def _setup_load_vars(self):
        """Setup internal variables for loading tasks and handlers."""
        load_vars = dict()
        load_vars['playbook_dir'] = os.path.abspath(self.basedir)
        if self.playbook.inventory.basedir() is not None:
            load_vars['inventory_dir'] = self.playbook.inventory.basedir()
        if self.playbook.inventory.src() is not None:
            load_vars['inventory_file'] = self.playbook.inventory.src()
        self._load_vars = load_vars

    def _process_vars_files(self):
        """Process vars_files from datastructure."""
        self.vars_files = self._ds.get('vars_files', []) if hasattr(self, '_ds') else []
        if not hasattr(self, '_ds'):
            self.vars_files = []
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        processed_vars_files = self._update_vars_files_for_host(None)
        self.vars_files = utils.list_difference(self.vars_files, processed_vars_files)
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        self._update_vars_files_for_host(None)

    def _load_and_process_roles(self, ds):
        """Load roles and update datastructure."""
        self.vars_files = ds.get('vars_files', [])
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        processed_vars_files = self._update_vars_files_for_host(None)
        
        self.included_roles = []
        ds = self._load_roles(self.roles, ds)
        
        self.vars_files = utils.list_difference(ds.get('vars_files', []), processed_vars_files)
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')
        self._update_vars_files_for_host(None)

    def _extract_and_template_tasks_handlers(self, ds):
        """Extract tasks and handlers, then template the datastructure."""
        _tasks = ds.pop('tasks', [])
        _handlers = ds.pop('handlers', [])
        
        temp_vars = utils.combine_vars(self.vars, self.vars_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.playbook.extra_vars)
        
        try:
            ds = template(self.basedir, ds, temp_vars)
        except errors.AnsibleError, e:
            utils.warning("non fatal error while trying to template play variables: %s" % (str(e)))
        
        ds['tasks'] = _tasks
        ds['handlers'] = _handlers
        self._ds = ds

    def _initialize_play_attributes(self, ds):
        """Initialize play-level attributes from datastructure."""
        hosts = ds.get('hosts')
        if hosts is None:
            raise errors.AnsibleError('hosts declaration is required')
        elif isinstance(hosts, list):
            try:
                hosts = ';'.join(hosts)
            except TypeError, e:
                raise errors.AnsibleError('improper host declaration: %s' % str(e))
        
        self.serial = str(ds.get('serial', 0))
        self.hosts = hosts
        self.name = ds.get('name', self.hosts)
        self._tasks = ds.get('tasks', [])
        self._handlers = ds.get('handlers', [])
        self.remote_user = ds.get('remote_user', ds.get('user', self.playbook.remote_user))
        self.remote_port = ds.get('port', self.playbook.remote_port)
        self.transport = ds.get('connection', self.playbook.transport)
        self.any_errors_fatal = utils.boolean(ds.get('any_errors_fatal', 'false'))
        self.accelerate = utils.boolean(ds.get('accelerate', 'false'))
        self.accelerate_port = ds.get('accelerate_port', None)
        self.accelerate_ipv6 = ds.get('accelerate_ipv6', False)
        self.max_fail_pct = int(ds.get('max_fail_percentage', 100))
        self.no_log = utils.boolean(ds.get('no_log', 'false'))
        self.force_handlers = utils.boolean(ds.get('force_handlers', self.playbook.force_handlers))

    def _validate_privilege_escalation(self, ds):
        """Validate that conflicting privilege escalation methods are not used."""
        become_set = ds.get('become') or ds.get('become_user')
        sudo_set = ds.get('sudo') or ds.get('sudo_user')
        su_set = ds.get('su') or ds.get('su_user')
        
        if become_set and sudo_set:
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("sudo", "sudo_user") cannot be used together')
        if become_set and su_set:
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("su", "su_user") cannot be used together')
        if sudo_set and su_set:
            raise errors.AnsibleError('sudo params ("sudo", "sudo_user") and su params ("su", "su_user") cannot be used together')

    def _setup_become_attributes(self, ds):
        """Setup become-related attributes."""
        self.become = ds.get('become', self.playbook.become)
        self.become_method = ds.get('become_method', self.playbook.become_method)
        self.become_user = ds.get('become_user', self.playbook.become_user)
        
        if 'sudo' in ds:
            self.become = ds['sudo']
            self.become_method = 'sudo'
            if 'sudo_user' in ds:
                self.become_user = ds['sudo_user']
        elif 'su' in ds:
            self.become = ds['su']
            self.become_method = 'su'
            if 'su_user' in ds:
                self.become_user = ds['su_user']

    def _setup_gather_facts(self, ds):
        """Setup gather_facts attribute."""
        self.gather_facts = ds.get('gather_facts', None)
        if self.gather_facts is not None:
            self.gather_facts = utils.boolean(self.gather_facts)

    def _finalize_tasks_and_handlers(self):
        """Load and finalize tasks and handlers."""
        load_vars = self._load_vars
        load_vars['role_names'] = self._ds.get('role_names', [])
        
        self._tasks = self._load_tasks(self._ds.get('tasks', []), load_vars)
        self._handlers = self._load_tasks(self._ds.get('handlers', []), load_vars)
        
        self._late_merge_role_tags()
        self._play_hosts = None

    # *************************************************

    def _get_role_path(self, role):
        """
        Returns the path on disk to the directory containing
        the role directories like tasks, templates, etc. Also
        returns any variables that were included with the role
        """
        orig_path = template(self.basedir, role, self.vars)

        role_vars = {}
        if type(orig_path) == dict:
            parsed_role = utils.role_yaml_parse(orig_path)
            role_name = parsed_role.get('role', parsed_role.get('name'))
            if role_name is None:
                raise errors.AnsibleError("expected a role name in dictionary: %s" % orig_path)
            role_vars = orig_path
        else:
            role_name = utils.role_spec_parse(orig_path)["name"]

        role_path = self._find_role_path(role_name)
        if role_path is None:
            possible_paths = self._get_possible_role_paths(role_name)
            raise errors.AnsibleError("cannot find role in %s" % " or ".join(possible_paths))

        return (role_path, role_vars)

    def _get_possible_role_paths(self, role_name):
        """Get all possible paths where a role might be located."""
        possible_paths = [
            utils.path_dwim(self.basedir, os.path.join('roles', role_name)),
            utils.path_dwim(self.basedir, role_name)
        ]
        
        if C.DEFAULT_ROLES_PATH:
            search_locations = C.DEFAULT_ROLES_PATH.split(os.pathsep)
            for loc in search_locations:
                loc = os.path.expanduser(loc)
                possible_paths.append(utils.path_dwim(loc, role_name))
        
        return possible_paths

    def _find_role_path(self, role_name):
        """Find the actual path to a role."""
        for path_option in self._get_possible_role_paths(role_name):
            if os.path.isdir(path_option):
                return path_option
        return None

    def _build_role_dependencies(self, roles, dep_stack, passed_vars={}, level=0):
        if level > 20:
            raise errors.AnsibleError("too many levels of recursion while resolving role dependencies")
        for role in roles:
            role_path, role_vars = self._get_role_path(role)
            role_params = self._extract_role_params(role_vars)
            role_vars = utils.combine_vars(passed_vars, role_vars)
            
            vars_data = self._load_role_file(role_path, 'vars')
            if vars_data:
                role_vars = utils.combine_vars(vars_data, role_vars)
            
            defaults_data = self._load_role_file(role_path, 'defaults')
            meta = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(role_path, 'meta')))
            
            if os.path.isfile(meta):
                self._process_role_dependencies(meta, role, role_path, role_vars, passed_vars, dep_stack, level)
            
            if level == 0:
                self.included_roles.append(role)
                dep_stack.append([role, role_path, role_vars, role_params, defaults_data])
        
        return dep_stack

    def _extract_role_params(self, role_vars):
        """Extract role parameters, excluding special keywords."""
        role_params = role_vars.copy()
        for item in ('role', 'tags', 'when'):
            if item in role_params:
                del role_params[item]
        return role_params

    def _load_role_file(self, role_path, file_type):
        """Load a role file (vars or defaults) and return parsed data."""
        file_path = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(role_path, file_type)))
        if os.path.isfile(file_path):
            data = utils.parse_yaml_from_file(file_path, vault_password=self.vault_password)
            if data:
                if not isinstance(data, dict):
                    raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % (file_path, type(data)))
                return data
        return {}

    def _process_role_dependencies(self, meta_file, role, role_path, role_vars, passed_vars, dep_stack, level):
        """Process dependencies defined in a role's meta file."""
        data = utils.parse_yaml_from_file(meta_file, vault_password=self.vault_password)
        if not data:
            return
        
        dependencies = data.get('dependencies', [])
        if dependencies is None:
            dependencies = []
        
        for dep in dependencies:
            self._process_single_dependency(dep, role, role_path, role_vars, passed_vars, dep_stack, level)

    def _process_single_dependency(self, dep, role, role_path, role_vars, passed_vars, dep_stack, level):
        """Process a single role dependency."""
        dep_path, dep_vars = self._get_role_path(dep)
        dep_params = self._extract_role_params(dep_vars)
        
        meta = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(dep_path, 'meta')))
        allow_dupes = False
        if os.path.isfile(meta):
            meta_data = utils.parse_yaml_from_file(meta, vault_password=self.vault_password)
            if meta_data:
                allow_dupes = utils.boolean(meta_data.get('allow_duplicates', ''))
        
        dep_vars['tags'] = self._merge_dependency_tags(dep_vars, role_vars, passed_vars)
        
        if "tags" in passed_vars:
            self._update_included_role_tags(dep, dep_stack, passed_vars)
        
        dep_vars = utils.combine_vars(passed_vars, dep_vars)
        dep_vars = utils.combine_vars(role_vars, dep_vars)
        
        dep_vars_data = self._load_role_file(dep_path, 'vars')
        if dep_vars_data:
            dep_vars = utils.combine_vars(dep_vars, dep_vars_data)
        
        dep_defaults_data = self._load_role_file(dep_path, 'defaults')
        
        if 'role' in dep_vars:
            del dep_vars['role']
        
        if not allow_dupes:
            if dep in self.included_roles:
                return
            else:
                self.included_roles.append(dep)
        
        dep_when = self._merge_conditionals(passed_vars.get('when'), role_vars.get('when'), dep_vars.get('when'))
        if dep_when:
            dep_vars['when'] = dep_when
        
        self._build_role_dependencies([dep], dep_stack, passed_vars=dep_vars, level=level + 1)
        dep_stack.append([dep, dep_path, dep_vars, dep_params, dep_defaults_data])

    def _merge_dependency_tags(self, dep_vars, role_vars, passed_vars):
        """Merge tags from role and passed variables into dependency variables."""
        def _extract_tags(var_obj):
            tags = var_obj.get('tags', []) if isinstance(var_obj, dict) else []
            if isinstance(tags, basestring):
                tags = [tags]
            return tags
        
        old_tags = dep_vars.get('tags', [])
        if isinstance(old_tags, basestring):
            old_tags = [old_tags]
        
        new_tags = _extract_tags(role_vars)
        merged = list(set(old_tags).union(set(new_tags)))
        
        new_tags = _extract_tags(passed_vars)
        merged = list(set(merged).union(set(new_tags)))
        
        return merged

    def _update_included_role_tags(self, dep, dep_stack, passed_vars):
        """Update tags for already-included roles."""
        for included_role_dep in dep_stack:
            included_dep_name = included_role_dep[0]
            included_dep_vars = included_role_dep[2]
            if included_dep_name == dep:
                if "tags" in included_dep_vars:
                    included_dep_vars["tags"] = list(set(included_dep_vars["tags"]).union(set(passed_vars["tags"])))
                else:
                    included_dep_vars["tags"] = passed_vars["tags"][:]

    def _merge_conditionals(self, *conditionals):
        """Merge multiple conditional lists into one."""
        result = []
        for cond in conditionals:
            if isinstance(cond, (basestring, bool)):
                result.append(cond)
            elif isinstance(cond, list):
                result.extend(cond)
        return result if result else None

    def _load_role_vars_files(self, vars_files):
        """Process variables stored in vars/main.yml files."""
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
        """Process default variables."""
        default_vars = {}
        for filename in defaults_files:
            if os.path.exists(filename):
                new_default_vars = utils.parse_yaml_from_file(filename, vault_password=self.vault_password)
                if new_default_vars:
                    if type(new_default_vars) != dict:
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % (filename, type(new_default_vars)))
                    default_vars = utils.combine_vars(default_vars, new_default_vars)
        return default_vars

    def _load_roles(self, roles, ds):
        """Load roles and integrate them into the play datastructure."""
        if roles is None:
            roles = []
        if type(roles) != list:
            raise errors.AnsibleError("value of 'roles:' must be a list")

        new_tasks = []
        new_handlers = []
        role_vars_files = []
        defaults_files = []

        self._add_pre_tasks(ds, new_tasks)
        roles = self._build_role_dependencies(roles, [], {})
        self._assign_role_uuids(roles)
        
        role_names = []
        for (role, role_path, role_vars, role_params, default_vars) in roles:
            self._process_role_files(role, role_path, role_vars, role_params, default_vars, 
                                    new_tasks, new_handlers, role_vars_files, defaults_files, role_names)

        self._add_main_and_post_tasks(ds, new_tasks, new_handlers)
        
        ds['tasks'] = new_tasks
        ds['handlers'] = new_handlers
        ds['role_names'] = role_names

        self.role_vars = self._load_role_vars_files(role_vars_files)
        self.default_vars = self._load_role_defaults(defaults_files)

        return ds

    def _add_pre_tasks(self, ds, new_tasks):
        """Add pre_tasks to the task list."""
        pre_tasks = ds.get('pre_tasks', None)
        if type(pre_tasks) != list:
            pre_tasks = []
        for x in pre_tasks:
            new_tasks.append(x)
        new_tasks.append(dict(meta='flush_handlers'))

    def _assign_role_uuids(self, roles):
        """Assign UUIDs and paths to roles."""
        for idx, val in enumerate(roles):
            this_uuid = str(uuid.uuid4())
            roles[idx][-3]['role_uuid'] = this_uuid
            roles[idx][-3]['role_path'] = roles[idx][1]

    def _process_role_files(self, role, role_path, role_vars, role_params, default_vars,
                           new_tasks, new_handlers, role_vars_files, defaults_files, role_names):
        """Process a single role's files and add to task/handler lists."""
        special_keys = ["sudo", "sudo_user", "when", "with_items", "su", "su_user", "become", "become_user"]
        special_vars = {k: role_vars[k] for k in special_keys if k in role_vars}

        task_basepath = utils.path_dwim(self.basedir, os.path.join(role_path, 'tasks'))
        handler_basepath = utils.path_dwim(self.basedir, os.path.join(role_path, 'handlers'))
        vars_basepath = utils.path_dwim(self.basedir, os.path.join(role_path, 'vars'))
        meta_basepath = utils.path_dwim(self.basedir, os.path.join(role_path, 'meta'))
        defaults_basepath = utils.path_dwim(self.basedir, os.path.join(role_path, 'defaults'))

        task = self._resolve_main(task_basepath)
        handler = self._resolve_main(handler_basepath)
        vars_file = self._resolve_main(vars_basepath)
        meta_file = self._resolve_main(meta_basepath)
        defaults_file = self._resolve_main(defaults_basepath)
        library = utils.path_dwim(self.basedir, os.path.join(role_path, 'library'))

        self._validate_role_files(role_path, task, handler, vars_file, defaults_file, meta_file, library)

        role_name = role['role'] if isinstance(role, dict) else utils.role_spec_parse(role)["name"]
        role_names.append(role_name)

        if os.path.isfile(task):
            nt = dict(include=pipes.quote(task), vars=role_vars, role_params=role_params, 
                     default_vars=default_vars, role_name=role_name)
            for k in special_keys:
                if k in special_vars:
                    nt[k] = special_vars[k]
            new_tasks.append(nt)

        if os.path.isfile(handler):
            nt = dict(include=pipes.quote(handler), vars=role_vars, role_params=role_params, role_name=role_name)
            for k in special_keys:
                if k in special_vars:
                    nt[k] = special_vars[k]
            new_handlers.append(nt)

        if os.path.isfile(vars_file):
            role_vars_files.append(vars_file)
        if os.path.isfile(defaults_file):
            defaults_files.append(defaults_file)
        if os.path.isdir(library):
            utils.plugins.module_finder.add_directory(library)

    def _validate_role_files(self, role_path, task, handler, vars_file, defaults_file, meta_file, library):
        """Validate that at least one role file exists."""
        missing = lambda f: not os.path.isfile(f)
        if missing(task) and missing(handler) and missing(vars_file) and missing(defaults_file) and missing(meta_file) and not os.path.isdir(library):
            raise errors.AnsibleError("found role at %s, but cannot find %s or %s or %s or %s or %s or %s" % 
                                     (role_path, task, handler, vars_file, defaults_file, meta_file, library))

    def _add_main_and_post_tasks(self, ds, new_tasks, new_handlers):
        """Add main and post tasks to the task list."""
        tasks = ds.get('tasks', None)
        post_tasks = ds.get('post_tasks', None)
        handlers = ds.get('handlers', None)

        if type(tasks) != list:
            tasks = []
        if type(handlers) != list:
            handlers = []
        if type(post_tasks) != list:
            post_tasks = []

        new_tasks.extend(tasks)
        new_tasks.append(dict(meta='flush_handlers'))
        new_tasks.extend(post_tasks)
        new_tasks.append(dict(meta='flush_handlers'))
        new_handlers.extend(handlers)

    # *************************************************

    def _resolve_main(self, basepath):
        ''' flexibly handle variations in main filenames '''
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

    # *************************************************

    def _load_tasks(self, tasks, vars=None, role_params=None, default_vars=None, become_vars=None,
                    additional_conditions=None, original_file=None, role_name=None):
        ''' handle task and handler include statements '''

        results = []
        if tasks is None:
            tasks = []
        if additional_conditions is None:
            additional_conditions = []
        if vars is None:
            vars = {}
        if role_params is None:
            role_params = {}
        if default_vars is None:
            default_vars = {}
        if become_vars is None:
            become_vars = {}

        old_conditions = list(additional_conditions)

        for x in tasks:
            included_additional_conditions = list(old_conditions)

            if not isinstance(x, dict):
                raise errors.AnsibleError("expecting dict; got: %s, error in %s" % (x, original_file))

            included_become_vars = self._extract_become_vars(x, become_vars)
            task_vars = vars.copy()
            if original_file:
                task_vars['_original_file'] = original_file

            if 'meta' in x:
                self._handle_meta_task(x, task_vars, role_name, results)
                continue

            if 'include' in x:
                self._handle_include_task(x, task_vars, role_params, default_vars, included_become_vars,
                                         included_additional_conditions, original_file, results)
            elif type(x) == dict:
                task = Task(
                    self, x,
                    module_vars=task_vars,
                    play_vars=self.vars,
                    play_file_vars=self.vars_file_vars,
                    role_vars=self.role_vars,
                    role_params=role_params,
                    default_vars=default_vars,
                    additional_conditions=list(additional_conditions),
                    role_name=role_name
                )
                results.append(task)
            else:
                raise Exception("unexpected task type")

        for x in results:
            if self.tags is not None:
                x.tags.extend(self.tags)

        return results

    def _extract_become_vars(self, task_dict, become_vars):
        """Extract become-related variables from task."""
        included_become_vars = {}
        for k in ["become", "become_user", "become_method", "become_exe", "sudo", "su", "sudo_user", "su_user"]:
            if k in task_dict:
                included_become_vars[k] = task_dict[k]
            elif k in become_vars:
                included_become_vars[k] = become_vars[k]
                task_dict[k] = become_vars[k]
        return included_become_vars

    def _handle_meta_task(self, task_dict, task_vars, role_name, results):
        """Handle meta tasks like flush_handlers."""
        if task_dict['meta'] == 'flush_handlers':
            if role_name and 'role_name' not in task_dict:
                task_dict['role_name'] = role_name
            results.append(Task(self, task_dict, module_vars=task_vars, role_name=role_name, no_tags=False))

    def _handle_include_task(self, task_dict, task_vars, role_params, default_vars, included_become_vars,
                            included_additional_conditions, original_file, results):
        """Handle include tasks."""
        tokens = split_args(to_bytes(task_dict['include'], nonstring='simplerepr'))
        include_vars = {}
        
        for k in task_dict:
            if k.startswith("with_"):
                offender = " (in %s)" % original_file if original_file else ""
                utils.deprecated("include + with_items is a removed deprecated feature" + offender, "1.5", removed=True)
            elif k.startswith("when_"):
                utils.deprecated("\"when_<criteria>:\" is a removed deprecated feature, use the simplified 'when:' conditional directly", None, removed=True)
            elif k == 'when':
                if isinstance(task_dict[k], (basestring, bool)):
                    included_additional_conditions.append(task_dict[k])
                elif type(task_dict[k]) is list:
                    included_additional_conditions.extend(task_dict[k])
            elif k not in ("include", "vars", "role_params", "default_vars", "sudo", "sudo_user", "role_name", "no_log", "become", "become_user", "su", "su_user"):
                include_vars[k] = task_dict[k]

        role_params = task_dict.get('role_params', {})
        default_vars = task_dict.get('default_vars', {})
        if not default_vars:
            default_vars = self.default_vars
        else:
            default_vars = utils.combine_vars(self.default_vars, default_vars)

        task_vars = utils.combine_vars(task_vars, include_vars)
        if 'vars' in task_dict:
            task_vars = utils.combine_vars(task_vars, task_dict['vars'])

        new_role = task_dict.get('role_name', None)

        mv = task_vars.copy()
        for t in tokens[1:]:
            (k, v) = t.split("=", 1)
            v = unquote(v)
            mv[k] = template(self.basedir, v, mv)

        dirname = self.basedir
        if original_file:
            dirname = os.path.dirname(original_file)

        temp_vars = utils.combine_vars(self.vars, self.vars_file_vars)
        temp_vars = utils.combine_vars(temp_vars, mv)
        temp_vars = utils.combine_vars(temp_vars, self.playbook.extra_vars)
        include_file = template(dirname, tokens[0], temp_vars)
        include_filename = utils.path_dwim(dirname, include_file)

        data = utils.parse_yaml_from_file(include_filename, vault_password=self.vault_password)
        if 'role_name' in task_dict and data is not None:
            for y in data:
                if isinstance(y, dict) and 'include' in y:
                    y['role_name'] = new_role

        loaded = self._load_tasks(data, mv, role_params, default_vars, included_become_vars, 
                                 list(included_additional_conditions), original_file=include_filename, role_name=new_role)
        results += loaded

    # *************************************************

    def tasks(self):
        ''' return task objects for this play '''
        return self._tasks

    def handlers(self):
        ''' return handler objects for this play '''
        return self._handlers

    # *************************************************

    def _get_vars(self):
        ''' load the vars section from a play, accounting for all sorts of variable features
        including loading from yaml files, prompting, and conditional includes of the first
        file found in a list. '''

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
            self._process_vars_prompt_list(vars)
        elif type(self.vars_prompt) == dict:
            self._process_vars_prompt_dict(vars)
        else:
            raise errors.AnsibleError("'vars_prompt' section is malformed, see docs")

        if type(self.playbook.extra_vars) == dict:
            vars = utils.combine_vars(vars, self.playbook.extra_vars)

        return vars

    def _process_vars_prompt_list(self, vars):
        """Process vars_prompt when it's a list."""
        for var in self.vars_prompt:
            if 'name' not in var:
                raise errors.AnsibleError("'vars_prompt' item is missing 'name:'")

            vname = var['name']
            if vname not in self.playbook.extra_vars:
                prompt = var.get("prompt", vname)
                default = var.get("default", None)
                private = var.get("private", True)
                confirm = var.get("confirm", False)
                encrypt = var.get("encrypt", None)
                salt_size = var.get("salt_size", None)
                salt = var.get("salt", None)

                vars[vname] = self.playbook.callbacks.on_vars_prompt(
                    vname, private, prompt, encrypt, confirm, salt_size, salt, default
                )

    def _process_vars_prompt_dict(self, vars):
        """Process vars_prompt when it's a dict."""
        for (vname, prompt) in self.vars_prompt.iteritems():
            prompt_msg = "%s: " % prompt
            if vname not in self.playbook.extra_vars:
                vars[vname] = self.playbook.callbacks.on_vars_prompt(
                    varname=vname, private=True, prompt=prompt_msg, default=None
                )

    # *************************************************

    def update_vars_files(self, hosts, vault_password=None):
        ''' calculate vars_files, which requires that setup runs first so ansible facts can be mixed in '''

        for h in hosts:
            self._update_vars_files_for_host(h, vault_password=vault_password)

    # *************************************************

    def compare_tags(self, tags):
        ''' given a list of tags that the user has specified, return two lists:
        matched_tags:   tags were found within the current play and match those given
                        by the user
        unmatched_tags: tags that were found within the current play but do not match
                        any provided by the user '''

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

        if 'always' in all_tags_set:
            matched_tags = matched_tags.union(set(['always']))
            unmatched_tags = all_tags_set.difference(set(['always']))

        if 'all' in tags_set:
            matched_tags = matched_tags.union(all_tags_set)
            unmatched_tags = set()

        if 'tagged' in tags_set:
            matched_tags = all_tags_set.difference(set(['untagged']))
            unmatched_tags = set(['untagged'])

        if 'untagged' in tags_set and 'untagged' in all_tags_set:
            matched_tags = matched_tags.union(set(['untagged']))
            unmatched_tags = unmatched_tags.difference(set(['untagged']))

        return matched_tags, unmatched_tags

    # *************************************************

    def _late_merge_role_tags(self):
        """Merge role tags into task tags."""
        role_tags = self._build_role_tags_dict()
        self._apply_role_tags(role_tags)

    def _build_role_tags_dict(self):
        """Build a dictionary of tags for each role."""
        role_tags = {}
        for task in self._ds['tasks']:
            if 'role_name' in task:
                this_role = task['role_name'] + "-" + task['vars']['role_uuid']
                if this_role not in role_tags:
                    role_tags[this_role] = []

                if 'tags' in task['vars']:
                    tags = task['vars']['tags']
                    if isinstance(tags, basestring):
                        role_tags[this_role] += shlex.split(tags)
                    else:
                        role_tags[this_role] += tags
        return role_tags

    def _apply_role_tags(self, role_tags):
        """Apply role tags to their respective tasks."""
        for idx, val in enumerate(self._tasks):
            if getattr(val, 'role_name', None) is not None:
                this_role = val.role_name + "-" + val.module_vars['role_uuid']
                if this_role in role_tags:
                    self._tasks[idx].tags = sorted(set(self._tasks[idx].tags + role_tags[this_role]))

    # *************************************************

    def _update_vars_files_for_host(self, host, vault_password=None):
        """Update vars files for a specific host."""
        def generate_filenames(host, inject, filename):
            """Render the raw filename into 3 forms."""
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
            """Update a host's varscache with new var data."""
            self.playbook.VARS_CACHE[host] = utils.combine_vars(self.playbook.VARS_CACHE.get(host, {}), data)
            if target_filename:
                self.playbook.callbacks.on_import_for_host(host, target_filename)

        def process_files(filename, filename2, filename3, filename4, host=None):
            """Process a vars file and update appropriate cache."""
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

        if type(self.vars_files) != list:
            self.vars_files = [self.vars_files]

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
                self._process_vars_file_list(filename, host, inject, generate_filenames, process_files, processed)
            else:
                self._process_single_vars_file(filename, host, inject, generate_filenames, process_files, processed)

        return processed

    def _process_vars_file_list(self, filename_list, host, inject, generate_filenames, process_files, processed):
        """Process a list of vars files, loading the first one found."""
        found = False
        sequence = []
        for real_filename in filename_list:
            filename2, filename3, filename4 = generate_filenames(host, inject, real_filename)
            sequence.append(filename4)
            if os.path.exists(filename4):
                found = True
                if process_files(real_filename, filename2, filename3, filename4, host=host):
                    processed.append(real_filename)
            elif host is not None:
                self.playbook.callbacks.on_not_import_for_host(host, filename4)
            if found:
                break
        
        if not found and host is not None:
            raise errors.AnsibleError(
                "%s: FATAL, no files matched for vars_files import sequence: %s" % (host, sequence)
            )

    def _process_single_vars_file(self, filename, host, inject, generate_filenames, process_files, processed):
        """Process a single vars file."""
        filename2, filename3, filename4 = generate_filenames(host, inject, filename)
        if utils.contains_vars(filename4):
            return
        if process_files(filename, filename2, filename3, filename4, host=host):
            processed.append(filename)