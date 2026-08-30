import re
from itertools import chain

from django.core.exceptions import EmptyResultSet, FieldError
from django.db.models.constants import LOOKUP_SEP
from django.db.models.expressions import OrderBy, Random, RawSQL, Ref
from django.db.models.query_utils import QueryWrapper, select_related_descend
from django.db.models.sql.constants import (
    CURSOR, GET_ITERATOR_CHUNK_SIZE, MULTI, NO_RESULTS, ORDER_DIR, SINGLE,
)
from django.db.models.sql.query import Query, get_order_dir
from django.db.transaction import TransactionManagementError
from django.db.utils import DatabaseError
from django.utils.six.moves import zip

FORCE = object()


class SQLCompiler(object):
    def __init__(self, query, connection, using):
        self.query = query
        self.connection = connection
        self.using = using
        self.quote_cache = {'*': '*'}
        # The select, klass_info, and annotations are needed by QuerySet.iterator()
        # these are set as a side-effect of executing the query. Note that we calculate
        # separately a list of extra select columns needed for grammatical correctness
        # of the query, but these columns are not included in self.select.
        self.select = None
        self.annotation_col_map = None
        self.klass_info = None
        self.ordering_parts = re.compile(r'(.*)\s(ASC|DESC)(.*)')

    def setup_query(self):
        if all(self.query.alias_refcount[a] == 0 for a in self.query.tables):
            self.query.get_initial_alias()
        self.select, self.klass_info, self.annotation_col_map = self.get_select()
        self.col_count = len(self.select)

    def pre_sql_setup(self):
        """
        Does any necessary class setup immediately prior to producing SQL. This
        is for things that can't necessarily be done in __init__ because we
        might not have all the pieces in place at that time.
        """
        self.setup_query()
        order_by = self.get_order_by()
        self.where, self.having = self.query.where.split_having()
        extra_select = self.get_extra_select(order_by, self.select)
        group_by = self.get_group_by(self.select + extra_select, order_by)
        return extra_select, order_by, group_by

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
        expressions = self._get_base_group_by_expressions()
        expressions = self._add_select_grouping(expressions, select)
        expressions = self._add_order_by_grouping(expressions, order_by)
        having_group_by = self.having.get_group_by_cols() if self.having else ()
        expressions.extend(having_group_by)
        result = []
        seen = set()
        expressions = self.collapse_group_by(expressions, having_group_by)

        for expr in expressions:
            sql, params = self.compile(expr)
            if (sql, tuple(params)) not in seen:
                result.append((sql, params))
                seen.add((sql, tuple(params)))
        return result

    def _get_base_group_by_expressions(self):
        """Extract base expressions for group_by from query."""
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
        return expressions

    def _add_select_grouping(self, expressions, select):
        """Add columns from select to the group by expressions."""
        for expr, _, _ in select:
            cols = expr.get_group_by_cols()
            expressions.extend(cols)
        return expressions

    def _add_order_by_grouping(self, expressions, order_by):
        """Add columns from order_by to the group by expressions."""
        for expr, (sql, params, is_ref) in order_by:
            if expr.contains_aggregate:
                continue
            # We can skip References to select clause, as all expressions in
            # the select clause are already part of the group by.
            if is_ref:
                continue
            expressions.extend(expr.get_source_expressions())
        return expressions

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

    def get_select(self):
        """
        Returns three values:
        - a list of 3-tuples of (expression, (sql, params), alias)
        - a klass_info structure,
        - a dictionary of annotations

        The (sql, params) is what the expression will produce, and alias is the
        "AS alias" for the column (possibly None).

        The klass_info structure contains the following information:
        - Which model to instantiate
        - Which columns for that model are present in the query (by
          position of the select clause).
        - related_klass_infos: [f, klass_info] to descent into

        The annotations is a dictionary of {'attname': column position} values.
        """
        select = []
        klass_info = None
        annotations = {}
        select_idx = 0
        for alias, (sql, params) in self.query.extra_select.items():
            annotations[alias] = select_idx
            select.append((RawSQL(sql, params), alias))
            select_idx += 1
        assert not (self.query.select and self.query.default_cols)
        if self.query.default_cols:
            select_list = []
            for c in self.get_default_columns():
                select_list.append(select_idx)
                select.append((c, None))
                select_idx += 1
            klass_info = {
                'model': self.query.model,
                'select_fields': select_list,
            }
        # self.query.select is a special case. These columns never go to
        # any model.
        for col in self.query.select:
            select.append((col, None))
            select_idx += 1
        for alias, annotation in self.query.annotation_select.items():
            annotations[alias] = select_idx
            select.append((annotation, alias))
            select_idx += 1

        if self.query.select_related:
            related_klass_infos = self.get_related_selections(select)
            klass_info['related_klass_infos'] = related_klass_infos

            def get_select_from_parent(klass_info):
                for ki in klass_info['related_klass_infos']:
                    if ki['from_parent']:
                        ki['select_fields'] = (klass_info['select_fields'] +
                                               ki['select_fields'])
                    get_select_from_parent(ki)
            get_select_from_parent(klass_info)

        ret = []
        for col, alias in select:
            try:
                sql, params = self.compile(col, select_format=True)
            except EmptyResultSet:
                # Select a predicate that's always False.
                sql, params = '0', ()
            ret.append((col, (sql, params), alias))
        return ret, klass_info, annotations

    def get_order_by(self):
        """
        Returns a list of 2-tuples of form (expr, (sql, params, is_ref)) for the
        ORDER BY clause.

        The order_by clause can alter the select clause (for example it
        can add aliases to clauses that do not yet have one, or it can
        add totally new select clauses).
        """
        if self.query.extra_order_by:
            ordering = self.query.extra_order_by
        elif not self.query.default_ordering:
            ordering = self.query.order_by
        else:
            ordering = (self.query.order_by or self.query.get_meta().ordering or [])
        if self.query.standard_ordering:
            asc, desc = ORDER_DIR['ASC']
        else:
            asc, desc = ORDER_DIR['DESC']

        order_by = []
        for field in ordering:
            if hasattr(field, 'resolve_expression'):
                if not isinstance(field, OrderBy):
                    field = field.asc()
                if not self.query.standard_ordering:
                    field.reverse_ordering()
                order_by.append((field, False))
                continue
            if field == '?':  # random
                order_by.append((OrderBy(Random()), False))
                continue

            col, order = get_order_dir(field, asc)
            descending = True if order == 'DESC' else False

            if col in self.query.annotation_select:
                # Reference to expression in SELECT clause
                order_by.append((
                    OrderBy(Ref(col, self.query.annotation_select[col]), descending=descending),
                    True))
                continue
            if col in self.query.annotations:
                # References to an expression which is masked out of the SELECT clause
                order_by.append((
                    OrderBy(self.query.annotations[col], descending=descending),
                    False))
                continue

            if '.' in field:
                # This came in through an extra(order_by=...) addition. Pass it
                # on verbatim.
                table, col = col.split('.', 1)
                order_by.append((
                    OrderBy(
                        RawSQL('%s.%s' % (self.quote_name_unless_alias(table), col), []),
                        descending=descending
                    ), False))
                continue

            if not self.query._extra or col not in self.query._extra:
                # 'col' is of the form 'field' or 'field1__field2' or
                # '-field1__field2__field', etc.
                order_by.extend(self.find_ordering_name(
                    field, self.query.get_meta(), default_order=asc))
            else:
                if col not in self.query.extra_select:
                    order_by.append((
                        OrderBy(RawSQL(*self.query.extra[col]), descending=descending),
                        False))
                else:
                    order_by.append((
                        OrderBy(Ref(col, RawSQL(*self.query.extra[col])), descending=descending),
                        True))
        result = []
        seen = set()

        for expr, is_ref in order_by:
            if self.query.combinator:
                src = expr.get_source_expressions()[0]
                # Relabel order by columns to raw numbers if this is a combined
                # query; necessary since the columns can't be referenced by the
                # fully qualified name and the simple column names may collide.
                for idx, (sel_expr, _, col_alias) in enumerate(self.select):
                    if is_ref and col_alias == src.refs:
                        src = src.source
                    elif col_alias:
                        continue
                    if src == sel_expr:
                        expr.set_source_expressions([RawSQL('%d' % (idx + 1), ())])
                        break
                else:
                    raise DatabaseError('ORDER BY term does not match any column in the result set.')
            resolved = expr.resolve_expression(
                self.query, allow_joins=True, reuse=None)
            sql, params = self.compile(resolved)
            # Don't add the same column twice, but the order direction is
            # not taken into account so we strip it. When this entire method
            # is refactored into expressions, then we can check each part as we
            # generate it.
            without_ordering = self.ordering_parts.search(sql).group(1)
            if (without_ordering, tuple(params)) in seen:
                continue
            seen.add((without_ordering, tuple(params)))
            result.append((resolved, (sql, params, is_ref)))
        return result

    def get_extra_select(self, order_by, select):
        extra_select = []
        select_sql = [t[1] for t in select]
        if self.query.distinct and not self.query.distinct_fields:
            for expr, (sql, params, is_ref) in order_by:
                without_ordering = self.ordering_parts.search(sql).group(1)
                if not is_ref and (without_ordering, params) not in select_sql:
                    extra_select.append((expr, (without_ordering, params), None))
        return extra_select

    def quote_name_unless_alias(self, name):
        """
        A wrapper around connection.ops.quote_name that doesn't quote aliases
        for table names. This avoids problems with some SQL dialects that treat
        quoted strings specially (e.g. PostgreSQL).
        """
        if name in self.quote_cache:
            return self.quote_cache[name]
        if ((name in self.query.alias_map and name not in self.query.table_map) or
                name in self.query.extra_select or (
                    name in self.query.external_aliases and name not in self.query.table_map)):
            self.quote_cache[name] = name
            return name
        r = self.connection.ops.quote_name(name)
        self.quote_cache[name] = r
        return r

    def compile(self, node, select_format=False):
        vendor_impl = getattr(node, 'as_' + self.connection.vendor, None)
        if vendor_impl:
            sql, params = vendor_impl(self, self.connection)
        else:
            sql, params = node.as_sql(self, self.connection)
        if select_format is FORCE or (select_format and not self.query.subquery):
            return node.output_field.select_format(self, sql, params)
        return sql, params

    def get_combinator_sql(self, combinator, all):
        features = self.connection.features
        compilers = [
            query.get_compiler(self.using, self.connection)
            for query in self.query.combined_queries if not query.is_empty()
        ]
        if not features.supports_slicing_ordering_in_compound:
            for query, compiler in zip(self.query.combined_queries, compilers):
                if query.low_mark or query.high_mark:
                    raise DatabaseError('LIMIT/OFFSET not allowed in subqueries of compound statements.')
                if compiler.get_order_by():
                    raise DatabaseError('ORDER BY not allowed in subqueries of compound statements.')
        parts = ()
        for compiler in compilers:
            try:
                # If the columns list is limited, then all combined queries
                # must have the same columns list. Set the selects defined on
                # the query on all combined queries, if not already set.
                if not compiler.query.values_select and self.query.values_select:
                    compiler.query.set_values(tuple(self.query.values_select) + tuple(self.query.annotation_select))
                parts += (compiler.as_sql(),)
            except EmptyResultSet:
                # Omit the empty queryset with UNION and with DIFFERENCE if the
                # first queryset is nonempty.
                if combinator == 'union' or (combinator == 'difference' and parts):
                    continue
                raise
        if not parts:
            raise EmptyResultSet
        combinator_sql = self.connection.ops.set_operators[combinator]
        if all and combinator == 'union':
            combinator_sql += ' ALL'
        braces = '({})' if features.supports_slicing_ordering_in_compound else '{}'
        sql_parts, args_parts = zip(*((braces.format(sql), args) for sql, args in parts))
        result = [' {} '.format(combinator_sql).join(sql_parts)]
        params = []
        for part in args_parts:
            params.extend(part)
        return result, params

    def as_sql(self, with_limits=True, with_col_aliases=False):
        """
        Creates the SQL for this query. Returns the SQL string and list of
        parameters.

        If 'with_limits' is False, any limit/offset information is not included
        in the query.
        """
        refcounts_before = self.query.alias_refcount.copy()
        try:
            extra_select, order_by, group_by = self.pre_sql_setup()
            for_update_part = None
            combinator = self.query.combinator
            features = self.connection.features
            if combinator:
                if not getattr(features, 'supports_select_{}'.format(combinator)):
                    raise DatabaseError('{} not supported on this database backend.'.format(combinator))
                result, params = self.get_combinator_sql(combinator, self.query.combinator_all)
            else:
                distinct_fields = self.get_distinct()
                # This must come after 'select', 'ordering', and 'distinct'
                # (see docstring of get_from_clause() for details).
                from_, f_params = self.get_from_clause()
                where, w_params = self.compile(self.where) if self.where is not None else ("", [])
                having, h_params = self.compile(self.having) if self.having is not None else ("", [])
                result = ['SELECT']
                params = []

                if self.query.distinct:
                    result.append(self.connection.ops.distinct_sql(distinct_fields))

                out_cols = []
                col_idx = 1
                for _, (s_sql, s_params), alias in self.select + extra_select:
                    if alias:
                        s_sql = '%s AS %s' % (s_sql, self.connection.ops.quote_name(alias))
                    elif with_col_aliases:
                        s_sql = '%s AS %s' % (s_sql, 'Col%d' % col_idx)
                        col_idx += 1
                    params.extend(s_params)
                    out_cols.append(s_sql)

                result.append(', '.join(out_cols))

                result.append('FROM')
                result.extend(from_)
                params.extend(f_params)

                if self.query.select_for_update and self.connection.features.has_select_for_update:
                    if self.connection.get_autocommit():
                        raise TransactionManagementError('select_for_update cannot be used outside of a transaction.')

                    nowait = self.query.select_for_update_nowait
                    skip_locked = self.query.select_for_update_skip_locked
                    # If it's a NOWAIT/SKIP LOCKED query but the backend
                    # doesn't support it, raise a DatabaseError to prevent a
                    # possible deadlock.
                    if nowait and not self.connection.features.has_select_for_update_nowait:
                        raise DatabaseError('NOWAIT is not supported on this database backend.')
                    elif skip_locked and not self.connection.features.has_select_for_update_skip_locked:
                        raise DatabaseError('SKIP LOCKED is not supported on this database backend.')
                    for_update_part = self.connection.ops.for_update_sql(nowait=nowait, skip_locked=skip_locked)

                if for_update_part and self.connection.features.for_update_after_from:
                    result.append(for_update_part)

                if where:
                    result.append('WHERE %s' % where)
                    params.extend(w_params)

                grouping = []
                for g_sql, g_params in group_by:
                    grouping.append(g_sql)
                    params.extend(g_params)
                if grouping:
                    if distinct_fields:
                        raise NotImplementedError('annotate() + distinct(fields) is not implemented.')
                    if not order_by:
                        order_by = self.connection.ops.force_no_ordering()
                    result.append('GROUP BY %s' % ', '.join(grouping))

                if having:
                    result.append('HAVING %s' % having)
                    params.extend(h_params)

            if order_by:
                ordering = []
                for _, (o_sql, o_params, _) in order_by:
                    ordering.append(o_sql)
                    params.extend(o_params)
                result.append('ORDER BY %s' % ', '.join(ordering))

            if with_limits:
                if self.query.high_mark is not None:
                    result.append('LIMIT %d' % (self.query.high_mark - self.query.low_mark))
                if self.query.low_mark:
                    if self.query.high_mark is None:
                        val = self.connection.ops.no_limit_value()
                        if val:
                            result.append('LIMIT %d' % val)
                    result.append('OFFSET %d' % self.query.low_mark)

            if for_update_part and not self.connection.features.for_update_after_from:
                result.append(for_update_part)

            return ' '.join(result), tuple(params)
        finally:
            # Finally do cleanup - get rid of the joins we created above.
            self.query.reset_refcounts(refcounts_before)

    def get_default_columns(self, start_alias=None, opts=None, from_parent=None):
        """
        Computes the default columns for selecting every field in the base
        model. Will sometimes be called to pull in related models (e.g. via
        select_related), in which case "opts" and "start_alias" will be given
        to provide a starting point for the traversal.

        Returns a list of strings, quoted appropriately for use in SQL
        directly, as well as a set of aliases used in the select statement (if
        'as_pairs' is True, returns a list of (alias, col_name) pairs instead
        of strings as the first component and None as the second component).
        """
        result = []
        if opts is None:
            opts = self.query.get_meta()
        only_load = self.deferred_to_columns