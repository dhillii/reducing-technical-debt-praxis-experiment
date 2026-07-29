class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def _group_objects(self, obj_list, context):
        """
        Group *obj_list* by the value of *self.expression* evaluated in *context*.
        Returns a list of ``GroupedResult`` instances.
        """
        return [
            GroupedResult(grouper=key, list=list(val))
            for key, val in groupby(
                obj_list,
                lambda obj: self._resolve_expression(obj, context)
            )
        ]

    def _resolve_expression(self, obj, context):
        """
        Resolve the grouping expression for a single *obj*.
        The object is temporarily placed in the context under ``self.var_name``.
        """
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            # Target variable wasn't found; initialise an empty list.
            context[self.var_name] = []
        else:
            context[self.var_name] = self._group_objects(obj_list, context)
        # The {% regroup %} tag does not output anything directly.
        return ''