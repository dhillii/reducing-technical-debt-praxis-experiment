class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        # Temporarily place the object in the context to evaluate the expression.
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        result = ''
        if obj_list is None:
            # Target variable wasn't found in context; fail silently.
            context[self.var_name] = []
            return result
        # Build a list of GroupedResult objects.
        context[self.var_name] = [
            GroupedResult(grouper=key, list=list(val))
            for key, val in groupby(
                obj_list,
                lambda obj: self.resolve_expression(obj, context)
            )
        ]
        return result