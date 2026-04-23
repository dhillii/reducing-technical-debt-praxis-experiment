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

// Handle timestamp attributes in definition
const handleTimestampAttributes = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }
};

// Remove timestamp attributes from definition
const removeTimestampAttributes = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

// Check if auto migration is enabled
const isAutoMigrationEnabled = (connection) => {
  return !connection.options || connection.options.autoMigration !== false;
};

// Build morph relation attributes
const buildMorphRelationAttributes = (loadedModel, morphRelation, definition) => {
  return {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
    order: { type: 'integer' },
  };
};

// Process morph relations
const processMorphRelations = async (loadedModel, definition, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(association => {
    return association.nature.toLowerCase().includes('morphto');
  });

  for (const morphRelation of morphRelations) {
    if (!isAutoMigrationEnabled(connection)) continue;

    const attributes = buildMorphRelationAttributes(loadedModel, morphRelation, definition);
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
};

// Build many relation table attributes
const buildManyRelationAttributes = (manyRelation, definition, targetCollection, targetAttr, defAttr) => {
  let targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
  let rootCol = `${defAttr.attribute}_${defAttr.column}`;

  if (rootCol === targetCol) {
    rootCol = `related_${rootCol}`;
  }

  return {
    [targetCol]: { type: targetCollection.primaryKeyType },
    [rootCol]: { type: definition.primaryKeyType },
  };
};

// Get target attribute for many relation
const getTargetAttribute = (via, targetCollection, definition) => {
  if (via) {
    return targetCollection.attributes[via];
  }
  return {
    attribute: singular(definition.collectionName),
    column: definition.primaryKey,
  };
};

// Process many relations
const processManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant || !isAutoMigrationEnabled(connection)) continue;

    const { plugin, collection, via, alias } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
    const targetAttr = getTargetAttribute(via, targetCollection, definition);
    const defAttr = definition.attributes[alias];

    const attributes = buildManyRelationAttributes(
      manyRelation,
      definition,
      targetCollection,
      targetAttr,
      defAttr
    );

    await createOrUpdateTable(
      { table: manyRelation.tableCollectionName, attributes, definition, ORM, model },
      context
    );
  }
};

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  handleTimestampAttributes(loadedModel, definition);

  if (isAutoMigrationEnabled(connection)) {
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

  await processMorphRelations(loadedModel, definition, connection, ORM, model, context);
  await processManyRelations(definition, connection, ORM, model, context);

  removeTimestampAttributes(loadedModel, definition);
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

const uniqueColName = (table, key) => `${table}_${key}_unique`;

// Map attribute type to column type
const getColumnTypeForAttribute = (attribute, definition, ORM, name, table, tableExists) => {
  if (!attribute.type) {
    const relation = definition.associations.find(association => association.alias === name);

    if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) {
      return getColumnTypeForAttribute(
        { type: definition.primaryKeyType },
        definition,
        ORM,
        name,
        table,
        tableExists
      );
    }

    return null;
  }

  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  const typeHandlers = {
    uuid: () => table.uuid(name),
    uid: () => {
      table.unique(name);
      return table.string(name);
    },
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
      if (definition.client !== 'sqlite3' && tableExists) {
        return col;
      }
      return col.defaultTo(ORM.knex.fn.now());
    },
    boolean: () => table.boolean(name),
  };

  const handler = typeHandlers[attribute.type];
  return handler ? handler() : null;
};

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  return getColumnTypeForAttribute(attribute, definition, ORM, name, table, tableExists);
};

// Apply column constraints
const applyColumnConstraints = (col, attribute, definition, table, key, tableExists) => {
  if (attribute.required === true) {
    if (
      (definition.client !== 'sqlite3' || !tableExists) &&
      !contentTypesUtils.hasDraftAndPublish(definition.model) &&
      definition.modelType !== 'component'
    ) {
      col.notNullable();
    }
  } else {
    col.nullable();
  }

  if (attribute.unique === true) {
    if (definition.client !== 'sqlite3' || !tableExists) {
      table.unique(key, uniqueColName(definition.table, key));
    }
  }
};

// Create columns in table
const createColumns = (tbl, columns, opts = {}, definition, ORM) => {
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

    applyColumnConstraints(col, attribute, definition, tbl, key, tableExists);

    if (alter) {
      col.alter();
    }
  });
};

// Alter columns in table
const alterColumns = (tbl, columns, opts = {}, definition, ORM) => {
  return createColumns(tbl, columns, { ...opts, alter: true }, definition, ORM);
};

// Create ID column based on primary key type
const createIdType = (tbl, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return tbl
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }

  return tbl.increments('id');
};

// Handle SQLite table rebuild
const handleSqliteRebuild = async (table, attributes, definition, ORM, attributesNames) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    await trx.schema.createTable(table, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { tableExists: false }, definition, ORM);
    });

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
};

// Handle non-SQLite table alteration
const handleDatabaseAlter = async (table, attributes, definition, ORM, columnsToAlter, tableExists) => {
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
      alterColumns(tbl, _.pick(attributes, columnsToAlter), { tableExists }, definition, ORM);
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
};

// Equilize database tables
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await ORM.knex.schema.createTable(table, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { tableExists: false }, definition, ORM);
    });
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
      createColumns(tbl, columnsToAdd, { tableExists }, definition, ORM);
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

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await handleSqliteRebuild(table, attributes, definition, ORM, attributesNames);
  } else {
    await handleDatabaseAlter(table, attributes, definition, ORM, columnsToAlter, tableExists);
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