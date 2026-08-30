# (c) 2012-2014, Michael DeHaan <michael.dehaan@gmail.com>
#
# This file is part of Ansible
#
# Ansible is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
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

    def __init__(self, playbook, ds, basedir, vault_password=None):
        ''' constructor loads from a play datastructure '''
        self._validate_datastructure_keys(ds)
        
        self.playbook = playbook
        self.basedir = basedir
        self.vault_password = vault_password
        self._initialize_common_attributes(ds)
        
        load_vars = self._prepare_load_vars()
        
        self._process_vars_files_initial(ds, load_vars)
        self._load_roles_and_update_vars(ds)
        self._template_play_datastructure(ds, load_vars)
        
        self._initialize_host_settings(ds)
        self._initialize_become_settings(ds)
        
        self._initialize_tasks_and_handlers(ds, load_vars)

    def _validate_datastructure_keys(self, ds):
        """Validate that all keys in the datastructure are valid."""
        for key in ds.keys():
            if key not in Play.VALID_KEYS:
                raise errors.AnsibleError("%s is not a legal parameter of an Ansible Play" % key)

    def _initialize_common_attributes(self, ds):
        """Initialize common play attributes from datastructure."""
        self.vars = ds.get('vars', {})
        self.vars_prompt = ds.get('vars_prompt', {})
        self.roles = ds.get('roles', None)
        self.tags = self._canonicalize_tags(ds.get('tags', None))
        self.environment = ds.get('environment', {})
        self.vars_files = ds.get('vars_files', [])
        
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')

    def _canonicalize_tags(self, tags):
        """Convert tags to canonical list format."""
        if tags is None:
            return []
        elif isinstance(tags, (str, unicode)):
            return tags.split(",")
        elif isinstance(tags, list):
            return tags
        else:
            return []

    def _prepare_load_vars(self):
        """Prepare load_vars dictionary for templating."""
        load_vars = dict()
        load_vars['playbook_dir'] = os.path.abspath(self.basedir)
        if self.playbook.inventory.basedir() is not None:
            load_vars['inventory_dir'] = self.playbook.inventory.basedir()
        if self.playbook.inventory.src() is not None:
            load_vars['inventory_file'] = self.playbook.inventory.src()
        return load_vars

    def _process_vars_files_initial(self, ds, load_vars):
        """Process initial vars_files before role loading."""
        processed_vars_files = self._update_vars_files_for_host(None)
        self.included_roles = []
        self.vars = self._get_vars()
        self.vars_file_vars = dict()
        self.role_vars = dict()
        
        # Update roles in ds
        ds = self._load_roles(self.roles, ds)
        
        # Re-process remaining vars files
        self.vars_files = utils.list_difference(ds.get('vars_files', []), processed_vars_files)
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')

        self._update_vars_files_for_host(None)

    def _template_play_datastructure(self, ds, load_vars):
        """Template the play datastructure."""
        # Store tasks and handlers before templating to avoid premature templating
        _tasks = ds.pop('tasks', [])
        _handlers = ds.pop('handlers', [])
        
        temp_vars = utils.combine_vars(self.vars, self.vars_file_vars)
        temp_vars = utils.combine_vars(temp_vars, self.playbook.extra_vars)
        
        try:
            ds = template(self.basedir, ds, temp_vars)
        except errors.AnsibleError, e:
            utils.warning("non fatal error while trying to template play variables: %s" % str(e))
        
        ds['tasks'] = _tasks
        ds['handlers'] = _handlers
        self._ds = ds

    def _initialize_host_settings(self, ds):
        """Initialize host-related settings from datastructure."""
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

    def _initialize_become_settings(self, ds):
        """Initialize become-related settings and validate conflicts."""
        self._validate_privilege_escalation_conflicts(ds)

        # Use playbook defaults where not specified in play
        self.become = ds.get('become', self.playbook.become)
        self.become_method = ds.get('become_method', self.playbook.become_method)
        self.become_user = ds.get('become_user', self.playbook.become_user)

        # Override with play-level settings when specified
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

        # Handle gather_facts specially since None is meaningful
        self.gather_facts = ds.get('gather_facts', None)
        if self.gather_facts is not None:
            self.gather_facts = utils.boolean(self.gather_facts)

    def _validate_privilege_escalation_conflicts(self, ds):
        """Validate there are no conflicting privilege escalation settings."""
        if (ds.get('become') or ds.get('become_user')) and (ds.get('sudo') or ds.get('sudo_user')):
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("sudo", "sudo_user") cannot be used together')
        if (ds.get('become') or ds.get('become_user')) and (ds.get('su') or ds.get('su_user')):
            raise errors.AnsibleError('sudo params ("become", "become_user") and su params ("su", "su_user") cannot be used together')
        if (ds.get('sudo') or ds.get('sudo_user')) and (ds.get('su') or ds.get('su_user')):
            raise errors.AnsibleError('sudo params ("sudo", "sudo_user") and su params ("su", "su_user") cannot be used together')

    def _initialize_tasks_and_handlers(self, ds, load_vars):
        """Initialize tasks and handlers for the play."""
        load_vars['role_names'] = ds.get('role_names', [])
        
        self._tasks = self._load_tasks(ds.get('tasks', []), load_vars)
        self._handlers = self._load_tasks(ds.get('handlers', []), load_vars)
        self._late_merge_role_tags()
        self._play_hosts = None

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

        role_path = self._find_role_path(role_name)

        if role_path is None:
            raise errors.AnsibleError("cannot find role in %s" % " or ".join(
                [utils.path_dwim(self.basedir, os.path.join('roles', role_name)),
                 utils.path_dwim(self.basedir, role_name)]))

        return (role_path, role_vars)

    def _find_role_path(self, role_name):
        """Find the directory path for a role."""
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
                return path_option

        return None

    def _build_role_dependencies(self, roles, dep_stack, passed_vars={}, level=0):
        """Build role dependency stack recursively."""
        if level > 20:
            raise errors.AnsibleError("too many levels of recursion while resolving role dependencies")
        
        for role in roles:
            role_path, role_vars = self._get_role_path(role)
            
            # Store role params excluding special keywords
            role_params = role_vars.copy()
            for item in ('role', 'tags', 'when'):
                if item in role_params:
                    del role_params[item]

            role_vars = utils.combine_vars(passed_vars, role_vars)
            self._load_role_vars_and_defaults(role_path, role_vars)
            
            # Handle role dependencies
            self._process_role_dependencies(
                role_path, role_vars, passed_vars, dep_stack, level, role
            )

        # Only add at top level
        if level == 0:
            self.included_roles.append(role)
            dep_stack.append([role, role_path, role_vars, role_params, 
                            self._get_role_defaults(role_path)])

        return dep_stack

    def _load_role_vars_and_defaults(self, role_path, role_vars):
        """Load role vars and defaults."""
        vars_path = self._get_role_main_file(role_path, 'vars')
        if os.path.isfile(vars_path):
            vars_data = utils.parse_yaml_from_file(vars_path, vault_password=self.vault_password)
            if vars_data and isinstance(vars_data, dict):
                role_vars = utils.combine_vars(vars_data, role_vars)

        defaults_path = self._get_role_main_file(role_path, 'defaults')
        if os.path.isfile(defaults_path):
            defaults_data = utils.parse_yaml_from_file(defaults_path, vault_password=self.vault_password)
            if defaults_data and isinstance(defaults_data, dict):
                role_vars = utils.combine_vars(defaults_data, role_vars)

    def _get_role_main_file(self, role_path, directory):
        """Get the main file in a role directory."""
        base_path = utils.path_dwim(self.basedir, os.path.join(role_path, directory))
        return self._resolve_main(base_path)

    def _process_role_dependencies(self, role_path, role_vars, passed_vars, dep_stack, level, role):
        """Process role dependencies recursively."""
        meta_path = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(role_path, 'meta')))
        if os.path.isfile(meta_path):
            data = utils.parse_yaml_from_file(meta_path, vault_password=self.vault_password)
            if data:
                dependencies = data.get('dependencies', [])
                if dependencies is None:
                    dependencies = []
                
                for dep in dependencies:
                    self._process_single_dependency(
                        dep, role_vars, passed_vars, dep_stack, level
                    )

    def _process_single_dependency(self, dep, role_vars, passed_vars, dep_stack, level):
        """Process a single role dependency."""
        dep_path, dep_vars = self._get_role_path(dep)
        dep_params = dep_vars.copy()
        
        # Remove special keys from dep_params
        for item in ('role', 'tags', 'when'):
            if item in dep_params:
                del dep_params[item]

        meta_path = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(dep_path, 'meta')))
        allow_dupes = False
        if os.path.isfile(meta_path):
            meta_data = utils.parse_yaml_from_file(meta_path, vault_password=self.vault_password)
            if meta_data:
                allow_dupes = utils.boolean(meta_data.get('allow_duplicates', ''))
        
        # Merge tags
        dep_vars['tags'] = self._merge_role_tags(dep_vars, role_vars, passed_vars)
        
        # Merge conditionals
        dep_vars['when'] = self._merge_conditional_vars(passed_vars, role_vars, dep_vars)
        
        dep_vars = utils.combine_vars(passed_vars, dep_vars)
        dep_vars = utils.combine_vars(role_vars, dep_vars)
        
        # Load dependency vars and defaults
        dep_vars = self._load_dep_vars(dep_path, dep_vars)
        dep_defaults = self._load_role_defaults_from_path(dep_path)
        
        # Handle duplicate inclusion
        if not allow_dupes and dep in self.included_roles:
            return
            
        if not allow_dupes:
            self.included_roles.append(dep)
        
        # Recursive call for nested dependencies
        self._build_role_dependencies([dep], dep_stack, passed_vars=dep_vars, level=level+1)
        dep_stack.append([dep, dep_path, dep_vars, dep_params, dep_defaults])

    def _merge_role_tags(self, dep_vars, role_vars, passed_vars):
        """Merge tag values from multiple role contexts."""
        old_tags = dep_vars.get('tags', [])
        old_tags = [old_tags] if isinstance(old_tags, basestring) else old_tags
        
        # Process role tags
        new_tags = []
        if isinstance(role_vars, dict):
            role_tags = role_vars.get('tags', [])
            new_tags.extend([role_tags] if isinstance(role_tags, basestring) else role_tags)
        
        # Process passed vars tags
        if isinstance(passed_vars, dict):
            passed_tags = passed_vars.get('tags', [])
            new_tags.extend([passed_tags] if isinstance(passed_tags, basestring) else passed_tags)
        
        # Update tag for specific roles in stack
        if isinstance(passed_vars, dict) and 'tags' in passed_vars:
            for included_role_dep in dep_stack:
                included_dep_name = included_role_dep[0]
                included_dep_vars = included_role_dep[2]
                if included_dep_name == dep and 'tags' in included_dep_vars:
                    included_dep_vars['tags'] = list(set(
                        included_dep_vars['tags']).union(set(passed_vars['tags']))
                    )

        # Combine all tags
        all_tags = old_tags + new_tags
        return list(set(all_tags))

    def _merge_conditional_vars(self, passed_vars, role_vars, dep_vars):
        """Merge conditionals from multiple role contexts."""
        conditionals = []
        
        for var_obj in (passed_vars, role_vars, dep_vars):
            if isinstance(var_obj, dict):
                conditionals.extend(self._extract_conditionals(var_obj.get('when')))
        
        return conditionals if conditionals else None

    def _extract_conditionals(self, value):
        """Extract conditionals from a variable object."""
        if isinstance(value, (basestring, bool)):
            return [value]
        elif isinstance(value, list):
            return value
        return []

    def _load_dep_vars(self, dep_path, dep_vars):
        """Load variables for a dependency."""
        vars_path = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(dep_path, 'vars')))
        if os.path.isfile(vars_path):
            vars_data = utils.parse_yaml_from_file(vars_path, vault_password=self.vault_password)
            if vars_data and isinstance(vars_data, dict):
                dep_vars = utils.combine_vars(dep_vars, vars_data)
        return dep_vars

    def _load_role_defaults_from_path(self, dep_path):
        """Load defaults for a role from its path."""
        defaults_path = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(dep_path, 'defaults')))
        if os.path.isfile(defaults_path):
            defaults_data = utils.parse_yaml_from_file(defaults_path, vault_password=self.vault_password)
            return defaults_data if isinstance(defaults_data, dict) else {}
        return {}

    def _get_role_defaults(self, role_path):
        """Get defaults for a role."""
        defaults_path = self._resolve_main(utils.path_dwim(self.basedir, os.path.join(role_path, 'defaults')))
        if os.path.isfile(defaults_path):
            defaults_data = utils.parse_yaml_from_file(defaults_path, vault_password=self.vault_password)
            return defaults_data if isinstance(defaults_data, dict) else {}
        return {}

    def _load_roles(self, roles, ds):
        """Load roles and their associated files into the play."""
        if roles is None:
            roles = []
        if not isinstance(roles, list):
            raise errors.AnsibleError("value of 'roles:' must be a list")

        new_tasks = []
        new_handlers = []
        role_vars_files = []
        defaults_files = []

        # Process pre_tasks
        pre_tasks = ds.get('pre_tasks', None)
        if not isinstance(pre_tasks, list):
            pre_tasks = []
        new_tasks.extend(pre_tasks)

        # Flush handlers after pre_tasks
        new_tasks.append(dict(meta='flush_handlers'))

        # Build role dependency stack
        roles = self._build_role_dependencies(roles, [], {})

        # Add UUID and role_path to each role
        for idx, val in enumerate(roles):
            this_uuid = str(uuid.uuid4())
            roles[idx][-3]['role_uuid'] = this_uuid
            roles[idx][-3]['role_path'] = roles[idx][1]

        role_names = []
        
        # Process each role in the dependency stack
        for (role, role_path, role_vars, role_params, default_vars) in roles:
            new_tasks, new_handlers, role_vars_files, defaults_files, role_names = \
                self._process_single_role(
                    role, role_path, role_vars, role_params, 
                    default_vars, new_tasks, new_handlers, 
                    role_vars_files, defaults_files, role_names
                )

        # Process remaining tasks from ds
        self._append_standard_tasks(ds, new_tasks, new_handlers)

        ds['role_names'] = role_names
        
        # Set final role and default vars
        self.role_vars = self._load_role_vars_files(role_vars_files)
        self.default_vars = self._load_role_defaults(defaults_files)

        return ds

    def _process_single_role(self, role, role_path, role_vars, role_params, 
                            default_vars, new_tasks, new_handlers, 
                            role_vars_files, defaults_files, role_names):
        """Process a single role and return updated lists."""
        # Extract special keys for tasks
        special_keys = [ "sudo", "sudo_user", "when", "with_items", "su", "su_user", 
                        "become", "become_user" ]
        special_vars = self._extract_special_vars(role_vars, special_keys)

        basepaths = self._get_role_base_paths(role_path)
        main_files = self._get_role_main_paths(basepaths)

        self._handle_missing_role_files(role_path, main_files, basepaths)

        role_name = self._determine_role_name(role)
        role_names.append(role_name)

        # Add role tasks if present
        if os.path.isfile(main_files['task']):
            new_tasks.append(self._create_role_task(
                main_files['task'], role_vars, role_params, 
                default_vars, role_name, special_vars, special_keys
            ))

        # Add role handlers if present
        if os.path.isfile(main_files['handler']):
            new_handlers.append(self._create_role_handler(
                main_files['handler'], role_vars, role_params, 
                role_name, special_vars, special_keys
            ))

        # Track vars and defaults files
        if os.path.isfile(main_files['vars']):
            role_vars_files.append(main_files['vars'])
        if os.path.isfile(main_files['defaults']):
            defaults_files.append(main_files['defaults'])

        # Add library path if present
        if os.path.isdir(basepaths['library']):
            utils.plugins.module_finder.add_directory(basepaths['library'])

        return new_tasks, new_handlers, role_vars_files, defaults_files, role_names

    def _extract_special_vars(self, role_vars, special_keys):
        """Extract special variables from role variables."""
        return {k: role_vars[k] for k in special_keys if k in role_vars}

    def _get_role_base_paths(self, role_path):
        """Get base paths for role components."""
        return {
            'tasks': utils.path_dwim(self.basedir, os.path.join(role_path, 'tasks')),
            'handlers': utils.path_dwim(self.basedir, os.path.join(role_path, 'handlers')),
            'vars': utils.path_dwim(self.basedir, os.path.join(role_path, 'vars')),
            'meta': utils.path_dwim(self.basedir, os.path.join(role_path, 'meta')),
            'defaults': utils.path_dwim(self.basedir, os.path.join(role_path, 'defaults')),
            'library': utils.path_dwim(self.basedir, os.path.join(role_path, 'library')),
        }

    def _get_role_main_paths(self, basepaths):
        """Get main playbook file paths for role components."""
        return {
            'task': self._resolve_main(basepaths['tasks']),
            'handler': self._resolve_main(basepaths['handlers']),
            'vars': self._resolve_main(basepaths['vars']),
            'meta': self._resolve_main(basepaths['meta']),
            'defaults': self._resolve_main(basepaths['defaults']),
        }

    def _handle_missing_role_files(self, role_path, main_files, basepaths):
        """Check if role files exist and raise error if not."""
        missing_files = []
        for key, path in main_files.items():
            if not os.path.isfile(path):
                missing_files.append(path)
        
        if (not os.path.isfile(main_files['task']) and 
            not os.path.isfile(main_files['handler']) and 
            not os.path.isfile(main_files['vars']) and 
            not os.path.isfile(main_files['defaults']) and 
            not os.path.isfile(main_files['meta']) and 
            not os.path.isdir(basepaths['library'])):
            raise errors.AnsibleError(
                "found role at %s, but cannot find %s or %s or %s or %s or %s or %s" % 
                (role_path, main_files['task'], main_files['handler'], 
                 main_files['vars'], main_files['defaults'], main_files['meta'], 
                 basepaths['library']))
        
        return missing_files

    def _determine_role_name(self, role):
        """Determine the name of the role."""
        if isinstance(role, dict):
            return role['role']
        else:
            return utils.role_spec_parse(role)["name"]

    def _create_role_task(self, task_path, role_vars, role_params, 
                         default_vars, role_name, special_vars, special_keys):
        """Create a role task entry."""
        task = dict(include=pipes.quote(task_path), vars=role_vars, 
                   role_params=role_params, default_vars=default_vars, 
                   role_name=role_name)
        task.update({k: special_vars[k] for k in special_keys if k in special_vars})
        return task

    def _create_role_handler(self, handler_path, role_vars, role_params, 
                            role_name, special_vars, special_keys):
        """Create a role handler entry."""
        handler = dict(include=pipes.quote(handler_path), vars=role_vars, 
                      role_params=role_params, role_name=role_name)
        handler.update({k: special_vars[k] for k in special_keys if k in special_vars})
        return handler

    def _append_standard_tasks(self, ds, new_tasks, new_handlers):
        """Append standard tasks and handlers from the play."""
        tasks = ds.get('tasks', [])
        post_tasks = ds.get('post_tasks', None)
        handlers = ds.get('handlers', None)
        
        if not isinstance(tasks, list):
            tasks = []
        if not isinstance(post_tasks, list):
            post_tasks = []
        if not isinstance(handlers, list):
            handlers = []

        new_tasks.extend(tasks)
        
        # Flush handlers after tasks and role tasks
        new_tasks.append(dict(meta='flush_handlers'))
        new_tasks.extend(post_tasks)
        new_tasks.append(dict(meta='flush_handlers'))

        new_handlers.extend(handlers)
        ds['tasks'] = new_tasks
        ds['handlers'] = new_handlers

    def _resolve_main(self, basepath):
        ''' flexibly handle variations in main filenames '''
        mains = (
            os.path.join(basepath, 'main'),
            os.path.join(basepath, 'main.yml'),
            os.path.join(basepath, 'main.yaml'),
            os.path.join(basepath, 'main.json'),
        )
        
        # Check for multiple main files and error
        count = sum([os.path.isfile(x) for x in mains])
        if count > 1:
            raise errors.AnsibleError("found multiple main files at %s, only one allowed" % (basepath))
        
        # Return first existing main file, or default
        for m in mains:
            if os.path.isfile(m):
                return m
                
        return mains[0]

    def _load_tasks(self, tasks, vars=None, role_params=None, default_vars=None, 
                   become_vars=None, additional_conditions=None, original_file=None, 
                   role_name=None):
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

        for x in tasks:
            # Handle task type validation
            if not isinstance(x, dict):
                raise errors.AnsibleError("expecting dict; got: %s, error in %s" % (x, original_file))

            # Process task
            task = self._process_task_item(
                x, vars, original_file, become_vars, additional_conditions, 
                role_params, default_vars, role_name
            )
            if task is not None:
                results.append(task)

        # Apply play-level tags to all tasks
        for x in results:
            if self.tags is not None:
                x.tags.extend(self.tags)

        return results

    def _process_task_item(self, x, vars, original_file, become_vars, 
                          additional_conditions, role_params, default_vars, role_name):
        """Process a single task item."""
        included_additional_conditions = list(additional_conditions)

        # Handle special keys for privilege escalation
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

        # Handle meta tasks
        if 'meta' in x:
            if x['meta'] == 'flush_handlers':
                if role_name and 'role_name' not in x:
                    x['role_name'] = role_name
                return Task(self, x, module_vars=task_vars, role_name=role_name, no_tags=False)
            return None

        # Handle include tasks
        if 'include' in x:
            return self._process_include_task(
                x, task_vars, included_additional_conditions,
                additional_conditions, original_file, role_name
            )

        # Regular task
        return Task(
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

    def _process_include_task(self, x, task_vars, included_additional_conditions,
                             additional_conditions, original_file, role_name):
        """Process an include task."""
        tokens = split_args(to_bytes(x['include'], nonstring='simplerepr'))
        include_vars = {}
        
        # Handle deprecated features
        for k in x:
            if k.startswith("with_"):
                offender = " (in %s)" % original_file if original_file else ""
                utils.deprecated("include + with_items is a removed deprecated feature" + offender, 
                                "1.5", removed=True)
            elif k.startswith("when_"):
                utils.deprecated("\"when_<criteria>:\" is a removed deprecated feature, "
                                "use the simplified 'when:' conditional directly", 
                                None, removed=True)
            elif k == 'when':
                if isinstance(x[k], (basestring, bool)):
                    included_additional_conditions.append(x[k])
                elif isinstance(x[k], list):
                    included_additional_conditions.extend(x[k])
            elif k in ("include", "vars", "role_params", "default_vars", 
                      "sudo", "sudo_user", "role_name", "no_log", 
                      "become", "become_user", "su", "su_user"):
                continue
            else:
                include_vars[k] = x[k]

        # Process include vars
        role_params = x.get('role_params', {})
        default_vars = x.get('default_vars', {})
        if not default_vars:
            default_vars = self.default_vars
        else:
            default_vars = utils.combine_vars(self.default_vars, default_vars)

        task_vars = utils.combine_vars(task_vars, include_vars)
        if 'vars' in x:
            task_vars = utils.combine_vars(task_vars, x['vars'])

        # Template include file path
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

        # Process included file
        data = utils.parse_yaml_from_file(include_filename, vault_password=self.vault_password)
        if 'role_name' in x and data is not None:
            for y in data:
                if isinstance(y, dict) and 'include' in y:
                    y['role_name'] = x['role_name']
        
        # Recursively load tasks
        loaded = self._load_tasks(
            data, mv, role_params, default_vars, included_become_vars, 
            list(included_additional_conditions), original_file=include_filename, 
            role_name=x.get('role_name')
        )
        return loaded

    def _get_vars(self):
        ''' load the vars section from a play, accounting for all sorts of variable features
        including loading from yaml files, prompting, and conditional includes of the first
        file found in a list. '''

        if self.vars is None:
            self.vars = {}

        if not isinstance(self.vars, (dict, list)):
            raise errors.AnsibleError("'vars' section must contain only key/value pairs")

        vars = {}
        
        # Handle list of vars
        if isinstance(self.vars, list):
            vars = self._convert_vars_list_to_dict(self.vars)
        else:
            vars.update(self.vars)

        # Handle vars_prompt
        vars = self._process_vars_prompt(vars)
        
        # Add extra vars
        if isinstance(self.playbook.extra_vars, dict):
            vars = utils.combine_vars(vars, self.playbook.extra_vars)

        return vars

    def _convert_vars_list_to_dict(self, vars_list):
        """Convert a list of vars to a dict."""
        result = {}
        for item in vars_list:
            if not hasattr(item, 'items'):
                raise errors.AnsibleError("expecting a key-value pair in 'vars' section")
            k, v = item.items()[0]
            result[k] = v
        return result

    def _process_vars_prompt(self, vars):
        """Process vars_prompt section."""
        if isinstance(self.vars_prompt, list):
            vars = self._process_vars_prompt_list(vars)
        elif isinstance(self.vars_prompt, dict):
            vars = self._process_vars_prompt_dict(vars)
        else:
            raise errors.AnsibleError("'vars_prompt' section is malformed, see docs")
        return vars

    def _process_vars_prompt_list(self, vars):
        """Process vars_prompt when defined as a list."""
        for var in self.vars_prompt:
            if 'name' not in var:
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
        return vars

    def _process_vars_prompt_dict(self, vars):
        """Process vars_prompt when defined as a dict."""
        for (vname, prompt) in self.vars_prompt.iteritems():
            prompt_msg = "%s: " % prompt
            if vname not in self.playbook.extra_vars:
                vars[vname] = self.playbook.callbacks.on_vars_prompt(
                    varname=vname, private=True, prompt=prompt_msg, default=None
                )
        return vars

    def update_vars_files(self, hosts, vault_password=None):
        ''' calculate vars_files, which requires that setup runs first so ansible facts can be mixed in '''
        for h in hosts:
            self._update_vars_files_for_host(h, vault_password=vault_password)

    def compare_tags(self, tags):
        ''' given a list of tags that the user has specified, return two lists:
        matched_tags:   tags were found within the current play and match those given
                        by the user
        unmatched_tags: tags that were found within the current play but do not match
                        any provided by the user '''

        # Gather all tags from tasks and handlers
        all_tags = []
        for task in self._tasks:
            if not task.meta:
                all_tags.extend(task.tags)
        for handler in self._handlers:
            all_tags.extend(handler.tags)

        # Create sets for comparison
        all_tags_set = set(all_tags)
        tags_set = set(tags)

        matched_tags = all_tags_set.intersection(tags_set)
        unmatched_tags = all_tags_set.difference(tags_set)

        # Handle special tag cases
        always_tag = set(['always'])
        untagged_tag = set(['untagged'])
        
        if 'always' in all_tags_set:
            matched_tags = matched_tags.union(always_tag)
            unmatched_tags = all_tags_set.difference(always_tag)

        if 'all' in tags_set:
            matched_tags = matched_tags.union(all_tags_set)
            unmatched_tags = set()

        if 'tagged' in tags_set:
            matched_tags = all_tags_set.difference(untagged_tag)
            unmatched_tags = untagged_tag

        if 'untagged' in tags_set and 'untagged' in all_tags_set:
            matched_tags = matched_tags.union(untagged_tag)
            unmatched_tags = unmatched_tags.difference(untagged_tag)

        return matched_tags, unmatched_tags

    def _late_merge_role_tags(self):
        """Merge role tags late in the process after all role tasks are loaded."""
        role_tags = {}
        
        # Collect tags from each role in the original datastructure
        for task in self._ds['tasks']:
            if 'role_name' in task:
                this_role = task['role_name'] + "-" + task['vars']['role_uuid']
                if this_role not in role_tags:
                    role_tags[this_role] = []
                
                # Process tags from task vars
                if 'tags' in task['vars']:
                    tags = task['vars']['tags']
                    if isinstance(tags, basestring):
                        role_tags[this_role] += shlex.split(tags)
                    else:
                        role_tags[this_role] += tags

        # Apply collected tags to tasks
        for idx, task in enumerate(self._tasks):
            if getattr(task, 'role_name', None) is not None:
                this_role = task.role_name + "-" + task.module_vars['role_uuid']
                if this_role in role_tags:
                    self._tasks[idx].tags = sorted(set(self._tasks[idx].tags + role_tags[this_role]))

    def _load_role_vars_files(self, vars_files):
        """Load vars from role vars files."""
        role_vars = {}
        for filename in vars_files:
            if os.path.exists(filename):
                new_vars = utils.parse_yaml_from_file(filename, vault_password=self.vault_password)
                if new_vars:
                    if not isinstance(new_vars, dict):
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % 
                                                (filename, type(new_vars)))
                    role_vars = utils.combine_vars(role_vars, new_vars)
        return role_vars

    def _load_role_defaults(self, defaults_files):
        """Load default vars from role defaults files."""
        default_vars = {}
        for filename in defaults_files:
            if os.path.exists(filename):
                new_vars = utils.parse_yaml_from_file(filename, vault_password=self.vault_password)
                if new_vars:
                    if not isinstance(new_vars, dict):
                        raise errors.AnsibleError("%s must be stored as dictionary/hash: %s" % 
                                                (filename, type(new_vars)))
                    default_vars = utils.combine_vars(default_vars, new_vars)
        return default_vars

    def _update_vars_files_for_host(self, host, vault_password=None):
        """Update vars files for a specific host."""
        processed = []

        # Build inject dictionary for host-specific variables
        inject = self._build_host_inject_dict(host)
        
        # Process each vars file
        for filename in self.vars_files:
            if isinstance(filename, list):
                processed.extend(self._process_vars_file_sequence(
                    filename, host, inject, processed))
            else:
                processed.extend(self._process_single_vars_file(
                    filename, host, inject))

        return processed

    def _build_host_inject_dict(self, host):
        """Build inject dictionary for host variables."""
        if host is not None:
            inject = {}
            inject.update(self.playbook.inventory.get_variables(
                host, vault_password=vault_password))
            inject.update(self.playbook.SETUP_CACHE.get(host, {}))
            inject.update(self.playbook.VARS_CACHE.get(host, {}))
            return inject
        return None

    def _process_vars_file_sequence(self, filename_sequence, host, inject, processed):
        """Process a sequence of vars files, loading the first one found."""
        found = False
        
        for real_filename in filename_sequence:
            filenames = self._generate_filenames(host, inject, real_filename)
            filename4 = filenames[-1]  # Final path with DWIM applied
            
            if os.path.exists(filename4):
                found = True
                if self._process_single_vars_file(real_filename, host, inject, 
                                                  filenames=filenames):
                    processed.append(real_filename)
                break
            elif host is not None:
                self.playbook.callbacks.on_not_import_for_host(host, filename4)

        if not found and host is not None:
            sequence = [self._generate_filenames(host, inject, f)[-1] 
                       for f in filename_sequence]
            raise errors.AnsibleError(
                "%s: FATAL, no files matched for vars_files import sequence: %s" % 
                (host, sequence))
        
        return processed

    def _generate_filenames(self, host, inject, filename):
        """Generate different versions of a filename."""
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

    def _process_single_vars_file(self, filename, host, inject, filenames=None):
        """Process a single vars file."""
        if filenames is None:
            filenames = self._generate_filenames(host, inject, filename)
        filename2, filename3, filename4 = filenames
        
        data = utils.parse_yaml_from_file(filename4, vault_password=self.vault_password)
        if data and isinstance(data, dict):
            if host is not None:
                target_filename = self._determine_target_filename(
                    filename2, filename3, filename4)
                self.playbook.VARS_CACHE[host] = utils.combine_vars(
                    self.playbook.VARS_CACHE.get(host, {}), data)
                if target_filename:
                    self.playbook.callbacks.on_import_for_host(
                        host, target_filename)
            else:
                self.vars_file_vars = utils.combine_vars(
                    self.vars_file_vars, data)
            return True
        return False

    def _determine_target_filename(self, filename2, filename3, filename4):
        """Determine which filename variation to use for import tracking."""
        if utils.contains_vars(filename2):
            if not utils.contains_vars(filename3):
                return filename3
            else:
                return filename4
        return None

    def tasks(self):
        ''' return task objects for this play '''
        return self._tasks

    def handlers(self):
        ''' return handler objects for this play '''
        return self._handlers

    def _load_roles_and_update_vars(self, ds):
        """Load roles and update vars files."""
        processed_vars_files = self._update_vars_files_for_host(None)
        self.included_roles = []
        
        # Load and process roles
        ds = self._load_roles(self.roles, ds)
        
        # Re-process remaining vars files
        self.vars_files = utils.list_difference(
            ds.get('vars_files', []), processed_vars_files)
        if not isinstance(self.vars_files, list):
            raise errors.AnsibleError('vars_files must be a list')

        self._update_vars_files_for_host(None)