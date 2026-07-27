createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
    const primaryKeys = [];
    const foreignKeys = {};
    const attrParts = [];

    const splitDataType = dataType => {
      const refMatch = dataType.match(/(.*?)(\s+REFERENCES.*)$/);
      if (refMatch) {
        return { base: refMatch[1].trim(), ref: refMatch[2].trim() };
      }
      return { base: dataType.trim(), ref: null };
    };

    for (const attr in attributes) {
      if (!attributes.hasOwnProperty(attr)) continue;
      const dataType = attributes[attr];
      const { base, ref } = splitDataType(dataType);

      const cleanedBase = base.replace(/PRIMARY KEY/, '').trim();
      const quotedAttr = this.quoteIdentifier(attr);

      if (base.includes('PRIMARY KEY')) {
        primaryKeys.push(attr);
        attrParts.push(`${quotedAttr} ${cleanedBase}`);
        if (ref) foreignKeys[attr] = ref;
      } else {
        attrParts.push(`${quotedAttr} ${cleanedBase}`);
        if (ref) foreignKeys[attr] = ref;
      }
    }

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrParts.join(', ')
    };

    const pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');
    if (options && options.uniqueKeys) {
      _.each(options.uniqueKeys, (columns, indexName) => {
        if (columns.customIndex) {
          const constraintName = _.isString(indexName)
            ? indexName
            : `uniq_${tableName}_${columns.fields.join('_')}`;
          const fields = columns.fields.map(f => this.quoteIdentifier(f)).join(', ');
          values.attributes += `, CONSTRAINT ${this.quoteIdentifier(constraintName)} UNIQUE (${fields})`;
        }
      });
    }

    if (pkString) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }

    Object.entries(foreignKeys).forEach(([fkey, ref]) => {
      values.attributes += `, FOREIGN KEY (${this.quoteIdentifier(fkey)}) ${ref}`;
    });

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },