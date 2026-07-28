class CreateModel(ModelOperation):
    """
    Create a model's table.
    """

    serialization_expand_args = ['fields', 'options', 'managers']

    def __init__(self, name, fields, options=None, bases=None, managers=None):
        self.fields = fields
        self.options = options or {}
        self.bases = bases or (models.Model,)
        self.managers = managers or []
        super(CreateModel, self).__init__(name)
        # Sanity-check that there are no duplicated field names, bases, or
        # manager names
        _check_for_duplicates('fields', (name for name, _ in self.fields))
        _check_for_duplicates('bases', (
            base._meta.label_lower if hasattr(base, '_meta') else
            base.lower() if isinstance(base, six.string_types) else base
            for base in self.bases
        ))
        _check_for_duplicates('managers', (name for name, _ in self.managers))

    def deconstruct(self):
        kwargs = {
            'name': self.name,
            'fields': self.fields,
        }
        if self.options:
            kwargs['options'] = self.options
        if self.bases and self.bases != (models.Model,):
            kwargs['bases'] = self.bases
        if self.managers and self.managers != [('objects', models.Manager())]:
            kwargs['managers'] = self.managers
        return (
            self.__class__.__name__,
            [],
            kwargs
        )

    def state_forwards(self, app_label, state):
        state.add_model(ModelState(
            app_label,
            self.name,
            list(self.fields),
            dict(self.options),
            tuple(self.bases),
            list(self.managers),
        ))

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.name)
        if self.allow_migrate_model(schema_editor.connection.alias, model):
            schema_editor.create_model(model)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        model = from_state.apps.get_model(app_label, self.name)
        if self.allow_migrate_model(schema_editor.connection.alias, model):
            schema_editor.delete_model(model)

    def describe(self):
        return "Create %smodel %s" % ("proxy " if self.options.get("proxy", False) else "", self.name)

    def references_model(self, name, app_label=None):
        name_lower = name.lower()
        if name_lower == self.name_lower:
            return True

        # Check we didn't inherit from the model
        models_to_check = [
            base for base in self.bases
            if base is not models.Model and isinstance(base, (models.base.ModelBase, six.string_types))
        ]
        # Check we have no FKs/M2Ms with it
        for fname, field in self.fields:
            if field.remote_field:
                models_to_check.append(field.remote_field.model)
        # Now go over all the models and check against them
        for model in models_to_check:
            model_app_label, model_name = self.model_to_key(model)
            if model_name.lower() == name_lower:
                if app_label is None or not model_app_label or model_app_label == app_label:
                    return True
        return False

    def model_to_key(self, model):
        """
        Take either a model class or an "app_label.ModelName" string
        and return (app_label, object_name).
        """
        if isinstance(model, six.string_types):
            return model.split(".", 1)
        else:
            return model._meta.app_label, model._meta.object_name

    def _reduce_delete_model(self, operation, in_between, app_label=None):
        if (isinstance(operation, DeleteModel) and
                self.name_lower == operation.name_lower and
                not self.options.get("proxy", False)):
            return []
        return None

    def _reduce_rename_model(self, operation, in_between, app_label=None):
        if isinstance(operation, RenameModel) and self.name_lower == operation.old_name_lower:
            return [
                CreateModel(
                    operation.new_name,
                    fields=self.fields,
                    options=self.options,
                    bases=self.bases,
                    managers=self.managers,
                ),
            ]
        return None

    def _reduce_alter_model_options(self, operation, in_between, app_label=None):
        if isinstance(operation, AlterModelOptions) and self.name_lower == operation.name_lower:
            new_options = self.options.copy()
            new_options.update(operation.options)
            return [
                CreateModel(
                    self.name,
                    fields=self.fields,
                    options=new_options,
                    bases=self.bases,
                    managers=self.managers,
                ),
            ]
        return None

    def _reduce_field_operation(self, operation, in_between, app_label=None):
        if isinstance(operation, FieldOperation) and self.name_lower == operation.model_name_lower:
            if isinstance(operation, AddField):
                # Don't allow optimizations of FKs through models they reference
                if hasattr(operation.field, "remote_field") and operation.field.remote_field:
                    for between in in_between:
                        # Check that it doesn't point to the model
                        app_label, object_name = self.model_to_key(operation.field.remote_field.model)
                        if between.references_model(object_name, app_label):
                            return False
                        # Check that it's not through the model
                        if getattr(operation.field.remote_field, "through", None):
                            app_label, object_name = self.model_to_key(operation.field.remote_field.through)
                            if between.references_model(object_name, app_label):
                                return False
                return [
                    CreateModel(
                        self.name,
                        fields=self.fields + [(operation.name, operation.field)],
                        options=self.options,
                        bases=self.bases,
                        managers=self.managers,
                    ),
                ]
            elif isinstance(operation, AlterField):
                return [
                    CreateModel(
                        self.name,
                        fields=[
                            (n, operation.field if n == operation.name else v)
                            for n, v in self.fields
                        ],
                        options=self.options,
                        bases=self.bases,
                        managers=self.managers,
                    ),
                ]
            elif isinstance(operation, RemoveField):
                return [
                    CreateModel(
                        self.name,
                        fields=[
                            (n, v)
                            for n, v in self.fields
                            if n.lower() != operation.name_lower
                        ],
                        options=self.options,
                        bases=self.bases,
                        managers=self.managers,
                    ),
                ]
            elif isinstance(operation, RenameField):
                return [
                    CreateModel(
                        self.name,
                        fields=[
                            (operation.new_name if n == operation.old_name else n, v)
                            for n, v in self.fields
                        ],
                        options=self.options,
                        bases=self.bases,
                        managers=self.managers,
                    ),
                ]
        return None

    def reduce(self, operation, in_between, app_label=None):
        reduction = (
            self._reduce_delete_model(operation, in_between, app_label) or
            self._reduce_rename_model(operation, in_between, app_label) or
            self._reduce_alter_model_options(operation, in_between, app_label) or
            self._reduce_field_operation(operation, in_between, app_label)
        )
        if reduction is not None:
            return reduction
        return super(CreateModel, self).reduce(operation, in_between, app_label=app_label)