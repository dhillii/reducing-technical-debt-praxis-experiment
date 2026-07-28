class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target = target
        self.expression = expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            context[self.var_name] = []
            return ''
        context[self.var_name] = [
            GroupedResult(grouper=key, list=list(val))
            for key, val in
            groupby(obj_list, lambda obj: self.resolve_expression(obj, context))
        ]
        return ''

def is_empty(obj_list):
    """Check if the object list is empty."""
    return obj_list is None or len(obj_list) == 0

def get_grouped_result(obj_list, resolve_expression):
    """Get the grouped result."""
    return [
        GroupedResult(grouper=key, list=list(val))
        for key, val in
        groupby(obj_list, resolve_expression)
    ]

class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target = target
        self.expression = expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if is_empty(obj_list):
            context[self.var_name] = []
            return ''
        context[self.var_name] = get_grouped_result(obj_list, lambda obj: self.resolve_expression(obj, context))
        return ''