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
    while num_ops:
        # On every iteration, we step through all the apps and see if there
        # is a completed set of operations.
        for app_label in sorted(self.generated_operations.keys()):
            chopped = []
            dependencies = set()
            for operation in list(self.generated_operations[app_label]):
                deps_satisfied = True
                operation_dependencies = set()
                for dep in operation._auto_deps:
                    is_swappable_dep = False
                    if dep[0] == "__setting__":
                        # We need to temporarily resolve the swappable dependency to prevent
                        # circular references. While keeping the dependency checks on the
                        # resolved model we still add the swappable dependencies.
                        # See #23322
                        resolved_app_label, resolved_object_name = getattr(settings, dep[1]).split('.')
                        original_dep = dep
                        dep = (resolved_app_label, resolved_object_name.lower(), dep[2], dep[3])
                        is_swappable_dep = True
                    if dep[0] != app_label and dep[0] != "__setting__":
                        # External app dependency. See if it's not yet
                        # satisfied.
                        for other_operation in self.generated_operations.get(dep[0], []):
                            if self.check_dependency(other_operation, dep):
                                deps_satisfied = False
                                break
                        if not deps_satisfied:
                            break
                        else:
                            if is_swappable_dep:
                                operation_dependencies.add((original_dep[0], original_dep[1]))
                            elif dep[0] in self.migrations:
                                operation_dependencies.add((dep[0], self.migrations[dep[0]][-1].name))
                            else:
                                # If we can't find the other app, we add a first/last dependency,
                                # but only if we've already been through once and checked everything
                                if self.migrations:
                                    # If the app already exists, we add a dependency on the last migration,
                                    # as we don't know which migration contains the target field.
                                    # If it's not yet migrated or has no migrations, we use __first__
                                    if graph and graph.leaf_nodes(dep[0]):
                                        operation_dependencies.add(graph.leaf_nodes(dep[0])[0])
                                    else:
                                        operation_dependencies.add((dep[0], "__first__"))
                                else:
                                    deps_satisfied = False
                    if not deps_satisfied:
                        break
                if deps_satisfied:
                    chopped.append(operation)
                    dependencies.update(operation_dependencies)
                    self.generated_operations[app_label] = self.generated_operations[app_label][1:]
            # Make a migration! Well, only if there's stuff to put in it
            if dependencies or chopped:
                subclass = type(str("Migration"), (Migration,), {"operations": [], "dependencies": []})
                instance = subclass("auto_%i" % (len(self.migrations.get(app_label, [])) + 1), app_label)
                instance.dependencies = list(dependencies)
                instance.operations = chopped
                instance.initial = app_label not in self.existing_apps
                self.migrations.setdefault(app_label, []).append(instance)
        new_num_ops = sum(len(x) for x in self.generated_operations.values())
        if new_num_ops == num_ops:
            raise ValueError("Cannot resolve operation dependencies: %r" % self.generated_operations)
        num_ops = new_num_ops