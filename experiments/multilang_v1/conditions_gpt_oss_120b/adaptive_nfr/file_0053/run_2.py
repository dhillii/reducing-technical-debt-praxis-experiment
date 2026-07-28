import hashlib
import logging
from datetime import datetime

from django.db.backends.utils import split_identifier
from django.db.models import Index
from django.db.transaction import TransactionManagementError, atomic
from django.utils import six, timezone
from django.utils.encoding import force_bytes

logger = logging.getLogger('django.db.backends.schema')


def _is_relevant_relation(relation, altered_field):
    """
    When altering the given field, must constraints on its model from the given
    relation be temporarily dropped?
    """
    field = relation.field
    if field.many_to_many:
        return False
    if altered_field.primary_key and field.to_fields == [None]:
        return True
    return altered_field.name in field.to_fields


def _related_non_m2m_objects(old_field, new_field):
    return zip(
        (obj for obj in old_field.model._meta.related_objects if _is_relevant_relation(obj, old_field)),
        (obj for obj in new_field.model._meta.related_objects if _is_relevant_relation(obj, new_field))
    )


class BaseDatabaseSchemaEditor(object):
    """
    This class (and its subclasses) are responsible for emitting schema-changing
    statements to the databases - model creation/removal/alteration, field
    renaming, index fiddling, and so on.
    """

    # Overrideable SQL templates
    sql_create_table = "CREATE TABLE %(table)s (%(definition)s)"
    sql_rename_table = "ALTER TABLE %(old_table)s RENAME TO %(new_table)s"
    sql_retablespace_table = "ALTER TABLE %(table)s SET TABLESPACE %(new_tablespace)s"
    sql_delete_table = "DROP TABLE %(table)s CASCADE"

    sql_create_column = "ALTER TABLE %(table)s ADD COLUMN %(column)s %(definition)s"
    sql_alter_column = "ALTER TABLE %(table)s %(changes)s"
    sql_alter_column_type = "ALTER COLUMN %(column)s TYPE %(type)s"
    sql_alter_column_null = "ALTER COLUMN %(column)s DROP NOT NULL"
    sql_alter_column_not_null = "ALTER COLUMN %(column)s SET NOT NULL"
    sql_alter_column_default = "ALTER COLUMN %(column)s SET DEFAULT %(default)s"
    sql_alter_column_no_default = "ALTER COLUMN %(column)s DROP DEFAULT"
    sql_delete_column = "ALTER TABLE %(table)s DROP COLUMN %(column)s CASCADE"
    sql_rename_column = "ALTER TABLE %(table)s RENAME COLUMN %(old_column)s TO %(new_column)s"
    sql_update_with_default = "UPDATE %(table)s SET %(column)s = %(default)s WHERE %(column)s IS NULL"

    sql_create_check = "ALTER TABLE %(table)s ADD CONSTRAINT %(name)s CHECK (%(check)s)"
    SQL_DROP_CONSTRAINT = "ALTER TABLE %(table)s DROP CONSTRAINT %(name)s"
    sql_delete_check = SQL_DROP_CONSTRAINT
    sql_create_unique = "ALTER TABLE %(table)s ADD CONSTRAINT %(name)s UNIQUE (%(columns)s)"
    sql_delete_unique = SQL_DROP_CONSTRAINT
    sql_create_fk = (
        "ALTER TABLE %(table)s ADD CONSTRAINT %(name)s FOREIGN KEY (%(column)s) "
        "REFERENCES %(to_table)s (%(to_column)s)%(deferrable)s"
    )
    sql_create_inline_fk = None
    sql_delete_fk = SQL_DROP_CONSTRAINT
    sql_create_index = "CREATE INDEX %(name)s ON %(table)s (%(columns)s)%(extra)s"
    sql_delete_index = "DROP INDEX %(name)s"
    sql_create_pk = "ALTER TABLE %(table)s ADD CONSTRAINT %(name)s PRIMARY KEY (%(columns)s)"
    sql_delete_pk = SQL_DROP_CONSTRAINT

    def __init__(self, connection, collect_sql=False, atomic=True):
        self.connection = connection
        self.collect_sql = collect_sql
        if self.collect_sql:
            self.collected_sql = []
        self.atomic_migration = self.connection.features.can_rollback_ddl and atomic

    def __enter__(self):
        self.deferred_sql = []
        if self.atomic_migration:
            self.atomic = atomic(self.connection.alias)
            self.atomic.__enter__()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is None:
            for sql in self.deferred_sql:
                self.execute(sql)
        if self.atomic_migration:
            self.atomic.__exit__(exc_type, exc_value, traceback)

    def execute(self, sql, params=()):
        if not self.collect_sql and self.connection.in_atomic_block and not self.connection.features.can_rollback_ddl:
            raise TransactionManagementError(
                "Executing DDL statements while in a transaction on databases "
                "that can't perform a rollback is prohibited."
            )
        logger.debug("%s; (params %r)", sql, params, extra={'params': params, 'sql': sql})
        if self.collect_sql:
            ending = "" if sql.endswith(";") else ";"
            if params is not None:
                self.collected_sql.append((sql % tuple(map(self.quote_value, params))) + ending)
            else:
                self.collected_sql.append(sql + ending)
        else:
            with self.connection.cursor() as cursor:
                cursor.execute(sql, params)

    def quote_name(self, name):
        return self.connection.ops.quote_name(name)

    @classmethod
    def _digest(cls, *args):
        h = hashlib.md5()
        for arg in args:
            h.update(force_bytes(arg))
        return h.hexdigest()[:8]

    def column_sql(self, model, field, include_default=False):
        db_params = field.db_parameters(connection=self.connection)
        sql = db_params['type']
        params = []
        if sql is None:
            return None, None
        null = field.null
        include_default = include_default and not self.skip_default(field)
        if include_default:
            default_value = self.effective_default(field)
            if default_value is not None:
                if self.connection.features.requires_literal_defaults:
                    sql += " DEFAULT %s" % self.prepare_default(default_value)
                else:
                    sql += " DEFAULT %s"
                    params += [default_value]
        if (field.empty_strings_allowed and not field.primary_key and
                self.connection.features.interprets_empty_strings_as_nulls):
            null = True
        if null and not self.connection.features.implied_column_null:
            sql += " NULL"
        elif not null:
            sql += " NOT NULL"
        if field.primary_key:
            sql += " PRIMARY KEY"
        elif field.unique:
            sql += " UNIQUE"
        tablespace = field.db_tablespace or model._meta.db_tablespace
        if tablespace and self.connection.features.supports_tablespaces and field.unique:
            sql += " %s" % self.connection.ops.tablespace_sql(tablespace, inline=True)
        return sql, params

    def skip_default(self, field):
        return False

    def prepare_default(self, value):
        raise NotImplementedError(
            'subclasses of BaseDatabaseSchemaEditor for backends which have '
            'requires_literal_defaults must provide a prepare_default() method'
        )

    def effective_default(self, field):
        if field.has_default():
            default = field.get_default()
        elif not field.null and field.blank and field.empty_strings_allowed:
            if field.get_internal_type() == "BinaryField":
                default = six.binary_type()
            else:
                default = six.text_type()
        elif getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False):
            default = datetime.now()
            internal_type = field.get_internal_type()
            if internal_type == 'DateField':
                default = default.date
            elif internal_type == 'TimeField':
                default = default.time
            elif internal_type == 'DateTimeField':
                default = timezone.now
        else:
            default = None
        if callable(default):
            default = default()
        default = field.get_db_prep_save(default, self.connection)
        return default

    def quote_value(self, value):
        raise NotImplementedError()

    # -------------------------------------------------------------------------
    # Public actions
    # -------------------------------------------------------------------------

    def create_model(self, model):
        column_sqls = []
        params = []
        for field in model._meta.local_fields:
            definition, extra_params = self.column_sql(model, field)
            if definition is None:
                continue
            db_params = field.db_parameters(connection=self.connection)
            if db_params['check']:
                definition += " CHECK (%s)" % db_params['check']
            col_type_suffix = field.db_type_suffix(connection=self.connection)
            if col_type_suffix:
                definition += " %s" % col_type_suffix
            params.extend(extra_params)
            if field.remote_field and field.db_constraint:
                to_table = field.remote_field.model._meta.db_table
                to_column = field.remote_field.model._meta.get_field(field.remote_field.field_name).column
                if self.connection.features.supports_foreign_keys:
                    self.deferred_sql.append(self._create_fk_sql(model, field, "_fk_%(to_table)s_%(to_column)s"))
                elif self.sql_create_inline_fk:
                    definition += " " + self.sql_create_inline_fk % {
                        "to_table": self.quote_name(to_table),
                        "to_column": self.quote_name(to_column),
                    }
            column_sqls.append("%s %s" % (self.quote_name(field.column), definition))
            if field.get_internal_type() in ("AutoField", "BigAutoField"):
                autoinc_sql = self.connection.ops.autoinc_sql(model._meta.db_table, field.column)
                if autoinc_sql:
                    self.deferred_sql.extend(autoinc_sql)
        for fields in model._meta.unique_together:
            columns = [model._meta.get_field(field).column for field in fields]
            self.deferred_sql.append(self._create_unique_sql(model, columns))
        sql = self.sql_create_table % {
            "table": self.quote_name(model._meta.db_table),
            "definition": ", ".join(column_sqls)
        }
        if model._meta.db_tablespace:
            tablespace_sql = self.connection.ops.tablespace_sql(model._meta.db_tablespace)
            if tablespace_sql:
                sql += ' ' + tablespace_sql
        self.execute(sql, params or None)
        self.deferred_sql.extend(self._model_indexes_sql(model))
        for field in model._meta.local_many_to_many:
            if field.remote_field.through._meta.auto_created:
                self.create_model(field.remote_field.through)

    def delete_model(self, model):
        for field in model._meta.local_many_to_many:
            if field.remote_field.through._meta.auto_created:
                self.delete_model(field.remote_field.through)
        self.execute(self.sql_delete_table % {"table": self.quote_name(model._meta.db_table)})

    def add_index(self, model, index):
        self.execute(index.create_sql(model, self))

    def remove_index(self, model, index):
        self.execute(index.remove_sql(model, self))

    def alter_unique_together(self, model, old_unique_together, new_unique_together):
        olds = set(tuple(fields) for fields in old_unique_together)
        news = set(tuple(fields) for fields in new_unique_together)
        for fields in olds.difference(news):
            self._delete_composed_index(model, fields, {'unique': True}, self.sql_delete_unique)
        for fields in news.difference(olds):
            columns = [model._meta.get_field(field).column for field in fields]
            self.execute(self._create_unique_sql(model, columns))

    def alter_index_together(self, model, old_index_together, new_index_together):
        olds = set(tuple(fields) for fields in old_index_together)
        news = set(tuple(fields) for fields in new_index_together)
        for fields in olds.difference(news):
            self._delete_composed_index(model, fields, {'index': True}, self.sql_delete_index)
        for field_names in news.difference(olds):
            fields = [model._meta.get_field(field) for field in field_names]
            self.execute(self._create_index_sql(model, fields, suffix="_idx"))

    def _delete_composed_index(self, model, fields, constraint_kwargs, sql):
        columns = [model._meta.get_field(field).column for field in fields]
        constraint_names = self._constraint_names(model, columns, **constraint_kwargs)
        if len(constraint_names) != 1:
            raise ValueError("Found wrong number (%s) of constraints for %s(%s)" % (
                len(constraint_names),
                model._meta.db_table,
                ", ".join(columns),
            ))
        self.execute(self._delete_constraint_sql(sql, model, constraint_names[0]))

    def alter_db_table(self, model, old_db_table, new_db_table):
        if (old_db_table == new_db_table or
            (self.connection.features.ignores_table_name_case and
                old_db_table.lower() == new_db_table.lower())):
            return
        self.execute(self.sql_rename_table % {
            "old_table": self.quote_name(old_db_table),
            "new_table": self.quote_name(new_db_table),
        })

    def alter_db_tablespace(self, model, old_db_tablespace, new_db_tablespace):
        self.execute(self.sql_retablespace_table % {
            "table": self.quote_name(model._meta.db_table),
            "old_tablespace": self.quote_name(old_db_tablespace),
            "new_tablespace": self.quote_name(new_db_tablespace),
        })

    def add_field(self, model, field):
        if field.many_to_many and field.remote_field.through._meta.auto_created:
            return self.create_model(field.remote_field.through)
        definition, params = self.column_sql(model, field, include_default=True)
        if definition is None:
            return
        db_params = field.db_parameters(connection=self.connection)
        if db_params['check']:
            definition += " CHECK (%s)" % db_params['check']
        sql = self.sql_create_column % {
            "table": self.quote_name(model._meta.db_table),
            "column": self.quote_name(field.column),
            "definition": definition,
        }
        self.execute(sql, params)
        if not self.skip_default(field) and self.effective_default(field) is not None:
            sql = self.sql_alter_column % {
                "table": self.quote_name(model._meta.db_table),
                "changes": self.sql_alter_column_no_default % {
                    "column": self.quote_name(field.column),
                    "type": db_params['type'],
                }
            }
            self.execute(sql)
        self.deferred_sql.extend(self._field_indexes_sql(model, field))
        if field.remote_field and self.connection.features.supports_foreign_keys and field.db_constraint:
            self.deferred_sql.append(self._create_fk_sql(model, field, "_fk_%(to_table)s_%(to_column)s"))
        if self.connection.features.connection_persists_old_columns:
            self.connection.close()

    def remove_field(self, model, field):
        if field.many_to_many and field.remote_field.through._meta.auto_created:
            return self.delete_model(field.remote_field.through)
        if field.db_parameters(connection=self.connection)['type'] is None:
            return
        if field.remote_field:
            fk_names = self._constraint_names(model, [field.column], foreign_key=True)
            for fk_name in fk_names:
                self.execute(self._delete_constraint_sql(self.sql_delete_fk, model, fk_name))
        sql = self.sql_delete_column % {
            "table": self.quote_name(model._meta.db_table),
            "column": self.quote_name(field.column),
        }
        self.execute(sql)
        if self.connection.features.connection_persists_old_columns:
            self.connection.close()

    def alter_field(self, model, old_field, new_field, strict=False):
        old_db_params = old_field.db_parameters(connection=self.connection)
        old_type = old_db_params['type']
        new_db_params = new_field.db_parameters(connection=self.connection)
        new_type = new_db_params['type']
        if ((old_type is None and old_field.remote_field is None) or
                (new_type is None and new_field.remote_field is None)):
            raise ValueError(
                "Cannot alter field %s into %s - they do not properly define "
                "db_type (are you using a badly-written custom field?)" % (old_field, new_field)
            )
        elif old_type is None and new_type is None and (
                old_field.remote_field.through and new_field.remote_field.through and
                old_field.remote_field.through._meta.auto_created and
                new_field.remote_field.through._meta.auto_created):
            return self._alter_many_to_many(model, old_field, new_field, strict)
        elif old_type is None and new_type is None and (
                old_field.remote_field.through and new_field.remote_field.through and
                not old_field.remote_field.through._meta.auto_created and
                not new_field.remote_field.through._meta.auto_created):
            return
        elif old_type is None or new_type is None:
            raise ValueError(
                "Cannot alter field %s into %s - they are not compatible types "
                "(you cannot alter to or from M2M fields, or add or remove "
                "through= on M2M fields)" % (old_field, new_field)
            )
        self._alter_field(model, old_field, new_field, old_type, new_type,
                          old_db_params, new_db_params, strict)

    # -------------------------------------------------------------------------
    # Private helpers for alter_field
    # -------------------------------------------------------------------------

    def _alter_field(self, model, old_field, new_field, old_type, new_type,
                     old_db_params, new_db_params, strict=False):
        fks_dropped = self._drop_fk_constraints(model, old_field, strict)
        self._drop_unique_constraints(model, old_field, new_field, strict)
        drop_foreign_keys = self._drop_incoming_fks(old_field, new_field, old_type, new_type)
        self._remove_indexes(model, old_field, new_field)
        self._drop_check_constraints(model, old_field, new_field, old_db_params, new_db_params, strict)
        if old_field.column != new_field.column:
            self.execute(self._rename_field_sql(model._meta.db_table, old_field, new_field, new_type))
        actions, null_actions, post_actions, needs_db_default, four_way_default = self._collect_alter_actions(
            model, old_field, new_field, old_type, new_type, old_db_params, new_db_params
        )
        self._execute_alter_actions(model, actions, null_actions, post_actions,
                                    four_way_default, new_field, needs_db_default)
        self._add_unique_if_needed(model, old_field, new_field)
        self._add_index_if_needed(model, old_field, new_field)
        self._handle_pk_changes(model, old_field, new_field, old_type, new_type, strict)
        self._add_fk_if_needed(model, old_field, new_field, fks_dropped, strict)
        self._add_check_if_needed(model, old_field, new_field, old_db_params, new_db_params)
        if needs_db_default:
            self._drop_default_if_needed(model, new_field, new_type)

        if self.connection.features.connection_persists_old_columns:
            self.connection.close()

    def _drop_fk_constraints(self, model, old_field, strict):
        fks_dropped = set()
        if old_field.remote_field and old_field.db_constraint:
            fk_names = self._constraint_names(model, [old_field.column], foreign_key=True)
            if strict and len(fk_names) != 1:
                raise ValueError("Found wrong number (%s) of foreign key constraints for %s.%s" % (
                    len(fk_names), model._meta.db_table, old_field.column))
            for fk_name in fk_names:
                fks_dropped.add((old_field.column,))
                self.execute(self._delete_constraint_sql(self.sql_delete_fk, model, fk_name))
        return fks_dropped

    def _drop_unique_constraints(self, model, old_field, new_field, strict):
        if old_field.unique and (not new_field.unique or (not old_field.primary_key and new_field.primary_key)):
            constraint_names = self._constraint_names(model, [old_field.column], unique=True)
            if strict and len(constraint_names) != 1:
                raise ValueError("Found wrong number (%s) of unique constraints for %s.%s" % (
                    len(constraint_names), model._meta.db_table, old_field.column))
            for name in constraint_names:
                self.execute(self._delete_constraint_sql(self.sql_delete_unique, model, name))

    def _drop_incoming_fks(self, old_field, new_field, old_type, new_type):
        drop = ((old_field.primary_key and new_field.primary_key) or
                (old_field.unique and new_field.unique)) and old_type != new_type
        if drop:
            for _old_rel, new_rel in _related_non_m2m_objects(old_field, new_field):
                rel_fk_names = self._constraint_names(
                    new_rel.related_model, [new_rel.field.column], foreign_key=True
                )
                for fk_name in rel_fk_names:
                    self.execute(self._delete_constraint_sql(self.sql_delete_fk, new_rel.related_model, fk_name))
        return drop

    def _remove_indexes(self, model, old_field, new_field):
        if old_field.db_index and not old_field.unique and (not new_field.db_index or new_field.unique):
            meta_index_names = {index.name for index in model._meta.indexes}
            index_names = self._constraint_names(model, [old_field.column], index=True, type_=Index.suffix)
            for index_name in index_names:
                if index_name in meta_index_names:
                    continue
                self.execute(self._delete_constraint_sql(self.sql_delete_index, model, index_name))

    def _drop_check_constraints(self, model, old_field, new_field, old_db_params, new_db_params, strict):
        if old_db_params['check'] != new_db_params['check'] and old_db_params['check']:
            constraint_names = self._constraint_names(model, [old_field.column], check=True)
            if strict and len(constraint_names) != 1:
                raise ValueError("Found wrong number (%s) of check constraints for %s.%s" % (
                    len(constraint_names), model._meta.db_table, old_field.column))
            for name in constraint_names:
                self.execute(self._delete_constraint_sql(self.sql_delete_check, model, name))

    def _collect_alter_actions(self, model, old_field, new_field, old_type, new_type,
                               old_db_params, new_db_params):
        actions = []
        null_actions = []
        post_actions = []
        old_default = self.effective_default(old_field)
        new_default = self.effective_default(new_field)
        needs_db_default = (
            old_default != new_default and
            new_default is not None and
            not self.skip_default(new_field)
        )
        if needs_db_default:
            if self.connection.features.requires_literal_defaults:
                actions.append((
                    self.sql_alter_column_default % {
                        "column": self.quote_name(new_field.column),
                        "type": new_type,
                        "default": self.prepare_default(new_default),
                    },
                    [],
                ))
            else:
                actions.append((
                    self.sql_alter_column_default % {
                        "column": self.quote_name(new_field.column),
                        "type": new_type,
                        "default": "%s",
                    },
                    [new_default],
                ))
        if old_type != new_type:
            fragment, other_actions = self._alter_column_type_sql(
                model._meta.db_table, old_field, new_field, new_type
            )
            actions.append(fragment)
            post_actions.extend(other_actions)
        if old_field.null != new_field.null:
            if (self.connection.features.interprets_empty_strings_as_nulls and
                    new_field.get_internal_type() in ("CharField", "TextField")):
                pass
            elif new_field.null:
                null_actions.append((
                    self.sql_alter_column_null % {
                        "column": self.quote_name(new_field.column),
                        "type": new_type,
                    },
                    [],
                ))
            else:
                null_actions.append((
                    self.sql_alter_column_not_null % {
                        "column": self.quote_name(new_field.column),
                        "type": new_type,
                    },
                    [],
                ))
        four_way_default = (
            new_field.has_default() and
            (old_field.null and not new_field.null)
        )
        return actions, null_actions, post_actions, needs_db_default, four_way_default

    def _execute_alter_actions(self, model, actions, null_actions, post_actions,
                               four_way_default, new_field, needs_db_default):
        if actions or null_actions:
            if not four_way_default:
                actions = actions + null_actions
            if self.connection.features.supports_combined_alters and actions:
                sql, params = tuple(zip(*actions))
                actions = [(", ".join(sql), sum(params, []))]
            for sql, params in actions:
                self.execute(
                    self.sql_alter_column % {
                        "table": self.quote_name(model._meta.db_table),
                        "changes": sql,
                    },
                    params,
                )
            if four_way_default:
                self.execute(
                    self.sql_update_with_default % {
                        "table": self.quote_name(model._meta.db_table),
                        "column": self.quote_name(new_field.column),
                        "default": "%s",
                    },
                    [self.effective_default(new_field)],
                )
                for sql, params in null_actions:
                    self.execute(
                        self.sql_alter_column % {
                            "table": self.quote_name(model._meta.db_table),
                            "changes": sql,
                        },
                        params,
                    )
        for sql, params in post_actions:
            self.execute(sql, params)

    def _add_unique_if_needed(self, model, old_field, new_field):
        if (not old_field.unique and new_field.unique) or (
                old_field.primary_key and not new_field.primary_key and new_field.unique):
            self.execute(self._create_unique_sql(model, [new_field.column]))

    def _add_index_if_needed(self, model, old_field, new_field):
        if (not old_field.db_index or old_field.unique) and new_field.db_index and not new_field.unique:
            self.execute(self._create_index_sql(model, [new_field]))

    def _handle_pk_changes(self, model, old_field, new_field, old_type, new_type, strict):
        if old_field.primary_key and new_field.primary_key and old_type != new_type:
            rels = _related_non_m2m_objects(old_field, new_field)
            for old_rel, new_rel in rels:
                rel_db_params = new_rel.field.db_parameters(connection=self.connection)
                rel_type = rel_db_params['type']
                fragment, other_actions = self._alter_column_type_sql(
                    new_rel.related_model._meta.db_table, old_rel.field, new_rel.field, rel_type
                )
                self.execute(
                    self.sql_alter_column % {
                        "table": self.quote_name(new_rel.related_model._meta.db_table),
                        "changes": fragment[0],
                    },
                    fragment[1],
                )
                for sql, params in other_actions:
                    self.execute(sql, params)
        if not old_field.primary_key and new_field.primary_key:
            constraint_names = self._constraint_names(model, primary_key=True)
            if strict and len(constraint_names) != 1:
                raise ValueError("Found wrong number (%s) of PK constraints for %s" % (
                    len(constraint_names), model._meta.db_table))
            for name in constraint_names:
                self.execute(self._delete_constraint_sql(self.sql_delete_pk, model, name))
            self.execute(
                self.sql_create_pk % {
                    "table": self.quote_name(model._meta.db_table),
                    "name": self.quote_name(self._create_index_name(model, [new_field.column], suffix="_pk")),
                    "columns": self.quote_name(new_field.column),
                }
            )
            rels = _related_non_m2m_objects(old_field, new_field)
            for old_rel, new_rel in rels:
                rel_db_params = new_rel.field.db_parameters(connection=self.connection)
                rel_type = rel_db_params['type']
                fragment, other_actions = self._alter_column_type_sql(
                    new_rel.related_model._meta.db_table, old_rel.field, new_rel.field, rel_type
                )
                self.execute(
                    self.sql_alter_column % {
                        "table": self.quote_name(new_rel.related_model._meta.db_table),
                        "changes": fragment[0],
                    },
                    fragment[1],
                )
                for sql, params in other_actions:
                    self.execute(sql, params)

    def _add_fk_if_needed(self, model, old_field, new_field, fks_dropped, strict):
        if (new_field.remote_field and
                (fks_dropped or not old_field.remote_field or not old_field.db_constraint) and
                new_field.db_constraint):
            self.execute(self._create_fk_sql(model, new_field, "_fk_%(to_table)s_%(to_column)s"))
        if fks_dropped:
            for rel in new_field.model._meta.related_objects:
                if _is_relevant_relation(rel, new_field) and rel.field.db_constraint:
                    self.execute(self._create_fk_sql(rel.related_model, rel.field, "_fk"))

    def _add_check_if_needed(self, model, old_field, new_field, old_db_params, new_db_params):
        if old_db_params['check'] != new_db_params['check'] and new_db_params['check']:
            self.execute(
                self.sql_create_check % {
                    "table": self.quote_name(model._meta.db_table),
                    "name": self.quote_name(self._create_index_name(model, [new_field.column], suffix="_check")),
                    "column": self.quote_name(new_field.column),
                    "check": new_db_params['check'],
                }
            )

    def _drop_default_if_needed(self, model, new_field, new_type):
        sql = self.sql_alter_column % {
            "table": self.quote_name(model._meta.db_table),
            "changes": self.sql_alter_column_no_default % {
                "column": self.quote_name(new_field.column),
                "type": new_type,
            }
        }
        self.execute(sql)

    # -------------------------------------------------------------------------
    # Remaining helpers
    # -------------------------------------------------------------------------

    def _alter_column_type_sql(self, table, old_field, new_field, new_type):
        return (
            (
                self.sql_alter_column_type % {
                    "column": self.quote_name(new_field.column),
                    "type": new_type,
                },
                [],
            ),
            [],
        )

    def _alter_many_to_many(self, model, old_field, new_field, strict):
        if old_field.remote_field.through._meta.db_table != new_field.remote_field.through._meta.db_table:
            self.alter_db_table(old_field.remote_field.through,
                                old_field.remote_field.through._meta.db_table,
                                new_field.remote_field.through._meta.db_table)
        self.alter_field(
            new_field.remote_field.through,
            old_field.remote_field.through._meta.get_field(old_field.m2m_reverse_field_name()),
            new_field.remote_field.through._meta.get_field(new_field.m2m_reverse_field_name()),
        )
        self.alter_field(
            new_field.remote_field.through,
            old_field.remote_field.through._meta.get_field(old_field.m2m_field_name()),
            new_field.remote_field.through._meta.get_field(new_field.m2m_field_name()),
        )

    def _create_index_name(self, model, column_names, suffix=""):
        _, table_name = split_identifier(model._meta.db_table)
        hash_data = [table_name] + list(column_names)
        hash_suffix_part = '%s%s' % (self._digest(*hash_data), suffix)
        max_length = self.connection.ops.max_name_length() or 200
        index_name = '%s_%s_%s' % (table_name, '_'.join(column_names), hash_suffix_part)
        if len(index_name) <= max_length:
            return index_name
        if len(hash_suffix_part) > max_length / 3:
            hash_suffix_part = hash_suffix_part[:max_length // 3]
        other_length = (max_length - len(hash_suffix_part)) // 2 - 1
        index_name = '%s_%s_%s' % (
            table_name[:other_length],
            '_'.join(column_names)[:other_length],
            hash_suffix_part,
        )
        if index_name[0] == "_" or index_name[0].isdigit():
            index_name = "D%s" % index_name[:-1]
        return index_name

    def _get_index_tablespace_sql(self, model, fields):
        if len(fields) == 1 and fields[0].db_tablespace:
            tablespace_sql = self.connection.ops.tablespace_sql(fields[0].db_tablespace)
        elif model._meta.db_tablespace:
            tablespace_sql = self.connection.ops.tablespace_sql(model._meta.db_tablespace)
        else:
            tablespace_sql = ""
        if tablespace_sql:
            tablespace_sql = " " + tablespace_sql
        return tablespace_sql

    def _create_index_sql(self, model, fields, suffix="", sql=None):
        tablespace_sql = self._get_index_tablespace_sql(model, fields)
        columns = [field.column for field in fields]
        sql_create_index = sql or self.sql_create_index
        return sql_create_index % {
            "table": self.quote_name(model._meta.db_table),
            "name": self.quote_name(self._create_index_name(model, columns, suffix=suffix)),
            "using": "",
            "columns": ", ".join(self.quote_name(column) for column in columns),
            "extra": tablespace_sql,
        }

    def _model_indexes_sql(self, model):
        if not model._meta.managed or model._meta.proxy or model._meta.swapped:
            return []
        output = []
        for field in model._meta.local_fields:
            output.extend(self._field_indexes_sql(model, field))
        for field_names in model._meta.index_together:
            fields = [model._meta.get_field(field) for field in field_names]
            output.append(self._create_index_sql(model, fields, suffix="_idx"))
        for index in model._meta.indexes:
            output.append(index.create_sql(model, self))
        return output

    def _field_indexes_sql(self, model, field):
        output = []
        if self._field_should_be_indexed(model, field):
            output.append(self._create_index_sql(model, [field]))
        return output

    def _field_should_be_indexed(self, model, field):
        return field.db_index and not field.unique

    def _rename_field_sql(self, table, old_field, new_field, new_type):
        return self.sql_rename_column % {
            "table": self.quote_name(table),
            "old_column": self.quote_name(old_field.column),
            "new_column": self.quote_name(new_field.column),
            "type": new_type,
        }

    def _create_fk_sql(self, model, field, suffix):
        from_table = model._meta.db_table
        from_column = field.column
        _, to_table = split_identifier(field.target_field.model._meta.db_table)
        to_column = field.target_field.column
        suffix = suffix % {"to_table": to_table, "to_column": to_column}
        return self.sql_create_fk % {
            "table": self.quote_name(from_table),
            "name": self.quote_name(self._create_index_name(model, [from_column], suffix=suffix)),
            "column": self.quote_name(from_column),
            "to_table": self.quote_name(field.target_field.model._meta.db_table),
            "to_column": self.quote_name(to_column),
            "deferrable": self.connection.ops.deferrable_sql(),
        }

    def _create_unique_sql(self, model, columns):
        return self.sql_create_unique % {
            "table": self.quote_name(model._meta.db_table),
            "name": self.quote_name(self._create_index_name(model, columns, suffix="_uniq")),
            "columns": ", ".join(self.quote_name(column) for column in columns),
        }

    def _delete_constraint_sql(self, template, model, name):
        return template % {
            "table": self.quote_name(model._meta.db_table),
            "name": self.quote_name(name),
        }

    def _constraint_names(self, model, column_names=None, unique=None,
                          primary_key=None, index=None, foreign_key=None,
                          check=None, type_=None):
        if column_names is not None:
            column_names = [
                self.connection.introspection.column_name_converter(name)
                for name in column_names
            ]
        with self.connection.cursor() as cursor:
            constraints = self.connection.introspection.get_constraints(cursor, model._meta.db_table)
        result = []
        for name, infodict in constraints.items():
            if column_names is None or column_names == infodict['columns']:
                if unique is not None and infodict['unique'] != unique:
                    continue
                if primary_key is not None and infodict['primary_key'] != primary_key:
                    continue
                if index is not None and infodict['index'] != index:
                    continue
                if check is not None and infodict['check'] != check:
                    continue
                if foreign_key is not None and not infodict['foreign_key']:
                    continue
                if type_ is not None and infodict['type'] != type_:
                    continue
                result.append(name)
        return result