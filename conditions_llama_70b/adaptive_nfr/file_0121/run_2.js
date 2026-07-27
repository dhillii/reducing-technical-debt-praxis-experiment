createTableQuery(tableName, attributes, options) {
  const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
  const primaryKeys = [];
  const foreignKeys = {};
  const attrStr = [];

  if (!attributes) {
    return _.template(query, this._templateSettings)({
      table: this.quoteTable(tableName),
      attributes: ''
    }).trim() + ';';
  }

  for (const attr in attributes) {
    if (attributes.hasOwnProperty(attr)) {
      const dataType = attributes[attr];
      let match;

      if (isPrimaryKey(dataType)) {
        primaryKeys.push(attr);

        if (isForeignKey(dataType)) {
          match = dataType.match(/^(.+) (REFERENCES.*)$/);
          attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
          foreignKeys[attr] = match[2];
        } else {
          attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
        }
      } else if (isForeignKey(dataType)) {
        match = dataType.match(/^(.+) (REFERENCES.*)$/);
        attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
        foreignKeys[attr] = match[2];
      } else {
        attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
      }
    }
  }

  const values = {
    table: this.quoteTable(tableName),
    attributes: attrStr.join(', ')
  };

  const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');

  if (options.uniqueKeys) {
    addUniqueKeys(options.uniqueKeys, values, tableName);
  }

  if (pkString.length > 0) {
    values.attributes += `, PRIMARY KEY (${pkString})`;
  }

  for (const fkey in foreignKeys) {
    if (foreignKeys.hasOwnProperty(fkey)) {
      values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
    }
  }

  return _.template(query, this._templateSettings)(values).trim() + ';';
}

function isPrimaryKey(dataType) {
  return _.includes(dataType, 'PRIMARY KEY');
}

function isForeignKey(dataType) {
  return _.includes(dataType, 'REFERENCES');
}

function addUniqueKeys(uniqueKeys, values, tableName) {
  _.each(uniqueKeys, (columns, indexName) => {
    if (columns.customIndex) {
      if (!_.isString(indexName)) {
        indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
      }
      values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
    }
  });
}