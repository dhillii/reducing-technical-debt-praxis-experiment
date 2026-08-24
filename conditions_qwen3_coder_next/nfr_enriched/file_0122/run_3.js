return fragment;
  },

  attributeToSQL(attribute, options = {}) {
    if (!_.isPlainObject(attribute)) {
      attribute = { type: attribute };
    }

    return this.buildAttributeSQL(attribute);
  },

  buildAttributeSQL(attribute) {
    const enumType = this.getEnumType(attribute);
    const type = enumType || attribute.type;
    let sql = type.toString();

    sql = this.addConstraints(sql, attribute);
    sql = this.addReferences(sql, attribute);

    return sql;
  },

  getEnumType(attribute) {
    if (
      !(attribute.type instanceof DataTypes.ENUM) &&
      !(
        attribute.type instanceof DataTypes.ARRAY &&
        attribute.type.type instanceof DataTypes.ENUM
      )
    ) {
      return null;
    }

    const enumType = attribute.type.type || attribute.type;
    const values = attribute.values || (enumType.values && enumType.values);

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Values for ENUM haven't been defined.");
    }

    const enumSQL = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';
    return attribute.type instanceof DataTypes.ARRAY ? enumSQL + '[]' : enumSQL;
  },

  addConstraints(sql, attribute) {
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

    return sql;
  },

  addReferences(sql, attribute) {
    if (!attribute.references) {
      return sql;
    }

    const referencesTable = this.quoteTable(attribute.references.model);
    const referencesKey = attribute.references.key
      ? this.quoteIdentifiers(attribute.references.key)
      : this.quoteIdentifier('id');

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

    return sql;
  },