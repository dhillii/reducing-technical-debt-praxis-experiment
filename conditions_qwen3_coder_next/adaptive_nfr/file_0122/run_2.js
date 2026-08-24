return fragment;
  },

  attributeToSQL(attribute, options = {}) {
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    const context = options.context || '';
    return this._attributeToSQL(attribute, context);
  },

  _attributeToSQL(attribute, context) {
    let type;
    if (
      attribute.type instanceof DataTypes.ENUM ||
      (attribute.type instanceof DataTypes.ARRAY && attribute.type.type instanceof DataTypes.ENUM)
    ) {
      type = this._getEnumType(attribute);
    }

    if (!type) {
      type = attribute.type;
    }

    const sql = [type];
    this._applyNotNullAttribute(sql, attribute);
    this._applyAutoIncrement(sql, attribute);
    this._applyDefaultValue(sql, attribute);
    this._applyUniqueAttribute(sql, attribute);
    this._applyPrimaryKeyAttribute(sql, attribute);
    this._applyReferencesAttribute(sql, attribute);

    return sql.join(' ');
  },

  _getEnumType(attribute) {
    const enumType = attribute.type.type || attribute.type;
    let values = attribute.values;

    if (enumType.values && !attribute.values) {
      values = enumType.values;
    }

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Values for ENUM haven't been defined.");
    }

    let type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

    if (attribute.type instanceof DataTypes.ARRAY) {
      type += '[]';
    }

    return type;
  },

  _applyNotNullAttribute(sql, attribute) {
    if (attribute.hasOwnProperty('allowNull') && !attribute.allowNull) {
      sql.push('NOT NULL');
    }
  },

  _applyAutoIncrement(sql, attribute) {
    if (attribute.autoIncrement) {
      sql.push('SERIAL');
    }
  },

  _applyDefaultValue(sql, attribute) {
    if (Utils.defaultValueSchemable(attribute.defaultValue)) {
      sql.push('DEFAULT ' + this.escape(attribute.defaultValue, attribute));
    }
  },

  _applyUniqueAttribute(sql, attribute) {
    if (attribute.unique === true) {
      sql.push('UNIQUE');
    }
  },

  _applyPrimaryKeyAttribute(sql, attribute) {
    if (attribute.primaryKey) {
      sql.push('PRIMARY KEY');
    }
  },

  _applyReferencesAttribute(sql, attribute) {
    if (!attribute.references) return;

    const table = this.quoteTable(attribute.references.model);
    let column = attribute.references.key
      ? this.quoteIdentifiers(attribute.references.key)
      : this.quoteIdentifier('id');

    sql.push(`REFERENCES ${table} (${column})`);

    if (attribute.onDelete) {
      sql.push('ON DELETE ' + attribute.onDelete.toUpperCase());
    }

    if (attribute.onUpdate) {
      sql.push('ON UPDATE ' + attribute.onUpdate.toUpperCase());
    }

    if (attribute.references.deferrable) {
      sql.push(attribute.references.deferrable.toString(this));
    }
  },

  deferConstraintsQuery(options) {
    return options.deferrable.toString(this);
  },

  setConstraintQuery(columns, type) {
    let columnFragment = 'ALL';

    if (columns) {
      columnFragment = columns.map(column => this.quoteIdentifier(column)).join(', ');
    }

    return 'SET CONSTRAINTS ' + columnFragment + ' ' + type;
  },

  setDeferredQuery(columns) {
    return this.setConstraintQuery(columns, 'DEFERRED');
  },

  setImmediateQuery(columns) {
    return this.setConstraintQuery(columns, 'IMMEDIATE');
  },

  attributesToSQL(attributes, options = {}) {
    const result = {};

    for (const key in attributes) {
      const attribute = attributes[key];
      result[attribute.field || key] = this.attributeToSQL(attribute, options);
    }

    return result;
  },