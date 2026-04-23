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
const buildMorphRelationAttributes = (loadedModel, morphRelation, definition) => {
  return {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
    order: { type: 'integer' },
  };
};

// Process morphic relations
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

// Build many-to-many relation column names
const buildManyRelationColumns = (manyRelation, definition, targetCollection, targetAttr, defAttr) => {
  const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
  let rootCol = `${defAttr.attribute}_${defAttr.column}`;

  if (rootCol === targetCol) {
    rootCol = `related_${rootCol}`;
  }

  return {
    targetCol,
    rootCol,
    attributes: {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    },
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

// Process many-to-many relations
const processManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant || !isAutoMigrationEnabled(connection)) continue;

    const { plugin, collection, via, alias } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
    const targetAttr = getTargetAttribute(via, targetCollection, definition);
    const defAttr = definition.attributes[alias];

    const { attributes, targetCol } = buildManyRelationColumns(
      manyRelation,
      definition,
      targetCollection,
      targetAttr,
      defAttr
    );

    const table = manyRelation.tableCollectionName;
    await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
  }
};

// Main schema migration function
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

// Handle relation type column building
const buildRelationColType = (name, relation, definition, table, tableExists, ORM) => {
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
};

// Map attribute types to column builders
const buildColumnTypeByAttributeType = (attribute, name, table, definition, ORM) => {
  const { type } = attribute;

  if (_.has(attribute, 'columnType')) {
    return table.specificType(name, attribute.columnType);
  }

  switch (type) {
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
    const relation = definition.associations.find(association => association.alias === name);
    return buildRelationColType(name, relation, definition, table, tableExists, ORM);
  }

  return buildColumnTypeByAttributeType(attribute, name, table, definition, ORM);
};

// Apply column constraints
const applyColumnConstraints = (col, attribute, table, key, definition, tableExists) => {
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
const createColumns = (tbl, columns, opts = {}) => {
  const { tableExists, alter = false, definition, ORM, table } = opts;

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

    applyColumnConstraints(col, attribute, tbl, key, definition, tableExists);

    if (alter) {
      col.alter();
    }
  });
};

// Alter existing columns
const alterColumns = (tbl, columns, opts = {}) => {
  return createColumns(tbl, columns, { ...opts, alter: true });
};

// Create new table
const createNewTable = (table, attributes, definition, ORM) => {
  return ORM.knex.schema.createTable(table, tbl => {
    if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
      tbl
        .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
        .notNullable()
        .primary();
    } else {
      tbl.increments('id');
    }

    createColumns(tbl, attributes, { tableExists: false, definition, ORM, table });
  });
};

// Handle SQLite table rebuild
const rebuildSqliteTable = async (table, attributes, attributesNames, definition, ORM) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    await ORM.knex.schema.createTable(table, tbl => {
      if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
        tbl
          .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
          .notNullable()
          .primary();
      } else {
        tbl.increments('id');
      }
      createColumns(tbl, attributes, { tableExists: false, definition, ORM, table });
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

// Handle other database table alterations
const alterTableForOtherDatabases = async (table, attributes, columnsToAlter, definition, ORM, tableExists) => {
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
        definition,
        ORM,
        table,
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
};

// Handle table rebuild based on client type
const handleTableRebuild = async (table, attributes, attributesNames, columnsToAlter, definition, ORM, tableExists) => {
  if (definition.client === 'sqlite3') {
    return rebuildSqliteTable(table, attributes, attributesNames, definition, ORM);
  }
  return alterTableForOtherDatabases(table, attributes, columnsToAlter, definition, ORM, tableExists);
};

// Add missing columns to existing table
const addMissingColumns = async (table, attributes, attributesNames, definition, ORM, tableExists) => {
  const columnsInfo = await Promise.all(
    attributesNames.map(attributeName => getColumnInfo(attributeName, table, ORM))
  );
  const nameOfColumnsToAdd = columnsInfo.filter(info => !info.exists).map(info => info.columnName);

  if (nameOfColumnsToAdd.length === 0) return;

  const columnsToAdd = _.pick(attributes, nameOfColumnsToAdd);
  await ORM.knex.schema.table(table, tbl => {
    createColumns(tbl, columnsToAdd, { tableExists, definition, ORM, table });
  });
};

// Equilize database tables
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await createNewTable(table, attributes, definition, ORM);
    return;
  }

  const attributesNames = Object.keys(attributes);

  await addMissingColumns(table, attributes, attributesNames, definition, ORM, tableExists);

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
    await handleTableRebuild(table, attributes, attributesNames, columnsToAlter, definition, ORM, tableExists);
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