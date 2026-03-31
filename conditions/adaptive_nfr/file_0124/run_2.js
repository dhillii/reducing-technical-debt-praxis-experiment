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

const applyColumnConstraints = (col, attribute, table, key, tableExists, definition, model) => {
  if (attribute.required === true) {
    const shouldApplyNotNull =
      (definition.client !== 'sqlite3' || !tableExists) &&
      !contentTypesUtils.hasDraftAndPublish(model) &&
      definition.modelType !== 'component';

    if (shouldApplyNotNull) {
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

const createColumns = (tbl, columns, table, tableExists, definition, ORM, model, alter = false) => {
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

    applyColumnConstraints(col, attribute, tbl, key, tableExists, definition, model);

    if (alter) {
      col.alter();
    }
  });
};

// ============================================================================
// SQLITE TABLE REBUILD
// ============================================================================

const rebuildSqliteTable = async (ORM, table, attributes, attributesNames, definition) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async (trx) => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map((key) => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );

    await trx.schema.createTable(table, (tbl) => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, table, false, definition, ORM, null, false);
    });

    const attrs = attributesNames.filter((attributeName) =>
      isColumn({
        definition,
        attribute: attributes[attributeName],
        name: attributeName,
      })
    );

    const allAttrs = ['id', ...attrs];
    await trx.insert((qb) => qb.select(allAttrs).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  };

  try {
    await ORM.knex.transaction((trx) => rebuildTable(trx));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
      );
    } else {
      strapi.log.error('Migration failed');
      strapi.log.error(err);
    }
    return false;
  }
};

// ============================================================================
// DATABASE ALTER HANDLERS
// ============================================================================

const alterTableColumns = async (ORM, table, attributes, columnsToAlter, tableExists, definition) => {
  const alterTable = async (trx) => {
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
      createColumns(tbl, _.pick(attributes, columnsToAlter), table, tableExists, definition, ORM, null, true);
    });
  };

  try {
    await ORM.knex.transaction((trx) => alterTable(trx));
  } catch (err) {
    handleAlterTableError(err, definition);
    return false;
  }
};

const handleAlterTableError = (err, definition) => {
  if (err.code === '23505' && definition.client === 'pg') {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t- ${err.detail}`
    );
  } else if (definition.client === 'mysql' && err.errno === 1062) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.sqlMessage}`
    );
  } else {
    strapi.log.error('Migration failed');
    strapi.log.error(err);
  }
};

// ============================================================================
// MAIN TABLE OPERATIONS
// ============================================================================

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await ORM.knex.schema.createTable(table, (tbl) => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, table, false, definition, ORM, model, false);
    });
    return;
  }

  const attributesNames = Object.keys(attributes);

  // Add missing columns
  const columnsInfo = await Promise.all(
    attributesNames.map((name) => getColumnInfo(name, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter((info) => !info.exists).map((info) => info.columnName);

  if (nameOfColumnsToAdd.length > 0) {
    await ORM.knex.schema.table(table, (tbl) => {
      createColumns(tbl, _.pick(attributes, nameOfColumnsToAdd), table, tableExists, definition, ORM, model, false);
    });
  }

  // Alter changed columns
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

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await rebuildSqliteTable(ORM, table, attributes, attributesNames, definition);
  } else {
    await alterTableColumns(ORM, table, attributes, columnsToAlter, tableExists, definition);
  }
};

// ============================================================================
// SCHEMA MIGRATION
// ============================================================================

const addTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }
};

const removeTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
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
    let targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
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
  addTimestampAttributes(definition, loadedModel);

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

  removeTimestampAttributes(definition, loadedModel);
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

module.exports = async ({ ORM, loadedModel, definition, connection, model }) => {
  await getDefinitionFromStore(definition, ORM);

  await strapi.db.migrations.run(migrateSchemas, {
    ORM,
    loadedModel,
    definition,
    connection,
    model,
  });

  await storeDefinition(definition, ORM);
};
```