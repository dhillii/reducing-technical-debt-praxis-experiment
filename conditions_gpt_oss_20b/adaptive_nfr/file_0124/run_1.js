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
 * Migrate database schemas to match the current model definition.
 *
 * @param {Object} params
 * @param {Object} params.ORM
 * @param {Object} params.loadedModel
 * @param {Object} params.definition
 * @param {Object} params.connection
 * @param {Object} params.model
 * @param {Object} context
 */
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  // Add created_at and updated_at field if timestamp option is true
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }

  // Equilize tables
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

  // Equilize polymorphic relations
  const morphRelations = definition.associations.filter((association) =>
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

  // Equilize many to many relations
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

    // manyWay with same CT
    if (rootCol === targetCol) {
      rootCol = `related_${rootCol}`;
    }

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    const table = manyRelation.tableCollectionName;
    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
    }
  }

  // Remove from attributes (auto handled by bookshelf and not displayed on ctb)
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);

  return {
    columnName,
    exists,
  };
};

/**
 * Determines if an attribute represents a column in the database.
 *
 * @param {Object} params
 * @param {Object} params.definition
 * @param {Object} params.attribute
 * @param {string} params.name
 * @returns {boolean}
 */
const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find((association) => association.alias === name);
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
 * Builds a column type for the given attribute.
 *
 * @param {Object} params
 * @param {string} params.name
 * @param {Object} params.attribute
 * @param {Object} params.table
 * @param {boolean} [params.tableExists=false]
 * @param {Object} params.definition
 * @param {Object} params.ORM
 * @returns {Object|null}
 */
const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find((association) => association.alias === name);

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

  // allow custom data type for a column
  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  const typeBuilders = {
    uuid: (tbl, key) => tbl.uuid(key),
    uid: (tbl, key) => {
      tbl.unique(key);
      return tbl.string(key);
    },
    richtext: (tbl, key) => tbl.text(key, 'longtext'),
    text: (tbl, key) => tbl.text(key, 'longtext'),
    json: (tbl, key) =>
      definition.client === 'pg' ? tbl.jsonb(key) : tbl.text(key, 'longtext'),
    enumeration: (tbl, key) => tbl.string(key),
    string: (tbl, key) => tbl.string(key),
    password: (tbl, key) => tbl.string(key),
    email: (tbl, key) => tbl.string(key),
    integer: (tbl, key) => tbl.integer(key),
    biginteger: (tbl, key) => tbl.bigInteger(key),
    float: (tbl, key) => tbl.double(key),
    decimal: (tbl, key) => tbl.decimal(key, 10, 2),
    date: (tbl, key) => tbl.date(key),
    time: (tbl, key) => tbl.time(key, 3),
    datetime: (tbl, key) => tbl.datetime(key),
    timestamp: (tbl, key) => tbl.timestamp(key),
    currentTimestamp: (tbl, key) => {
      const col = tbl.timestamp(key);
      if (definition.client !== 'sqlite3' && tableExists) {
        return col;
      }
      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: (tbl, key) => tbl.boolean(key),
  };

  const builder = typeBuilders[attribute.type];
  return builder ? builder(table, name) : null;
};

/**
 * Strategy for rebuilding a SQLite table.
 *
 * @param {Object} params
 * @param {string} params.table
 * @param {Object} params.attributes
 * @param {Object} params.definition
 * @param {Object} params.ORM
 * @param {Object} params.trx
 * @returns {Promise<void>}
 */
const rebuildSqliteTable = async ({ table, attributes, definition, ORM, trx }) => {
  const tmpTable = `tmp_${table}`;

  await trx.schema.renameTable(table, tmpTable);

  // drop possible conflicting indexes
  await Promise.all(
    Object.keys(attributes).map((key) =>
      trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
    )
  );

  // create the table
  await createTable(table, { trx, definition, attributes, ORM });

  const attrs = Object.keys(attributes).filter((attributeName) =>
    isColumn({
      definition,
      attribute: attributes[attributeName],
      name: attributeName,
    })
  );

  const allAttrs = ['id', ...attrs];

  await trx.insert((qb) => qb.select(allAttrs).from(tmpTable)).into(table);
  await trx.schema.dropTableIfExists(tmpTable);
};

/**
 * Strategy for altering a non-SQLite table.
 *
 * @param {Object} params
 * @param {string} params.table
 * @param {Object} params.attributes
 * @param {Object} params.definition
 * @param {Object} params.ORM
 * @param {Object} params.trx
 * @param {Array<string>} params.columnsToAlter
 * @returns {Promise<void>}
 */
const alterTableStrategy = async ({ table, attributes, definition, ORM, trx, columnsToAlter }) => {
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
    alterColumns(tbl, _.pick(attributes, columnsToAlter), {
      tableExists: true,
    });
  });
};

/**
 * Creates or updates a database table based on the provided definition.
 *
 * @param {Object} params
 * @param {string} params.table
 * @param {Object} params.attributes
 * @param {Object} params.definition
 * @param {Object} params.ORM
 * @param {Object} params.model
 * @param {Object} context
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  const createIdType = (tbl) => {
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
    Object.keys(cols).forEach((key) => {
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

  const alterColumns = (tbl, cols, opts = {}) => {
    return createColumns(tbl, cols, { ...opts, alter: true });
  };

  const createTable = (tableName, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(tableName, (tbl) => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...opts, tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attributesNames = Object.keys(attributes);

  // Fetch existing column
  const columnsInfo = await Promise.all(
    attributesNames.map((attributeName) => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter((info) => !info.exists).map((info) => info.columnName);

  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  // Generate and execute query to add missing column
  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, (tbl) => {
      createColumns(tbl, columnsToAdd, { tableExists });
    });
  }

  const attrsNameWithoutTimestamps = attributesNames.filter(
    (columnName) => !(definition.options.timestamps || []).includes(columnName)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsNameWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (shouldRebuild) {
    if (definition.client === 'sqlite3') {
      try {
        await ORM.knex.transaction((trx) => rebuildSqliteTable({ table, attributes, definition, ORM, trx }));
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
    } else {
      try {
        await ORM.knex.transaction((trx) =>
          alterTableStrategy({
            table,
            attributes,
            definition,
            ORM,
            trx,
            columnsToAlter,
          })
        );
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
    }
  }
};

module.exports = async ({ ORM, loadedModel, definition, connection, model }) => {
  const previousDefinition = await getDefinitionFromStore(definition, ORM);

  // run migrations
  await strapi.db.migrations.run(migrateSchemas, {
    ORM,
    loadedModel,
    previousDefinition,
    definition,
    connection,
    model,
  });

  // store new definitions
  await storeDefinition(definition, ORM);
};