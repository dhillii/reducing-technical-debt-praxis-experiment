class CreateModel(ModelOperation):
    # ...

    def reduce(self, operation, in_between, app_label=None):
        if isinstance(operation, DeleteModel) and self.name_lower == operation.name_lower and not self.options.get("proxy", False):
            return []
        elif isinstance(operation, RenameModel) and self.name_lower == operation.old_name_lower:
            return self._rename_model(operation)
        elif isinstance(operation, AlterModelOptions) and self.name_lower == operation.name_lower:
            return self._alter_model_options(operation)
        elif isinstance(operation, FieldOperation) and self.name_lower == operation.model_name_lower:
            return self._field_operation(operation, in_between)
        return super(CreateModel, self).reduce(operation, in_between, app_label=app_label)

    def _rename_model(self, operation):
        return [
            CreateModel(
                operation.new_name,
                fields=self.fields,
                options=self.options,
                bases=self.bases,
                managers=self.managers,
            ),
        ]

    def _alter_model_options(self, operation):
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

    def _field_operation(self, operation, in_between):
        if isinstance(operation, AddField):
            return self._add_field(operation, in_between)
        elif isinstance(operation, AlterField):
            return self._alter_field(operation)
        elif isinstance(operation, RemoveField):
            return self._remove_field(operation)
        elif isinstance(operation, RenameField):
            return self._rename_field(operation)
        return False

    def _add_field(self, operation, in_between):
        if hasattr(operation.field, "remote_field") and operation.field.remote_field:
            for between in in_between:
                app_label, object_name = self.model_to_key(operation.field.remote_field.model)
                if between.references_model(object_name, app_label):
                    return False
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

    def _alter_field(self, operation):
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

    def _remove_field(self, operation):
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

    def _rename_field(self, operation):
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