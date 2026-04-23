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
 * Migrate schemas based on model definition and connection options.
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

/**
 * Retrieve column existence information.
 */
const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

/**
 * Determine if a given attribute should be treated as a column.
 */
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
 * Build column definition based on attribute metadata.
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

  const handlers = {
    uuid: tbl => tbl.uuid(name),
    uid: tbl => {
      tbl.unique(name);
      return tbl.string(name);
    },
    richtext: tbl => tbl.text(name, 'longtext'),
    text: tbl => tbl.text(name, 'longtext'),
    json: tbl =>
      definition.client === 'pg' ? tbl.jsonb(name) : tbl.text(name, 'longtext'),
    enumeration: tbl => tbl.string(name),
    string: tbl => tbl.string(name),
    password: tbl => tbl.string(name),
    email: tbl => tbl.string(name),
    integer: tbl => tbl.integer(name),
    biginteger: tbl => tbl.bigInteger(name),
    float: tbl => tbl.double(name),
    decimal: tbl => tbl.decimal(name, 10, 2),
    date: tbl => tbl.date(name),
    time: tbl => tbl.time(name, 3),
    datetime: tbl => tbl.datetime(name),
    timestamp: tbl => tbl.timestamp(name),
    currentTimestamp: tbl => {
      const col = tbl.timestamp(name);
      if (definition.client !== 'sqlite3' && tableExists) {
        return col;
      }
      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: tbl => tbl.boolean(name),
  };

  const handler = handlers[attribute.type];
  return handler ? handler(table) : null;
};

/**
 * Create or update a database table to match the provided definition.
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

  const shouldAddNotNullable = attribute => {
    return (
      definition.client !== 'sqlite3' ||
      !tableExists
    ) && !contentTypesUtils.hasDraftAndPublish(model) && definition.modelType !== 'component';
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

      if (attribute.required) {
        if (shouldAddNotNullable(attribute)) {
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

  const createTable = (tblName, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(tblName, tbl => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...opts, tableExists: false });
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
  const missing = columnsInfo.filter(i => !i.exists).map(i => i.columnName);
  const columnsToAdd = _.pick(attributes, missing);

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

  const clientHandlers = {
    sqlite3: async trx => {
      const tmpTable = `tmp_${table}`;

      await trx.schema.renameTable(table, tmpTable);
      await Promise.all(
        attributeNames.map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
      );
      await createTable(table, { trx });

      const columnAttrs = attributeNames.filter(name =>
        isColumn({
          definition,
          attribute: attributes[name],
          name,
        })
      );
      const allAttrs = ['id', ...columnAttrs];

      await trx.insert(qb => qb.select(allAttrs).from(tmpTable)).into(table);
      await trx.schema.dropTableIfExists(tmpTable);
    },
    default: async trx => {
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
        createColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists });
      });
    },
  };

  const handler = clientHandlers[definition.client] || clientHandlers.default;

  try {
    await ORM.knex.transaction(trx => handler(trx));
  } catch (err) {
    if (definition.client === 'sqlite3' && err.message.includes('UNIQUE constraint failed')) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
      );
    } else if (definition.client === 'pg' && err.code === '23505') {
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