```javascript
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
const handleTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
    definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
  }
};

// Remove timestamp attributes after migration
const removeTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
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
    if (connection.options && connection.options.autoMigration === false) {
      continue;
    }

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
const buildManyRelationColumns = (manyRelation, definition, targetCollection) => {
  const { via, alias } = manyRelation;

  const targetAttr = via
    ? targetCollection.attributes[via]
    : {
        attribute: singular(definition.collectionName),
        column: definition.primaryKey,
      };

  const defAttr = definition.attributes[alias];
  const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
  let rootCol = `${defAttr.attribute}_${defAttr.column}`;

  // Handle many-way relations with same content type
  if (rootCol === targetCol) {
    rootCol = `related_${rootCol}`;
  }

  return { targetCol, rootCol };
};

// Process many-to-many relations
const processManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant) {
      continue;
    }

    if (connection.options && connection.options.autoMigration === false) {
      continue;
    }

    const { plugin, collection } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
    const { targetCol, rootCol } = buildManyRelationColumns(manyRelation, definition, targetCollection);

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    const table = manyRelation.tableCollectionName;
    await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
  }
};

// Main schema migration orchestrator
const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  handleTimestamps(loadedModel, definition);

  // Equalize main table
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

  // Process polymorphic relations
  await processMorphRelations(loadedModel, definition, connection, ORM, model, context);

  // Process many-to-many relations
  await processManyRelations(definition, connection, ORM, model, context);

  removeTimestamps(loadedModel, definition);
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

// Resolve relation type to primary key type
const resolveRelationColumnType = (name, attribute, definition) => {
  if (!attribute.type) {
    const relation = definition.associations.find(association => association.alias === name);

    if (['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature)) {
      return { type: definition.primaryKeyType };
    }
  }

  return attribute;
};

// Map attribute type to column type
const mapAttributeTypeToColumn = (name, attribute, table, definition, ORM, tableExists) => {
  const type = attribute.type;

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
  const resolvedAttribute = resolveRelationColumnType(name, attribute, definition);

  if (!resolvedAttribute.type) {
    return null;
  }

  return mapAttributeTypeToColumn(name, resolvedAttribute, table, definition, ORM, tableExists);
};

// Apply column constraints (nullable, unique, etc.)
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
const createColumns = (tbl, columns, opts = {}) => {
  const { tableExists, alter = false, table, definition, ORM } = opts;

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

// Alter existing columns
const alterColumns = (tbl, columns, opts = {}) => {
  return createColumns(tbl, columns, { ...opts, alter: true });
};

// Create primary key column
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
const rebuildSqliteTable = async (table, attributesNames, attributes, definition, ORM) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    // Drop possible conflicting indexes
    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    // Create the table
    await trx.schema.createTable(table, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { tableExists: false, table, definition, ORM });
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

// Handle non-SQLite table alterations
const alterNonSqliteTable = async (table, columnsToAlter, attributes, definition, ORM, tableExists) => {
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
        table,
        definition,
        ORM,
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

// Handle table rebuild logic
const handleTableRebuild = async (table, attributesNames, attributes, definition, ORM, columnsToAlter, tableExists) => {
  if (definition.client === 'sqlite3') {
    return rebuildSqliteTable(table, attributesNames, attributes, definition, ORM);
  }

  return alterNonSqliteTable(table, columnsToAlter, attributes, definition, ORM, tableExists);
};

// Add missing columns to existing table
const addMissingColumns = async (table, attributes, attributesNames, ORM, tableExists) => {
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
};

// Equalize database tables
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await ORM.knex.schema.createTable(table, tbl => {
      createIdType(tbl, definition);
      createColumns(tbl, attributes, { tableExists: false, table, definition, ORM });
    });
    return;
  }

  const attributesNames = Object.keys(attributes);

  // Add missing columns
  await addMissingColumns(table, attributes, attributesNames, ORM, tableExists);

  // Determine columns that need alteration
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
    await