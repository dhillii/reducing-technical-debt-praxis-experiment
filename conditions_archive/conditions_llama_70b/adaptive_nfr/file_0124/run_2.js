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
 * Migrate database schema.
 * @param {Object} params - Parameters.
 * @param {Object} params.ORM - Object-Relational Mapping.
 * @param {Object} params.loadedModel - Loaded model.
 * @param {Object} params.definition - Definition.
 * @param {Object} params.connection - Connection.
 * @param {Object} params.model - Model.
 * @param {Object} context - Context.
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

/**
 * Get column information.
 * @param {string} columnName - Column name.
 * @param {string} tableName - Table name.
 * @param {Object} ORM - Object-Relational Mapping.
 */
const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);

  return {
    columnName,
    exists,
  };
};

/**
 * Check if attribute is a column.
 * @param {Object} params - Parameters.
 * @param {Object} params.definition - Definition.
 * @param {Object} params.attribute - Attribute.
 * @param {string} params.name - Name.
 */
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

/**
 * Get unique column name.
 * @param {string} table - Table name.
 * @param {string} key - Key.
 */
const uniqueColName = (table, key) => `${table}_${key}_unique`;

/**
 * Build column type.
 * @param {Object} params - Parameters.
 * @param {string} params.name - Name.
 * @param {Object} params.attribute - Attribute.
 * @param {string} params.table - Table name.
 * @param {boolean} [params.tableExists=false] - Table exists.
 * @param {Object} params.definition - Definition.
 * @param {Object} params.ORM - Object-Relational Mapping.
 */
const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  const columnTypes = {
    uuid: () => table.uuid(name),
    uid: () => {
      table.unique(name);
      return table.string(name);
    },
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

      if (definition.client !== 'sqlite3' && tableExists) {
        return col;
      }

      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: () => table.boolean(name),
  };

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

  return columnTypes[attribute.type]();
};

/**
 * Create or update table.
 * @param {Object} params - Parameters.
 * @param {string} params.table - Table name.
 * @param {Object} params.attributes - Attributes.
 * @param {Object} params.definition - Definition.
 * @param {Object} params.ORM - Object-Relational Mapping.
 * @param {Object} params.model - Model.
 * @param {Object} context - Context.
 */
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

  const createTable = (table, { trx = ORM.knex, ...opts } = {}) => {
    return trx.schema.createTable(table, tbl => {
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
    const rebuildTable = async (trx, client) => {
      switch (client) {
        case 'sqlite3': {
          const tmpTable = `tmp_${table}`;

          await trx.schema.renameTable(table, tmpTable);

          // drop possible conflicting indexes
          await Promise.all(
            attributesNames.map(key =>
              trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
            )
          );

          // create the table
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
          break;
        }
        default: {
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
              tableExists,
            });
          });
        }
      }
    };

    try {
      await ORM.knex.transaction(trx => rebuildTable(trx, definition.client));
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
```