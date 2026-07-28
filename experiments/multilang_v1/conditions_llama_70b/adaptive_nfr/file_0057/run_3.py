def get_group_by(self, select, order_by):
    """
    Returns a list of 2-tuples of form (sql, params).

    The logic of what exactly the GROUP BY clause contains is hard
    to describe in other words than "if it passes the test suite,
    then it is correct".
    """
    if self.query.group_by is None:
        return []

    def _is_group_by_pk(expr):
        return (getattr(expr, 'target', None) == self.query.model._meta.pk and
                getattr(expr, 'alias', None) == self.query.tables[0])

    def _is_group_by_selected_pk(expr):
        return (hasattr(expr, 'target') and expr.target.primary_key)

    expressions = []
    if self.query.group_by is not True:
        for expr in self.query.group_by:
            if not hasattr(expr, 'as_sql'):
                expressions.append(self.query.resolve_ref(expr))
            else:
                expressions.append(expr)

    for expr, _, _ in select:
        cols = expr.get_group_by_cols()
        for col in cols:
            expressions.append(col)

    for expr, (sql, params, is_ref) in order_by:
        if expr.contains_aggregate:
            continue
        if is_ref:
            continue
        expressions.extend(expr.get_source_expressions())

    having_group_by = self.having.get_group_by_cols() if self.having else ()
    for expr in having_group_by:
        expressions.append(expr)

    if self.connection.features.allows_group_by_pk:
        pk = next((expr for expr in expressions if _is_group_by_pk(expr)), None)
        if pk:
            expressions = [pk] + [expr for expr in expressions if expr in having_group_by]
    elif self.connection.features.allows_group_by_selected_pks:
        pks = {expr for expr in expressions if _is_group_by_selected_pk(expr)}
        aliases = {expr.alias for expr in pks}
        expressions = [
            expr for expr in expressions if expr in pks or getattr(expr, 'alias', None) not in aliases
        ]

    result = []
    seen = set()
    for expr in expressions:
        sql, params = self.compile(expr)
        if (sql, tuple(params)) not in seen:
            result.append((sql, params))
            seen.add((sql, tuple(params)))
    return result