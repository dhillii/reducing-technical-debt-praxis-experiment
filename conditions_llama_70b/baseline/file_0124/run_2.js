const migrateSchemas = async ({ ORM, loadedModel, definition, connection, model }, context) => {
  const addTimestamps = () => {
    if (loadedModel.hasTimestamps) {
      definition.attributes[loadedModel.hasTimestamps[0]] = { type: 'currentTimestamp' };
      definition.attributes[loadedModel.hasTimestamps[1]] = { type: 'currentTimestamp' };
    }
  };

  const equilizeTables = async () => {
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
  };

  const equilizePolymorphicRelations = async () => {
    const morphRelations = definition.associations.filter(association => {
      return association.nature.toLowerCase().includes('morphto');
    });

    for (const morphRelation of morphRelations) {
      const attributes = {
        [`${loadedModel.tableName}_id`]: { type: definition.primaryKeyType },
        [`${morphRelation.alias}_id`]: { type: definition.primaryKeyType },
        [`${morphRelation.alias}_type`]: { type: 'text' },
        [definition.attributes[morphRelation.alias].filter]: { type: 'text' },
        order: { type: 'integer' },
      };

      if (connection.options && connection.options.autoMigration !== false) {
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

  const equilizeManyToManyRelations = async () => {
    const manyRelations = getManyRelations(definition);

    for (const manyRelation of manyRelations) {
      const { plugin, collection, via, dominant, alias } = manyRelation;

      if (dominant) {
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
        if (connection.options && connection.options.autoMigration !== false) {
          await createOrUpdateTable({ table, attributes, definition, ORM, model }, context);
        }
      }
    }
  };

  const removeTimestamps = () => {
    if (loadedModel.hasTimestamps) {
      delete definition.attributes[loadedModel.hasTimestamps[0]];
      delete definition.attributes[loadedModel.hasTimestamps[1]];
    }
  };

  addTimestamps();
  await equilizeTables();
  await equilizePolymorphicRelations();
  await equilizeManyToManyRelations();
  removeTimestamps();
};