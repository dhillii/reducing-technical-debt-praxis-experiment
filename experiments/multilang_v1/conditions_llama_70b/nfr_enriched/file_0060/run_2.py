class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def _resolve_expression(self, obj, context):
        """Resolve the expression for a given object in the target list."""
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def _group_objects(self, obj_list, context):
        """Group objects in the target list by the resolved expression."""
        return [
            GroupedResult(grouper=key, list=list(val))
            for key, val in groupby(obj_list, lambda obj: self._resolve_expression(obj, context))
        ]

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            # target variable wasn't found in context; fail silently.
            context[self.var_name] = []
            return ''
        context[self.var_name] = self._group_objects(obj_list, context)
        return ''