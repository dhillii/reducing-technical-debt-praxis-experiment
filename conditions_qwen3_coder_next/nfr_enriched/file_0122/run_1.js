return fragment;
  },

  attributeToSQL(attribute, options) {
    if (!_.isPlainObject(attribute)) {
      attribute = { type: attribute };
    }

    const type = this._getAttributeType(attribute);
    const sql = [type];

    this._applyNotNullConstraint(sql, attribute);
    this._applyAutoIncrement(sql, attribute);
    this._applyDefaultValue(sql, attribute);
    this._applyUniqueConstraint(sql, attribute);
    this._applyPrimaryKeyConstraint(sql, attribute);
    this._applyReferences(sql, attribute);

    return sql.join(' ');
  },

  _getAttributeType(attribute) {
    if (
      attribute.type instanceof DataTypes.ENUM ||
      (attribute.type instanceof DataTypes.ARRAY && attribute.type.type instanceof DataTypes.ENUM)
    ) {
      const enumType = attribute.type.type || attribute.type;
      const values = attribute.values || (enumType.values || []);

      if (!Array.isArray(values) || values.length === 0) {
        throw new Error("Values for ENUM haven't been defined.");
      }

      let type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

      if (attribute.type instanceof DataTypes.ARRAY) {
        type += '[]';
      }

      return type;
    }

    return attribute.type;
  },

  _applyNotNullConstraint(sql, attribute) {
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

  _applyUniqueConstraint(sql, attribute) {
    if (attribute.unique === true) {
      sql.push('UNIQUE');
    }
  },

  _applyPrimaryKeyConstraint(sql, attribute) {
    if (attribute.primaryKey) {
      sql.push('PRIMARY KEY');
    }
  },

  _applyReferences(sql, attribute) {
    if (!attribute.references) return;

    const referencesTable = this.quoteTable(attribute.references.model);
    const referencesKey = attribute.references.key
      ? this.quoteIdentifiers(attribute.references.key)
      : this.quoteIdentifier('id');

    sql.push(`REFERENCES ${referencesTable} (${referencesKey})`);

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