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

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  // Add created_at and updated_at field if timestamp option is true
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }

  // Equilize tables
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

  // Equilize polymorphic relations
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

  // Equilize many to many relations
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    const { plugin, collection, via, dominant, alias } = manyRelation;

    if (dominant) {
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

      // manyWay with same CT
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
  }

  // Remove from attributes (auto handled by bookshelf and not displayed on ctb)
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
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
 * Create primary key column based on definition.
 */
const createIdColumn = (table, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return table
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }
  return table.increments('id');
};

/**
 * Add columns to a table based on attribute definitions.
 */
const addColumns = (tbl, columns, { tableExists, alter = false, definition, ORM }) => {
  Object.keys(columns).forEach(key => {
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

    if (attribute.unique === true && (definition.client !== 'sqlite3' || !tableExists)) {
      tbl.unique(key, uniqueColName(tbl._tableName, key));
    }

    if (alter) col.alter();
  });
};

/**
 * Create a new table with given attributes.
 */
const createNewTable = async ({ table, attributes, definition, ORM, model }) => {
  await ORM.knex.schema.createTable(table, tbl => {
    createIdColumn(tbl, definition);
    addColumns(tbl, attributes, { tableExists: false, definition, ORM });
  });
};

/**
 * Add missing columns to an existing table.
 */
const addMissingColumns = async (table, columnsToAdd, definition, ORM) => {
  if (Object.keys(columnsToAdd).length === 0) return;
  await ORM.knex.schema.table(table, tbl => {
    addColumns(tbl, columnsToAdd, { tableExists: true, definition, ORM });
  });
};

/**
 * Determine if a table needs to be rebuilt (sqlite) or altered.
 */
const computeRebuildFlag = async (definition, context, columnsToAlter, attrsWithoutTimestamps) => {
  return (
    columnsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable)
  );
};

/**
 * Rebuild a SQLite table by renaming, recreating, and copying data.
 */
const rebuildSqliteTable = async ({
  table,
  attributes,
  definition,
  ORM,
  model,
  columnsInfo,
}) => {
  const tmpTable = `tmp_${table}`;
  const trx = await ORM.knex.transaction();

  try {
    await trx.schema.renameTable(table, tmpTable);

    // drop possible conflicting indexes
    await Promise.all(
      Object.keys(attributes).map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );

    // recreate table
    await trx.schema.createTable(table, tbl => {
      createIdColumn(tbl, definition);
      addColumns(tbl, attributes, { tableExists: false, definition, ORM });
    });

    const attrs = Object.keys(attributes).filter(name =>
      isColumn({ definition, attribute: attributes[name], name })
    );

    const allAttrs = ['id', ...attrs];
    await trx.insert(qb => qb.select(allAttrs).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
    await trx.commit();
  } catch (err) {
    await trx.rollback();
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
const alterNonSqliteTable = async ({
  table,
  attributes,
  columnsToAlter,
  definition,
  ORM,
}) => {
  const trx = await ORM.knex.transaction();

  try {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => {
            tbl.dropUnique(col, uniqueColName(table, col));
          })
          .catch(() => {})
      )
    );

    await trx.schema.alterTable(table, tbl => {
      addColumns(tbl, _.pick(attributes, columnsToAlter), {
        tableExists: true,
        alter: true,
        definition,
        ORM,
      });
    });

    await trx.commit();
  } catch (err) {
    await trx.rollback();
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
 * Main function to create or update a table based on the definition.
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createNewTable({ table, attributes, definition, ORM, model });
    return;
  }

  // Add missing columns
  const attributeNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributeNames.map(name => getColumnInfo(name, table, ORM))
  );
  const missing = columnsInfo.filter(info => !info.exists).map(info => info.columnName);
  const columnsToAdd = _.pick(attributes, missing);
  await addMissingColumns(table, columnsToAdd, definition, ORM);

  // Determine columns that need alteration
  const attrsWithoutTimestamps = attributeNames.filter(
    col => !(definition.options.timestamps || []).includes(col)
  );
  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild = await computeRebuildFlag(
    definition,
    context,
    columnsToAlter,
    attrsWithoutTimestamps
  );

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await rebuildSqliteTable({
      table,
      attributes,
      definition,
      ORM,
      model,
      columnsInfo,
    });
  } else {
    await alterNonSqliteTable({
      table,
      attributes,
      columnsToAlter,
      definition,
      ORM,
    });
  }
};

module.exports = async ({ ORM, loadedModel, definition, connection, model }) => {
  const previousDefinition = await getDefinitionFromStore(definition, ORM);

  // run migrations
  await strapi.db.migrations.run(migrateSchemas, {
    ORM,
    loadedModel,
    previousDefinition,
    definition,
    connection,
    model,
  });

  // store new definitions
  await storeDefinition(definition, ORM);
};