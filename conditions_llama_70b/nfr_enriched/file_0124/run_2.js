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
 * Adds created_at and updated_at fields to the definition if timestamps are enabled.
 * @param {Object} loadedModel - The loaded model.
 * @param {Object} definition - The definition of the model.
 */
const addTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }
};

/**
 * Equilizes tables by creating or updating them based on the definition.
 * @param {Object} options - Options for creating or updating the table.
 * @param {Object} context - The context of the migration.
 */
const equilizeTables = async (options, context) => {
  const { table, attributes, definition, ORM, model } = options;
  await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
};

/**
 * Equilizes polymorphic relations by creating or updating the morph tables.
 * @param {Object} definition - The definition of the model.
 * @param {Object} loadedModel - The loaded model.
 * @param {Object} context - The context of the migration.
 */
const equilizePolymorphicRelations = async (definition, loadedModel, context) => {
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

    await equilizeTables(
      {
        table: `${loadedModel.tableName}_morph`,
        attributes,
        definition,
        ORM: context.ORM,
        model: context.model,
      },
      context
    );
  }
};

/**
 * Equilizes many to many relations by creating or updating the join tables.
 * @param {Object} definition - The definition of the model.
 * @param {Object} loadedModel - The loaded model.
 * @param {Object} context - The context of the migration.
 */
const equilizeManyToManyRelations = async (definition, loadedModel, context) => {
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

      await equilizeTables(
        {
          table: manyRelation.tableCollectionName,
          attributes,
          definition,
          ORM: context.ORM,
          model: context.model,
        },
        context
      );
    }
  }
};

/**
 * Removes created_at and updated_at fields from the definition.
 * @param {Object} loadedModel - The loaded model.
 * @param {Object} definition - The definition of the model.
 */
const removeTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

/**
 * Migrates the schema of the model.
 * @param {Object} options - Options for the migration.
 * @param {Object} context - The context of the migration.
 */
const migrateSchemas = async (options, context) => {
  const { ORM, loadedModel, definition, connection, model } = options;

  addTimestamps(loadedModel, definition);

  if (connection.options && connection.options.autoMigration !== false) {
    await equilizeTables(
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

  await equilizePolymorphicRelations(definition, loadedModel, context);
  await equilizeManyToManyRelations(definition, loadedModel, context);

  removeTimestamps(loadedModel, definition);
};

/**
 * Gets the column information for a given column name and table name.
 * @param {string} columnName - The name of the column.
 * @param {string} tableName - The name of the table.
 * @param {Object} ORM - The ORM instance.
 */
const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);

  return {
    columnName,
    exists,
  };
};

/**
 * Checks if a given attribute is a column.
 * @param {Object} definition - The definition of the model.
 * @param {Object} attribute - The attribute to check.
 * @param {string} name - The name of the attribute.
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
 * Generates a unique column name for a given table and key.
 * @param {string} table - The name of the table.
 * @param {string} key - The key to generate the column name for.
 */
const uniqueColName = (table, key) => `${table}_${key}_unique`;

/**
 * Builds the column type for a given attribute and table.
 * @param {Object} options - Options for building the column type.
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
 * Creates or updates a table based on the given definition and attributes.
 * @param {Object} options - Options for creating or updating the table.
 * @param {Object} context - The context of the migration.
 */
const createOrUpdateTable = async (options, context) => {
  const { table, attributes, definition, ORM, model } = options;
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