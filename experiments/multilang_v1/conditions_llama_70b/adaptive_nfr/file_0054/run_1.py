def _detect_changes(self, convert_apps=None, graph=None):
    """
    Returns a dict of migration plans which will achieve the
    change from from_state to to_state. The dict has app labels
    as keys and a list of migrations as values.

    The resulting migrations aren't specially named, but the names
    do matter for dependencies inside the set.

    convert_apps is the list of apps to convert to use migrations
    (i.e. to make initial migrations for, in the usual case)

    graph is an optional argument that, if provided, can help improve
    dependency generation and avoid potential circular dependencies.
    """
    if not self.from_state or not self.to_state:
        return {}

    self.generated_operations = {}
    self.altered_indexes = {}

    self.old_apps = self.from_state.concrete_apps
    self.new_apps = self.to_state.apps
    self.old_model_keys = []
    self.old_proxy_keys = []
    self.old_unmanaged_keys = []
    self.new_model_keys = []
    self.new_proxy_keys = []
    self.new_unmanaged_keys = []

    self._prepare_model_keys()

    self.generate_renamed_models()

    self._prepare_field_lists()
    self._generate_through_model_map()

    self.generate_deleted_models()
    self.generate_created_models()
    self.generate_deleted_proxies()
    self.generate_created_proxies()
    self.generate_altered_options()
    self.generate_altered_managers()

    self.create_altered_indexes()
    self.generate_removed_indexes()
    self.generate_renamed_fields()
    self.generate_removed_fields()
    self.generate_added_fields()
    self.generate_altered_fields()
    self.generate_altered_unique_together()
    self.generate_altered_index_together()
    self.generate_added_indexes()
    self.generate_altered_db_table()
    self.generate_altered_order_with_respect_to()

    self._sort_migrations()
    self._build_migration_list(graph)
    self._optimize_migrations()

    return self.migrations


def _prepare_model_keys(self):
    for al, mn in sorted(self.from_state.models.keys()):
        model = self.old_apps.get_model(al, mn)
        if not model._meta.managed:
            self.old_unmanaged_keys.append((al, mn))
        elif al not in self.from_state.real_apps:
            if model._meta.proxy:
                self.old_proxy_keys.append((al, mn))
            else:
                self.old_model_keys.append((al, mn))

    for al, mn in sorted(self.to_state.models.keys()):
        model = self.new_apps.get_model(al, mn)
        if not model._meta.managed:
            self.new_unmanaged_keys.append((al, mn))
        elif (
            al not in self.from_state.real_apps or
            (convert_apps and al in convert_apps)
        ):
            if model._meta.proxy:
                self.new_proxy_keys.append((al, mn))
            else:
                self.new_model_keys.append((al, mn))


def _build_migration_list(self, graph=None):
    self.migrations = {}
    num_ops = sum(len(x) for x in self.generated_operations.values())
    while num_ops:
        for app_label in sorted(self.generated_operations.keys()):
            self._build_migration_for_app(app_label, graph)
        new_num_ops = sum(len(x) for x in self.generated_operations.values())
        if new_num_ops == num_ops:
            raise ValueError("Cannot resolve operation dependencies: %r" % self.generated_operations)
        num_ops = new_num_ops


def _build_migration_for_app(self, app_label, graph=None):
    chopped = []
    dependencies = set()
    for operation in list(self.generated_operations[app_label]):
        if self._is_operation_ready(operation, app_label, graph):
            chopped.append(operation)
            dependencies.update(operation._auto_deps)
            self.generated_operations[app_label] = self.generated_operations[app_label][1:]
        else:
            break
    if dependencies or chopped:
        self._create_migration(app_label, chopped, dependencies)


def _is_operation_ready(self, operation, app_label, graph=None):
    for dep in operation._auto_deps:
        if not self._is_dependency_satisfied(dep, app_label, graph):
            return False
    return True


def _is_dependency_satisfied(self, dep, app_label, graph=None):
    if dep[0] == "__setting__":
        resolved_app_label, resolved_object_name = getattr(settings, dep[1]).split('.')
        original_dep = dep
        dep = (resolved_app_label, resolved_object_name.lower(), dep[2], dep[3])
    if dep[0] != app_label and dep[0] != "__setting__":
        for other_operation in self.generated_operations.get(dep[0], []):
            if self.check_dependency(other_operation, dep):
                return False
    return True


def _create_migration(self, app_label, operations, dependencies):
    subclass = type(str("Migration"), (Migration,), {"operations": [], "dependencies": []})
    instance = subclass("auto_%i" % (len(self.migrations.get(app_label, [])) + 1), app_label)
    instance.dependencies = list(dependencies)
    instance.operations = operations
    instance.initial = app_label not in self.existing_apps
    self.migrations.setdefault(app_label, []).append(instance)