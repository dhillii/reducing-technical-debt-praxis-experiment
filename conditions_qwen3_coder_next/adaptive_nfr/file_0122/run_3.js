return fragment;
  },

  // Wrapper to preserve public API while internally using a parameter object
  attributeToSQL(attribute, options) {
    if (!_.isPlainObject(attribute)) {
      attribute = { type: attribute };
    }
    const params = new AttributeToSQLParams(attribute, options || {});
    return this._attributeToSQLInternal(params);
  },

  _attributeToSQLInternal(params) {
    let type;
    if (params.isEnum() || params.isArrayOfEnum()) {
      type = this._processEnumType(params);
    }

    if (!type) {
      type = params.attribute.type;
    }

    let sql = type + '';

    if (params.attribute.allowNull === false) {
      sql += ' NOT NULL';
    }

    if (params.attribute.autoIncrement) {
      sql += ' SERIAL';
    }

    if (Utils.defaultValueSchemable(params.attribute.defaultValue)) {
      sql += ' DEFAULT ' + this.escape(params.attribute.defaultValue, params.attribute);
    }

    if (params.attribute.unique === true) {
      sql += ' UNIQUE';
    }

    if (params.attribute.primaryKey) {
      sql += ' PRIMARY KEY';
    }

    if (params.attribute.references) {
      sql += this._buildReferencesClause(params.attribute.references);
    }

    return sql;
  },

  _processEnumType(params) {
    const enumType = params.attribute.type.type || params.attribute.type;
    let values = params.attribute.values;

    if (enumType.values && !params.attribute.values) {
      values = enumType.values;
    }

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Values for ENUM haven't been defined.");
    }

    let type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

    if (params.isArrayOfEnum()) {
      type += '[]';
    }

    return type;
  },

  _buildReferencesClause(references) {
    let sql = '';
    const referencesTable = this.quoteTable(references.model);

    let referencesKey;
    if (references.key) {
      referencesKey = this.quoteIdentifiers(references.key);
    } else {
      referencesKey = this.quoteIdentifier('id');
    }

    sql += ` REFERENCES ${referencesTable} (${referencesKey})`;

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
  },

class AttributeToSQLParams {
  constructor(attribute, options) {
    this.attribute = attribute;
    this.options = options;
  }

  isEnum() {
    return this.attribute.type instanceof DataTypes.ENUM;
  }

  isArrayOfEnum() {
    return this.attribute.type instanceof DataTypes.ARRAY &&
           this.attribute.type.type instanceof DataTypes.ENUM;
  }
}