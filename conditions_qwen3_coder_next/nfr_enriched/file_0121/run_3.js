createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
    const { primaryKeys, foreignKeys, attrStr } = this._processAttributesForCreateTable(attributes);
    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ')
    };

    this._addUniqueConstraints(values, options);
    this._addPrimaryKeyConstraint(values, primaryKeys);
    this._addForeignKeyConstraints(values, foreignKeys);

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  _processAttributesForCreateTable(attributes) {
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

  _addUniqueConstraints(values, options) {
    if (!options || !options.uniqueKeys) return;

    _.each(options.uniqueKeys, (columns, indexName) => {
      if (columns.customIndex) {
        if (!_.isString(indexName)) {
          indexName = 'uniq_' + values.table.replace(/[\[\]]/g, '') + '_' + columns.fields.join('_');
        }
        values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
      }
    });
  },

  _addPrimaryKeyConstraint(values, primaryKeys) {
    if (primaryKeys.length > 0) {
      const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }
  },

  _addForeignKeyConstraints(values, foreignKeys) {
    for (const fkey in foreignKeys) {
      if (foreignKeys.hasOwnProperty(fkey)) {
        values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
      }
    }
  },