attributeToSQL(attribute) {
    if (!_.isPlainObject(attribute)) {
      attribute = { type: attribute };
    }

    const typeSql = this._buildTypeSql(attribute);
    const constraintsSql = this._buildConstraintsSql(attribute);
    const referenceSql = this._buildReferenceSql(attribute);

    return `${typeSql}${constraintsSql}${referenceSql}`;
  },

  /**
   * Builds the SQL fragment for the column type, handling ENUM and ARRAY types.
   * @private
   */
  _buildTypeSql(attribute) {
    let type;
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
        type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';
        if (attribute.type instanceof DataTypes.ARRAY) {
          type += '[]';
        }
      } else {
        throw new Error("Values for ENUM haven't been defined.");
      }
    }

    if (!type) {
      type = attribute.type;
    }

    let sql = type + '';

    if (attribute.hasOwnProperty('allowNull') && !attribute.allowNull) {
      sql += ' NOT NULL';
    }

    if (attribute.autoIncrement) {
      sql += ' SERIAL';
    }

    return sql;
  },

  /**
   * Builds the SQL fragment for default values, uniqueness, primary key, and other constraints.
   * @private
   */
  _buildConstraintsSql(attribute) {
    let sql = '';

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

  /**
   * Builds the SQL fragment for foreign key references and actions.
   * @private
   */
  _buildReferenceSql(attribute) {
    if (!attribute.references) {
      return '';
    }

    const referencesTable = this.quoteTable(attribute.references.model);
    const referencesKey = attribute.references.key
      ? this.quoteIdentifiers(attribute.references.key)
      : this.quoteIdentifier('id');

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