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

/**
 * Add timestamp columns when the model requires them.
 */
const addTimestampColumns = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  definition.attributes[created] = { type: 'currentTimestamp' };
  definition.attributes[updated] = { type: 'currentTimestamp' };
};

/**
 * Remove timestamp columns after migration.
 */
const removeTimestampColumns = (definition, loadedModel) => {
  if (!loadedModel.hasTimestamps) return;
  const [created, updated] = loadedModel.hasTimestamps;
  delete definition.attributes[created];
  delete definition.attributes[updated];
};

/**
 * Migrate polymorphic (morph) relations.
 */
const migrateMorphRelations = async ({
  definition,
  loadedModel,
  connection,
  ORM,
  model,
  context,
}) => {
  const morphRelations = definition.associations.filter(a =>
    a.nature.toLowerCase().includes('morphto')
  );

  for (const rel of morphRelations) {
    const attrs = {
      [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
      [`${rel.alias}_id`]: { type: definition.primaryKeyType },
      [`${rel.alias}_type`]: { type: 'text' },
      [definition.attributes[rel.alias].filter]: { type: 'text' },
      order: { type: 'integer' },
    };

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
        {
          table: `${loadedModel.tableName}_morph`,
          attributes: attrs,
          definition,
          ORM,
          model,
        },
        context
      );
    }
  }
};

/**
 * Migrate many‑to‑many relations.
 */
const migrateManyRelations = async ({
  definition,
  connection,
  ORM,
  model,
  context,
}) => {
  const manyRelations = getManyRelations(definition);

  for (const rel of manyRelations) {
    if (!rel.dominant) continue;

    const targetCollection = strapi.db.getModel(rel.collection, rel.plugin);
    const targetAttr = rel.via
      ? targetCollection.attributes[rel.via]
      : {
          attribute: singular(definition.collectionName),
          column: definition.primaryKey,
        };

    const defAttr = definition.attributes[rel.alias];
    const targetCol = `${targetAttr.attribute}_${targetAttr.column}`;
    let rootCol = `${defAttr.attribute}_${defAttr.column}`;

    if (rootCol === targetCol) rootCol = `related_${rootCol}`;

    const attrs = {
      [targetCol]: { type: targetCollection.primaryKeyType },
      [rootCol]: { type: definition.primaryKeyType },
    };

    if (connection.options && connection.options.autoMigration !== false) {
      await createOrUpdateTable(
        {
          table: rel.tableCollectionName,
          attributes: attrs,
          definition,
          ORM,
          model,
        },
        context
      );
    }
  }
};

/**
 * Main migration orchestrator.
 */
const migrateSchemas = async (
  { ORM, loadedModel, definition, connection, model },
  context
) => {
  addTimestampColumns(definition, loadedModel);

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

  await migrateMorphRelations({
    definition,
    loadedModel,
    connection,
    ORM,
    model,
    context,
  });

  await migrateManyRelations({
    definition,
    connection,
    ORM,
    model,
    context,
  });

  removeTimestampColumns(definition, loadedModel);
};

const getColumnInfo = async (columnName, tableName, ORM) => ({
  columnName,
  exists: await ORM.knex.schema.hasColumn(tableName, columnName),
});

const isColumn = ({ definition, attribute, name }) => {
  if (!_.has(attribute, 'type')) {
    const relation = definition.associations.find(a => a.alias === name);
    if (!relation) return false;
    return ['oneToOne', 'manyToOne', 'oneWay'].includes(relation.nature);
  }
  if (['component', 'dynamiczone'].includes(attribute.type)) return false;
  return true;
};

const uniqueColName = (table, key) => `${table}_${key}_unique`;

