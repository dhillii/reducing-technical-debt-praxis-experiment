```javascript
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
 * Add timestamp columns to definition when model has timestamps enabled.
 */
const addTimestampColumns = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  definition.attributes[created] = { type: 'currentTimestamp' };
  definition.attributes[updated] = { type: 'currentTimestamp' };
};

/**
 * Remove timestamp columns from definition after migration.
 */
const removeTimestampColumns = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  delete definition.attributes[created];
  delete definition.attributes[updated];
};

/**
 * Create or update tables for polymorphic (morph) relations.
 */
const processMorphRelations = async ({
  definition,
  loadedModel,
  connection,
  ORM,
  model,
  context,
}) => {
  const morphRelations = definition.associations.filter(a =>
    a.nature.toLowerCase().includes('morphto')
  );

  for (const rel of morphRelations) {
    const attrs = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${rel.alias}_id`]: { type: definition.primaryKeyType },
      [`${rel.alias}_type`]: { type: 'text' },
      [definition.attributes[rel.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
        {
          table: `${loadedModel.tableName}_morph`,
          attributes: attrs,
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
 * Create or update tables for many‑to‑many relations.
 */
const processManyRelations = async ({
  definition,
  connection,
  ORM,
  model,
  context,
}) => {
  const manyRelations = getManyRelations(definition);

  for (const rel of manyRelations) {
    if (!rel.dominant) continue;

    const targetModel = strapi.db.getModel(rel.collection, rel.plugin);
    const targetAttr = rel.via
      ? targetModel.attributes[rel.via]
      : {
          attribute: singular(definition.collectionName),
          column: definition.primaryKey,
        };

    const defAttr = definition.attributes[rel.alias];
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;

    if (rootCol === targetCol) rootCol = `related_${rootCol}`;

    const attrs = {
      [targetCol]: { type: targetModel.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
        {
          table: rel.tableCollectionName,
          attributes: attrs,
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
 * Orchestrates schema migration for a single model.
 */
const migrateSchemas = async (
  { ORM, loadedModel, definition, connection, model },
  context
) => {
  addTimestampColumns(definition, loadedModel);

  // main table
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

  await processMorphRelations({
    definition,
    loadedModel,
    connection,
    ORM,
    model,
    context,
  });

  await processManyRelations({
    definition,
    connection,
    ORM,
    model,
    context,
  });

  removeTimestampColumns(definition, loadedModel);
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find(a => a.alias === name);
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

  if (_.has(attribute, 'columnType')) return table.specificType(name, attribute.columnType);

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
 * Determine if a table rebuild is required.
 */
const shouldRebuild = (columnsToAlter, definition, context) => {
  return (
    columnsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable)
  );
};

/**
 * Rebuild a SQLite table by renaming, recreating and copying data.
 */
const rebuildSQLiteTable = async ({
  table,
  attributes,
  attributesNames,
  definition,
  ORM,
  context,
}) => {
  const tmpTable = `tmp_${table}`;

  const rebuild = async trx => {
    await trx.schema.renameTable(table, tmpTable);
    await Promise.all(
      attributesNames.map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );
    await createTable(table, { trx });
    const cols = attributesNames.filter(col =>
      isColumn({ definition, attribute: attributes[col], name: col })
    );
    const allCols = ['id', ...cols];
    await trx.insert(qb => qb.select(allCols).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  };

  try {
    await ORM.knex.transaction(trx => rebuild(trx));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
      );
    } else {
      strapi.log.error(`Migration failed`);
      strapi.log.error(err);
    }
    return false;
  }
};

/**
 * Alter a non‑SQLite table to apply column changes.
 */
const alterNonSQLiteTable = async ({
  table,
  attributes,
  columnsToAlter,
  definition,
  ORM,
  context,
}) => {
  const alter = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
          .catch(() => {})
      )
    );
    await trx.schema.alterTable(table, tbl => {
      createColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists: true, alter: true });
    });
  };

  try {
    await ORM.knex.transaction(trx => alter(trx));
  } catch (err) {
    if (err.code === '23505' && definition.client === 'pg') {
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
    return false;
  }
};

/**
 * Create a new table with primary key and provided columns.
 */
const createTable = (table, { trx = ORM.knex, definition, attributes } = {}) => {
  return trx.schema.createTable(table, tbl => {
    // primary key
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      tbl.specificType('id', 'uuid DEFAULT uuid_generate_v4()').notNullable().primary();
    } else {
      tbl.increments('id');
    }
    // other columns
    createColumns(tbl, attributes, { tableExists: false });
  });
};

/**
 * Helper to create columns on a table builder.
 */
const createColumns = (tbl, columns, { tableExists = false, alter = false } = {}) => {
  Object.entries(columns).forEach(([key, attribute]) => {
    const col = buildColType({
      name: key,
      attribute,
      table: tbl,
      tableExists,
      definition,
      ORM,
    });
    if (!col) return;

    if (attribute.required) {
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

    if (attribute.unique && (definition.client !== 'sqlite3' || !tableExists)) {
      tbl.unique(key, uniqueColName(table, key));
    }

    if (alter) col.alter();
  });
};

/**
 * Equilize database tables: create, add missing columns, or rebuild/alter as needed.
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);
  if (!tableExists) {
    await createTable(table, { definition, attributes });
    return;
  }

  const attributeNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributeNames.map(name => getColumnInfo(name, table, ORM))
  );
  const missing = columnsInfo.filter(i => !i.exists).map(i => i.columnName);
  const columnsToAdd = _.pick(attributes, missing);

  if (Object.keys(columnsToAdd).length) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, columnsToAdd, { tableExists });
    });
  }

  const attrsWithoutTimestamps = attributeNames.filter(
    n => !(definition.options.timestamps || []).includes(n)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  if (!shouldRebuild(columnsToAlter, definition, context)) return;

  if (definition.client === 'sqlite3') {
    const rebuilt = await rebuildSQLiteTable({
      table,
      attributes,
      attributesNames: attributeNames,
      definition,
      ORM,
      context,
    });
    if (rebuilt === false) return false;
  } else {
    const altered = await alterNonSQLiteTable({
      table,
      attributes,
      columnsToAlter,
      definition,
      ORM,
      context,
    });
    if (altered === false) return false;
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
```