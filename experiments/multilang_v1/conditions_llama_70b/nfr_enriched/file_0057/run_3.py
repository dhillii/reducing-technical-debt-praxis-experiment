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
            expressions = self._get_group_by_from_query()
        expressions = self._add_select_expressions(expressions, select)
        expressions = self._add_order_by_expressions(expressions, order_by)
        expressions = self._add_having_expressions(expressions)
        return expressions

    def _get_group_by_from_query(self):
        """Returns a list of expressions from the query's group_by attribute."""
        expressions = []
        for expr in self.query.group_by:
            if not hasattr(expr, 'as_sql'):
                expressions.append(self.query.resolve_ref(expr))
            else:
                expressions.append(expr)
        return expressions

    def _add_select_expressions(self, expressions, select):
        """Adds expressions from the select clause to the list of expressions."""
        for expr, _, _ in select:
            cols = expr.get_group_by_cols()
            for col in cols:
                expressions.append(col)
        return expressions

    def _add_order_by_expressions(self, expressions, order_by):
        """Adds expressions from the order_by clause to the list of expressions."""
        for expr, (sql, params, is_ref) in order_by:
            if expr.contains_aggregate:
                continue
            if is_ref:
                continue
            expressions.extend(expr.get_source_expressions())
        return expressions

    def _add_having_expressions(self, expressions):
        """Adds expressions from the having clause to the list of expressions."""
        having_group_by = self.having.get_group_by_cols() if self.having else ()
        for expr in having_group_by:
            expressions.append(expr)
        return expressions

    def _compile_group_by_expressions(self, expressions):
        """Compiles the list of expressions into a list of 2-tuples of form (sql, params)."""
        result = []
        seen = set()
        expressions = self.collapse_group_by(expressions, self.having.get_group_by_cols() if self.having else ())
        for expr in expressions:
            sql, params = self.compile(expr)
            if (sql, tuple(params)) not in seen:
                result.append((sql, params))
                seen.add((sql, tuple(params)))
        return result

    # ...