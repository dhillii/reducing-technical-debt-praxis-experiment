attributeToSQL(attribute) {
  if (!_.isPlainObject(attribute)) {
    attribute = { type: attribute };
  }

  const type = this.getAttributeType(attribute);
  const sql = this.buildAttributeSQL(type, attribute);

  return sql;
},

getAttributeType(attribute) {
  if (
    attribute.type instanceof DataTypes.ENUM ||
    (attribute.type instanceof DataTypes.ARRAY && attribute.type.type instanceof DataTypes.ENUM)
  ) {
    const enumType = attribute.type.type || attribute.type;
    let values = attribute.values;

    if (enumType.values && !attribute.values) {
      values = enumType.values;
    }

    if (Array.isArray(values) && values.length > 0) {
      return 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

    } else {
      throw new Error("Values for ENUM haven't been defined.");
    }
  }

  return attribute.type;
},

buildAttributeSQL(type, attribute) {
  let sql = type + '';

  sql = this.addNullability(sql, attribute);
  sql = this.addAutoIncrement(sql, attribute);
  sql = this.addDefaultValue(sql, attribute);
  sql = this.addUnique(sql, attribute);
  sql = this.addPrimaryKey(sql, attribute);
  sql = this.addReferences(sql, attribute);

  return sql;
},

addNullability(sql, attribute) {
  if (attribute.hasOwnProperty('allowNull') && !attribute.allowNull) {
    sql += ' NOT NULL';
  }

  return sql;
},

addAutoIncrement(sql, attribute) {
  if (attribute.autoIncrement) {
    sql += ' SERIAL';
  }

  return sql;
},

addDefaultValue(sql, attribute) {
  if (Utils.defaultValueSchemable(attribute.defaultValue)) {
    sql += ' DEFAULT ' + this.escape(attribute.defaultValue, attribute);
  }

  return sql;
},

addUnique(sql, attribute) {
  if (attribute.unique === true) {
    sql += ' UNIQUE';
  }

  return sql;
},

addPrimaryKey(sql, attribute) {
  if (attribute.primaryKey) {
    sql += ' PRIMARY KEY';
  }

  return sql;
},

addReferences(sql, attribute) {
  if (attribute.references) {
    const referencesTable = this.quoteTable(attribute.references.model);
    let referencesKey;

    if (attribute.references.key) {
      referencesKey = this.quoteIdentifiers(attribute.references.key);
    } else {
      referencesKey = this.quoteIdentifier('id');
    }

    sql += ` REFERENCES ${referencesTable} (${referencesKey})`;

    if (attribute.onDelete) {
      sql += ' ON DELETE ' + attribute.onDelete.toUpperCase();
    }

    if (attribute.onUpdate) {
      sql += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
    }

    if (attribute.references.deferrable) {
      sql += ' ' + attribute.references.deferrable.toString(this);
    }
  }

  return sql;
},