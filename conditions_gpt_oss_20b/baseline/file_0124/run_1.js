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

    if (connection.options?.autoMigration !== false) {
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
    if (connection.options?.autoMigration !== false) {
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
  return { columnName, exists };
};

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

const createIdType = (table, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return table
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }
  return table.increments('id');
};

const applyColumnConstraints = (col, attribute, definition, model) => {
  if (attribute.required === true) {
    if (
      (definition.client !== 'sqlite3' || !col.tableExists) &&
      !contentTypesUtils.hasDraftAndPublish(model) &&
      definition.modelType !== 'component'
    ) {
      col.notNullable();
    }
  } else {
    col.nullable();
  }

  if (attribute.unique === true) {
    if (definition.client !== 'sqlite3' || !col.tableExists) {
      col.table.unique(col.key, uniqueColName(col.tableName, col.key));
    }
  }
};

const createColumns = (tbl, columns, opts = {}) => {
  const { tableExists, alter = false } = opts;
  Object.keys(columns).forEach((key) => {
    const attribute = columns[key];
    const col = buildColType({
      name: key,
      attribute,
      table: tbl,
      tableExists,
      definition: tbl.definition,
      ORM: tbl.ORM,
    });
    if (!col) return;
    applyColumnConstraints(col, attribute, tbl.definition, tbl.model);
    if (alter) col.alter();
  });
};

const alterColumns = (tbl, columns, opts = {}) => createColumns(tbl, columns, { ...opts, alter: true });

const createTable = async (table, { trx = ORM.knex, ...opts } = {}) => {
  await trx.schema.createTable(table, (tbl) => {
    tbl.definition = opts.definition;
    tbl.ORM = opts.ORM;
    tbl.model = opts.model;
    createIdType(tbl, opts.definition);
    createColumns(tbl, opts.attributes, { ...opts, tableExists: false });
  });
};

const rebuildSqliteTable = async (definition, attributes, ORM, table, tmpTable, trx) => {
  await trx.schema.renameTable(table, tmpTable);
  await Promise.all(
    Object.keys(attributes).map((key) =>
      trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
    )
  );
  await createTable(table, { trx, definition, attributes, ORM });
  const attrs = Object.keys(attributes).filter((attributeName) =>
    isColumn({ definition, attribute: attributes[attributeName], name: attributeName })
  );
  const allAttrs = ['id', ...attrs];
  await trx.insert((qb) => qb.select(allAttrs).from(tmpTable)).into(table);
  await trx.schema.dropTableIfExists(tmpTable);
};

const rebuildOtherTable = async (definition, attributes, ORM, table, columnsToAlter, trx) => {
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
    alterColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists: true });
  });
};

const handleRebuild = async (definition, attributes, ORM, context, table, tableExists) => {
  const attrsNameWithoutTimestamps = Object.keys(attributes).filter(
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

  if (definition.client === 'sqlite3') {
    const tmpTable = `tmp_${table}`;
    try {
      await ORM.knex.transaction((trx) => rebuildSqliteTable(definition, attributes, ORM, table, tmpTable, trx));
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        strapi.log.error(
          `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.stack}`
        );
      } else {
        strapi.log.error('Migration failed');
        strapi.log.error(err);
      }
      return false;
    }
  } else {
    try {
      await ORM.knex.transaction((trx) =>
        rebuildOtherTable(definition, attributes, ORM, table, columnsToAlter, trx)
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
        strapi.log.error('Migration failed');
        strapi.log.error(err);
      }
      return false;
    }
  }
};

const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createTable(table, { definition, attributes, ORM, model });
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

  await handleRebuild(definition, attributes, ORM, context, table, tableExists);
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