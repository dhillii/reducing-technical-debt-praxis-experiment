'use strict';

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
 * Add timestamp attributes to the definition if the model has timestamps.
 */
const handleTimestamps = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }
};

/**
 * Remove timestamp attributes from the definition after migration.
 */
const removeTimestampsFromAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

/**
 * Handle polymorphic relations by creating or updating the morph tables.
 */
const handleMorphRelations = async (
  definition,
  loadedModel,
  ORM,
  model,
  connection,
  context
) => {
  const morphRelations = definition.associations.filter((association) =>
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

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
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
 * Handle many-to-many relations by creating or updating the join tables.
 */
const handleManyRelations = async (
  definition,
  loadedModel,
  ORM,
  model,
  connection,
  context
) => {
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

    const table = manyRelation.tableCollectionName;

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
    }
  }
};

/**
 * Main migration function that orchestrates the schema migration.
 */
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  handleTimestamps(definition, loadedModel);

  if (connection.options && connection.options.autoMigration !== false) {
    await createOrUpdateTable(
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

  await handleMorphRelations(definition, loadedModel, ORM, model, connection, context);
  await handleManyRelations(definition, loadedModel, ORM, model, connection, context);

  removeTimestampsFromAttributes(definition, loadedModel);
};

/**
 * Retrieve column existence information.
 */
const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

/**
 * Determine if a column should be created based on attribute definition.
 */
const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find((association) => association.alias === name);
    if (!relation) return false;
    if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) return true;
    return false;
  }

  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

/**
 * Generate a unique column name for constraints.
 */
const uniqueColName = (table, key) => `${table}_${key}_unique`;

/**
 * Build the column type based on attribute definition.
 */
const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find((association) => association.alias === name);
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
    case 'uid':
      table.unique(name);
      return table.string(name);
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
      if (definition.client !== 'sqlite3' && tableExists) return col;
      return col.defaultTo(ORM.knex.fn.now());
    }
    case 'boolean':
      return table.boolean(name);
    default:
      return null;
  }
};

/**
 * Create the primary key column based on the definition.
 */
const createIdType = (table, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return table
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }
  return table.increments('id');
};

/**
 * Create or update columns in a table.
 */
const createColumns = (tbl, columns, definition, ORM, model, opts = {}) => {
  const { tableExists, alter = false } = opts;
  Object.keys(columns).forEach((key) => {
    const attribute = columns[key];
    const col = buildColType({
      name: key,
      attribute,
      table: tbl,
      tableExists,
      definition,
      ORM,
    });
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
        tbl.unique(key, uniqueColName(table, key));
      }
    }

    if (alter) {
      col.alter();
    }
  });
};

/**
 * Helper to alter columns.
 */
const alterColumns = (tbl, columns, definition, ORM, model, opts = {}) => {
  createColumns(tbl, columns, definition, ORM, model, { ...opts, alter: true });
};

/**
 * Create a new table.
 */
const createTable = async (table, attributes, definition, ORM, model) => {
  await ORM.knex.schema.createTable(table, (tbl) => {
    createIdType(tbl, definition);
    createColumns(tbl, attributes, definition, ORM, model, { tableExists: false });
  });
};

/**
 * Add missing columns to an existing table.
 */
const addMissingColumns = async (table, attributes, definition, ORM, model) => {
  const attributesNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributesNames.map((name) => getColumnInfo(name, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter((info) => !info.exists).map((info) => info.columnName);
  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, (tbl) => {
      createColumns(tbl, columnsToAdd, definition, ORM, model, { tableExists: true });
    });
  }
};

/**
 * Determine if the table needs to be rebuilt or altered.
 */
const shouldRebuildTable = async (table, attributes, definition, ORM, context) => {
  const attributesNames = Object.keys(attributes);
  const attrsNameWithoutTimestamps = attributesNames.filter(
    (columnName) => !(definition.options.timestamps || []).includes(columnName)
  );
  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsNameWithoutTimestamps,
    definition,
    ORM
  );
  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);
  return { shouldRebuild, columnsToAlter };
};

