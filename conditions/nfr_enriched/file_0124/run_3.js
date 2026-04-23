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

// Build morphic relation attributes
const buildMorphicAttributes = (loadedModel, morphRelation, definition) => {
  return {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
    order: { type: 'integer' },
  };
};

// Process morphic relations
const processMorphicRelations = async (loadedModel, definition, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(association => {
    return association.nature.toLowerCase().includes('morphto');
  });

  for (const morphRelation of morphRelations) {
    if (isAutoMigrationEnabled(connection)) {
      const attributes = buildMorphicAttributes(loadedModel, morphRelation, definition);
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

// Build many relation column names
const buildManyRelationColumns = (defAttr, targetAttr, definition) => {
  const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
  let rootCol = `${defAttr.attribute}_${defAttr.column}`;

  if (rootCol === targetCol) {
    rootCol = `related_${rootCol}`;
  }

  return { targetCol, rootCol };
};

// Build many relation attributes
const buildManyRelationAttributes = (targetCol, rootCol, targetCollection, definition) => {
  return {
    [targetCol]: { type: targetCollection.primaryKeyType },
    [rootCol]: { type: definition.primaryKeyType },
  };
};

// Process many-to-many relations
const processManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    const { plugin, collection, via, dominant, alias } = manyRelation;

    if (!dominant) continue;

    const targetCollection = strapi.db.getModel(collection, plugin);
    const targetAttr = getTargetAttribute(via, targetCollection, definition);
    const defAttr = definition.attributes[alias];

    const { targetCol, rootCol } = buildManyRelationColumns(defAttr, targetAttr, definition);
    const attributes = buildManyRelationAttributes(targetCol, rootCol, targetCollection, definition);
    const table = manyRelation.tableCollectionName;

    if (isAutoMigrationEnabled(connection)) {
      await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
    }
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

  await processMorphicRelations(loadedModel, definition, connection, ORM, model, context);
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

// Handle relation type conversion
const handleRelationType = (name, definition) => {
  const relation = definition.associations.find(association => association.alias === name);
  if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) {
    return { type: definition.primaryKeyType };
  }
  return null;
};

// Map attribute type to column type
const mapAttributeTypeToColumn = (attribute, name, table, definition, ORM, tableExists) => {
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

const buildColType = ({ name, attribute, table, tableExists = false, definition, ORM }) => {
  if (!attribute.type) {
    const relationType = handleRelationType(name, definition);
    if (!relationType) return null;

    return buildColType({
      name,
      attribute: relationType,
      table,
      tableExists,
      definition,
      ORM,
    });
  }

  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  return mapAttributeTypeToColumn(attribute, name, table, definition, ORM, tableExists);
};

// Create primary key column
const createIdType = (table, definition, ORM) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return table
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }

  return table.increments('id');
};

// Apply column constraints
const applyColumnConstraints = (col, attribute, key, table, definition, tableExists) => {
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

    applyColumnConstraints(col, attribute, key, tbl, definition, tableExists);

    if (alter) {
      col.alter();
    }
  });
};

// Alter columns in table
const alterColumns = (tbl, columns, opts = {}, definition, ORM) => {
  return createColumns(tbl, columns, { ...opts, alter: true }, definition, ORM);
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
      createIdType(tbl, definition, ORM);
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

// Handle other database table rebuild
const handleOtherDatabaseRebuild = async (table, attributes, definition, ORM, columnsToAlter, tableExists) => {
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

// Handle table rebuild logic
const handleTableRebuild = async (table, attributes, definition, ORM, columnsToAlter, tableExists, attributesNames) => {
  if (definition.client === 'sqlite3') {
    return handleSqliteRebuild(table, attributes, definition, ORM, attributesNames);
  }
  return handleOtherDatabaseRebuild(table, attributes, definition, ORM, columnsToAlter, tableExists);
};

// Add missing columns to table
const addMissingColumns = async (table, attributes, ORM, attributesNames, definition, tableExists) => {
  const columnsInfo = await Promise.all(
    attributesNames.map(attributeName => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter(info => !info.exists).map(info => info.columnName);

  if (nameOfColumnsToAdd.length === 0) return;

  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);

  await ORM.knex.schema.table(table, tbl => {
    createColumns(tbl, columnsToAdd, { tableExists }, definition, ORM);
  });
};

// Equilize database tables
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  definition.table = table;
  definition.model = model;

  if (!tableExists) {
    await ORM.knex.schema.createTable(table, tbl => {
      createIdType(tbl, definition, ORM);
      createColumns(tbl, attributes, { tableExists: false }, definition, ORM);
    });
    return;
  }

  const attributesNames = Object.keys(attributes);

  await addMissingColumns(table, attributes, ORM, attributesNames, definition, tableExists);

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
    await handleTableRebuild(table, attributes, definition, ORM, columnsToAlter, tableExists, attributesNames);
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