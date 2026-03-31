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

// ============================================================================
// TYPE BUILDERS
// ============================================================================

const TYPE_BUILDERS = {
  uuid: (table) => table.uuid(),
  uid: (table) => {
    table.unique();
    return table.string();
  },
  richtext: (table) => table.text('longtext'),
  text: (table) => table.text('longtext'),
  json: (table, definition) =>
    definition.client === 'pg' ? table.jsonb() : table.text('longtext'),
  enumeration: (table) => table.string(),
  string: (table) => table.string(),
  password: (table) => table.string(),
  email: (table) => table.string(),
  integer: (table) => table.integer(),
  biginteger: (table) => table.bigInteger(),
  float: (table) => table.double(),
  decimal: (table) => table.decimal(10, 2),
  date: (table) => table.date(),
  time: (table) => table.time(3),
  datetime: (table) => table.datetime(),
  timestamp: (table) => table.timestamp(),
  boolean: (table) => table.boolean(),
};

// ============================================================================
// COLUMN TYPE BUILDER
// ============================================================================

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find((a) => a.alias === name);
    if (!relation) return null;

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

  const builder = TYPE_BUILDERS[attribute.type];
  if (!builder) return null;

  const col = builder(table, definition);

  if (attribute.type === 'currentTimestamp' && definition.client !== 'sqlite3' && tableExists) {
    return col;
  }

  if (attribute.type === 'currentTimestamp') {
    return col.defaultTo(ORM.knex.fn.now());
  }

  return col;
};

// ============================================================================
// COLUMN UTILITIES
// ============================================================================

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find((a) => a.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }

  return !['component', 'dynamiczone'].includes(attribute.type);
};

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const uniqueColName = (table, key) => `${table}_${key}_unique`;

// ============================================================================
// COLUMN CONSTRAINT BUILDERS
// ============================================================================

const applyColumnConstraints = (col, attribute, table, key, definition, tableExists) => {
  if (attribute.required === true) {
    if (
      (definition.client !== 'sqlite3' || !tableExists) &&
      !contentTypesUtils.hasDraftAndPublish(definition.model) &&
      definition.modelType !== 'component'
    ) {
      col.notNullable();
    }
  } else {
    col.nullable();
  }

  if (attribute.unique === true && (definition.client !== 'sqlite3' || !tableExists)) {
    table.unique(key, uniqueColName(table, key));
  }
};

// ============================================================================
// TABLE CREATION HELPERS
// ============================================================================

const createIdType = (table, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return table
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }
  return table.increments('id');
};

const createColumns = (tbl, columns, table, definition, ORM, opts = {}) => {
  const { tableExists = false, alter = false } = opts;

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

    applyColumnConstraints(col, attribute, tbl, key, definition, tableExists);

    if (alter) {
      col.alter();
    }
  });
};

// ============================================================================
// SQLITE MIGRATION
// ============================================================================

const migrateSqliteTable = async (
  table,
  tmpTable,
  attributes,
  attributesNames,
  definition,
  ORM,
  createTableFn
) => {
  await ORM.knex.schema.renameTable(table, tmpTable);

  await Promise.all(
    attributesNames.map((key) =>
      ORM.knex.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
    )
  );

  await createTableFn(table);

  const attrs = attributesNames.filter((name) =>
    isColumn({
      definition,
      attribute: attributes[name],
      name,
    })
  );

  const allAttrs = ['id', ...attrs];
  await ORM.knex.insert(ORM.knex.select(allAttrs).from(tmpTable)).into(table);
  await ORM.knex.schema.dropTableIfExists(tmpTable);
};

const handleSqliteRebuild = async (
  table,
  attributes,
  attributesNames,
  definition,
  ORM,
  createTableFn
) => {
  const tmpTable = `tmp_${table}`;

  try {
    await ORM.knex.transaction(async (trx) => {
      await trx.schema.renameTable(table, tmpTable);

      await Promise.all(
        attributesNames.map((key) =>
          trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
        )
      );

      await createTableFn(table, { trx });

      const attrs = attributesNames.filter((name) =>
        isColumn({
          definition,
          attribute: attributes[name],
          name,
        })
      );

      const allAttrs = ['id', ...attrs];
      await trx.insert((qb) => qb.select(allAttrs).from(tmpTable)).into(table);
      await trx.schema.dropTableIfExists(tmpTable);
    });
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

// ============================================================================
// POSTGRES/MYSQL MIGRATION
// ============================================================================

const handleStandardRebuild = async (
  table,
  attributes,
  columnsToAlter,
  definition,
  ORM,
  tableExists
) => {
  try {
    await ORM.knex.transaction(async (trx) => {
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
        createColumns(tbl, _.pick(attributes, columnsToAlter), table, definition, ORM, {
          tableExists,
          alter: true,
        });
      });
    });
  } catch (err) {
    const errorMessages = {
      pg: () =>
        err.code === '23505'
          ? `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t- ${err.detail}`
          : null,
      mysql: () =>
        err.errno === 1062
          ? `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.sqlMessage}`
          : null,
    };

    const message = errorMessages[definition.client]?.();
    if (message) {
      strapi.log.error(message);
    } else {
      strapi.log.error(`Migration failed`);
      strapi.log.error(err);
    }
    return false;
  }
};

// ============================================================================
// TABLE CREATION AND UPDATE
// ============================================================================

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  const createTableFn = (tableName, { trx = ORM.knex } = {}) => {
    return trx.schema.createTable(tableName, (tbl) => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, tableName, definition, ORM, { tableExists: false });
    });
  };

  if (!tableExists) {
    await createTableFn(table);
    return;
  }

  const attributesNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributesNames.map((name) => getColumnInfo(name, table, ORM))
  );

  const nameOfColumnsToAdd = columnsInfo.filter((info) => !info.exists).map((info) => info.columnName);
  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, (tbl) => {
      createColumns(tbl, columnsToAdd, table, definition, ORM, { tableExists });
    });
  }

  const attrsNameWithoutTimestamps = attributesNames.filter(
    (name) => !(definition.options.timestamps || []).includes(name)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsNameWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await handleSqliteRebuild(
      table,
      attributes,
      attributesNames,
      definition,
      ORM,
      createTableFn
    );
  } else {
    await handleStandardRebuild(table, attributes, columnsToAlter, definition, ORM, tableExists);
  }
};

// ============================================================================
// SCHEMA MIGRATION
// ============================================================================

const addTimestamps = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAt, updatedAt] = loadedModel.hasTimestamps;
    definition.attributes[createdAt] = { type: 'currentTimestamp' };
    definition.attributes[updatedAt] = { type: 'currentTimestamp' };
  }
};

const removeTimestamps = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAt, updatedAt] = loadedModel.hasTimestamps;
    delete definition.attributes[createdAt];
    delete definition.attributes[updatedAt];
  }
};

const shouldAutoMigrate = (connection) => !connection.options || connection.options.autoMigration !== false;

const migrateMorphRelations = async (definition, loadedModel, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter((a) =>
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

    if (shouldAutoMigrate(connection)) {
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

const migrateManyRelations = async (definition, connection, ORM, model, context) => {
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

    if (shouldAutoMigrate(connection)) {
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

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  addTimestamps(definition, loadedModel);

  if (shouldAutoMigrate(connection)) {
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
  await migrateManyRelations(definition, connection, ORM, model, context);

  removeTimestamps(definition, loadedModel);
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

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