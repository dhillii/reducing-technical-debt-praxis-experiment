def get_group_by(self, select, order_by):
        """
        Returns a list of 2-tuples of form (sql, params).

        The logic of what exactly the GROUP BY clause contains is hard
        to describe in other words than "if it passes the test suite,
        then it is correct".
        """
        if self.query.group_by is None:
            return []

        expressions = self._build_group_by_expressions()
        expressions.extend(self._add_select_expressions(select))
        expressions.extend(self._add_order_by_expressions(order_by))
        expressions.extend(self._add_having_expressions())

        having_group_by = self.having.get_group_by_cols() if self.having else ()
        expressions = self.collapse_group_by(expressions, having_group_by)

        return self._dedupe_expressions(expressions)

    def _build_group_by_expressions(self):
        """
        Build the initial list of expressions from self.query.group_by.
        """
        expressions = []
        if self.query.group_by is not True:
            for expr in self.query.group_by:
                if not hasattr(expr, 'as_sql'):
                    expressions.append(self.query.resolve_ref(expr))
                else:
                    expressions.append(expr)
        return expressions

    def _add_select_expressions(self, select):
        """
        Add expressions from the SELECT clause to the GROUP BY list.
        """
        exprs = []
        for expr, _, _ in select:
            cols = expr.get_group_by_cols()
            exprs.extend(cols)
        return exprs

    def _add_order_by_expressions(self, order_by):
        """
        Add expressions from the ORDER BY clause to the GROUP BY list.
        """
        exprs = []
        for expr, (sql, params, is_ref) in order_by:
            if expr.contains_aggregate:
                continue
            if is_ref:
                continue
            exprs.extend(expr.get_source_expressions())
        return exprs

    def _add_having_expressions(self):
        """
        Add expressions from the HAVING clause to the GROUP BY list.
        """
        exprs = []
        if self.having:
            having_group_by = self.having.get_group_by_cols()
            exprs.extend(having_group_by)
        return exprs

    def _dedupe_expressions(self, expressions):
        """
        Compile expressions and remove duplicates.
        """
        result = []
        seen = set()
        for expr in expressions:
            sql, params = self.compile(expr)
            key = (sql, tuple(params))
            if key not in seen:
                result.append((sql, params))
                seen.add(key)
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