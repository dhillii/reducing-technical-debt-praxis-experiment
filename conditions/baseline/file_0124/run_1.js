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
// COLUMN TYPE BUILDERS
// ============================================================================

const COLUMN_TYPE_MAP = {
  uuid: (table) => table.uuid,
  uid: (table) => table.string,
  richtext: (table) => (name) => table.text(name, 'longtext'),
  text: (table) => (name) => table.text(name, 'longtext'),
  json: (table, definition) => (name) =>
    definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext'),
  enumeration: (table) => table.string,
  string: (table) => table.string,
  password: (table) => table.string,
  email: (table) => table.string,
  integer: (table) => table.integer,
  biginteger: (table) => table.bigInteger,
  float: (table) => table.double,
  decimal: (table) => (name) => table.decimal(name, 10, 2),
  date: (table) => table.date,
  time: (table) => (name) => table.time(name, 3),
  datetime: (table) => table.datetime,
  timestamp: (table) => table.timestamp,
  boolean: (table) => table.boolean,
};

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find((a) => a.alias === name);
    if (!relation || !['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) {
      return null;
    }
    return buildColType({
      name,
      attribute: { type: definition.primaryKeyType },
      table,
      tableExists,
      definition,
      ORM,
    });
  }

  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  if (attribute.type === 'uid') {
    table.unique(name);
    return table.string(name);
  }

  if (attribute.type === 'currentTimestamp') {
    const col = table.timestamp(name);
    if (definition.client !== 'sqlite3' && tableExists) {
      return col;
    }
    return col.defaultTo(ORM.knex.fn.now());
  }

  const builder = COLUMN_TYPE_MAP[attribute.type];
  return builder ? builder(table, definition)(name) : null;
};

// ============================================================================
// COLUMN UTILITIES
// ============================================================================

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find((a) => a.alias === name);
    return relation && ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  return !['component', 'dynamiczone'].includes(attribute.type);
};

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const uniqueColName = (table, key) => `${table}_${key}_unique`;

// ============================================================================
// TIMESTAMP HANDLING
// ============================================================================

const addTimestampAttributes = (loadedModel, definition) => {
  if (!loadedModel.hasTimestamps) return;
  const [createdAt, updatedAt] = loadedModel.hasTimestamps;
  definition.attributes[createdAt] = { type: 'currentTimestamp' };
  definition.attributes[updatedAt] = { type: 'currentTimestamp' };
};

const removeTimestampAttributes = (loadedModel, definition) => {
  if (!loadedModel.hasTimestamps) return;
  const [createdAt, updatedAt] = loadedModel.hasTimestamps;
  delete definition.attributes[createdAt];
  delete definition.attributes[updatedAt];
};

// ============================================================================
// MORPHIC RELATIONS
// ============================================================================

