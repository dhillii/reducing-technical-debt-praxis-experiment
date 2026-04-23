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

const syncTable = async ({ table, attributes, definition, ORM, model }, context) => {
  await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
};

const syncMorphRelations = async (definition, loadedModel, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(a =>
    a.nature.toLowerCase().includes('morphto')
  );

  for (const rel of morphRelations) {
    const attrs = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${rel.alias}_id`]: { type: definition.primaryKeyType },
      [`${rel.alias}_type`]: { type: 'text' },
      [definition.attributes[rel.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

    if (shouldMigrate(connection)) {
      await syncTable(
        {
          table: `${loadedModel.tableName}_morph`,
          attributes: attrs,
          definition,
          ORM,
          model,
        },
        context
      );
    }
  }
};

const syncManyRelations = async (definition, loadedModel, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const rel of manyRelations) {
    if (!rel.dominant) continue;

    const targetCollection = strapi.db.getModel(rel.collection, rel.plugin);
    const targetAttr = rel.via
      ? targetCollection.attributes[rel.via]
      : { attribute: singular(definition.collectionName), column: definition.primaryKey };

    const defAttr = definition.attributes[rel.alias];
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;

    if (rootCol === targetCol) rootCol = `related_${rootCol}`;

    const attrs = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (shouldMigrate(connection)) {
      await syncTable(
        {
          table: rel.tableCollectionName,
          attributes: attrs,
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
    await syncTable(
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

  await syncMorphRelations(definition, loadedModel, connection, ORM, model, context);
  await syncManyRelations(definition, loadedModel, connection, ORM, model, context);
  removeTimestamps(definition, loadedModel);
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
  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
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
      if (definition.client !== 'sqlite3' && tableExists) return col;
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

  const createTable = async (tblName, opts = {}) => {
    const trx = opts.trx || ORM.knex;
    await trx.schema.createTable(tblName, tbl => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...opts, tableExists: false });
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
  const colsToAdd = _.pick(attributes, missing);

  if (Object.keys(colsToAdd).length) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, colsToAdd, { tableExists });
    });
  }

  const nonTimestampAttrs = attrNames.filter(
    n => !(definition.options.timestamps || []).includes(n)
  );

  const colsToAlter = await getColumnsWhereDefinitionChanged(
    nonTimestampAttrs,
    definition,
    ORM
  );

  const shouldRebuild =
    colsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  switch (definition.client) {
    case 'sqlite3': {
      const tmp = `tmp_${table}`;
      const rebuild = async trx => {
        await trx.schema.renameTable(table, tmp);
        await Promise.all(
          attrNames.map(k => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, k)))
        );
        await createTable(table, { trx });
        const cols = attrNames.filter(name =>
          isColumn({ definition, attribute: attributes[name], name })
        );
        const selectCols = ['id', ...cols];
        await trx.insert(qb => qb.select(selectCols).from(tmp)).into(table);
        await trx.schema.dropTableIfExists(tmp);
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
        return false;
      }
      break;
    }
    default: {
      const alter = async trx => {
        await Promise.all(
          colsToAlter.map(col =>
            ORM.knex.schema
              .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
              .catch(() => {})
          )
        );
        await trx.schema.alterTable(table, tbl => {
          createColumns(tbl, _.pick(attributes, colsToAlter), { tableExists });
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
        return false;
      }
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