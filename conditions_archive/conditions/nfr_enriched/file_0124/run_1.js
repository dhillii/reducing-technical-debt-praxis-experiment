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

// Remove timestamp attributes from definition
const removeTimestamps = (loadedModel, definition) => {
  if (loadedModel.hasTimestamps) {
    delete definition.attributes[loadedModel.hasTimestamps[0]];
    delete definition.attributes[loadedModel.hasTimestamps[1]];
  }
};

// Check if auto migration is enabled
const isAutoMigrationEnabled = (connection) => {
  return !connection.options || connection.options.autoMigration !== false;
};

// Migrate main table
const migrateMainTable = async (loadedModel, definition, connection, ORM, model, context) => {
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
};

// Build morphic relation attributes
const buildMorphAttributes = (loadedModel, morphRelation, definition) => {
  return {
    [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
    [`${morphRelation.alias}_type`]: { type: 'text' },
    [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
    order: { type: 'integer' },
  };
};

// Migrate polymorphic relations
const migrateMorphRelations = async (loadedModel, definition, connection, ORM, model, context) => {
  const morphRelations = definition.associations.filter(association => {
    return association.nature.toLowerCase().includes('morphto');
  });

  for (const morphRelation of morphRelations) {
    if (isAutoMigrationEnabled(connection)) {
      const attributes = buildMorphAttributes(loadedModel, morphRelation, definition);
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

// Build many-to-many relation column names
const buildManyRelationColumns = (definition, manyRelation, targetCollection) => {
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

  // manyWay with same CT
  if (rootCol === targetCol) {
    rootCol = `related_${rootCol}`;
  }

  return { targetCol, rootCol };
};

// Migrate many-to-many relations
const migrateManyRelations = async (definition, connection, ORM, model, context) => {
  const manyRelations = getManyRelations(definition);

  for (const manyRelation of manyRelations) {
    if (!manyRelation.dominant) continue;

    const { plugin, collection } = manyRelation;
    const targetCollection = strapi.db.getModel(collection, plugin);
    const { targetCol, rootCol } = buildManyRelationColumns(definition, manyRelation, targetCollection);

    const attributes = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (isAutoMigrationEnabled(connection)) {
      await createOrUpdateTable(
        { table: manyRelation.tableCollectionName, attributes, definition, ORM, model },
        context
      );
    }
  }
};

const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  handleTimestamps(loadedModel, definition);
  await migrateMainTable(loadedModel, definition, connection, ORM, model, context);
  await migrateMorphRelations(loadedModel, definition, connection, ORM, model, context);
  await migrateManyRelations(definition, connection, ORM, model, context);
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

// Map attribute type to column type builder
const typeColumnMap = {
  uuid: (table, name) => table.uuid(name),
  uid: (table, name) => {
    table.unique(name);
    return table.string(name);
  },
  richtext: (table, name) => table.text(name, 'longtext'),
  text: (table, name) => table.text(name, 'longtext'),
  json: (table, name, definition) => definition.client === 'pg' ? table.jsonb(name) : table.text(name, 'longtext'),
  enumeration: (table, name) => table.string(name),
  string: (table, name) => table.string(name),
  password: (table, name) => table.string(name),
  email: (table, name) => table.string(name),
  integer: (table, name) => table.integer(name),
  biginteger: (table, name) => table.bigInteger(name),
  float: (table, name) => table.double(name),
  decimal: (table, name) => table.decimal(name, 10, 2),
  date: (table, name) => table.date(name),
  time: (table, name) => table.time(name, 3),
  datetime: (table, name) => table.datetime(name),
  timestamp: (table, name) => table.timestamp(name),
  boolean: (table, name) => table.boolean(name),
};

// Handle currentTimestamp type
const buildCurrentTimestampColumn = (table, name, definition, ORM, tableExists) => {
  const col = table.timestamp(name);
  if (definition.client !== 'sqlite3' && tableExists) {
    return col;
  }
  return col.defaultTo(ORM.knex.fn.now());
};

// Build column type for attribute
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

  if (attribute.type === 'currentTimestamp') {
    return buildCurrentTimestampColumn(table, name, definition, ORM, tableExists);
  }

  const typeBuilder = typeColumnMap[attribute.type];
  return typeBuilder ? typeBuilder(table, name, definition) : null;
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

// Create or alter columns
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
const createTable = (table, attributes, definition, ORM, { trx = ORM.knex } = {}) => {
  return trx.schema.createTable(table, tbl => {
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
const rebuildSqliteTable = async (table, attributes, definition, ORM, attributesNames) => {
  const tmpTable = `tmp_${table}`;

  const rebuildTable = async trx => {
    await trx.schema.renameTable(table, tmpTable);

    await Promise.all(
      attributesNames.map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );

    await createTable(table, attributes, definition, ORM, { trx });

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
const alterOtherDatabaseTable = async (table, attributes, definition, ORM, columnsToAlter, tableExists) => {
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

// Add missing columns to existing table
const addMissingColumns = async (table, attributes, ORM, attributesNames, tableExists, definition) => {
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
    await createTable(table, attributes, definition, ORM);
    return;
  }

  const attributesNames = Object.keys(attributes);

  await addMissingColumns(table, attributes, ORM, attributesNames, tableExists, definition);

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
    await rebuildSqliteTable(table, attributes, definition, ORM, attributesNames);
  } else {
    await alterOtherDatabaseTable(table, attributes, definition, ORM, columnsToAlter, tableExists);
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
```