createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)",
      primaryKeys = [],
      foreignKeys = {},
      attrStr = [];

    _.forOwn(attributes, (dataType, attr) => {
      let base = dataType;
      let ref = null;

      // Extract REFERENCES clause if present
      if (_.includes(base, 'REFERENCES')) {
        const match = base.match(/^(.+?)\s+(REFERENCES.*)$/);
        if (match) {
          base = match[1];
          ref = match[2];
        }
      }

      // Detect PRIMARY KEY
      const isPrimary = _.includes(base, 'PRIMARY KEY');
      if (isPrimary) {
        primaryKeys.push(attr);
        base = base.replace(/PRIMARY KEY/, '').trim();
      }

      attrStr.push(`${this.quoteIdentifier(attr)} ${base}`);

      if (ref) {
        foreignKeys[attr] = ref;
      }
    });

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ')
    };
    const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');

    if (options.uniqueKeys) {
      _.forOwn(options.uniqueKeys, (columns, indexName) => {
        if (columns.customIndex) {
          if (!_.isString(indexName)) {
            indexName = `uniq_${tableName}_${columns.fields.join('_')}`;
          }
          values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }

    if (pkString.length > 0) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }

    _.forOwn(foreignKeys, (ref, fkey) => {
      values.attributes += `, FOREIGN KEY (${this.quoteIdentifier(fkey)}) ${ref}`;
    });

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },