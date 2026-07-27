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
  const autoMigrationEnabled = connection.options?.autoMigration !== false;

  // Handle timestamps
  if (loadedModel.hasTimestamps) {
    const [created, updated] = loadedModel.hasTimestamps;
    definition.attributes[created] = { type: 'currentTimestamp' };
    definition.attributes[updated] = { type: 'currentTimestamp' };
  }

  // Equilize tables
  if (autoMigrationEnabled) {
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
  const morphRelations = definition.associations.filter(
    ({ nature }) => nature.toLowerCase().includes('morphto')
  );

  for (const morphRelation of morphRelations) {
    const { alias } = morphRelation;
    const attributes = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${alias}_id`]: { type: definition.primaryKeyType },
      [`${alias}_type`]: { type: 'text' },
      [definition.attributes[alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

    if (autoMigrationEnabled) {
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
    if (!manyRelation.dominant) continue;

    const { plugin, collection, via, alias } = manyRelation;
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

    if (autoMigrationEnabled) {
      await createOrUpdateTable(
        { table: manyRelation.tableCollectionName, attributes, definition, ORM, model },
        context
      );
    }
  }

  // Remove timestamps from attributes
  if (loadedModel.hasTimestamps) {
    const [created, updated] = loadedModel.hasTimestamps;
    delete definition.attributes[created];
    delete definition.attributes[updated];
  }
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(({ alias }) => alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find(({ alias }) => alias === name);
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
    case 'uid':
      table.unique(name);
      return table.string(name);
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
      if (definition.client !== 'sqlite3' && tableExists) return col;
      return col.defaultTo(ORM.knex.fn.now());
    }
    case 'boolean':
      return table.boolean(name);
    default:
      return null;
  }
};

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

  const createColumns = (tbl, cols, opts = {}) => {
    const { tableExists, alter = false } = opts;
    Object.keys(cols).forEach(key => {
      const attr = cols[key];
      const col = buildColType({
        name: key,
        attribute: attr,
        table: tbl,
        tableExists,
        definition,
        ORM,
      });
      if (!col) return;

      if (attr.required === true) {
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

      if (attr.unique === true && (definition.client !== 'sqlite3' || !tableExists)) {
        tbl.unique(key, uniqueColName(table, key));
      }

      if (alter) col.alter();
    });
  };

  const alterColumns = (tbl, cols, opts = {}) => createColumns(tbl, cols, { ...opts, alter: true });

  const createTable = async (tblName, { trx = ORM.knex, ...opts } = {}) => {
    await trx.schema.createTable(tblName, tbl => {
      createIdType(tbl);
      createColumns(tbl, attributes, { ...opts, tableExists: false });
    });
  };

  if (!tableExists) {
    await createTable(table);
    return;
  }

  const attrNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attrNames.map(name => getColumnInfo(name, table, ORM))
  );
  const namesToAdd = columnsInfo.filter(info => !info.exists).map(info => info.columnName);
  const colsToAdd = _.pick(attributes, namesToAdd);

  if (Object.keys(colsToAdd).length > 0) {
    await ORM.knex.schema.table(table, tbl => {
      createColumns(tbl, colsToAdd, { tableExists });
    });
  }

  const attrsWithoutTimestamps = attrNames.filter(
    name => !(definition.options.timestamps || []).includes(name)
  );

  const colsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    colsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    const tmpTable = `tmp_${table}`;
    const rebuildTable = async trx => {
      await trx.schema.renameTable(table, tmpTable);
      await Promise.all(
        attrNames.map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
      );
      await createTable(table, { trx });
      const attrs = attrNames.filter(name =>
        isColumn({ definition, attribute: attributes[name], name })
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
        colsToAlter.map(col =>
          ORM.knex.schema
            .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
            .catch(() => {})
        )
      );
      await trx.schema.alterTable(table, tbl => {
        alterColumns(tbl, _.pick(attributes, colsToAlter), { tableExists });
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