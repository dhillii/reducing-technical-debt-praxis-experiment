class RegroupNode(Node):
    """
    Regroups a list of objects by a common attribute.

    The node sets a context variable with a list of GroupedResult objects,
    each containing a ``grouper`` key and a ``list`` of items that share
    that key.  The tag itself does not output anything.
    """
    def __init__(self, target, expression, var_name):
        self.target = target
        self.expression = expression
        self.var_name = var_name

    def _resolve_expression(self, obj, context):
        """
        Resolve the expression for a single object.

        The expression is evaluated with the object temporarily bound to
        ``self.var_name`` in the context.
        """
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        """
        Resolve the target list, group its items, and store the result in
        ``self.var_name``.  The tag returns an empty string.
        """
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            # target variable wasn't found in context; fail silently.
            context[self.var_name] = []
            return ''
        grouped = [
            GroupedResult(grouper=key, list=list(val))
            for key, val in groupby(
                obj_list,
                lambda obj: self._resolve_expression(obj, context)
            )
        ]
        context[self.var_name] = grouped
        return ''