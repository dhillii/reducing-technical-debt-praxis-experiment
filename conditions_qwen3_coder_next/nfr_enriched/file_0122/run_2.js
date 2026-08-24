attributeToSQL(attribute, options) {
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    const type = this._getTypeForAttribute(attribute);
    let sql = type;

    sql = this._applyNullConstraint(sql, attribute);
    sql = this._applyAutoIncrement(sql, attribute);
    sql = this._applyDefaultValue(sql, attribute);
    sql = this._applyUnique(sql, attribute);
    sql = this._applyPrimaryKey(sql, attribute);
    sql = this._applyReferences(sql, attribute);

    return sql;
  },

  _getTypeForAttribute(attribute) {
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
        const enumValueList = _.map(values, value => this.escape(value)).join(', ');
        const type = `ENUM(${enumValueList})`;

        return attribute.type instanceof DataTypes.ARRAY ? `${type}[]` : type;
      }

      throw new Error("Values for ENUM haven't been defined.");
    }

    return attribute.type;
  },

  _applyNullConstraint(sql, attribute) {
    if (attribute.hasOwnProperty('allowNull') && !attribute.allowNull) {
      return `${sql} NOT NULL`;
    }
    return sql;
  },

  _applyAutoIncrement(sql, attribute) {
    if (attribute.autoIncrement) {
      return `${sql} SERIAL`;
    }
    return sql;
  },

  _applyDefaultValue(sql, attribute) {
    if (Utils.defaultValueSchemable(attribute.defaultValue)) {
      return `${sql} DEFAULT ${this.escape(attribute.defaultValue, attribute)}`;
    }
    return sql;
  },

  _applyUnique(sql, attribute) {
    if (attribute.unique === true) {
      return `${sql} UNIQUE`;
    }
    return sql;
  },

  _applyPrimaryKey(sql, attribute) {
    if (attribute.primaryKey) {
      return `${sql} PRIMARY KEY`;
    }
    return sql;
  },

  _applyReferences(sql, attribute) {
    if (!attribute.references) {
      return sql;
    }

    const referencesTable = this.quoteTable(attribute.references.model);
    const referencesKey = attribute.references.key
      ? this.quoteIdentifiers(attribute.references.key)
      : this.quoteIdentifier('id');

    let result = `${sql} REFERENCES ${referencesTable} (${referencesKey})`;

    if (attribute.onDelete) {
      result += ` ON DELETE ${attribute.onDelete.toUpperCase()}`;
    }

    if (attribute.onUpdate) {
      result += ` ON UPDATE ${attribute.onUpdate.toUpperCase()}`;
    }

    if (attribute.references.deferrable) {
      result += ` ${attribute.references.deferrable.toString(this)}`;
    }

    return result;
  },