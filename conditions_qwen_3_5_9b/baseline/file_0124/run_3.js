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
  const { hasTimestamps, tableName, primaryKeyType, collectionName, attributes, associations } = loadedModel;
  const { client, options } = connection;
  const autoMigrationEnabled = options && options.autoMigration !== false;

  // Handle timestamps
  if (hasTimestamps) {
    const timestamps = hasTimestamps;
    const timestampFields = timestamps.map((field, index) => ({
      field,
      type: 'currentTimestamp',
      index,
    }));

    timestampFields.forEach(({ field, type, index }) => {
      attributes[field] = { type };
    });

    const morphRelations = associations.filter(association =>
      association.nature.toLowerCase().includes('morphto')
    );

    for (const morphRelation of morphRelations) {
      const { alias, filter } = attributes[morphRelation.alias];
      const morphTable = `${tableName}_morph`;

      const morphAttributes = {
        [`${tableName}_id`]: { type: primaryKeyType },
        [`${alias}_id`]: { type: primaryKeyType },
        [`${alias}_type`]: { type: 'text' },
        [filter]: { type: 'text' },
        order: { type: 'integer' },
      };

      if (autoMigrationEnabled) {
        await createOrUpdateTable({ table: morphTable, attributes: morphAttributes, definition, ORM, model }, context);
      }
    }

    const manyRelations = getManyRelations(definition);

    for (const manyRelation of manyRelations) {
      const { plugin, collection, via, dominant, alias } = manyRelation;

      if (dominant) {
        const targetCollection = strapi.db.getModel(collection, plugin);
        const targetAttr = via
          ? targetCollection.attributes[via]
          : {
              attribute: singular(collectionName),
              column: definition.primaryKey,
            };

        const defAttr = attributes[alias];
        const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
        let rootCol = `${defAttr.attribute}_${defAttr.column}`;

        if (rootCol === targetCol) {
          rootCol = `related_${rootCol}`;
        }

        const table = manyRelation.tableCollectionName;
        const relationAttributes = {
          [targetCol]: { type: targetCollection.primaryKeyType },
          [rootCol]: { type: primaryKeyType },
        };

        if (autoMigrationEnabled) {
          await createOrUpdateTable({ table, attributes: relationAttributes, definition, ORM, model }, context);
        }
      }
    }
  }

  // Remove timestamp attributes from definition
  if (hasTimestamps) {
    const timestamps = hasTimestamps;
    timestamps.forEach(timestamp => {
      delete attributes[timestamp];
    });
  }
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(association => association.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }

  if (['component', 'dynamiczone'].includes(attribute.type)) {
    return false;
  }

  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

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

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const { client } = definition;
  const tableExists = await ORM.knex.schema.hasTable(table);
  const { primaryKeyType, options: modelOptions } = definition;
  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(model);
  const isComponent = definition.modelType === 'component';
  const isSqlite = client === 'sqlite3';

  const createIdType = table => {
    if (primaryKeyType === 'uuid' && client === 'pg') {
      return table
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    }
    return table.increments('id');
  };

  const createColumns = (tbl, columns, opts = {}) => {
    const { tableExists: localTableExists, alter = false } = opts;

    Object.keys(columns).forEach(key => {
      const attribute = columns[key];
      const col = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists: localTableExists,
        definition,
        ORM,
      });
      if (!col) return;

      if (attribute.required === true) {
        if (
          (!isSqlite || !localTableExists) &&
          !hasDraftAndPublish &&
          !isComponent
        ) {
          col.notNullable();
        }
      } else {
        col.nullable();
      }

      if (attribute.unique === true) {
        if (!isSqlite || !localTableExists) {
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
  const columnsInfo = await Promise.all(
    attributesNames.map(attributeName => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter(info => !info.exists).map(info => info.columnName);
  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  if (Object.keys(columnsToAdd).length > 0) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, columnsToAdd, { tableExists });
    });
  }

  const attrsNameWithoutTimestamps = attributesNames.filter(
    columnName => !(modelOptions.timestamps || []).includes(columnName)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsNameWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 || (client === 'sqlite3' && context.recreateSqliteTable);

  if (shouldRebuild) {
    if (client === 'sqlite3') {
      const tmpTable = `tmp_${table}`;

      const rebuildTable = async trx => {
        await trx.schema.renameTable(table, tmpTable);

        await Promise.all(
          attributesNames.map(key =>
            trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
          )
        );

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
    } else {
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

        return false;
      }
    }
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