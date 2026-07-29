class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        """
        Resolve the grouping key for a single object without mutating the
        original context. A temporary context is created to hold the
        temporary variable name, ensuring that each call can produce a
        distinct value based on the current object.
        """
        # Push a temporary context with the variable set to the current object.
        context.push(**{self.var_name: obj})
        try:
            return self.expression.resolve(context, True)
        finally:
            context.pop()

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            # target variable wasn't found in context; fail silently.
            context[self.var_name] = []
            return ''
        # List of dictionaries in the format:
        # {'grouper': 'key', 'list': [list of contents]}.
        context[self.var_name] = [
            GroupedResult(grouper=key, list=list(val))
            for key, val in
            groupby(obj_list, lambda obj: self.resolve_expression(obj, context))
        ]
        return ''