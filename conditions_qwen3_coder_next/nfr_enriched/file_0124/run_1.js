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
  if (loadedModel.hasTimestamps) {
    addTimestampsToAttributes(definition, loadedModel.hasTimestamps);
  }

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

  const morphRelations = defineMorphRelations(definition);
  for (const morphRelation of morphRelations) {
    await handlePolymorphicRelation(
      { morphRelation, loadedModel, definition, connection, ORM, model },
      context
    );
  }

  const manyRelations = getManyRelations(definition);
  for (const manyRelation of manyRelations) {
    await handleManyToManyRelation(
      { manyRelation, loadedModel, definition, connection, ORM, model },
      context
    );
  }

  if (loadedModel.hasTimestamps) {
    removeTimestampsFromAttributes(definition, loadedModel.hasTimestamps);
  }
};

const addTimestampsToAttributes = (definition, timestampFields) => {
  definition.attributes[timestampFields[0]] = { type: 'currentTimestamp' };
  definition.attributes[timestampFields[1]] = { type: 'currentTimestamp' };
};

const removeTimestampsFromAttributes = (definition, timestampFields) => {
  delete definition.attributes[timestampFields[0]];
  delete definition.attributes[timestampFields[1]];
};

const defineMorphRelations = definition => {
  return definition.associations.filter(association =>
    association.nature.toLowerCase().includes('morphto')
  );
};

const handlePolymorphicRelation = async (
  { morphRelation, loadedModel, definition, connection, ORM, model },
  context
) => {
  const attributes = buildMorphRelationAttributes(loadedModel, morphRelation, definition);

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
};

const buildMorphRelationAttributes = (loadedModel, morphRelation, definition) => {
  return {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
    order: { type: 'integer' },
  };
};

const handleManyToManyRelation = async (
  { manyRelation, loadedModel, definition, connection, ORM, model },
  context
) => {
  if (!manyRelation.dominant) return;

  const targetCollection = strapi.db.getModel(manyRelation.collection, manyRelation.plugin);
  const targetAttr = getTargetAttribute(manyRelation, targetCollection, definition);
  const defAttr = definition.attributes[manyRelation.alias];

  const rootCol = buildRootColumnName(targetAttr, defAttr, loadedModel.tableName);
  const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
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
};

const getTargetAttribute = (manyRelation, targetCollection, definition) => {
  if (manyRelation.via) {
    return targetCollection.attributes[manyRelation.via];
  }

  return {
    attribute: singular(definition.collectionName),
    column: definition.primaryKey,
  };
};

const buildRootColumnName = (targetAttr, defAttr, tableName) => {
  const rootCol = `${defAttr.attribute}_${defAttr.column}`;
  const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;

  return rootCol === targetCol ? `related_${rootCol}` : rootCol;
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);

  return {
    columnName,
    exists,
  };
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
    case 'uid': {
      table.unique(name);
      return table.string(name);
    }
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

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  const createIdType = tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      return tbl
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }
    return tbl.increments('id');
  };

  const createColumns = (tbl, cols, opts = {}) => {
    const { tableExists, alter = false } = opts;

    Object.keys(cols).forEach(key => {
      const attribute = cols[key];
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

      if (attribute.unique === true) {
        if (definition.client !== 'sqlite3' || !tableExists) {
          tbl.unique(key, uniqueColName(table, key));
        }
      }

      if (alter) {
        col.alter();
      }
    });
  };

  const alterColumns = (tbl, cols, opts) => {
    return createColumns(tbl, cols, { ...opts, alter: true });
  };

  const createTable = (table, opts = {}) => {
    const { trx = ORM.knex, ...rest } = opts;

    return trx.schema.createTable(table, tbl => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...rest, tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attributesNames = Object.keys(attributes);

  const columnsInfo = await Promise.all(
    attributesNames.map(attributeName =>
      getColumnInfo(attributeName, table, ORM)
    )
  );

  const nameOfColumnsToAdd = columnsInfo
    .filter(info => !info.exists)
    .map(info => info.columnName);

  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, columnsToAdd, { tableExists });
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

  if (shouldRebuild) {
    await handleRebuild({ definition, table, attributes, attributesNames, columnsToAlter, ORM }, context);
  }
};

const handleRebuild = async ({ definition, table, attributes, attributesNames, columnsToAlter, ORM }, context) => {
  switch (definition.client) {
    case 'sqlite3': {
      return await rebuildSqliteTable({ definition, table, attributes, attributesNames, ORM }, context);
    }
    default: {
      return await alterColumnsInTable({ definition, table, columnsToAlter, attributes, ORM }, context);
    }
  }
};

const rebuildSqliteTable = async ({ definition, table, attributes, attributesNames, ORM }, context) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    await createTable(table, { trx });

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
    handleMigrationError(err, definition.client);
    return false;
  }
};

const alterColumnsInTable = async ({ definition, table, columnsToAlter, attributes, ORM }, context) => {
  const alterTable = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
          .catch(() => {})
      )
    );

    await trx.schema.alterTable(table, tbl => {
      alterColumns(tbl, _.pick(attributes, columnsToAlter), {
        tableExists: true,
      });
    });
  };

  try {
    await ORM.knex.transaction(trx => alterTable(trx));
  } catch (err) {
    handleMigrationError(err, definition.client);
    return false;
  }
};

const handleMigrationError = (err, client) => {
  if (err.message.includes('UNIQUE constraint failed')) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
    );
    return true;
  }

  if (client === 'pg' && err.code === '23505') {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t- ${err.detail}`
    );
    return true;
  }

  if (client === 'mysql' && err.errno === 1062) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.sqlMessage}`
    );
    return true;
  }

  strapi.log.error(`Migration failed`);
  strapi.log.error(err);
  return false;
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