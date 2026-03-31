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
const TIMESTAMP_TYPE = 'currentTimestamp';
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
  boolean: (table, name) => table.boolean(name),
};

const RELATION_TYPES_WITH_COLUMNS = ['oneToOne', 'manyToOne', 'oneWay'];
const MORPH_RELATION_PATTERN = 'morphto';
const AUTO_MIGRATION_ENABLED = (options) => !options || options.autoMigration !== false;

// Utility functions
const getRelationByAlias = (definition, alias) =>
  definition.associations.find(association => association.alias === alias);

const isRelationWithColumn = (relation) =>
  relation && RELATION_TYPES_WITH_COLUMNS.includes(relation.nature);

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = getRelationByAlias(definition, name);
    return isRelationWithColumn(relation);
  }

  return !['component', 'dynamiczone'].includes(attribute.type);
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildPrimaryKeyColumn = (table, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return table
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }
  return table.increments('id');
};

const buildColumnType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = getRelationByAlias(definition, name);
    if (isRelationWithColumn(relation)) {
      return buildColumnType({
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

  if (attribute.type === TIMESTAMP_TYPE) {
    const col = table.timestamp(name);
    if (definition.client !== 'sqlite3' && tableExists) {
      return col;
    }
    return col.defaultTo(ORM.knex.fn.now());
  }

  const typeBuilder = COLUMN_TYPE_MAP[attribute.type];
  return typeBuilder ? typeBuilder(table, name, definition) : null;
};

const applyColumnConstraints = (col, attribute, table, tableName, definition, tableExists) => {
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

  if (attribute.unique === true) {
    if (definition.client !== 'sqlite3' || !tableExists) {
      table.unique(attribute.name || '', uniqueColName(tableName, attribute.name || ''));
    }
  }
};

const createColumns = (tbl, columns, table, definition, ORM, { tableExists = false, alter = false } = {}) => {
  Object.entries(columns).forEach(([key, attribute]) => {
    const col = buildColumnType({
      name: key,
      attribute,
      table: tbl,
      tableExists,
      definition,
      ORM,
    });

    if (!col) return;

    applyColumnConstraints(col, { ...attribute, name: key }, tbl, table, definition, tableExists);

    if (alter) {
      col.alter();
    }
  });
};

const addTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAt, updatedAt] = loadedModel.hasTimestamps;
    definition.attributes[createdAt] = { type: TIMESTAMP_TYPE };
    definition.attributes[updatedAt] = { type: TIMESTAMP_TYPE };
  }
};

const removeTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAt, updatedAt] = loadedModel.hasTimestamps;
    delete definition.attributes[createdAt];
    delete definition.attributes[updatedAt];
  }
};

const buildMorphRelationAttributes = (loadedModel, morphRelation, definition) => ({
  [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_type`]: { type: 'text' },
  [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
  order: { type: 'integer' },
});

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
    rootCol = `${RELATED_COL_PREFIX}${rootCol}`;
  }

  return {
    [targetCol]: { type: targetCollection.primaryKeyType },
    [rootCol]: { type: definition.primaryKeyType },
  };
};

const migrateMorphRelations = async (definition, loadedModel, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(association =>
    association.nature.toLowerCase().includes(MORPH_RELATION_PATTERN)
  );

  for (const morphRelation of morphRelations) {
    if (!AUTO_MIGRATION_ENABLED(connection.options)) continue;

    const attributes = buildMorphRelationAttributes(loadedModel, morphRelation, definition);
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
};

const migrateManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant || !AUTO_MIGRATION_ENABLED(connection.options)) continue;

    const { plugin, collection, via } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
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

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  addTimestampAttributes(definition, loadedModel);

  if (AUTO_MIGRATION_ENABLED(connection.options)) {
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

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const handleSqlite3Rebuild = async (table, attributes, definition, ORM, attributesNames) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async (trx) => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );

    await trx.schema.createTable(table, tbl => {
      buildPrimaryKeyColumn(tbl, definition);
      createColumns(tbl, attributes, table, definition, ORM, { tableExists: false });
    });

    const attrs = attributesNames.filter(attributeName =>
      isColumn({
        definition,
        attribute: attributes[attributeName],
        name: attributeName,
      })
    );

    const allAttrs = ['id', ...attrs];
    await trx.insert(qb => qb.select(allAttrs).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  };

  try {
    await ORM.knex.transaction(rebuildTable);
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

const handleAlterTable = async (table, attributes, columnsToAlter, definition, ORM, tableExists) => {
  const alterTable = async (trx) => {
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
      createColumns(tbl, _.pick(attributes, columnsToAlter), table, definition, ORM, {
        tableExists,
        alter: true,
      });
    });
  };

  try {
    await ORM.knex.transaction(alterTable);
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
      strapi.log.error('Migration failed');
      strapi.log.error(err);
    }
    return false;
  }
};

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await ORM.knex.schema.createTable(table, tbl => {
      buildPrimaryKeyColumn(tbl, definition);
      createColumns(tbl, attributes, table, definition, ORM, { tableExists: false });
    });
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
      createColumns(tbl, columnsToAdd, table, definition, ORM, { tableExists });
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

  if (definition.client === 'sqlite3') {
    await handleSqlite3Rebuild(table, attributes, definition, ORM, attributesNames);
  } else {
    await handleAlterTable(table, attributes, columnsToAlter, definition, ORM, tableExists);
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