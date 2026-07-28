class SQLCompiler(object):
    # ...

    def get_group_by(self, select, order_by):
        """Returns a list of 2-tuples of form (sql, params)."""
        group_by_expressions = self._get_group_by_expressions(select, order_by)
        return self._compile_group_by_expressions(group_by_expressions)

    def _get_group_by_expressions(self, select, order_by):
        """Returns a list of expressions to be included in the GROUP BY clause."""
        expressions = []
        if self.query.group_by is not True:
            expressions.extend(self._get_group_by_from_query())
        expressions.extend(self._get_group_by_from_select(select))
        expressions.extend(self._get_group_by_from_order_by(order_by))
        expressions.extend(self._get_group_by_from_having())
        return expressions

    def _get_group_by_from_query(self):
        """Returns a list of expressions from the query's group_by attribute."""
        if self.query.group_by is None:
            return []
        return [self.query.resolve_ref(expr) if not hasattr(expr, 'as_sql') else expr
                for expr in self.query.group_by]

    def _get_group_by_from_select(self, select):
        """Returns a list of expressions from the select clause."""
        return [expr.get_group_by_cols() for expr, _, _ in select]

    def _get_group_by_from_order_by(self, order_by):
        """Returns a list of expressions from the order_by clause."""
        expressions = []
        for expr, (sql, params, is_ref) in order_by:
            if expr.contains_aggregate:
                continue
            if is_ref:
                continue
            expressions.extend(expr.get_source_expressions())
        return expressions

    def _get_group_by_from_having(self):
        """Returns a list of expressions from the having clause."""
        if self.having:
            return self.having.get_group_by_cols()
        return []

    def _compile_group_by_expressions(self, expressions):
        """Compiles a list of expressions into a list of 2-tuples of form (sql, params)."""
        result = []
        seen = set()
        expressions = self.collapse_group_by(expressions, self._get_group_by_from_having())
        for expr in expressions:
            sql, params = self.compile(expr)
            if (sql, tuple(params)) not in seen:
                result.append((sql, params))
                seen.add((sql, tuple(params)))
        return result

    # ...