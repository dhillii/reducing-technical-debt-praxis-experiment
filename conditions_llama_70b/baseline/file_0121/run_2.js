createTableQuery(tableName, attributes, options) {
  const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)",
    primaryKeys = [],
    foreignKeys = {},
    attrStr = [];

  Object.keys(attributes).forEach(attr => {
    const dataType = attributes[attr];
    let match;

    if (dataType.includes('PRIMARY KEY')) {
      primaryKeys.push(attr);

      if (dataType.includes('REFERENCES')) {
        match = dataType.match(/^(.+) (REFERENCES.*)$/);
        attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
        foreignKeys[attr] = match[2];
      } else {
        attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
      }
    } else if (dataType.includes('REFERENCES')) {
      match = dataType.match(/^(.+) (REFERENCES.*)$/);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
      foreignKeys[attr] = match[2];
    } else {
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
    }
  });

  const values = {
    table: this.quoteTable(tableName),
    attributes: attrStr.join(', ')
  };

  const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');

  if (options.uniqueKeys) {
    Object.keys(options.uniqueKeys).forEach(indexName => {
      const columns = options.uniqueKeys[indexName];
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

  Object.keys(foreignKeys).forEach(fkey => {
    values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
  });

  return _.template(query, this._templateSettings)(values).trim() + ';';
}