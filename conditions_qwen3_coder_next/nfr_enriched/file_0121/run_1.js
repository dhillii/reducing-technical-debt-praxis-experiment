createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
    const { primaryKeys, foreignKeys, attrStr } = this._processAttributes(attributes);
    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ')
    };

    this._processPrimaryKeys(primaryKeys, values);
    this._processUniqueConstraints(options, values);
    this._processForeignKeys(foreignKeys, values);

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  _processAttributes(attributes) {
    const primaryKeys = [];
    const foreignKeys = {};
    const attrStr = [];

    for (const attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        const dataType = attributes[attr];
        let match;

        if (_.includes(dataType, 'PRIMARY KEY')) {
          primaryKeys.push(attr);

          if (_.includes(dataType, 'REFERENCES')) {
            match = dataType.match(/^(.+) (REFERENCES.*)$/);
            attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
            foreignKeys[attr] = match[2];
          } else {
            attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
          }
        } else if (_.includes(dataType, 'REFERENCES')) {
          match = dataType.match(/^(.+) (REFERENCES.*)$/);
          attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
          foreignKeys[attr] = match[2];
        } else {
          attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
        }
      }
    }

    return { primaryKeys, foreignKeys, attrStr };
  },

  _processPrimaryKeys(primaryKeys, values) {
    const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');
    if (pkString.length > 0) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }
  },

  _processUniqueConstraints(options, values) {
    if (options && options.uniqueKeys) {
      _.each(options.uniqueKeys, (columns, indexName) => {
        if (columns.customIndex) {
          if (!_.isString(indexName)) {
            indexName = 'uniq_' + options.tableName + '_' + columns.fields.join('_');
          }
          values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }
  },

  _processForeignKeys(foreignKeys, values) {
    for (const fkey in foreignKeys) {
      if (foreignKeys.hasOwnProperty(fkey)) {
        values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
      }
    }
  },