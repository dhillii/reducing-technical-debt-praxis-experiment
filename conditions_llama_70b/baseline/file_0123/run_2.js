dropAllTables(options) {
  options = options || {};
  const skip = options.skip || [];

  const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
    if (skip.indexOf(tableName.tableName || tableName) === -1) {
      return this.dropTable(tableName, _.assign({}, options, { cascade: true }) );
    }
  });

  return this.showAllTables(options).then(tableNames => {
    if (this.sequelize.options.dialect === 'sqlite') {
      return this.sequelize.query('PRAGMA foreign_keys;', options).then(result => {
        const foreignKeysAreEnabled = result.foreign_keys === 1;

        if (foreignKeysAreEnabled) {
          return this.sequelize.query('PRAGMA foreign_keys = OFF', options)
            .then(() => dropAllTables(tableNames))
            .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', options));
        } else {
          return dropAllTables(tableNames);
        }
      });
    } else {
      return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
        const promises = this.dropForeignKeys(foreignKeys, tableNames, options);
        return Promise.all(promises).then(() => dropAllTables(tableNames));
      });
    }
  });
}

dropForeignKeys(foreignKeys, tableNames, options) {
  const promises = [];

  tableNames.forEach(tableName => {
    let normalizedTableName = tableName;
    if (_.isObject(tableName)) {
      normalizedTableName = tableName.schema + '.' + tableName.tableName;
    }

    foreignKeys[normalizedTableName].forEach(foreignKey => {
      const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
      promises.push(this.sequelize.query(sql, options));
    });
  });

  return promises;
}