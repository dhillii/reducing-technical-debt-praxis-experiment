DROP_CONSTRAINT_TEMPLATE = "ALTER TABLE %(table)s DROP CONSTRAINT %(name)s"

# ...

sql_delete_check = DROP_CONSTRAINT_TEMPLATE
sql_delete_unique = DROP_CONSTRAINT_TEMPLATE
sql_delete_fk = DROP_CONSTRAINT_TEMPLATE
sql_delete_pk = DROP_CONSTRAINT_TEMPLATE

# ...

def _delete_constraint_sql(self, model, name):
    return DROP_CONSTRAINT_TEMPLATE % {
        "table": self.quote_name(model._meta.db_table),
        "name": self.quote_name(name),
    }