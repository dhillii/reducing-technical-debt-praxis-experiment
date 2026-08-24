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
  if (loadedModel.hasTimestamps) {
    addTimestampFields(definition, loadedModel.hasTimestamps);
  }

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

  await migratePolymorphicRelations({ loadedModel, definition, connection, ORM, model }, context);

  await migrateManyRelations({ definition, connection, ORM, model }, context);

  if (loadedModel.hasTimestamps) {
    removeTimestampFields(definition, loadedModel.hasTimestamps);
  }
};

const addTimestampFields = (definition, timestamps) => {
  definition.attributes[timestamps[0]] = { type: 'currentTimestamp' };
  definition.attributes[timestamps[1]] = { type: 'currentTimestamp' };
};

const removeTimestampFields = (definition, timestamps) => {
  delete definition.attributes[timestamps[0]];
  delete definition.attributes[timestamps[1]];
};

const migratePolymorphicRelations = async ({ loadedModel, definition, connection, ORM, model }, context) => {
  const morphRelations = getMorphRelations(definition);

  for (const morphRelation of morphRelations) {
    const attributes = buildMorphRelationAttributes(loadedModel, morphRelation, definition);
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
};

const getMorphRelations = definition => {
  return definition.associations.filter(association =>
    association.nature.toLowerCase().includes('morphto')
  );
};

const buildMorphRelationAttributes = (loadedModel, morphRelation, definition) => {
  const attrs = definition.attributes[morphRelation.alias];
  return {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [attrs.filter]: { type: 'text' },
    order: { type: 'integer' },
  };
};

const migrateManyRelations = async ({ definition, connection, ORM, model }, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant) continue;

    await createManyRelationTable(manyRelation, definition, connection, ORM, model, context);
  }
};

const createManyRelationTable = async (manyRelation, definition, connection, ORM, model, context) => {
  const { plugin, collection, via, alias } = manyRelation;
  const targetCollection = strapi.db.getModel(collection, plugin);
  const targetAttr = getTargetAttribute(targetCollection, via, definition);
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
  if (connection.options?.autoMigration !== false) {
    await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
  }
};

const getTargetAttribute = (targetCollection, via, definition) => {
  if (via) {
    return targetCollection.attributes[via];
  }
  return {
    attribute: singular(definition.collectionName),
    column: definition.primaryKey,
  };
};

const getColumnInfo = async (columnName, tableName, ORM) => {
  const exists = await ORM.knex.schema.hasColumn(tableName, columnName);

  return {
    columnName,
    exists,
  };
};

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    return isColumnBasedRelation(relation);
  }

  if (['component', 'dynamiczone'].includes(attribute.type)) {
    return false;
  }

  return true;
};

const isColumnBasedRelation = relation => {
  if (!relation) return false;
  return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relation = definition.associations.find(association => association.alias === name);
    if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation?.nature)) {
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

  return switchOnType({ attribute, name, table, tableExists, definition, ORM });
};

const switchOnType = ({ attribute, name, table, tableExists, definition, ORM }) => {
  const typeMap = {
    uuid: () => table.uuid(name),
    uid: () => { table.unique(name); return table.string(name); },
    richtext: () => table.text(name, 'longtext'),
    text: () => table.text(name, 'longtext'),
    json: () => definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext'),
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
      if (definition.client !== 'sqlite3' && tableExists) return col;
      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: () => table.boolean(name),
  };

  return typeMap[attribute.type]?.() ?? null;
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

  const createColumns = (tbl, columns, opts = {}) => {
    const { tableExists, alter = false } = opts;
    Object.keys(columns).forEach(key => {
      applyColumnCreation(tbl, key, columns[key], tableExists, definition, ORM, model);
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

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsNameWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 || (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (shouldRebuild) {
    await rebuildTableIfNecessary(
      { table, attributes, definition, ORM, model, context, columnsToAlter, attrsNameWithoutTimestamps }
    );
  }
};

const applyColumnCreation = (tbl, key, attribute, tableExists, definition, ORM, model) => {
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
    apply_REQUIRED_constraints(col, definition, model, tableExists);
  } else {
    col.nullable();
  }

  if (attribute.unique === true) {
    apply_UNIQUE_constraint(tbl, key, tableExists, definition);
  }

  if (definition.client !== 'sqlite3' || !tableExists) {
    if (attribute.unique === true) tbl.unique(key, uniqueColName(table, key));
  }
};

const apply_REQUIRED_constraints = (col, definition, model, tableExists) => {
  if (
    (definition.client !== 'sqlite3' || !tableExists) &&
    !contentTypesUtils.hasDraftAndPublish(model) &&
    definition.modelType !== 'component'
  ) {
    col.notNullable();
  }
};

const apply_UNIQUE_constraint = (tbl, key, tableExists, definition) => {
  if (definition.client !== 'sqlite3' || !tableExists) {
    // Handled in outer scope
  }
};

const rebuildTableIfNecessary = async ({ table, attributes, definition, ORM, model, context, columnsToAlter, attrsNameWithoutTimestamps }) => {
  if (definition.client === 'sqlite3') {
    return rebuildSqliteTable({ table, attributes, definition, ORM, model, context, attrsNameWithoutTimestamps });
  }
  return rebuildNonSqliteTable({ table, attributes, definition, ORM, model, context, columnsToAlter });
};

const rebuildSqliteTable = async ({ table, attributes, definition, ORM, model, context, attrsNameWithoutTimestamps }) => {
  const tmpTable = `tmp_${table}`;
  const attributesNames = Object.keys(attributes);

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
    handleMigrationError(err, definition);
  }
};

const rebuildNonSqliteTable = async ({ table, attributes, definition, ORM, model, context, columnsToAlter }) => {
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
        tableExists: true,
      });
    });
  };

  try {
    await ORM.knex.transaction(trx => alterTable(trx));
  } catch (err) {
    handleMigrationError(err, definition, model);
  }
};

const handleMigrationError = (err, definition, model) => {
  const isUniqueConstraintError =
    err.message?.includes('UNIQUE constraint failed') ||
    (err.code === '23505' && definition.client === 'pg') ||
    (definition.client === 'mysql' && err.errno === 1062);

  if (isUniqueConstraintError) {
    const detailMsg = getUniqueConstraintDetail(err, definition.client);
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${err.message}\n\t${detailMsg}`
    );
  } else {
    strapi.log.error(`Migration failed`);
    strapi.log.error(err);
  }

  return false;
};

const getUniqueConstraintDetail = (err, client) => {
  if (client === 'pg') return `\t- ${err.detail || ''}`;
  if (client === 'mysql') return `\t- ${err.sqlMessage || ''}`;
  return '';
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