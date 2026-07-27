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

/**
 * Adds timestamp attributes to the definition if the model has timestamps.
 *
 * @param {Object} definition - The model definition.
 * @param {Object} loadedModel - The loaded model metadata.
 */
const addTimestamps = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  definition.attributes[created] = { type: 'currentTimestamp' };
  definition.attributes[updated] = { type: 'currentTimestamp' };
};

/**
 * Removes timestamp attributes from the definition after migration.
 *
 * @param {Object} definition - The model definition.
 * @param {Object} loadedModel - The loaded model metadata.
 */
const removeTimestamps = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  delete definition.attributes[created];
  delete definition.attributes[updated];
};

/**
 * Creates or updates a table based on the definition.
 *
 * @param {Object} params - Parameters for table creation/updating.
 * @param {Object} context - Migration context.
 */
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
      const attr = cols[key];
      const col = buildColType({
        name: key,
        attribute: attr,
        table: tbl,
        tableExists,
        definition,
        ORM,
      });
      if (!col) return;
      if (attr.required === true) {
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
      if (attr.unique === true && (definition.client !== 'sqlite3' || !tableExists)) {
        tbl.unique(key, uniqueColName(table, key));
      }
      if (alter) col.alter();
    });
  };

  const alterColumns = (tbl, cols, opts = {}) => createColumns(tbl, cols, { ...opts, alter: true });

  const createTable = async (tblName, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(tblName, tbl => {
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
  const missing = columnsInfo.filter(info => !info.exists).map(info => info.columnName);
  const columnsToAdd = _.pick(attributes, missing);

  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, columnsToAdd, { tableExists });
    });
  }

  const attrsWithoutTimestamps = attrNames.filter(
    name => !(definition.options.timestamps || []).includes(name)
  );
  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  const rebuildStrategies = {
    sqlite3: async () => {
      const tmpTable = `tmp_${table}`;
      const rebuild = async trx => {
        await trx.schema.renameTable(table, tmpTable);
        await Promise.all(
          attrNames.map(key =>
            trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
          )
        );
        await createTable(table, { trx });
        const attrs = attrNames.filter(name =>
          isColumn({ definition, attribute: attributes[name], name })
        );
        const allAttrs = ['id', ...attrs];
        await trx.insert(qb => qb.select(allAttrs).from(tmpTable)).into(table);
        await trx.schema.dropTableIfExists(tmpTable);
      };
      try {
        await ORM.knex.transaction(trx => rebuild(trx));
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
    },
    default: async () => {
      const alter = async trx => {
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
          alterColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists });
        });
      };
      try {
        await ORM.knex.transaction(trx => alter(trx));
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
          strapi.log.error(`Migration failed`);
          strapi.log.error(err);
        }
        return false;
      }
    },
  };

  await rebuildStrategies[definition.client]();
};

/**
 * Handles morph relations for a given model.
 *
 * @param {Object} params - Parameters for morph relation handling.
 * @param {Object} context - Migration context.
 */
const handleMorphRelations = async (params, context) => {
  const { definition, loadedModel, ORM, model } = params;
  const morphRelations = definition.associations.filter(assoc =>
    assoc.nature.toLowerCase().includes('morphto')
  );

  for (const morph of morphRelations) {
    const attrs = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${morph.alias}_id`]: { type: definition.primaryKeyType },
      [`${morph.alias}_type`]: { type: 'text' },
      [definition.attributes[morph.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };
    await createOrUpdateTable(
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
};

/**
 * Handles many-to-many dominant relations for a given model.
 *
 * @param {Object} params - Parameters for many relation handling.
 * @param {Object} context - Migration context.
 */
const handleManyRelations = async (params, context) => {
  const { definition, ORM, model } = params;
  const manyRelations = getManyRelations(definition);

  for (const rel of manyRelations) {
    if (!rel.dominant) continue;
    const target = strapi.db.getModel(rel.collection, rel.plugin);
    const targetAttr = rel.via
      ? target.attributes[rel.via]
      : { attribute: singular(definition.collectionName), column: definition.primaryKey };
    const defAttr = definition.attributes[rel.alias];
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;
    if (rootCol === targetCol) rootCol = `related_${rootCol}`;
    const attrs = {
      [targetCol]: { type: target.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };
    await createOrUpdateTable(
      { table: rel.tableCollectionName, attributes: attrs, definition, ORM, model },
      context
    );
  }
};

/**
 * Migrates schemas for a loaded model.
 *
 * @param {Object} params - Migration parameters.
 * @param {Object} context - Migration context.
 */
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  addTimestamps(definition, loadedModel);

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

  await handleMorphRelations({ definition, loadedModel, ORM, model }, context);
  await handleManyRelations({ definition, ORM, model }, context);

  removeTimestamps(definition, loadedModel);
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(assoc => assoc.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find(assoc => assoc.alias === name);
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

  const typeMap = {
    uuid: () => table.uuid(name),
    uid: () => { table.unique(name); return table.string(name); },
    richtext: () => table.text(name, 'longtext'),
    text: () => table.text(name, 'longtext'),
    json: () => (definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext')),
    enumeration: () => table.string(name),
    string: () => table.string(name),
    password: () => table.string(name),
    email: () => table.string(name),
    integer: () => table.integer(name),
    biginteger: () => table.bigInteger(name),
    float: () => table.double(name),
    decimal: () => table.decimal(name, 10, 2),
    date: () => table.date(name),
    time: () => table.time(name, 3),
    datetime: () => table.datetime(name),
    timestamp: () => table.timestamp(name),
    currentTimestamp: () => {
      const col = table.timestamp(name);
      if (definition.client !== 'sqlite3' && tableExists) return col;
      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: () => table.boolean(name),
  };

  const builder = typeMap[attribute.type];
  return builder ? builder() : null;
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