const buildColType = ({
  name,
  attribute,
  table,
  tableExists = false,
  definition,
  ORM,
}) => {
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

/**
 * Create a new table with primary key.
 */
const createIdColumn = (tbl, definition) => {
  if (definition.primaryKeyType === 'uuid' && definition.client === 'pg') {
    return tbl
      .specificType('id', 'uuid DEFAULT uuid_generate_v4()')
      .notNullable()
      .primary();
  }
  return tbl.increments('id');
};

/**
 * Add columns to a table definition.
 */
const addColumnsToTable = ({
  tbl,
  columns,
  tableExists,
  definition,
  ORM,
  alter = false,
}) => {
  Object.entries(columns).forEach(([key, attribute]) => {
    const col = buildColType({
      name: key,
      attribute,
      table: tbl,
      tableExists,
      definition,
      ORM,
    });
    if (!col) return;

    if (attribute.required) {
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

    if (attribute.unique && (definition.client !== 'sqlite3' || !tableExists)) {
      tbl.unique(key, uniqueColName(tbl._tableName, key));
    }

    if (alter) col.alter();
  });
};

/**
 * Build a new table.
 */
const buildNewTable = async ({ table, attributes, definition, ORM, model }) => {
  await ORM.knex.schema.createTable(table, tbl => {
    createIdColumn(tbl, definition);
    addColumnsToTable({
      tbl,
      columns: attributes,
      tableExists: false,
      definition,
      ORM,
      alter: false,
    });
  });
};

/**
 * Add missing columns to an existing table.
 */
const addMissingColumns = async ({
  table,
  columnsToAdd,
  definition,
  ORM,
  tableExists,
}) => {
  await ORM.knex.schema.table(table, tbl => {
    addColumnsToTable({
      tbl,
      columns: columnsToAdd,
      tableExists,
      definition,
      ORM,
      alter: false,
    });
  });
};

/**
 * Rebuild SQLite table using a temporary copy.
 */
const rebuildSQLiteTable = async ({
  table,
  attributes,
  definition,
  ORM,
  model,
  context,
}) => {
  const tmpTable = `tmp_${table}`;

  const rebuild = async trx => {
    await trx.schema.renameTable(table, tmpTable);
    await Promise.all(
      Object.keys(attributes).map(key =>
        trx.raw('DROP INDEX IF EXISTS ??', uniqueColName(table, key))
      )
    );
    await buildNewTable({
      table,
      attributes,
      definition,
      ORM: { knex: trx },
      model,
    });

    const cols = Object.keys(attributes).filter(colName =>
      isColumn({
        definition,
        attribute: attributes[colName],
        name: colName,
      })
    );
    const selectCols = ['id', ...cols];
    await trx.insert(qb => qb.select(selectCols).from(tmpTable)).into(table);
    await trx.schema.dropTableIfExists(tmpTable);
  };

  try {
    await ORM.knex.transaction(trx => rebuild(trx));
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

/**
 * Alter table for non‑SQLite databases.
 */
const alterNonSQLiteTable = async ({
  table,
  columnsToAlter,
  attributes,
  definition,
  ORM,
  model,
}) => {
  const alter = async trx => {
    await Promise.all(
      columnsToAlter.map(col =>
        ORM.knex.schema
          .alterTable(table, tbl => tbl.dropUnique(col, uniqueColName(table, col)))
          .catch(() => {})
      )
    );
    await trx.schema.alterTable(table, tbl => {
      addColumnsToTable({
        tbl,
        columns: _.pick(attributes, columnsToAlter),
        tableExists: true,
        definition,
        ORM,
        alter: true,
      });
    });
  };

  try {
    await ORM.knex.transaction(trx => alter(trx));
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

/**
 * Core table creation / update logic.
 */
const createOrUpdateTable = async ({ table, attributes, definition, ORM, model }, context) => {
  const tableExists = await ORM.knex.schema.hasTable(table);

  if (!tableExists) {
    await buildNewTable({ table, attributes, definition, ORM, model });
    return;
  }

  const attributeNames = Object.keys(attributes);
  const columnsInfo = await Promise.all(
    attributeNames.map(name => getColumnInfo(name, table, ORM))
  );
  const missing = columnsInfo.filter(i => !i.exists).map(i => i.columnName);
  const columnsToAdd = _.pick(attributes, missing);

  if (Object.keys(columnsToAdd).length) {
    await addMissingColumns({
      table,
      columnsToAdd,
      definition,
      ORM,
      tableExists,
    });
  }

  const attrsWithoutTimestamps = attributeNames.filter(
    name => !(definition.options.timestamps || []).includes(name)
  );

  const columnsToAlter = await getColumnsWhereDefinitionChanged(
    attrsWithoutTimestamps,
    definition,
    ORM
  );

  const shouldRebuild =
    columnsToAlter.length > 0 ||
    (definition.client === 'sqlite3' && context.recreateSqliteTable);

  if (!shouldRebuild) return;

  if (definition.client === 'sqlite3') {
    await rebuildSQLiteTable({
      table,
      attributes,
      definition,
      ORM,
      model,
      context,
    });
  } else {
    await alterNonSQLiteTable({
      table,
      columnsToAlter,
      attributes,
      definition,
      ORM,
      model,
    });
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
```