const buildMorphAttributes = (loadedModel, morphRelation, definition) => ({
  [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_type`]: { type: 'text' },
  [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
  order: { type: 'integer' },
});

const migrateMorphRelations = async (
  loadedModel,
  definition,
  connection,
  ORM,
  model,
  context
) => {
  const morphRelations = definition.associations.filter((a) =>
    a.nature.toLowerCase().includes('morphto')
  );

  for (const morphRelation of morphRelations) {
    if (connection.options?.autoMigration === false) continue;

    const attributes = buildMorphAttributes(loadedModel, morphRelation, definition);
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
};

// ============================================================================
// MANY-TO-MANY RELATIONS
// ============================================================================

const buildManyRelationAttributes = (manyRelation, definition, targetCollection) => {
  const targetAttr = manyRelation.via
    ? targetCollection.attributes[manyRelation.via]
    : {
        attribute: singular(definition.collectionName),
        column: definition.primaryKey,
      };

  const defAttr = definition.attributes[manyRelation.alias];
  let targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
  let rootCol = `${defAttr.attribute}_${defAttr.column}`;

  if (rootCol === targetCol) {
    rootCol = `related_${rootCol}`;
  }

  return {
    [targetCol]: { type: targetCollection.primaryKeyType },
    [rootCol]: { type: definition.primaryKeyType },
  };
};

const migrateManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant || connection.options?.autoMigration === false) continue;

    const targetCollection = strapi.db.getModel(manyRelation.collection, manyRelation.plugin);
    const attributes = buildManyRelationAttributes(manyRelation, definition, targetCollection);

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
};

// ============================================================================
// TABLE CREATION AND ALTERATION
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

const applyColumnConstraints = (col, attribute, definition, model, table, columnName) => {
  if (attribute.required === true) {
    if (
      (definition.client !== 'sqlite3') &&
      !contentTypesUtils.hasDraftAndPublish(model) &&
      definition.modelType !== 'component'
    ) {
      col.notNullable();
    }
  } else {
    col.nullable();
  }

  if (attribute.unique === true && definition.client !== 'sqlite3') {
    table.unique(columnName, uniqueColName(table.toString(), columnName));
  }
};

const createColumns = (tbl, columns, { tableExists = false, alter = false, definition, ORM, model, table }) => {
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

    applyColumnConstraints(col, attribute, definition, model, tbl, key);

    if (alter) {
      col.alter();
    }
  });
};

const createTable = (tableName, attributes, definition, ORM) => {
  return ORM.knex.schema.createTable(tableName, (tbl) => {
    createIdType(tbl, definition);
    createColumns(tbl, attributes, {
      tableExists: false,
      definition,
      ORM,
      model: null,
      table: tableName,
    });
  });
};

// ============================================================================
// SQLITE REBUILD
// ============================================================================

const rebuildSqliteTable = async (table, attributes, attributesNames, definition, ORM) => {
  const tmpTable = `tmp_${table}`;

  const rebuildFn = async (trx) => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map((key) => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );

    await createTable(table, attributes, definition, trx);

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
  };

  try {
    await ORM.knex.transaction(rebuildFn);
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
// GENERIC ALTER TABLE
// ============================================================================

const alterTableColumns = async (table, columnsToAlter, attributes, definition, ORM, tableExists) => {
  const dropUniqueConstraints = async (trx) => {
    await Promise.all(
      columnsToAlter.map((col) =>
        ORM.knex.schema
          .alterTable(table, (tbl) => {
            tbl.dropUnique(col, uniqueColName(table, col));
          })
          .catch(() => {})
      )
    );
  };

  const alterFn = async (trx) => {
    await dropUniqueConstraints(trx);
    await trx.schema.alterTable(table, (tbl) => {
      createColumns(tbl, _.pick(attributes, columnsToAlter), {
        tableExists,
        alter: true,
        definition,
        ORM,
        model: null,
        table,
      });
    });
  };

  try {
    await ORM.knex.transaction(alterFn);
  } catch (err) {
    const errorMessages = {
      pg: () => err.code === '23505',
      mysql: () => err.errno === 1062,
    };

    if (errorMessages[definition.client]?.()) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${
          err.message || err.sqlMessage
        }${err.detail ? `\n\t- ${err.detail}` : ''}`
      );
    } else {
      strapi.log.error('Migration failed');
      strapi.log.error(err);
    }
    return false;
  }
};

// ============================================================================
// MAIN TABLE CREATION/UPDATE
// ============================================================================

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createTable(table, attributes, definition, ORM);
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
      createColumns(tbl, _.pick(attributes, nameOfColumnsToAdd), {
        tableExists,
        definition,
        ORM,
        model,
        table,
      });
    });
  }

  // Alter existing columns if needed
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
    await rebuildSqliteTable(table, attributes, attributesNames, definition, ORM);
  } else {
    await alterTableColumns(table, columnsToAlter, attributes, definition, ORM, tableExists);
  }
};

// ============================================================================
// SCHEMA MIGRATION
// ============================================================================

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  addTimestampAttributes(loadedModel, definition);

  if (connection.options?.autoMigration !== false) {
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

  await migrateMorphRelations(loadedModel, definition, connection, ORM, model, context);
  await migrateManyRelations(definition, connection, ORM, model, context);

  removeTimestampAttributes(loadedModel, definition);
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