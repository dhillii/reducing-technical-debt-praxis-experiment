def get_group_by(self, select, order_by):
    """
    Returns a list of 2-tuples of form (sql, params).

    The logic of what exactly the GROUP BY clause contains is hard
    to describe in other words than "if it passes the test suite,
    then it is correct".
    """
    # Some examples:
    #     SomeModel.objects.annotate(Count('somecol'))
    #     GROUP BY: all fields of the model
    #
    #    SomeModel.objects.values('name').annotate(Count('somecol'))
    #    GROUP BY: name
    #
    #    SomeModel.objects.annotate(Count('somecol')).values('name')
    #    GROUP BY: all cols of the model
    #
    #    SomeModel.objects.values('name', 'pk').annotate(Count('somecol')).values('pk')
    #    GROUP BY: name, pk
    #
    #    SomeModel.objects.values('name').annotate(Count('somecol')).values('pk')
    #    GROUP BY: name, pk
    #
    # In fact, the self.query.group_by is the minimal set to GROUP BY. It
    # can't be ever restricted to a smaller set, but additional columns in
    # HAVING, ORDER BY, and SELECT clauses are added to it. Unfortunately
    # the end result is that it is impossible to force the query to have
    # a chosen GROUP BY clause - you can almost do this by using the form:
    #     .values(*wanted_cols).annotate(AnAggregate())
    # but any later annotations, extra selects, values calls that
    # refer some column outside of the wanted_cols, order_by, or even
    # filter calls can alter the GROUP BY clause.

    # The query.group_by is either None (no GROUP BY at all), True
    # (group by select fields), or a list of expressions to be added
    # to the group by.
    if self.query.group_by is None:
        return []
    expressions = []
    if self.query.group_by is not True:
        # If the group by is set to a list (by .values() call most likely),
        # then we need to add everything in it to the GROUP BY clause.
        # Backwards compatibility hack for setting query.group_by. Remove
        # when  we have public API way of forcing the GROUP BY clause.
        # Converts string references to expressions.
        for expr in self.query.group_by:
            if not hasattr(expr, 'as_sql'):
                expressions.append(self.query.resolve_ref(expr))
            else:
                expressions.append(expr)
    # Note that even if the group_by is set, it is only the minimal
    # set to group by. So, we need to add cols in select, order_by, and
    # having into the select in any case.
    for expr, _, _ in select:
        cols = expr.get_group_by_cols()
        for col in cols:
            expressions.append(col)
    for expr, (sql, params, is_ref) in order_by:
        if expr.contains_aggregate:
            continue
        # We can skip References to select clause, as all expressions in
        # the select clause are already part of the group by.
        if is_ref:
            continue
        expressions.extend(expr.get_source_expressions())
    having_group_by = self.having.get_group_by_cols() if self.having else ()
    for expr in having_group_by:
        expressions.append(expr)
    result = []
    seen = set()
    expressions = self.collapse_group_by(expressions, having_group_by)

    def compile_expression(expr):
        sql, params = self.compile(expr)
        return sql, params

    for expr in expressions:
        sql, params = compile_expression(expr)
        if (sql, tuple(params)) not in seen:
            result.append((sql, params))
            seen.add((sql, tuple(params)))
    return result

def collapse_group_by(self, expressions, having):
    # If the DB can group by primary key, then group by the primary key of
    # query's main model. Note that for PostgreSQL the GROUP BY clause must
    # include the primary key of every table, but for MySQL it is enough to
    # have the main table's primary key.
    if self.connection.features.allows_group_by_pk:
        # The logic here is: if the main model's primary key is in the
        # query, then set new_expressions to that field. If that happens,
        # then also add having expressions to group by.
        pk = None
        for expr in expressions:
            # Is this a reference to query's base table primary key? If the
            # expression isn't a Col-like, then skip the expression.
            if (getattr(expr, 'target', None) == self.query.model._meta.pk and
                    getattr(expr, 'alias', None) == self.query.tables[0]):
                pk = expr
                break
        if pk:
            # MySQLism: Columns in HAVING clause must be added to the GROUP BY.
            expressions = [pk] + [expr for expr in expressions if expr in having]
    elif self.connection.features.allows_group_by_selected_pks:
        # Filter out all expressions associated with a table's primary key
        # present in the grouped columns. This is done by identifying all
        # tables that have their primary key included in the grouped
        # columns and removing non-primary key columns referring to them.
        pks = {expr for expr in expressions if hasattr(expr, 'target') and expr.target.primary_key}
        aliases = {expr.alias for expr in pks}
        expressions = [
            expr for expr in expressions if expr in pks or getattr(expr, 'alias', None) not in aliases
        ]
    return expressions