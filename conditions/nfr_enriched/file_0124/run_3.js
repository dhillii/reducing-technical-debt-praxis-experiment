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

// Constants
const MORPH_RELATION_SUFFIX = '_morph';
const RELATED_COL_PREFIX = 'related_';
const SQLITE_TMP_TABLE_PREFIX = 'tmp_';
const UNIQUE_CONSTRAINT_ERROR_PG = '23505';
const UNIQUE_CONSTRAINT_ERROR_MYSQL = 1062;

// Type mapping for column types
const COLUMN_TYPE_MAP = {
  uuid: (table, name) => table.uuid(name),
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

const RELATION_TYPES_WITH_COLUMNS = ['oneToOne', 'manyToOne', 'oneWay'];
const SKIP_ATTRIBUTE_TYPES = ['component', 'dynamiczone'];

// Utility functions
const uniqueColName = (table, key) => `${table}_${key}_unique`;

const isMorphRelation = association => association.nature.toLowerCase().includes('morphto');

const isColumnAttribute = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    return relation && RELATION_TYPES_WITH_COLUMNS.includes(relation.nature);
  }
  return !SKIP_ATTRIBUTE_TYPES.includes(attribute.type);
};

const getRelationByAlias = (associations, alias) =>
  associations.find(association => association.alias === alias);

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = getRelationByAlias(definition.associations, name);
    if (RELATION_TYPES_WITH_COLUMNS.includes(relation.nature)) {
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

  const typeHandler = COLUMN_TYPE_MAP[attribute.type];
  return typeHandler ? typeHandler(table, name, definition, ORM, tableExists) : null;
};

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

const addTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAt, updatedAt] = loadedModel.hasTimestamps;
    definition.attributes[createdAt] = { type: 'currentTimestamp' };
    definition.attributes[updatedAt] = { type: 'currentTimestamp' };
  }
};

const removeTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAt, updatedAt] = loadedModel.hasTimestamps;
    delete definition.attributes[createdAt];
    delete definition.attributes[updatedAt];
  }
};

const shouldAutoMigrate = connection => !connection.options || connection.options.autoMigration !== false;

const migrateMorphRelations = async (definition, loadedModel, ORM, connection, model, context) => {
  const morphRelations = definition.associations.filter(isMorphRelation);

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
          table: `${loadedModel.tableName}${MORPH_RELATION_SUFFIX}`,
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

const migrateManyRelations = async (definition, ORM, connection, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant) continue;

    const { plugin, collection, via, alias } = manyRelation;
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
      rootCol = `${RELATED_COL_PREFIX}${rootCol}`;
    }

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (shouldAutoMigrate(connection)) {
      await createOrUpdateTable(
        { table: manyRelation.tableCollectionName, attributes, definition, ORM, model },
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

  await migrateMorphRelations(definition, loadedModel, ORM, connection, model, context);
  await migrateManyRelations(definition, ORM, connection, model, context);

  removeTimestampAttributes(definition, loadedModel);
};

const rebuildSqliteTable = async (table, attributes, attributesNames, definition, ORM, createTable) => {
  const tmpTable = `${SQLITE_TMP_TABLE_PREFIX}${table}`;

  await ORM.knex.transaction(async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );

    await createTable(table, { trx });

    const attrs = attributesNames.filter(attributeName =>
      isColumnAttribute({
        definition,
        attribute: attributes[attributeName],
        name: attributeName,
      })
    );

    const allAttrs = ['id', ...attrs];
    await trx.insert(qb => qb.select(allAttrs).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  });
};

const alterTableColumns = async (table, columnsToAlter, attributes, definition, ORM) => {
  await ORM.knex.transaction(async trx => {
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
      createColumns(tbl, _.pick(attributes, columnsToAlter), {
        tableExists: true,
        definition,
        ORM,
        table,
      });
    });
  });
};

const handleMigrationError = (err, definition) => {
  if (err.code === UNIQUE_CONSTRAINT_ERROR_PG && definition.client === 'pg') {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t- ${err.detail}`
    );
  } else if (definition.client === 'mysql' && err.errno === UNIQUE_CONSTRAINT_ERROR_MYSQL) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.sqlMessage}`
    );
  } else if (err.message?.includes('UNIQUE constraint failed')) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
    );
  } else {
    strapi.log.error(`Migration failed`);
    strapi.log.error(err);
  }
};

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  const createTable = (tableName, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(tableName, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { ...opts, tableExists: false, definition, ORM, model, table: tableName });
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
      createColumns(tbl, columnsToAdd, { tableExists, definition, ORM, model, table });
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

  if (!shouldRebuild) return;

  try {
    if (definition.client === 'sqlite3') {
      await rebuildSqliteTable(table, attributes, attributesNames, definition, ORM, createTable);
    } else {
      await alterTableColumns(table, columnsToAlter, attributes, definition, ORM);
    }
  } catch (err) {
    handleMigrationError(err, definition);
    return false;
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