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

/**
 * Determines if an attribute represents a column (vs a relation).
 * @param {Object} params
 * @param {Object} params.definition
 * @param {Object} params.attribute
 * @param {string} params.name
 * @returns {boolean}
 */
const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  return !['component', 'dynamiczone'].includes(attribute.type);
};

/**
 * Returns a unique column name for indexes.
 * @param {string} table
 * @param {string} key
 * @returns {string}
 */
const uniqueColName = (table, key) => `${table}_${key}_unique`;

/**
 * Mapping of attribute types to column builders.
 */
const typeBuilders = {
  uuid: (tbl, name) => tbl.uuid(name),
  uid: (tbl, name) => {
    tbl.unique(name);
    return tbl.string(name);
  },
  richtext: (tbl, name) => tbl.text(name, 'longtext'),
  text: (tbl, name) => tbl.text(name, 'longtext'),
  json: (tbl, name, def) =>
    def.client === 'pg' ? tbl.jsonb(name) : tbl.text(name, 'longtext'),
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
  currentTimestamp: (tbl, name, def, tableExists, ORM) => {
    const col = tbl.timestamp(name);
    if (def.client !== 'sqlite3' && tableExists) return col;
    return col.defaultTo(ORM.knex.fn.now());
  },
  boolean: (tbl, name) => tbl.boolean(name),
};

/**
 * Builds a column based on attribute definition.
 * @param {Object} opts
 * @param {string} opts.name
 * @param {Object} opts.attribute
 * @param {Object} opts.table
 * @param {boolean} opts.tableExists
 * @param {Object} opts.definition
 * @param {Object} opts.ORM
 * @returns {Object|null}
 */
const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  // Relation handling
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

  // Custom column type
  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  const builder = typeBuilders[attribute.type];
  return builder ? builder(table, name, definition, tableExists, ORM) : null;
};

/**
 * Creates or updates a table based on the provided schema.
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

  const createIdColumn = tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      return tbl
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }
    return tbl.increments('id');
  };

  const applyColumnConstraints = (col, attribute) => {
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
      col.table.unique(col.builder._method, uniqueColName(table, col.builder._method));
    }
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

      applyColumnConstraints(col, attribute);
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

  // Add missing columns
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

  // Determine columns needing alteration
  const attrsWithoutTimestamps = attributeNames.filter(
    n => !(definition.options.timestamps || []).includes(n)
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

  const clientStrategies = {
    sqlite3: async () => {
      const tmpTable = `tmp_${table}`;
      const rebuild = async trx => {
        await trx.schema.renameTable(table, tmpTable);
        await Promise.all(
          attributeNames.map(k => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, k)))
        );
        await createTable(table, trx);
        const columnAttrs = attributeNames.filter(name =>
          isColumn({ definition, attribute: attributes[name], name })
        );
        const selectCols = ['id', ...columnAttrs];
        await trx.insert(qb => qb.select(selectCols).from(tmpTable)).into(table);
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
              .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
              .catch(() => {})
          )
        );
        await trx.schema.alterTable(table, tbl => {
          createColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists, alter: true });
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
          strapi.log.error(`Migration failed`);
          strapi.log.error(err);
        }
        return false;
      }
    },
  };

  const strategy = clientStrategies[definition.client] || clientStrategies.default;
  await strategy();
};

/**
 * Retrieves column existence information.
 * @param {string} columnName
 * @param {string} tableName
 * @param {Object} ORM
 * @returns {Promise<Object>}
 */
const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

/**
 * Migrates schemas based on model definitions.
 * @param {Object} params
 * @param {Object} params.ORM
 * @param {Object} params.loadedModel
 * @param {Object} params.definition
 * @param {Object} params.connection
 * @param {Object} params.model
 * @param {Object} context
 */
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  // timestamps
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }

  // main table
  if (connection.options?.autoMigration !== false) {
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

  // polymorphic relations
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
    if (connection.options?.autoMigration !== false) {
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
  }

  // many-to-many relations
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
    if (connection.options?.autoMigration !== false) {
      await createOrUpdateTable(
        { table: rel.tableCollectionName, attributes: attrs, definition, ORM, model },
        context
      );
    }
  }

  // cleanup timestamps
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
```