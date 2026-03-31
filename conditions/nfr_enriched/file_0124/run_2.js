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
const NON_COLUMN_TYPES = ['component', 'dynamiczone'];

// Utility functions
const shouldAutoMigrate = (connection) => !connection.options || connection.options.autoMigration !== false;

const getRelationByAlias = (definition, alias) =>
  definition.associations.find(association => association.alias === alias);

const isRelationWithColumn = (relation) =>
  relation && RELATION_TYPES_WITH_COLUMNS.includes(relation.nature);

const isMorphRelation = (association) =>
  association.nature.toLowerCase().includes(MORPH_RELATION_PATTERN);

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = getRelationByAlias(definition, name);
    return isRelationWithColumn(relation);
  }

  return !NON_COLUMN_TYPES.includes(attribute.type);
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = getRelationByAlias(definition, name);
    if (isRelationWithColumn(relation)) {
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
  if (typeHandler) {
    const col = typeHandler(table, name, definition);
    
    if (attribute.type === TIMESTAMP_TYPE && definition.client !== 'sqlite3' && tableExists) {
      return col;
    }
    
    if (attribute.type === TIMESTAMP_TYPE) {
      return col.defaultTo(ORM.knex.fn.now());
    }
    
    return col;
  }

  return null;
};

const addTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAtField, updatedAtField] = loadedModel.hasTimestamps;
    definition.attributes[createdAtField] = { type: TIMESTAMP_TYPE };
    definition.attributes[updatedAtField] = { type: TIMESTAMP_TYPE };
  }
};

const removeTimestampAttributes = (definition, loadedModel) => {
  if (loadedModel.hasTimestamps) {
    const [createdAtField, updatedAtField] = loadedModel.hasTimestamps;
    delete definition.attributes[createdAtField];
    delete definition.attributes[updatedAtField];
  }
};

const buildMorphRelationAttributes = (loadedModel, morphRelation, definition) => ({
  [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
  [`${morphRelation.alias}_type`]: { type: 'text' },
  [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
  order: { type: 'integer' },
});

const buildManyRelationAttributes = (manyRelation, definition, targetCollection, targetAttr, defAttr) => {
  let targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
  let rootCol = `${defAttr.attribute}_${defAttr.column}`;

  if (rootCol === targetCol) {
    rootCol = `${RELATED_COL_PREFIX}${rootCol}`;
  }

  return {
    [targetCol]: { type: targetCollection.primaryKeyType },
    [rootCol]: { type: definition.primaryKeyType },
  };
};

const getTargetAttribute = (manyRelation, definition, targetCollection) => {
  if (manyRelation.via) {
    return targetCollection.attributes[manyRelation.via];
  }

  return {
    attribute: singular(definition.collectionName),
    column: definition.primaryKey,
  };
};

const migrateMorphRelations = async (loadedModel, definition, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(isMorphRelation);

  for (const morphRelation of morphRelations) {
    if (!shouldAutoMigrate(connection)) continue;

    const attributes = buildMorphRelationAttributes(loadedModel, morphRelation, definition);
    const table = `${loadedModel.tableName}${MORPH_RELATION_SUFFIX}`;

    await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
  }
};

const migrateManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant || !shouldAutoMigrate(connection)) continue;

    const { plugin, collection, via, alias } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
    const targetAttr = getTargetAttribute(manyRelation, definition, targetCollection);
    const defAttr = definition.attributes[alias];

    const attributes = buildManyRelationAttributes(
      manyRelation,
      definition,
      targetCollection,
      targetAttr,
      defAttr
    );

    await createOrUpdateTable(
      { table: manyRelation.tableCollectionName, attributes, definition, ORM, model },
      context
    );
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

  await migrateMorphRelations(loadedModel, definition, connection, ORM, model, context);
  await migrateManyRelations(definition, connection, ORM, model, context);

  removeTimestampAttributes(definition, loadedModel);
};

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

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

    applyColumnConstraints(col, attribute, definition, model, tbl, key);

    if (alter) {
      col.alter();
    }
  });
};

const rebuildSqliteTable = async (ORM, table, attributes, definition, attributesNames) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    await trx.schema.createTable(table, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { tableExists: false, definition, ORM, table });
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
    await ORM.knex.transaction(trx => rebuildTable(trx));
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

const alterTableColumns = async (ORM, table, attributes, columnsToAlter, definition, tableExists) => {
  const alterTable = async trx => {
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
        tableExists,
        alter: true,
        definition,
        ORM,
        table,
      });
    });
  };

  try {
    await ORM.knex.transaction(trx => alterTable(trx));
  } catch (err) {
    const errorHandlers = {
      pg: () => err.code === '23505',
      mysql: () => err.errno === 1062,
    };

    if (errorHandlers[definition.client]?.()) {
      const messages = {
        pg: `${err.message}\n\t- ${err.detail}`,
        mysql: err.sqlMessage,
      };
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${messages[definition.client]}`
      );
    } else {
      strapi.log.error(`Migration failed`);
      strapi.log.error(err);
    }
    return false;
  }
};

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await ORM.knex.schema.createTable(table, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { tableExists: false, definition, ORM, model, table });
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

  if (definition.client === 'sqlite3') {
    await rebuildSqliteTable(ORM, table, attributes, definition, attributesNames);
  } else {
    await alterTableColumns(ORM, table, attributes, columnsToAlter, definition, tableExists);
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