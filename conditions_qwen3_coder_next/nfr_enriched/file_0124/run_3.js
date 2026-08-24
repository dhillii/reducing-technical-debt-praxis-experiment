const _ = require('lodash');
const { singular } = require('pluralize');
const { contentTypes: contentTypesUtils } = require('strapi-utils');

const {
  getDefinitionFromStore,
  storeDefinition,
  getColumnsWhereDefinitionChanged,
} = require('./utils/store-definition');
const { getManyRelations } = require('./utils/associations');

/**
 * Adds timestamp fields to definition if model has timestamps enabled.
 */
const addTimestampsToDefinition = (loadedModel, definition) => {
  if (!loadedModel.hasTimestamps) return;

  definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
  definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
};

/**
 * Removes timestamp fields from definition after table creation.
 */
const removeTimestampsFromDefinition = (loadedModel, definition) => {
  if (!loadedModel.hasTimestamps) return;

  delete definition.attributes[loadedModel.hasTimestamps[0]];
  delete definition.attributes[loadedModel.hasTimestamps[1]];
};

/**
 * Creates or updates a single table with given attributes.
 */
const processTableMigration = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);
  const createIdType = tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      return tbl
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }
    return tbl.increments('id');
  };

  const createColumns = (tbl, cols, opts = {}) => {
    const { tableExists, alter = false } = opts;
    Object.keys(cols).forEach(key => {
      const attribute = cols[key];
      const col = buildColType({ name: key, attribute, table: tbl, tableExists, definition, ORM });
      if (!col) return;

      if (attribute.required === true) {
        if (
          (definition.client !== 'sqlite3' || !tableExists) &&
          !contentTypesUtils.hasDraftAndPublish(model) &&
          definition.modelType !== 'component'
        ) {
          col.notNullable();
        }
      } else {
        col.nullable();
      }

      if (attribute.unique === true) {
        if (definition.client !== 'sqlite3' || !tableExists) {
          tbl.unique(key, `${table}_${key}_unique`);
        }
      }

      if (alter) {
        col.alter();
      }
    });
  };

  const createTable = (table, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(table, tbl => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...opts, tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attributesNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributesNames.map(attributeName => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter(info => !info.exists).map(info => info.columnName);
  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, columnsToAdd, { tableExists });
    });
  }

  const attrsNameWithoutTimestamps = attributesNames.filter(
    columnName => !(definition.options.timestamps || []).includes(columnName)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsNameWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (shouldRebuild) {
    await handleTableRebuild({
      table,
      attributes,
      attributesNames,
      columnsToAlter,
      definition,
      ORM,
      model,
      context,
    });
  }
};

/**
 * Handles table rebuild logic for SQLite and other databases.
 */
const handleTableRebuild = async ({ table, attributes, attributesNames, columnsToAlter, definition, ORM, model, context }) => {
  if (definition.client === 'sqlite3') {
    return await handleSqliteRebuild({ table, attributes, attributesNames, definition, ORM, context });
  }
  return await handleNonSqliteRebuild({ table, attributes, columnsToAlter, definition, ORM, context });
};

/**
 * Handles SQLite-specific table rebuild.
 */
const handleSqliteRebuild = async ({ table, attributes, attributesNames, definition, ORM, context }) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key => trx.raw('DROP INDEX IF EXISTS ??', `${table}_${key}_unique`))
    );

    await createTableForRebuild(table, attributes, definition, ORM, trx);

    const attrs = attributesNames.filter(attributeName =>
      isColumn({ definition, attribute: attributes[attributeName], name: attributeName })
    );
    const allAttrs = ['id', ...attrs];

    await trx.insert(qb => qb.select(allAttrs).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  };

  try {
    await ORM.knex.transaction(trx => rebuildTable(trx));
  } catch (err) {
    handleMigrationError(err, definition);
    return false;
  }
};

/**
 * Handles non-SQLite table rebuild.
 */
const handleNonSqliteRebuild = async ({ table, attributes, columnsToAlter, definition, ORM, context }) => {
  const alterTable = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, `${table}_${col}_unique`))
          .catch(() => {})
      )
    );
    await trx.schema.alterTable(table, tbl => {
      createColumnsForAlter(tbl, _.pick(attributes, columnsToAlter), {
        tableExists: true,
        definition,
        ORM,
      });
    });
  };

  try {
    await ORM.knex.transaction(trx => alterTable(trx));
  } catch (err) {
    handleMigrationError(err, definition);
    return false;
  }
};

/**
 * Creates table with ID and columns for rebuild.
 */
const createTableForRebuild = (table, attributes, definition, ORM, trx) => {
  return trx.schema.createTable(table, tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      tbl.specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    } else {
      tbl.increments('id');
    }
    createColumnsForAlter(tbl, attributes, { tableExists: false, definition, ORM });
  });
};

/**
 * Creates columns for alter operations.
 */
