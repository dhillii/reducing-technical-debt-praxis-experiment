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
  const morphRelations = definition.associations.filter(association => {
    return association.nature.toLowerCase().includes('morphto');
  });

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

    if (dominant) {
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

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(association => {
      return association.alias === name;
    });

    if (!relation) return false;

    if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) {
      return true;
    }

    return false;
  }

  if (['component', 'dynamiczone'].includes(attribute.type)) {
    return false;
  }

  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

/** @type {Object<string, Function>} Strategy map for column type builders */
const columnTypeStrategies = {
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
  currentTimestamp: (table, name, definition, tableExists, ORM) => {
    const col = table.timestamp(name);
    if (definition.client !== 'sqlite3' && tableExists) {
      return col;
    }
    return col.defaultTo(ORM.knex.fn.now());
  },
  boolean: (table, name) => table.boolean(name),
};

/**
 * Builds column type using strategy pattern
 * @param {Object} params - Configuration parameters
 * @returns {*} Column definition or null
 */
const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find(association => association.alias === name);

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

  const strategy = columnTypeStrategies[attribute.type];
  if (strategy) {
    return strategy(table, name, definition, tableExists, ORM);
  }

  return null;
};

/**
 * Determines if table rebuild is needed for sqlite3
 * @param {string} table - Table name
 * @param {Array} attributesNames - Attribute names
 * @param {Object} attributes - Attributes map
 * @param {Object} definition - Definition object
 * @param {Object} ORM - ORM instance
 * @returns {Promise<boolean>}
 */
const rebuildSqliteTable = async (table, attributesNames, attributes, definition, ORM) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    // drop possible conflicting indexes
    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    // create the table
    await createTable(table, { trx, definition, ORM, attributes });

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
    return true;
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
 * Handles error logging for different database clients
 * @param {Error} err - Error object
 * @param {string} client - Database client type
 */
const handleAlterTableError = (err, client) => {
  if (err.code === '23505' && client === 'pg') {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t- ${err.detail}`
    );
  } else if (client === 'mysql' && err.errno === 1062) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.sqlMessage}`
    );
  } else {
    strapi.log.error(`Migration failed`);
    strapi.log.error(err);
  }
};

/**
 * Alters existing table columns
 * @param {string} table - Table name
 * @param {Array} columnsToAlter - Columns to alter
 * @param {Object} attributes - Attributes map
 * @param {Object} definition - Definition object
 * @param {Object} ORM - ORM instance
 * @returns {Promise<boolean>}
 */
const alterExistingTable = async (table, columnsToAlter, attributes, definition, ORM) => {
  const alterTable = async trx => {
    await Promise.all(
      columnsToAlter.map(col => {
        return ORM.knex.schema
          .alterTable(table, tbl => {
            tbl.dropUnique(col, uniqueColName(table, col));
          })
          .catch(() => {});
      })
    );
    await trx.schema.alterTable(table, tbl => {
      alterColumns(tbl, _.pick(attributes, columnsToAlter), {
        tableExists: true,
      });
    });
  };

  try {
    await ORM.knex.transaction(trx => alterTable(trx));
    return true;
  } catch (err) {
    handleAlterTableError(err, definition.client);
    return false;
  }
};

/**
 * Executes rebuild based on database client type
 * @param {string} client - Database client type
 * @param {Object} params - Rebuild parameters
 * @returns {Promise<boolean>}
 */
const executeRebuild = async (client, params) => {
  const { table, attributesNames, attributes, definition, ORM, columnsToAlter } = params;

  if (client === 'sqlite3') {
    return rebuildSqliteTable(table, attributesNames, attributes, definition, ORM);
  }

  return alterExistingTable(table, columnsToAlter, attributes, definition, ORM);
};

// Equilize database tables
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  const createIdType = table => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      return table
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }

    return table.increments('id');
  };

  const createColumns = (tbl, columns, opts = {}) => {
    const { tableExists, alter = false } = opts;

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

      if (attribute.required === true) {
        if (
          (definition.client !== 'sqlite3' || !tableExists) &&
          !contentTypesUtils.hasDraftAndPublish(model) && // no require constraint to allow drafts
          definition.modelType !== 'component' // no require constraint to allow components in drafts
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

  const alterColumns = (tbl, columns, opts = {}) => {
    return createColumns(tbl, columns, { ...opts, alter: true });
  };

  const createTable = (tbl, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(tbl, t => {
      createIdType(t);
      createColumns(t, attributes, { ...opts, tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attributesNames = Object.keys(attributes);

  // Fetch existing column
  const columnsInfo = await Promise.all(
    attributesNames.map(attributeName => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter(info => !info.exists).map(info => info.columnName);

  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  // Generate and execute query to add missing column
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
    await executeRebuild(definition.client, {
      table,
      attributesNames,
      attributes,
      definition,
      ORM,
      columnsToAlter,
    });
  }
};

module.exports = async ({ ORM, loadedModel, definition, connection, model }) => {
  const previousDefinition = await getDefinitionFromStore(definition, ORM);

  // run migrations