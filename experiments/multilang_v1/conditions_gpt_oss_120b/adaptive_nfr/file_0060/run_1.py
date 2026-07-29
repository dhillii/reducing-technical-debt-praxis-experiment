class RegroupNode(Node):
    """
    Regroups a list of objects by a common attribute and stores the result in
    the context under ``var_name``.
    """
    def __init__(self, target, expression, var_name):
        self.target = target
        self.expression = expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        """
        Resolve the grouping expression for a single object.
        """
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def _set_empty(self, context):
        """
        Populate the context with an empty list when the target resolves to
        ``None``.
        """
        context[self.var_name] = []

    def _group_objects(self, obj_list, context):
        """
        Group ``obj_list`` by the result of ``resolve_expression`` and return a
        list of ``GroupedResult`` instances.
        """
        return [
            GroupedResult(grouper=key, list=list(val))
            for key, val in groupby(
                obj_list,
                lambda obj: self.resolve_expression(obj, context)
            )
        ]

    def _empty_return(self):
        """
        Return value for the tag – always an empty string to keep the original
        rendering behaviour.
        """
        return ''

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            self._set_empty(context)
            return self._empty_return()
        context[self.var_name] = self._group_objects(obj_list, context)
        return self._empty_return()