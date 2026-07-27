attributeToSQL(attribute, options) {
  if (!_.isPlainObject(attribute)) {
    attribute = { type: attribute };
  }

  const type = this.getAttributeType(attribute);
  const sql = this.buildAttributeSQL(type, attribute);

  if (attribute.hasOwnProperty('allowNull') && !attribute.allowNull) {
    sql += ' NOT NULL';
  }

  if (attribute.autoIncrement) {
    sql += ' SERIAL';
  }

  if (Utils.defaultValueSchemable(attribute.defaultValue)) {
    sql += ' DEFAULT ' + this.escape(attribute.defaultValue, attribute);
  }

  if (attribute.unique === true) {
    sql += ' UNIQUE';
  }

  if (attribute.primaryKey) {
    sql += ' PRIMARY KEY';
  }

  if (attribute.references) {
    sql += this.buildReferenceSQL(attribute.references);
  }

  return sql;
}

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
}

buildAttributeSQL(type, attribute) {
  let sql = type + '';

  if (attribute.type instanceof DataTypes.ARRAY && attribute.type.type instanceof DataTypes.ENUM) {
    sql += '[]';
  }

  return sql;
}

buildReferenceSQL(references) {
  const referencesTable = this.quoteTable(references.model);
  let referencesKey;

  if (references.key) {
    referencesKey = this.quoteIdentifiers(references.key);
  } else {
    referencesKey = this.quoteIdentifier('id');
  }

  let sql = ` REFERENCES ${referencesTable} (${referencesKey})`;

  if (references.onDelete) {
    sql += ' ON DELETE ' + references.onDelete.toUpperCase();
  }

  if (references.onUpdate) {
    sql += ' ON UPDATE ' + references.onUpdate.toUpperCase();
  }

  if (references.deferrable) {
    sql += ' ' + references.deferrable.toString(this);
  }

  return sql;
}