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
 * Adds timestamp columns to the definition if the model uses timestamps.
 */
const addTimestampColumns = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [createdAt, updatedAt] = loadedModel.hasTimestamps;
  definition.attributes[createdAt] = { type: 'currentTimestamp' };
  definition.attributes[updatedAt] = { type: 'currentTimestamp' };
};

/**
 * Removes timestamp columns from the definition after migration.
 */
const removeTimestampColumns = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [createdAt, updatedAt] = loadedModel.hasTimestamps;
  delete definition.attributes[createdAt];
  delete definition.attributes[updatedAt];
};

/**
 * Handles migration of polymorphic (morph) relations.
 */
const migrateMorphRelations = async (definition, loadedModel, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(a =>
    a.nature.toLowerCase().includes('morphto')
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
 * Handles migration of many‑to‑many relations.
 */
const migrateManyRelations = async (definition, loadedModel, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    const { plugin, collection, via, dominant, alias } = manyRelation;
    if (!dominant) continue;

    const targetCollection = strapi.db.getModel(collection, plugin);
    const targetAttr = via
      ? targetCollection.attributes[via]
      : {
          attribute: singular(definition.collectionName),
          column: definition.primaryKey,
        };

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

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
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

/**
 * Main migration orchestrator.
 */
const migrateSchemas = async (
  { ORM, loadedModel, definition, connection, model },
  context
) => {
  addTimestampColumns(definition, loadedModel);

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

  await migrateMorphRelations(definition, loadedModel, connection, ORM, model, context);
  await migrateManyRelations(definition, loadedModel, connection, ORM, model, context);
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

  if (['component', 'dynamiczone'].includes(attribute.type)) {
    return false;
  }

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

/**
 * Creates a new table with the given attributes.
 */
const createTable = async (table, attributes, definition, ORM, model) => {
  const createId = tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      return tbl
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }
    return tbl.increments('id');
  };

  await ORM.knex.schema.createTable(table, tbl => {
    createId(tbl);
    Object.entries(attributes).forEach(([key, attribute]) => {
      const col = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists: false,
        definition,
        ORM,
      });
      if (!col) return;
      if (attribute.required) {
        if (
          definition.client !== 'sqlite3' ||
          !contentTypesUtils.hasDraftAndPublish(model) ||
          definition.modelType === 'component'
        ) {
          col.notNullable();
        }
      } else {
        col.nullable();
      }
      if (attribute.unique && definition.client !== 'sqlite3') {
        tbl.unique(key, uniqueColName(table, key));
      }
    });
  });
};

/**
 * Adds missing columns to an existing table.
 */
const addMissingColumns = async (table, columnsToAdd, definition, ORM) => {
  await ORM.knex.schema.table(table, tbl => {
    Object.entries(columnsToAdd).forEach(([key, attribute]) => {
      const col = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists: true,
        definition,
        ORM,
      });
      if (!col) return;
      if (attribute.required) {
        if (
          definition.client !== 'sqlite3' ||
          !contentTypesUtils.hasDraftAndPublish()
        ) {
          col.notNullable();
        }
      } else {
        col.nullable();
      }
      if (attribute.unique && definition.client !== 'sqlite3') {
        tbl.unique(key, uniqueColName(table, key));
      }
    });
  });
};

/**
 * Rebuilds a SQLite table when column changes require recreation.
 */
const rebuildSQLiteTable = async (table, attributes, definition, ORM, context) => {
  const tmpTable = `tmp_${table}`;

  const rebuild = async trx => {
    await trx.schema.renameTable(table, tmpTable);
    await Promise.all(
      Object.keys(attributes).map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );
    await createTable(table, attributes, definition, { knex: trx }, null);
    const cols = Object.keys(attributes).filter(name =>
      isColumn({ definition, attribute: attributes[name], name })
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
 * Alters an existing table for column changes (non‑SQLite).
 */
const alterExistingTable = async (table, columnsToAlter, attributes, definition, ORM) => {
  const alter = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
          .catch(() => {})
      )
    );
    await trx.schema.alterTable(table, tbl => {
      columnsToAlter.forEach(col => {
        const attribute = attributes[col];
        const colBuilder = buildColType({
          name: col,
          attribute,
          table: tbl,
          tableExists: true,
          definition,
          ORM,
        });
        if (colBuilder) colBuilder.alter();
      });
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
 * Core function to create or update a table based on the definition.
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createTable(table, attributes, definition, ORM, model);
    return;
  }

  const attributeNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributeNames.map(name => getColumnInfo(name, table, ORM))
  );
  const missing = columnsInfo.filter(i => !i.exists).map(i => i.columnName);
  const columnsToAdd = _.pick(attributes, missing);

  if (Object.keys(columnsToAdd).length) {
    await addMissingColumns(table, columnsToAdd, definition, ORM);
  }

  const attrsWithoutTimestamps = attributeNames.filter(
    name => !(definition.options.timestamps || []).includes(name)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await rebuildSQLiteTable(table, attributes, definition, ORM, context);
  } else {
    await alterExistingTable(table, columnsToAlter, attributes, definition, ORM);
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