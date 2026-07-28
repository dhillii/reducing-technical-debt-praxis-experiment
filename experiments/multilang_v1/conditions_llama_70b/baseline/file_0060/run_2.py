class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            context[self.var_name] = []
            return ''
        grouped_list = [
            GroupedResult(grouper=key, list=list(val))
            for key, val in
            groupby(obj_list, lambda obj: self.resolve_expression(obj, context))
        ]
        if not grouped_list:
            return ''
        context[self.var_name] = grouped_list
        return ''