const createColumnsForAlter = (tbl, columns, opts) => {
  const { tableExists, definition, ORM } = opts;
  Object.keys(columns).forEach(key => {
    const attribute = columns[key];
    const col = buildColType({ name: key, attribute, table: tbl, tableExists, definition, ORM });
    if (!col) return;

    if (attribute.required === true) {
      if (
        (definition.client !== 'sqlite3' || !tableExists) &&
        !contentTypesUtils.hasDraftAndPublish({ modelType: definition.modelType }) &&
        definition.modelType !== 'component'
      ) {
        col.notNullable();
      }
    } else {
      col.nullable();
    }

    if (attribute.unique === true) {
      if (definition.client !== 'sqlite3' || !tableExists) {
        tbl.unique(key, `${tbl.tableName}_${key}_unique`);
      }
    }

    col.alter();
  });
};

/**
 * Handles migration errors and logs appropriately.
 */
const handleMigrationError = (err, definition) => {
  if (err.message?.includes('UNIQUE constraint failed') || (err.code === '23505' && definition.client === 'pg') || (definition.client === 'mysql' && err.errno === 1062)) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message || err.detail || err.sqlMessage}`
    );
  } else {
    strapi.log.error('Migration failed');
    strapi.log.error(err);
  }
};

/**
 * Processes polymorphic relations and creates join tables.
 */
const processPolymorphicRelations = async ({ loadedModel, definition, connection, ORM, model }, context) => {
  const morphRelations = definition.associations.filter(association =>
    association.nature.toLowerCase().includes('morphto')
  );

  for (const morphRelation of morphRelations) {
    const attributes = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
      [`${morphRelation.alias}_type`]: { type: 'text' },
      [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

    if (connection.options?.autoMigration !== false) {
      await processTableMigration(
        {
          table: `${loadedModel.tableName}_morph`,
          attributes,
          definition,
          ORM,
          model,
        },
        context
      );
    }
  }
};

/**
 * Processes many-to-many relations and creates join tables.
 */
const processManyToManyRelations = async ({ definition, connection, ORM, model }, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    const { plugin, collection, via, dominant, alias } = manyRelation;

    if (!dominant) continue;

    const targetCollection = strapi.db.getModel(collection, plugin);
    const targetAttr = via
      ? targetCollection.attributes[via]
      : { attribute: singular(definition.collectionName), column: definition.primaryKey };

    const defAttr = definition.attributes[alias];
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;

    if (rootCol === targetCol) {
      rootCol = `related_${rootCol}`;
    }

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (connection.options?.autoMigration !== false) {
      await processTableMigration(
        {
          table: manyRelation.tableCollectionName,
          attributes,
          definition,
          ORM,
          model,
        },
        context
      );
    }
  }
};

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  addTimestampsToDefinition(loadedModel, definition);

  if (connection.options?.autoMigration !== false) {
    await processTableMigration(
      {
        table: loadedModel.tableName,
        attributes: definition.attributes,
        definition,
        ORM,
        model,
      },
      context
    );
  }

  await processPolymorphicRelations({ loadedModel, definition, connection, ORM, model }, context);
  await processManyToManyRelations({ definition, connection, ORM, model }, context);

  removeTimestampsFromDefinition(loadedModel, definition);
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(association => association.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }

  if (['component', 'dynamiczone'].includes(attribute.type)) {
    return false;
  }

  return true;
};

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find(association => association.alias === name);
    if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) {
      return buildColType({
        name,
        attribute: { type: definition.primaryKeyType },
        table,
        tableExists,
        definition,
        ORM,
      });
    }
    return null;
  }

  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  switch (attribute.type) {
    case 'uuid':
      return table.uuid(name);
    case 'uid': {
      table.unique(name);
      return table.string(name);
    }
    case 'richtext':
    case 'text':
      return table.text(name, 'longtext');
    case 'json':
      return definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext');
    case 'enumeration':
    case 'string':
    case 'password':
    case 'email':
      return table.string(name);
    case 'integer':
      return table.integer(name);
    case 'biginteger':
      return table.bigInteger(name);
    case 'float':
      return table.double(name);
    case 'decimal':
      return table.decimal(name, 10, 2);
    case 'date':
      return table.date(name);
    case 'time':
      return table.time(name, 3);
    case 'datetime':
      return table.datetime(name);
    case 'timestamp':
      return table.timestamp(name);
    case 'currentTimestamp': {
      const col = table.timestamp(name);
      if (definition.client !== 'sqlite3' && tableExists) {
        return col;
      }
      return col.defaultTo(ORM.knex.fn.now());
    }
    case 'boolean':
      return table.boolean(name);
    default:
      return null;
  }
};

module.exports = async ({ ORM, loadedModel, definition, connection, model }) => {
  const previousDefinition = await getDefinitionFromStore(definition, ORM);

  await strapi.db.migrations.run(migrateSchemas, {
    ORM,
    loadedModel,
    previousDefinition,
    definition,
    connection,
    model,
  });

  await storeDefinition(definition, ORM);
};