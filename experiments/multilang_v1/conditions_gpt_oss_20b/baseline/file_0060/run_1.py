class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        # Evaluate the expression on the given object without permanently
        # modifying the original context.
        try:
            temp_context = context.new_child({self.var_name: obj})
        except AttributeError:
            # Fallback for older Django versions that don't support new_child.
            context.push(**{self.var_name: obj})
            temp_context = context
        value = self.expression.resolve(temp_context, True)
        if not hasattr(context, 'push'):
            # If we used push, pop the temporary variable.
            context.pop()
        return value

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