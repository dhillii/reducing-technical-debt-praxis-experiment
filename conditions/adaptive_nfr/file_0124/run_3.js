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
  uuid: (table) => table.uuid('name'),
  uid: (table, name) => {
    table.unique(name);
    return table.string(name);
  },
  richtext: (table, name) => table.text(name, 'longtext'),
  text: (table, name) => table.text(name, 'longtext'),
  json: (table, name, definition) =>
    definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext'),
  enumeration: (table, name) => table.string(name),
  string: (table, name) => table.string(name),
  password: (table, name) => table.string(name),
  email: (table, name) => table.string(name),
  integer: (table, name) => table.integer(name),
  biginteger: (table, name) => table.bigInteger(name),
  float: (table, name) => table.double(name),
  decimal: (table, name) => table.decimal(name, 10, 2),
  date: (table, name) => table.date(name),
  time: (table, name) => table.time(name, 3),
  datetime: (table, name) => table.datetime(name),
  timestamp: (table, name) => table.timestamp(name),
  currentTimestamp: (table, name, definition, ORM, tableExists) => {
    const col = table.timestamp(name);
    if (definition.client !== 'sqlite3' && tableExists) {
      return col;
    }
    return col.defaultTo(ORM.knex.fn.now());
  },
  boolean: (table, name) => table.boolean(name),
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const shouldAutoMigrate = (connection) => !connection.options || connection.options.autoMigration !== false;

const addTimestampAttributes = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [createdAt, updatedAt] = loadedModel.hasTimestamps;
  definition.attributes[createdAt] = { type: 'currentTimestamp' };
  definition.attributes[updatedAt] = { type: 'currentTimestamp' };
};

const removeTimestampAttributes = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [createdAt, updatedAt] = loadedModel.hasTimestamps;
  delete definition.attributes[createdAt];
  delete definition.attributes[updatedAt];
};

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const isColumn = ({ definition, attribute, name }) => {
  if (_.has(attribute, 'type')) {
    return !['component', 'dynamiczone'].includes(attribute.type);
  }

  const relation = definition.associations.find((assoc) => assoc.alias === name);
  return relation && ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const findRelationByAlias = (definition, name) =>
  definition.associations.find((assoc) => assoc.alias === name);

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = findRelationByAlias(definition, name);
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

  const builder = TYPE_BUILDERS[attribute.type];
  return builder ? builder(table, name, definition, ORM, tableExists) : null;
};

// ============================================================================
// MORPH RELATIONS
// ============================================================================

const createMorphRelationAttributes = (loadedModel, morphRelation, definition) => ({
  [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_type`]: { type: 'text' },
  [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
  order: { type: 'integer' },
});

const migrateMorphRelations = async (
  { loadedModel, definition, connection, ORM, model },
  context
) => {
  const morphRelations = definition.associations.filter((assoc) =>
    assoc.nature.toLowerCase().includes('morphto')
  );

  for (const morphRelation of morphRelations) {
    if (!shouldAutoMigrate(connection)) continue;

    const attributes = createMorphRelationAttributes(loadedModel, morphRelation, definition);
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
  const { via, alias } = manyRelation;

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

  return {
    [targetCol]: { type: targetCollection.primaryKeyType },
    [rootCol]: { type: definition.primaryKeyType },
  };
};

const migrateManyRelations = async (
  { definition, connection, ORM, model },
  context
) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant || !shouldAutoMigrate(connection)) continue;

    const { plugin, collection, tableCollectionName } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
    const attributes = buildManyRelationAttributes(manyRelation, definition, targetCollection);

    await createOrUpdateTable(
      { table: tableCollectionName, attributes, definition, ORM, model },
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

const applyColumnConstraints = (col, attribute, definition, model, table, key) => {
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
    table.unique(key, uniqueColName(table.name, key));
  }
};

const createColumns = (tbl, columns, { tableExists = false, alter = false, definition, ORM, model, table }) => {
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

    applyColumnConstraints(col, attribute, definition, model, tbl, key);

    if (alter) {
      col.alter();
    }
  });
};

const createTable = (table, attributes, { trx = null, definition, ORM, model } = {}) => {
  const knex = trx || ORM.knex;
  return knex.schema.createTable(table, (tbl) => {
    createIdType(tbl, definition);
    createColumns(tbl, attributes, {
      tableExists: false,
      definition,
      ORM,
      model,
      table,
    });
  });
};

// ============================================================================
// SQLITE REBUILD
// ============================================================================

const rebuildSqliteTable = async (table, attributes, definition, ORM, attributesNames) => {
  const tmpTable = `tmp_${table}`;

  const rebuildFn = async (trx) => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map((key) =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    await createTable(table, attributes, { trx, definition, ORM });

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
// DATABASE ALTER
// ============================================================================

const alterDatabaseTable = async (table, attributes, columnsToAlter, definition, ORM, tableExists) => {
  const alterFn = async (trx) => {
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
      createColumns(tbl, _.pick(attributes, columnsToAlter), {
        tableExists,
        alter: true,
        definition,
        ORM,
        table,
      });
    });
  };

  try {
    await ORM.knex.transaction(alterFn);
  } catch (err) {
    handleAlterError(err, definition);
    return false;
  }
};

const handleAlterError = (err, definition) => {
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
// MAIN TABLE CREATION/UPDATE
// ============================================================================

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createTable(table, attributes, { definition, ORM, model });
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

  // Alter changed columns
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
    await rebuildSqliteTable(table, attributes, definition, ORM, attributesNames);
  } else {
    await alterDatabaseTable(table, attributes, columnsToAlter, definition, ORM, tableExists);
  }
};

// ============================================================================
// SCHEMA MIGRATION
// ============================================================================

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

  await migrateMorphRelations({ loadedModel, definition, connection, ORM, model }, context);
  await migrateManyRelations({ definition, connection, ORM, model }, context);

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