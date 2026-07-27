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
 * Migrate schemas based on model definition.
 */
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
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

  const morphRelations = definition.associations.filter(association =>
    association.nature.toLowerCase().includes('morphto')
  );

  for (const morphRelation of morphRelations) {
    const attributes = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
      [`${morphRelation.alias}_type`]: { type: 'text' },
      [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

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
  }

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
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;

    if (rootCol === targetCol) {
      rootCol = `related_${rootCol}`;
    }

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
        { table: manyRelation.tableCollectionName, attributes, definition, ORM, model },
        context
      );
    }
  }

  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
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

  if (['component', 'dynamiczone'].includes(attribute.type)) {
    return false;
  }

  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

/**
 * Map of column builders keyed by attribute type.
 */
const columnBuilders = {
  uuid: (tbl, name) => tbl.uuid(name),
  uid: (tbl, name) => {
    tbl.unique(name);
    return tbl.string(name);
  },
  richtext: (tbl, name) => tbl.text(name, 'longtext'),
  text: (tbl, name) => tbl.text(name, 'longtext'),
  json: (tbl, name, definition) =>
    definition.client === 'pg' ? tbl.jsonb(name) : tbl.text(name, 'longtext'),
  enumeration: (tbl, name) => tbl.string(name),
  string: (tbl, name) => tbl.string(name),
  password: (tbl, name) => tbl.string(name),
  email: (tbl, name) => tbl.string(name),
  integer: (tbl, name) => tbl.integer(name),
  biginteger: (tbl, name) => tbl.bigInteger(name),
  float: (tbl, name) => tbl.double(name),
  decimal: (tbl, name) => tbl.decimal(name, 10, 2),
  date: (tbl, name) => tbl.date(name),
  time: (tbl, name) => tbl.time(name, 3),
  datetime: (tbl, name) => tbl.datetime(name),
  timestamp: (tbl, name) => tbl.timestamp(name),
  currentTimestamp: (tbl, name, definition, tableExists, ORM) => {
    const col = tbl.timestamp(name);
    if (definition.client !== 'sqlite3' && tableExists) {
      return col;
    }
    return col.defaultTo(ORM.knex.fn.now());
  },
  boolean: (tbl, name) => tbl.boolean(name),
};

/**
 * Build column based on attribute definition.
 */
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

  const builder = columnBuilders[attribute.type];
  if (!builder) return null;

  return builder(table, name, definition, tableExists, ORM);
};

/**
 * Determine if a column should be NOT NULL.
 */
const shouldBeNotNullable = ({ attribute, definition, tableExists }) => {
  if (attribute.required !== true) return false;
  if (definition.client === 'sqlite3' && tableExists) return false;
  if (contentTypesUtils.hasDraftAndPublish(model)) return false;
  if (definition.modelType === 'component') return false;
  return true;
};

/**
 * Create or update a table based on the provided attributes.
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  const createIdColumn = tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      return tbl
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }
    return tbl.increments('id');
  };

  const createColumns = (tbl, cols, opts = {}) => {
    const { tableExists: tblExists, alter = false } = opts;

    Object.entries(cols).forEach(([key, attribute]) => {
      const col = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists: tblExists,
        definition,
        ORM,
      });
      if (!col) return;

      if (shouldBeNotNullable({ attribute, definition, tableExists: tblExists })) {
        col.notNullable();
      } else {
        col.nullable();
      }

      if (attribute.unique === true && (definition.client !== 'sqlite3' || !tblExists)) {
        tbl.unique(key, uniqueColName(table, key));
      }

      if (alter) col.alter();
    });
  };

  const createTable = async (tblName, trx = ORM.knex) => {
    await trx.schema.createTable(tblName, tbl => {
      createIdColumn(tbl);
      createColumns(tbl, attributes, { tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attributeNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributeNames.map(name => getColumnInfo(name, table, ORM))
  );
  const missingColumns = columnsInfo.filter(info => !info.exists).map(i => i.columnName);
  const columnsToAdd = _.pick(attributes, missingColumns);

  if (Object.keys(columnsToAdd).length) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, columnsToAdd, { tableExists });
    });
  }

  const attrsWithoutTimestamps = attributeNames.filter(
    name => !(definition.options.timestamps || []).includes(name)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await handleSQLiteRebuild({
      table,
      attributes,
      definition,
      ORM,
      model,
      columnsToAlter,
      createTable,
    });
  } else {
    await handleDefaultAlter({
      table,
      attributes,
      definition,
      ORM,
      model,
      columnsToAlter,
      createTable,
    });
  }
};

/**
 * Rebuild SQLite table when schema changes require recreation.
 */
const handleSQLiteRebuild = async ({
  table,
  attributes,
  definition,
  ORM,
  model,
  columnsToAlter,
  createTable,
}) => {
  const tmpTable = `tmp_${table}`;

  const rebuild = async trx => {
    await trx.schema.renameTable(table, tmpTable);
    await Promise.all(
      Object.keys(attributes).map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );
    await createTable(table, trx);

    const columnNames = Object.keys(attributes);
    const attrs = columnNames.filter(name =>
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
};

/**
 * Alter non‑SQLite tables to apply column changes.
 */
const handleDefaultAlter = async ({
  table,
  attributes,
  definition,
  ORM,
  model,
  columnsToAlter,
  createTable,
}) => {
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
      const cols = _.pick(attributes, columnsToAlter);
      createColumns(tbl, cols, { tableExists: true, alter: true });
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