/**
 * Handle unique constraint errors during migration.
 */
const handleUniqueConstraintError = (err, definition) => {
  if (err.message.includes('UNIQUE constraint failed')) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
    );
  } else if (definition.client === 'pg' && err.code === '23505') {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t- ${err.detail}`
    );
  } else if (definition.client === 'mysql' && err.errno === 1062) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.sqlMessage}`
    );
  } else {
    strapi.log.error(`Migration failed`);
    strapi.log.error(err);
  }
};

/**
 * Rebuild a table for SQLite by renaming, recreating, and copying data.
 */
const rebuildSqliteTable = async (table, attributes, definition, ORM, model, context) => {
  const tmpTable = `tmp_${table}`;
  const rebuildTableFn = async (trx) => {
    await trx.schema.renameTable(table, tmpTable);
    await Promise.all(
      Object.keys(attributes).map((key) =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );
    await createTable(table, attributes, definition, ORM, model);
    const attrs = Object.keys(attributes).filter((name) =>
      isColumn({ definition, attribute: attributes[name], name })
    );
    const allAttrs = ['id', ...attrs];
    await trx.insert((qb) => qb.select(allAttrs).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  };

  try {
    await ORM.knex.transaction((trx) => rebuildTableFn(trx));
  } catch (err) {
    handleUniqueConstraintError(err, definition);
    return false;
  }
};

/**
 * Rebuild a table for non-SQLite databases by dropping unique constraints and altering columns.
 */
const rebuildNonSqliteTable = async (
  table,
  attributes,
  definition,
  ORM,
  model,
  context,
  columnsToAlter
) => {
  const alterTableFn = async (trx) => {
    await Promise.all(
      columnsToAlter.map((col) =>
        ORM.knex.schema
          .alterTable(table, (tbl) => {
            tbl.dropUnique(col, uniqueColName(table, col));
          })
          .catch(() => {})
      )
    );
    await trx.schema.alterTable(table, (tbl) => {
      alterColumns(tbl, _.pick(attributes, columnsToAlter), definition, ORM, model, { tableExists: true });
    });
  };

  try {
    await ORM.knex.transaction((trx) => alterTableFn(trx));
  } catch (err) {
    handleUniqueConstraintError(err, definition);
    return false;
  }
};

/**
 * Rebuild or alter the table based on the database type.
 */
const rebuildTable = async (
  table,
  attributes,
  definition,
  ORM,
  model,
  context,
  columnsToAlter
) => {
  if (definition.client === 'sqlite3') {
    await rebuildSqliteTable(table, attributes, definition, ORM, model, context);
  } else {
    await rebuildNonSqliteTable(table, attributes, definition, ORM, model, context, columnsToAlter);
  }
};

/**
 * Alter the table if there are columns to change.
 */
const alterTableIfNeeded = async (
  table,
  attributes,
  definition,
  ORM,
  model,
  context,
  columnsToAlter
) => {
  if (columnsToAlter.length === 0) return;

  const alterTableFn = async (trx) => {
    await trx.schema.alterTable(table, (tbl) => {
      alterColumns(tbl, _.pick(attributes, columnsToAlter), definition, ORM, model, { tableExists: true });
    });
  };

  try {
    await ORM.knex.transaction((trx) => alterTableFn(trx));
  } catch (err) {
    handleUniqueConstraintError(err, definition);
    return false;
  }
};

/**
 * Main function to create or update a table.
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createTable(table, attributes, definition, ORM, model);
    return;
  }

  await addMissingColumns(table, attributes, definition, ORM, model);

  const { shouldRebuild, columnsToAlter } = await shouldRebuildTable(
    table,
    attributes,
    definition,
    ORM,
    context
  );

  if (shouldRebuild) {
    await rebuildTable(table, attributes, definition, ORM, model, context, columnsToAlter);
  } else {
    await alterTableIfNeeded(table, attributes, definition, ORM, model, context, columnsToAlter);
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