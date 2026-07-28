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
            expressions = self._get_group_by_expressions_from_query()
        expressions = self._add_select_expressions_to_group_by(expressions, select)
        expressions = self._add_order_by_expressions_to_group_by(expressions, order_by)
        expressions = self._add_having_expressions_to_group_by(expressions)
        return self._collapse_group_by_expressions(expressions)

    def _get_group_by_expressions_from_query(self):
        """Returns a list of expressions to be included in the GROUP BY clause from the query."""
        expressions = []
        for expr in self.query.group_by:
            if not hasattr(expr, 'as_sql'):
                expressions.append(self.query.resolve_ref(expr))
            else:
                expressions.append(expr)
        return expressions

    def _add_select_expressions_to_group_by(self, expressions, select):
        """Adds select expressions to the GROUP BY clause."""
        for expr, _, _ in select:
            cols = expr.get_group_by_cols()
            for col in cols:
                expressions.append(col)
        return expressions

    def _add_order_by_expressions_to_group_by(self, expressions, order_by):
        """Adds order by expressions to the GROUP BY clause."""
        for expr, (sql, params, is_ref) in order_by:
            if expr.contains_aggregate:
                continue
            if is_ref:
                continue
            expressions.extend(expr.get_source_expressions())
        return expressions

    def _add_having_expressions_to_group_by(self, expressions):
        """Adds having expressions to the GROUP BY clause."""
        having_group_by = self.having.get_group_by_cols() if self.having else ()
        for expr in having_group_by:
            expressions.append(expr)
        return expressions

    def _collapse_group_by_expressions(self, expressions):
        """Collapses the GROUP BY expressions based on the database features."""
        if self.connection.features.allows_group_by_pk:
            return self._collapse_group_by_expressions_using_pk(expressions)
        elif self.connection.features.allows_group_by_selected_pks:
            return self._collapse_group_by_expressions_using_selected_pks(expressions)
        return expressions

    def _collapse_group_by_expressions_using_pk(self, expressions):
        """Collapses the GROUP BY expressions using the primary key."""
        pk = None
        for expr in expressions:
            if (getattr(expr, 'target', None) == self.query.model._meta.pk and
                    getattr(expr, 'alias', None) == self.query.tables[0]):
                pk = expr
                break
        if pk:
            expressions = [pk] + [expr for expr in expressions if expr in self.having.get_group_by_cols()]
        return expressions

    def _collapse_group_by_expressions_using_selected_pks(self, expressions):
        """Collapses the GROUP BY expressions using the selected primary keys."""
        pks = {expr for expr in expressions if hasattr(expr, 'target') and expr.target.primary_key}
        aliases = {expr.alias for expr in pks}
        expressions = [
            expr for expr in expressions if expr in pks or getattr(expr, 'alias', None) not in aliases
        ]
        return expressions

    def _compile_group_by_expressions(self, expressions):
        """Compiles the GROUP BY expressions into a list of 2-tuples of form (sql, params)."""
        result = []
        seen = set()
        for expr in expressions:
            sql, params = self.compile(expr)
            if (sql, tuple(params)) not in seen:
                result.append((sql, params))
                seen.add((sql, tuple(params)))
        return result

    # ...