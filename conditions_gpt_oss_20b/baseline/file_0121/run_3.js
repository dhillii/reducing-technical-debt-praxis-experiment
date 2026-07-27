createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)",
      primaryKeys = [],
      foreignKeys = {},
      attrStr = [];

    const parseAttribute = (attr, dataType) => {
      const hasPk = _.includes(dataType, 'PRIMARY KEY');
      const hasRef = _.includes(dataType, 'REFERENCES');
      let base = dataType;
      let ref = null;

      if (hasRef) {
        const m = dataType.match(/^(.+?)\s+(REFERENCES.*)$/);
        if (m) {
          base = m[1];
          ref = m[2];
        }
      }

      if (hasPk) {
        base = base.replace(/PRIMARY KEY/, '');
        primaryKeys.push(attr);
      }

      return { base: base.trim(), ref };
    };

    for (const [attr, dataType] of Object.entries(attributes)) {
      const { base, ref } = parseAttribute(attr, dataType);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + base);
      if (ref) foreignKeys[attr] = ref;
    }

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ')
    };

    const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');
    if (options.uniqueKeys) {
      _.each(options.uniqueKeys, (columns, indexName) => {
        if (columns.customIndex) {
          if (!_.isString(indexName)) {
            indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
          }
          values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }

    if (pkString.length > 0) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }

    for (const fkey of Object.keys(foreignKeys)) {
      values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
    }

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },