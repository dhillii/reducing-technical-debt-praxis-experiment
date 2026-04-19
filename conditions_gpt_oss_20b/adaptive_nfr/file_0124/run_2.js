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
 * Builds a column type based on the attribute definition.
 *
 * @param {Object} params
 * @param {string} params.name - Column name.
 * @param {Object} params.attribute - Attribute definition.
 * @param {Object} params.table - Knex table builder.
 * @param {boolean} params.tableExists - Whether the table already exists.
 * @param {Object} params.definition - Model definition.
 * @param {Object} params.ORM - ORM instance.
 * @returns {Object|null} Knex column builder or null if unsupported.
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

  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  const builders = {
    uuid: (tbl) => tbl.uuid(name),
    uid: (tbl) => {
      tbl.unique(name);
      return tbl.string(name);
    },
    richtext: (tbl) => tbl.text(name, 'longtext'),
    text: (tbl) => tbl.text(name, 'longtext'),
    json: (tbl) => (definition.client === 'pg' ? tbl.jsonb(name) : tbl.text(name, 'longtext')),
    enumeration: (tbl) => tbl.string(name),
    string: (tbl) => tbl.string(name),
    password: (tbl) => tbl.string(name),
    email: (tbl) => tbl.string(name),
    integer: (tbl) => tbl.integer(name),
    biginteger: (tbl) => tbl.bigInteger(name),
    float: (tbl) => tbl.double(name),
    decimal: (tbl) => tbl.decimal(name, 10, 2),
    date: (tbl) => tbl.date(name),
    time: (tbl) => tbl.time(name, 3),
    datetime: (tbl) => tbl.datetime(name),
    timestamp: (tbl) => {
      const col = tbl.timestamp(name);
      if (definition.client !== 'sqlite3' && tableExists) return col;
      return col.defaultTo(ORM.knex.fn.now());
    },
    currentTimestamp: (tbl) => {
      const col = tbl.timestamp(name);
      if (definition.client !== 'sqlite3' && tableExists) return col;
      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: (tbl) => tbl.boolean(name),
  };

  const builder = builders[attribute.type];
  return builder ? builder(table) : null;
};

/**
 * Determines if an attribute represents a column.
 *
 * @param {Object} params
 * @param {Object} params.definition - Model definition.
 * @param {Object} params.attribute - Attribute definition.
 * @param {string} params.name - Attribute name.
 * @returns {boolean}
 */
const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find((association) => association.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }

  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

/**
 * Equilizes database tables.
 *
 * @param {Object} params
 * @param {string} params.table - Table name.
 * @param {Object} params.attributes - Table attributes.
 * @param {Object} params.definition - Model definition.
 * @param {Object} params.ORM - ORM instance.
 * @param {Object} params.model - Model instance.
 * @param {Object} context - Migration context.
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
    const { tableExists: exists, alter = false } = opts;
    Object.keys(cols).forEach((key) => {
      const attribute = cols[key];
      const col = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists: exists,
        definition,
        ORM,
      });
      if (!col) return;

      if (attribute.required === true) {
        if (
          (definition.client !== 'sqlite3' || !exists) &&
          !contentTypesUtils.hasDraftAndPublish(model) &&
          definition.modelType !== 'component'
        ) {
          col.notNullable();
        }
      } else {
        col.nullable();
      }

      if (attribute.unique === true) {
        if (definition.client !== 'sqlite3' || !exists) {
          tbl.unique(key, uniqueColName(table, key));
        }
      }

      if (alter) col.alter();
    });
  };

  const alterColumns = (tbl, cols, opts = {}) => createColumns(tbl, cols, { ...opts, alter: true });

  const createTable = async (tblName, { trx = ORM.knex, ...opts } = {}) => {
    await trx.schema.createTable(tblName, (tbl) => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...opts, tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attributesNames = Object.keys(attributes);

  const columnsInfo = await Promise.all(
    attributesNames.map((attributeName) => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter((info) => !info.exists).map((info) => info.columnName);
  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

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

  if (!shouldRebuild) return;

  const rebuildStrategies = {
    sqlite3: async (trx) => {
      const tmpTable = `tmp_${table}`;

      await trx.schema.renameTable(table, tmpTable);

      await Promise.all(
        attributesNames.map((key) => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
      );

      await createTable(table, { trx });

      const attrs = attributesNames.filter((attributeName) =>
        isColumn({
          definition,
          attribute: attributes[attributeName],
          name: attributeName,
        })
      );

      const allAttrs = ['id', ...attrs];

      await trx.insert((qb) => qb.select(allAttrs).from(tmpTable)).into(table);
      await trx.schema.dropTableIfExists(tmpTable);
    },
    default: async (trx) => {
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
        alterColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists });
      });
    },
  };

  const rebuild = rebuildStrategies[definition.client] || rebuildStrategies.default;

  try {
    await ORM.knex.transaction((trx) => rebuild(trx));
  } catch (err) {
    if (definition.client === 'pg' && err.code === '23505') {
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

    const table = manyRelation.tableCollectionName;
    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
    }
  }

  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
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