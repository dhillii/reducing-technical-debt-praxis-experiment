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

    # The first phase is generating all the operations for each app
    # and gathering them into a big per-app list.
    # We'll then go through that list later and order it and split
    # into migrations to resolve dependencies caused by M2Ms and FKs.
    self.generated_operations = {}
    self.altered_indexes = {}

    # Prepare some old/new state and model lists, separating
    # proxy models and ignoring unmigrated apps.
    self.old_apps = self.from_state.concrete_apps
    self.new_apps = self.to_state.apps
    self.old_model_keys = []
    self.old_proxy_keys = []
    self.old_unmanaged_keys = []
    self.new_model_keys = []
    self.new_proxy_keys = []
    self.new_unmanaged_keys = []
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

    # Renames have to come first
    self.generate_renamed_models()

    # Prepare lists of fields and generate through model map
    self._prepare_field_lists()
    self._generate_through_model_map()

    # Generate non-rename model operations
    self.generate_deleted_models()
    self.generate_created_models()
    self.generate_deleted_proxies()
    self.generate_created_proxies()
    self.generate_altered_options()
    self.generate_altered_managers()

    # Create the altered indexes and store them in self.altered_indexes.
    # This avoids the same computation in generate_removed_indexes()
    # and generate_added_indexes().
    self.create_altered_indexes()
    # Generate index removal operations before field is removed
    self.generate_removed_indexes()
    # Generate field operations
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


def _build_migration_list(self, graph=None):
    """
    We need to chop the lists of operations up into migrations with
    dependencies on each other. We do this by stepping up an app's list of
    operations until we find one that has an outgoing dependency that isn't
    in another app's migration yet (hasn't been chopped off its list). We
    then chop off the operations before it into a migration and move onto
    the next app. If we loop back around without doing anything, there's a
    circular dependency (which _should_ be impossible as the operations are
    all split at this point so they can't depend and be depended on).
    """
    self.migrations = {}
    num_ops = sum(len(x) for x in self.generated_operations.values())
    chop_mode = False
    while num_ops:
        # On every iteration, we step through all the apps and see if there
        # is a completed set of operations.
        # If we find that a subset of the operations are complete we can
        # try to chop it off from the rest and continue, but we only
        # do this if we've already been through the list once before
        # without any chopping and nothing has changed.
        for app_label in sorted(self.generated_operations.keys()):
            if not self.generated_operations[app_label]:
                continue
            chopped = []
            dependencies = set()
            for operation in list(self.generated_operations[app_label]):
                if self._is_operation_ready(operation, app_label):
                    chopped.append(operation)
                    dependencies.update(operation._auto_deps)
                    self.generated_operations[app_label] = self.generated_operations[app_label][1:]
                else:
                    break
            # Make a migration! Well, only if there's stuff to put in it
            if dependencies or chopped:
                if not self.generated_operations[app_label] or chop_mode:
                    self._create_migration(app_label, chopped, dependencies)
                    chop_mode = False
                else:
                    self.generated_operations[app_label] = chopped + self.generated_operations[app_label]
        new_num_ops = sum(len(x) for x in self.generated_operations.values())
        if new_num_ops == num_ops:
            if not chop_mode:
                chop_mode = True
            else:
                raise ValueError("Cannot resolve operation dependencies: %r" % self.generated_operations)
        num_ops = new_num_ops


def _is_operation_ready(self, operation, app_label):
    """
    Checks if an operation is ready to be added to a migration.
    """
    for dep in operation._auto_deps:
        if dep[0] != app_label and dep[0] != "__setting__":
            # External app dependency. See if it's not yet
            # satisfied.
            for other_operation in self.generated_operations.get(dep[0], []):
                if self.check_dependency(other_operation, dep):
                    return False
    return True


def _create_migration(self, app_label, operations, dependencies):
    """
    Creates a new migration with the given operations and dependencies.
    """
    subclass = type(str("Migration"), (Migration,), {"operations": [], "dependencies": []})
    instance = subclass("auto_%i" % (len(self.migrations.get(app_label, [])) + 1), app_label)
    instance.dependencies = list(dependencies)
    instance.operations = operations
    instance.initial = app_label not in self.existing_apps
    self.migrations.setdefault(app_label, []).append(instance)


def _sort_migrations(self):
    """
    Reorder to make things possible. The order we have already isn't bad,
    but we need to pull a few things around so FKs work nicely inside the
    same app
    """
    for app_label, ops in sorted(self.generated_operations.items()):
        # construct a dependency graph for intra-app dependencies
        dependency_graph = {op: set() for op in ops}
        for op in ops:
            for dep in op._auto_deps:
                if dep[0] == app_label:
                    for op2 in ops:
                        if self.check_dependency(op2, dep):
                            dependency_graph[op].add(op2)

        # we use a stable sort for deterministic tests & general behavior
        self.generated_operations[app_label] = stable_topological_sort(ops, dependency_graph)


def _optimize_migrations(self):
    # Add in internal dependencies among the migrations
    for app_label, migrations in self.migrations.items():
        for m1, m2 in zip(migrations, migrations[1:]):
            m2.dependencies.append((app_label, m1.name))

    # De-dupe dependencies
    for app_label, migrations in self.migrations.items():
        for migration in migrations:
            migration.dependencies = list(set(migration.dependencies))

    # Optimize migrations
    for app_label, migrations in self.migrations.items():
        for migration in migrations:
            migration.operations = MigrationOptimizer().optimize(migration.operations, app_label=app_label)


def _get_dependencies_for_foreign_key(self, field):
    """
    Returns a list of dependencies for a foreign key field.
    """
    dependencies = []
    if field.remote_field and field.remote_field.model:
        dependencies.append((
            field.remote_field.model._meta.app_label,
            field.remote_field.model._meta.object_name,
            None,
            True,
        ))
    if getattr(field.remote_field, "through", None) and not field.remote_field.through._meta.auto_created:
        dependencies.append((
            field.remote_field.through._meta.app_label,
            field.remote_field.through._meta.object_name,
            None,
            True,
        ))
    return dependencies


def _generate_added_field(self, app_label, model_name, field_name):
    """
    Generates an operation to add a field to a model.
    """
    field = self.new_apps.get_model(app_label, model_name)._meta.get_field(field_name)
    dependencies = self._get_dependencies_for_foreign_key(field)
    self.add_operation(
        app_label,
        operations.AddField(
            model_name=model_name,
            name=field_name,
            field=field,
        ),
        dependencies=dependencies,
    )