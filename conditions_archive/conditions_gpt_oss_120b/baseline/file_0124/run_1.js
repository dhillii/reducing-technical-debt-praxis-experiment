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

const addTimestamps = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  definition.attributes[created] = { type: 'currentTimestamp' };
  definition.attributes[updated] = { type: 'currentTimestamp' };
};

const removeTimestamps = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  delete definition.attributes[created];
  delete definition.attributes[updated];
};

const shouldMigrate = connection => connection?.options?.autoMigration !== false;

const handleMorphRelations = async ({
  morphRelations,
  loadedModel,
  definition,
  ORM,
  model,
  context,
}) => {
  for (const morphRelation of morphRelations) {
    const attributes = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
      [`${morphRelation.alias}_type`]: { type: 'text' },
      [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

    if (shouldMigrate(context.connection)) {
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

const handleManyRelations = async ({
  manyRelations,
  definition,
  ORM,
  model,
  connection,
  context,
}) => {
  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant) continue;

    const targetCollection = strapi.db.getModel(manyRelation.collection, manyRelation.plugin);
    const targetAttr = manyRelation.via
      ? targetCollection.attributes[manyRelation.via]
      : {
          attribute: singular(definition.collectionName),
          column: definition.primaryKey,
        };

    const defAttr = definition.attributes[manyRelation.alias];
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;

    if (rootCol === targetCol) rootCol = `related_${rootCol}`;

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (shouldMigrate(connection)) {
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

  if (shouldMigrate(connection)) {
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

  const morphRelations = definition.associations.filter(a =>
    a.nature.toLowerCase().includes('morphto')
  );
  await handleMorphRelations({
    morphRelations,
    loadedModel,
    definition,
    ORM,
    model,
    context: { ...context, connection },
  });

  const manyRelations = getManyRelations(definition);
  await handleManyRelations({
    manyRelations,
    definition,
    ORM,
    model,
    connection,
    context,
  });

  removeTimestamps(definition, loadedModel);
};

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    return relation && ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  return !['component', 'dynamiczone'].includes(attribute.type);
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

  if (_.has(attribute, 'columnType')) return table.specificType(name, attribute.columnType);

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
      return definition.client !== 'sqlite3' && tableExists ? col : col.defaultTo(ORM.knex.fn.now());
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

  const createColumns = (tbl, cols, { tableExists, alter = false } = {}) => {
    Object.entries(cols).forEach(([key, attribute]) => {
      const col = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists,
        definition,
        ORM,
      });
      if (!col) return;

      if (attribute.required) {
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

      if (attribute.unique && (definition.client !== 'sqlite3' || !tableExists)) {
        tbl.unique(key, uniqueColName(table, key));
      }

      if (alter) col.alter();
    });
  };

  const createTable = async (tblName, trx = ORM.knex) => {
    await trx.schema.createTable(tblName, tbl => {
      createIdType(tbl);
      createColumns(tbl, attributes, { tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attrNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attrNames.map(name => getColumnInfo(name, table, ORM))
  );
  const missing = columnsInfo.filter(i => !i.exists).map(i => i.columnName);
  const columnsToAdd = _.pick(attributes, missing);

  if (Object.keys(columnsToAdd).length) {
    await ORM.knex.schema.table(table, tbl => createColumns(tbl, columnsToAdd, { tableExists }));
  }

  const nonTimestampAttrs = attrNames.filter(
    n => !(definition.options.timestamps || []).includes(n)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    nonTimestampAttrs,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    const tmpTable = `tmp_${table}`;
    const rebuild = async trx => {
      await trx.schema.renameTable(table, tmpTable);
      await Promise.all(
        attrNames.map(k => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, k)))
      );
      await createTable(table, trx);
      const cols = attrNames.filter(name =>
        isColumn({ definition, attribute: attributes[name], name })
      );
      const allCols = ['id', ...cols];
      await trx.insert(qb => qb.select(allCols).from(tmpTable)).into(table);
      await trx.schema.dropTableIfExists(tmpTable);
    };
    try {
      await ORM.knex.transaction(rebuild);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        strapi.log.error(
          `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
        );
      } else {
        strapi.log.error('Migration failed');
        strapi.log.error(err);
      }
    }
    return;
  }

  const alter = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
          .catch(() => {})
      )
    );
    await trx.schema.alterTable(table, tbl => {
      createColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists });
    });
  };

  try {
    await ORM.knex.transaction(alter);
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
      strapi.log.error('Migration failed');
      strapi.log.error(err);
    }
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