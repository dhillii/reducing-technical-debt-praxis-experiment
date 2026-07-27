createTableQuery(tableName, attributes, options) {
  const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
  const values = this._createTableQueryValues(tableName, attributes, options);
  return _.template(query, this._templateSettings)(values).trim() + ';';
}

_createTableQueryValues(tableName, attributes, options) {
  const primaryKeys = [];
  const foreignKeys = {};
  const attrStr = this._createTableQueryAttributes(attributes, primaryKeys, foreignKeys);

  const values = {
    table: this.quoteTable(tableName),
    attributes: attrStr.join(', ')
  };

  this._addUniqueKeys(values, options.uniqueKeys, tableName);
  this._addPrimaryKey(values, primaryKeys);
  this._addForeignKeys(values, foreignKeys);

  return values;
}

_createTableQueryAttributes(attributes, primaryKeys, foreignKeys) {
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

  return attrStr;
}

_addUniqueKeys(values, uniqueKeys, tableName) {
  if (uniqueKeys) {
    _.each(uniqueKeys, (columns, indexName) => {
      if (columns.customIndex) {
        if (!_.isString(indexName)) {
          indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
        }
        values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
      }
    });
  }
}

_addPrimaryKey(values, primaryKeys) {
  const pkString = primaryKeys.map(pk => { return this.quoteIdentifier(pk); }).join(', ');

  if (pkString.length > 0) {
    values.attributes += `, PRIMARY KEY (${pkString})`;
  }
}

_addForeignKeys(values, foreignKeys) {
  for (const fkey in foreignKeys) {
    if (foreignKeys.hasOwnProperty(fkey)) {
      values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
    }
  }
}