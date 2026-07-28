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
        Does any necessary class setup immediately prior to producing SQL.
        """
        self.setup_query()
        order_by = self.get_order_by()
        self.where, self.having = self.query.where.split_having()
        extra_select = self.get_extra_select(order_by, self.select)
        group_by = self.get_group_by(self.select + extra_select, order_by)
        return extra_select, order_by, group_by

    # -------------------------------------------------------------------------
    # Group By handling
    # -------------------------------------------------------------------------

    def get_group_by(self, select, order_by):
        """
        Return a list of (sql, params) tuples for the GROUP BY clause.
        """
        if self._is_group_by_none():
            return []

        expressions = self._collect_initial_expressions()
        self._add_select_group_by(expressions, select)
        self._add_order_by_group_by(expressions, order_by)
        self._add_having_group_by(expressions)

        expressions = self.collapse_group_by(expressions, self.having.get_group_by_cols() if self.having else ())
        return self._unique_compiled(expressions)

    def _is_group_by_none(self):
        """Return True when the query has no GROUP BY."""
        return self.query.group_by is None

    def _collect_initial_expressions(self):
        """
        Gather initial GROUP BY expressions based on query.group_by.
        """
        if self.query.group_by is True:
            return []

        expressions = []
        for expr in self.query.group_by:
            if not hasattr(expr, 'as_sql'):
                expressions.append(self.query.resolve_ref(expr))
            else:
                expressions.append(expr)
        return expressions

    def _add_select_group_by(self, expressions, select):
        """Add GROUP BY columns derived from the SELECT clause."""
        for expr, _, _ in select:
            for col in expr.get_group_by_cols():
                expressions.append(col)

    def _add_order_by_group_by(self, expressions, order_by):
        """Add GROUP BY columns derived from the ORDER BY clause."""
        for expr, (sql, params, is_ref) in order_by:
            if self._expr_contains_aggregate(expr):
                continue
            if is_ref:
                continue
            expressions.extend(expr.get_source_expressions())

    def _add_having_group_by(self, expressions):
        """Add GROUP BY columns derived from the HAVING clause."""
        having_cols = self.having.get_group_by_cols() if self.having else ()
        for expr in having_cols:
            expressions.append(expr)

    def _expr_contains_aggregate(self, expr):
        """Return True if the expression contains an aggregate."""
        return getattr(expr, 'contains_aggregate', False)

    def _unique_compiled(self, expressions):
        """
        Compile expressions and return a list of unique (sql, params) tuples.
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
        if self.connection.features.allows_group_by_pk:
            pk = None
            for expr in expressions:
                if (getattr(expr, 'target', None) == self.query.model._meta.pk and
                        getattr(expr, 'alias', None) == self.query.tables[0]):
                    pk = expr
                    break
            if pk:
                expressions = [pk] + [expr for expr in expressions if expr in having]
        elif self.connection.features.allows_group_by_selected_pks:
            pks = {expr for expr in expressions if hasattr(expr, 'target') and expr.target.primary_key}
            aliases = {expr.alias for expr in pks}
            expressions = [
                expr for expr in expressions
                if expr in pks or getattr(expr, 'alias', None) not in aliases
            ]
        return expressions

    # -------------------------------------------------------------------------
    # Remaining methods (unchanged)
    # -------------------------------------------------------------------------

    def get_select(self):
        """
        Returns three values:
        - a list of 3-tuples of (expression, (sql, params), alias)
        - a klass_info structure,
        - a dictionary of annotations
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

            def _propagate_select_fields(ki):
                for sub in ki.get('related_klass_infos', []):
                    if sub.get('from_parent'):
                        sub['select_fields'] = ki['select_fields'] + sub['select_fields']
                    _propagate_select_fields(sub)

            _propagate_select_fields(klass_info)

        ret = []
        for col, alias in select:
            try:
                sql, params = self.compile(col, select_format=True)
            except EmptyResultSet:
                sql, params = '0', ()
            ret.append((col, (sql, params), alias))
        return ret, klass_info, annotations

    def get_order_by(self):
        """
        Returns a list of 2-tuples of form (expr, (sql, params, is_ref)) for the
        ORDER BY clause.
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
            if field == '?':
                order_by.append((OrderBy(Random()), False))
                continue

            col, order = get_order_dir(field, asc)
            descending = order == 'DESC'

            if col in self.query.annotation_select:
                order_by.append((
                    OrderBy(Ref(col, self.query.annotation_select[col]), descending=descending),
                    True))
                continue
            if col in self.query.annotations:
                order_by.append((
                    OrderBy(self.query.annotations[col], descending=descending),
                    False))
                continue

            if '.' in field:
                table, col = col.split('.', 1)
                order_by.append((
                    OrderBy(
                        RawSQL('%s.%s' % (self.quote_name_unless_alias(table), col), []),
                        descending=descending
                    ), False))
                continue

            if not self.query._extra or col not in self.query._extra:
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
        Wrapper around connection.ops.quote_name that doesn't quote aliases.
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

    # ... (rest of the class unchanged) ...

def cursor_iter(cursor, sentinel, col_count):
    """
    Yields blocks of rows from a cursor and ensures the cursor is closed when
    done.
    """
    try:
        for rows in iter((lambda: cursor.fetchmany(GET_ITERATOR_CHUNK_SIZE)),
                         sentinel):
            yield [r[0:col_count] for r in rows]
    finally:
        cursor.close()