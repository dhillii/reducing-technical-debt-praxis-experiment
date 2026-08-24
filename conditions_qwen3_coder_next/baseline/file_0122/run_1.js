attributeToSQL(attribute) {
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    const type = this._getAttributeType(attribute);
    let sql = type || attribute.type;

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
      sql += this._getReferenceClause(attribute);
    }

    return sql;
  },

  _getAttributeType(attribute) {
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
        const type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

        if (attribute.type instanceof DataTypes.ARRAY) {
          return type + '[]';
        }

        return type;
      } else {
        throw new Error("Values for ENUM haven't been defined.");
      }
    }

    return null;
  },

  _getReferenceClause(attribute) {
    const referencesTable = this.quoteTable(attribute.references.model);
    let referencesKey;

    if (attribute.references.key) {
      referencesKey = this.quoteIdentifiers(attribute.references.key);
    } else {
      referencesKey = this.quoteIdentifier('id');
    }

    let sql = ` REFERENCES ${referencesTable} (${referencesKey})`;

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
  }