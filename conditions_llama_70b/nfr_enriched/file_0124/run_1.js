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
 * @param {Object} params - Migration parameters.
 * @param {Object} params.ORM - Object-Relational Mapping instance.
 * @param {Object} params.loadedModel - Loaded model instance.
 * @param {Object} params.definition - Model definition.
 * @param {Object} params.connection - Database connection instance.
 * @param {Object} params.model - Model instance.
 * @param {Object} context - Migration context.
 */
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  await addTimestamps(loadedModel, definition);
  await equilizeTables(ORM, loadedModel, definition, connection, model, context);
  await equilizePolymorphicRelations(ORM, loadedModel, definition, connection, model, context);
  await equilizeManyToManyRelations(ORM, loadedModel, definition, connection, model, context);
  await removeTimestamps(loadedModel, definition);
};

/**
 * Add created_at and updated_at fields if timestamp option is true.
 * @param {Object} loadedModel - Loaded model instance.
 * @param {Object} definition - Model definition.
 */
const addTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }
};

/**
 * Equilize tables.
 * @param {Object} ORM - Object-Relational Mapping instance.
 * @param {Object} loadedModel - Loaded model instance.
 * @param {Object} definition - Model definition.
 * @param {Object} connection - Database connection instance.
 * @param {Object} model - Model instance.
 * @param {Object} context - Migration context.
 */
const equilizeTables = async (ORM, loadedModel, definition, connection, model, context) => {
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
};

/**
 * Equilize polymorphic relations.
 * @param {Object} ORM - Object-Relational Mapping instance.
 * @param {Object} loadedModel - Loaded model instance.
 * @param {Object} definition - Model definition.
 * @param {Object} connection - Database connection instance.
 * @param {Object} model - Model instance.
 * @param {Object} context - Migration context.
 */
const equilizePolymorphicRelations = async (ORM, loadedModel, definition, connection, model, context) => {
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
};

/**
 * Equilize many to many relations.
 * @param {Object} ORM - Object-Relational Mapping instance.
 * @param {Object} loadedModel - Loaded model instance.
 * @param {Object} definition - Model definition.
 * @param {Object} connection - Database connection instance.
 * @param {Object} model - Model instance.
 * @param {Object} context - Migration context.
 */
const equilizeManyToManyRelations = async (ORM, loadedModel, definition, connection, model, context) => {
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
};

/**
 * Remove created_at and updated_at fields from attributes.
 * @param {Object} loadedModel - Loaded model instance.
 * @param {Object} definition - Model definition.
 */
const removeTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

/**
 * Get column information.
 * @param {string} columnName - Column name.
 * @param {string} tableName - Table name.
 * @param {Object} ORM - Object-Relational Mapping instance.
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
 * @param {Object} definition - Model definition.
 * @param {Object} attribute - Attribute instance.
 * @param {string} name - Attribute name.
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
 * Generate unique column name.
 * @param {string} table - Table name.
 * @param {string} key - Column key.
 */
const uniqueColName = (table, key) => `${table}_${key}_unique`;

/**
 * Build column type.
 * @param {Object} params - Column type parameters.
 * @param {string} params.name - Column name.
 * @param {Object} params.attribute - Attribute instance.
 * @param {string} params.table - Table name.
 * @param {boolean} params.tableExists - Whether table exists.
 * @param {Object} params.definition - Model definition.
 * @param {Object} params.ORM - Object-Relational Mapping instance.
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

  switch (attribute.type) {
    case 'uuid':
      return table.uuid(name);
    case 'uid': {
      table.unique(name);
      return table.string(name);
    }
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

      if (definition.client !== 'sqlite3' && tableExists) {
        return col;
      }

      return col.defaultTo(ORM.knex.fn.now());
    }
    case 'boolean':
      return table.boolean(name);
    default:
      return null;
  }
};

/**
 * Create or update table.
 * @param {Object} params - Table creation parameters.
 * @param {string} params.table - Table name.
 * @param {Object} params.attributes - Table attributes.
 * @param {Object} params.definition - Model definition.
 * @param {Object} params.ORM - Object-Relational Mapping instance.
 * @param {Object} params.model - Model instance.
 * @param {Object} context - Migration context.
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
    switch (definition.client) {
      case 'sqlite3': {
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
        };

        try {
          await ORM.knex.transaction(trx => rebuildTable(trx));
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
        break;
      }
      default: {
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
              tableExists,
            });
          });
        };

        try {
          await ORM.knex.transaction(trx => alterTable(trx));
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