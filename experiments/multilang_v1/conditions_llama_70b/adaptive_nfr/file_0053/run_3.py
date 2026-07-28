CONSTRAINT_DROP_TEMPLATE = "ALTER TABLE %(table)s DROP CONSTRAINT %(name)s"

# ...

def _delete_constraint_sql(self, model, name):
    return CONSTRAINT_DROP_TEMPLATE % {
        "table": self.quote_name(model._meta.db_table),
        "name": self.quote_name(name),
    }

# ...

sql_delete_check = CONSTRAINT_DROP_TEMPLATE
sql_delete_unique = CONSTRAINT_DROP_TEMPLATE
sql_delete_fk = CONSTRAINT_DROP_TEMPLATE
sql_delete_pk = CONSTRAINT_DROP_TEMPLATE