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
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }

  if (connection.options && connection.options.autoMigration !== false) {
    await createOrUpdateTable(
      { table: loadedModel.tableName, attributes: definition.attributes, definition, ORM, model },
      context
    );
  }

  const morphRelations = definition.associations.filter(association =>
    association.nature.toLowerCase().includes('morphto')
  );
  for (const morphRelation of morphRelations) {
    await createMorphTable({ morphRelation, loadedModel, definition, connection, ORM, model }, context);
  }

  const manyRelations = getManyRelations(definition);
  for (const manyRelation of manyRelations) {
    if (manyRelation.dominant) {
      await createManyToManyTable({ manyRelation, definition, connection, ORM }, context);
    }
  }

  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

const createMorphTable = async ({ morphRelation, loadedModel, definition, connection, ORM, model }, context) => {
  const attributes = {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
    order: { type: 'integer' },
  };

  if (connection.options && connection.options.autoMigration !== false) {
    await createOrUpdateTable(
      { table: `${loadedModel.tableName}_morph`, attributes, definition, ORM, model },
      context
    );
  }
};

const createManyToManyTable = async ({ manyRelation, definition, connection, ORM }, context) => {
  const { plugin, collection, via, alias } = manyRelation;
  const targetCollection = strapi.db.getModel(collection, plugin);

  const targetAttr = via
    ? targetCollection.attributes[via]
    : { attribute: singular(definition.collectionName), column: definition.primaryKey };

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
      { table: manyRelation.tableCollectionName, attributes, definition, ORM, model: targetCollection },
      context
    );
  }
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);
  return { columnName, exists };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    return relation && ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const mapAttributeTypeToBuilder = {
  uuid: ({ name, table }) => table.uuid(name),
  uid: ({ name, table, definition }) => {
    table.unique(name);
    return table.string(name);
  },
  richtext: ({ name, table }) => table.text(name, 'longtext'),
  text: ({ name, table }) => table.text(name, 'longtext'),
  json: ({ name, table, definition }) =>
    definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext'),
  enumeration: ({ name, table }) => table.string(name),
  string: ({ name, table }) => table.string(name),
  password: ({ name, table }) => table.string(name),
  email: ({ name, table }) => table.string(name),
  integer: ({ name, table }) => table.integer(name),
  biginteger: ({ name, table }) => table.bigInteger(name),
  float: ({ name, table }) => table.double(name),
  decimal: ({ name, table }) => table.decimal(name, 10, 2),
  date: ({ name, table }) => table.date(name),
  time: ({ name, table }) => table.time(name, 3),
  datetime: ({ name, table }) => table.datetime(name),
  timestamp: ({ name, table }) => table.timestamp(name),
  currentTimestamp: ({ name, table, definition, tableExists }) => {
    const col = table.timestamp(name);
    if ((definition.client !== 'sqlite3' && tableExists) || definition.client === 'sqlite3') {
      return col;
    }
    return col.defaultTo(ORM.knex.fn.now());
  },
  boolean: ({ name, table }) => table.boolean(name),
};

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

  const builder = mapAttributeTypeToBuilder[attribute.type];
  if (!builder) return null;

  return builder({ name, table, definition, tableExists, ORM });
};

// Equilize database tables
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

  const applyColumnConstraints = (columnBuilder, attribute) => {
    if (attribute.required === true) {
      if (
        (definition.client !== 'sqlite3' || !tableExists) &&
        !contentTypesUtils.hasDraftAndPublish(model) &&
        definition.modelType !== 'component'
      ) {
        columnBuilder.notNullable();
      }
    } else {
      columnBuilder.nullable();
    }

    if (attribute.unique === true && (definition.client !== 'sqlite3' || !tableExists)) {
      columnBuilder.OrmTable.unique(attribute.key, uniqueColName(table, attribute.key));
    }
  };

  const createColumns = (tbl, columns, opts = {}) => {
    const { tableExists, alter = false } = opts;

    Object.keys(columns).forEach(key => {
      const attribute = columns[key];

      const columnBuilder = buildColType({
        name: key,
        attribute,
        table: tbl,
        tableExists,
        definition,
        ORM,
      });
      if (!columnBuilder) return;

      columnBuilder.key = key;

      if (alter) {
        columnBuilder.alter();
      } else {
        applyColumnConstraints(columnBuilder, attribute);
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
    columnName => !(definition.options.timestamps || []).includes(columnName)
  );
  const columnsToAlter = await getColumnsWhereDefinitionChanged(attrsNameWithoutTimestamps, definition, ORM);

  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (shouldRebuild) {
    if (definition.client === 'sqlite3') {
      await rebuildSqliteTable({ table, attributes, definition, ORM, context });
    } else {
      await alterTable({ table, attributes, columnsToAlter, definition, ORM, tableExists });
    }
  }
};

const rebuildSqliteTable = async ({ table, attributes, definition, ORM, context }) => {
  const tmpTable = `tmp_${table}`;
  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      Object.keys(attributes).map(key => trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key)))
    );

    await createTable(table, { trx });

    const attrs = Object.keys(attributes).filter(attributeName =>
      isColumn({ definition, attribute: attributes[attributeName], name: attributeName })
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
};

const alterTable = async ({ table, attributes, columnsToAlter, definition, ORM, tableExists }) => {
  const alterTable = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
          .catch(() => {})
      )
    );

    await trx.schema.alterTable(table, tbl =>
      alterColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists })
    );
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