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
                    subclass = type(str("Migration"), (Migration,), {"operations": [], "dependencies": []})
                    instance = subclass("auto_%i" % (len(self.migrations.get(app_label, [])) + 1), app_label)
                    instance.dependencies = list(dependencies)
                    instance.operations = chopped
                    instance.initial = app_label not in self.existing_apps
                    self.migrations.setdefault(app_label, []).append(instance)
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
    deps_satisfied = True
    for dep in operation._auto_deps:
        if dep[0] != app_label and dep[0] != "__setting__":
            # External app dependency. See if it's not yet
            # satisfied.
            for other_operation in self.generated_operations.get(dep[0], []):
                if self.check_dependency(other_operation, dep):
                    deps_satisfied = False
                    break
            if not deps_satisfied:
                break
    return deps_satisfied


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


def generate_renamed_models(self):
    """
    Finds any renamed models, and generates the operations for them,
    and removes the old entry from the model lists.
    Must be run before other model-level generation.
    """
    self.renamed_models = {}
    self.renamed_models_rel = {}
    added_models = set(self.new_model_keys) - set(self.old_model_keys)
    for app_label, model_name in sorted(added_models):
        model_state = self.to_state.models[app_label, model_name]
        model_fields_def = self.only_relation_agnostic_fields(model_state.fields)

        removed_models = set(self.old_model_keys) - set(self.new_model_keys)
        for rem_app_label, rem_model_name in removed_models:
            if rem_app_label == app_label:
                rem_model_state = self.from_state.models[rem_app_label, rem_model_name]
                rem_model_fields_def = self.only_relation_agnostic_fields(rem_model_state.fields)
                if model_fields_def == rem_model_fields_def:
                    if self.questioner.ask_rename_model(rem_model_state, model_state):
                        self.add_operation(
                            app_label,
                            operations.RenameModel(
                                old_name=rem_model_state.name,
                                new_name=model_state.name,
                            )
                        )
                        self.renamed_models[app_label, model_name] = rem_model_name
                        renamed_models_rel_key = '%s.%s' % (rem_model_state.app_label, rem_model_state.name)
                        self.renamed_models_rel[renamed_models_rel_key] = '%s.%s' % (
                            model_state.app_label,
                            model_state.name,
                        )
                        self.old_model_keys.remove((rem_app_label, rem_model_name))
                        self.old_model_keys.append((app_label, model_name))
                        break


def generate_created_models(self):
    """
    Find all new models (both managed and unmanaged) and make create
    operations for them as well as separate operations to create any
    foreign key or M2M relationships (we'll optimize these back in later
    if we can).

    We also defer any model options that refer to collections of fields
    that might be deferred (e.g. unique_together, index_together).
    """
    old_keys = set(self.old_model_keys).union(self.old_unmanaged_keys)
    added_models = set(self.new_model_keys) - old_keys
    added_unmanaged_models = set(self.new_unmanaged_keys) - old_keys
    all_added_models = chain(
        sorted(added_models, key=self.swappable_first_key, reverse=True),
        sorted(added_unmanaged_models, key=self.swappable_first_key, reverse=True)
    )
    for app_label, model_name in all_added_models:
        model_state = self.to_state.models[app_label, model_name]
        model_opts = self.new_apps.get_model(app_label, model_name)._meta
        # Gather related fields
        related_fields = {}
        primary_key_rel = None
        for field in model_opts.local_fields:
            if field.remote_field:
                if field.remote_field.model:
                    if field.primary_key:
                        primary_key_rel = field.remote_field.model
                    elif not field.remote_field.parent_link:
                        related_fields[field.name] = field
                # through will be none on M2Ms on swapped-out models;
                # we can treat lack of through as auto_created=True, though.
                if (getattr(field.remote_field, "through", None) and
                        not field.remote_field.through._meta.auto_created):
                    related_fields[field.name] = field
        for field in model_opts.local_many_to_many:
            if field.remote_field.model:
                related_fields[field.name] = field
            if getattr(field.remote_field, "through", None) and not field.remote_field.through._meta.auto_created:
                related_fields[field.name] = field
        # Are there indexes/unique|index_together to defer?
        indexes = model_state.options.pop('indexes')
        unique_together = model_state.options.pop('unique_together', None)
        index_together = model_state.options.pop('index_together', None)
        order_with_respect_to = model_state.options.pop('order_with_respect_to', None)
        # Depend on the deletion of any possible proxy version of us
        dependencies = [
            (app_label, model_name, None, False),
        ]
        # Depend on all bases
        for base in model_state.bases:
            if isinstance(base, six.string_types) and "." in base:
                base_app_label, base_name = base.split(".", 1)
                dependencies.append((base_app_label, base_name, None, True))
        # Depend on the other end of the primary key if it's a relation
        if primary_key_rel:
            dependencies.append((
                primary_key_rel._meta.app_label,
                primary_key_rel._meta.object_name,
                None,
                True
            ))
        # Generate creation operation
        self.add_operation(
            app_label,
            operations.CreateModel(
                name=model_state.name,
                fields=[d for d in model_state.fields if d[0] not in related_fields],
                options=model_state.options,
                bases=model_state.bases,
                managers=model_state.managers,
            ),
            dependencies=dependencies,
            beginning=True,
        )

        # Don't add operations which modify the database for unmanaged models
        if not model_opts.managed:
            return

        # Generate operations for each related field
        for name, field in sorted(related_fields.items()):
            dependencies = self._get_dependencies_for_foreign_key(field)
            # Depend on our own model being created
            dependencies.append((app_label, model_name, None, True))
            # Make operation
            self.add_operation(
                app_label,
                operations.AddField(
                    model_name=model_name,
                    name=name,
                    field=field,
                ),
                dependencies=list(set(dependencies)),
            )
        # Generate other opns
        related_dependencies = [
            (app_label, model_name, name, True)
            for name, field in sorted(related_fields.items())
        ]
        related_dependencies.append((app_label, model_name, None, True))
        for index in indexes:
            self.add_operation(
                app_label,
                operations.AddIndex(
                    model_name=model_name,
                    index=index,
                ),
                dependencies=related_dependencies,
            )
        if unique_together:
            self.add_operation(
                app_label,
                operations.AlterUniqueTogether(
                    name=model_name,
                    unique_together=unique_together,
                ),
                dependencies=related_dependencies
            )
        if index_together:
            self.add_operation(
                app_label,
                operations.AlterIndexTogether(
                    name=model_name,
                    index_together=index_together,
                ),
                dependencies=related_dependencies
            )
        if order_with_respect_to:
            self.add_operation(
                app_label,
                operations.AlterOrderWithRespectTo(
                    name=model_name,
                    order_with_respect_to=order_with_respect_to,
                ),
                dependencies=[
                    (app_label, model_name, order_with_respect_to, True),
                    (app_label, model_name, None, True),
                ]
            )

        # Fix relationships if the model changed from a proxy model to a
        # concrete model.
        if (app_label, model_name) in self.old_proxy_keys:
            for related_object in model_opts.related_objects:
                self.add_operation(
                    related_object.related_model._meta.app_label,
                    operations.AlterField(
                        model_name=related_object.related_model._meta.object_name,
                        name=related_object.field.name,
                        field=related_object.field,
                    ),
                    dependencies=[(app_label, model_name, None, True)],
                )