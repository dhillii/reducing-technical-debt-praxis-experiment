const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  return associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .reduce((resolver, association) => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);

      const { nature, alias } = association;

      switch (nature) {
        case 'oneToManyMorph':
        case 'manyMorphToOne':
        case 'manyMorphToMany':
        case 'manyToManyMorph': {
          resolver[alias] = async obj => {
            if (obj[alias]) {
              return assignOptions(obj[alias], obj);
            }

            const params = {
              ...initQueryOptions(targetModel, obj),
              id: obj[primaryKey],
            };

            const entry = await strapi.query(model.uid).findOne(params, [alias]);

            return assignOptions(entry[alias], obj);
          };
          break;
        }
        default: {
          resolver[alias] = async (obj, options) => {
            const targetPK = targetModel.primaryKey;
            const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

            if (model.modelType === 'component') {
              obj[alias] = _.get(obj[alias], targetPK, obj[alias]);
            }

            const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

            const localId = obj[model.primaryKey];
            const params = {
              ...initQueryOptions(targetModel, obj),
              ...convertToParams(_.omit(amountLimiting(options), 'where')),
              ...convertToQuery(options.where),
            };

            if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
              if (!_.has(obj, alias) || _.isNil(foreignId)) {
                return null;
              }

              if (_.has(obj[alias], targetPK)) {
                return assignOptions(obj[alias], obj);
              }

              const query = {
                single: true,
                filters: {
                  ...params,
                  [targetPK]: foreignId,
                },
              };

              return loader.load(query).then(r => assignOptions(r, obj));
            }

            if (
              nature === 'oneToMany' ||
              (nature === 'manyToMany' && association.dominant !== true)
            ) {
              const { via } = association;

              const filters = {
                ...params,
                [via]: localId,
              };

              return loader.load({ filters }).then(r => assignOptions(r, obj));
            }

            if (
              nature === 'manyWay' ||
              (nature === 'manyToMany' && association.dominant === true)
            ) {
              let targetIds = [];

              if (Array.isArray(obj[alias])) {
                targetIds = obj[alias].map(value => value[targetPK] || value);
              } else {
                const entry = await strapi
                  .query(model.uid)
                  .findOne({ [primaryKey]: obj[primaryKey] }, [alias]);

                if (_.isEmpty(entry[alias])) {
                  return [];
                }

                targetIds = entry[alias].map(el => el[targetPK]);
              }

              const filters = {
                ...params,
                [`${targetPK}_in`]: targetIds.map(_.toString),
              };

              return loader.load({ filters }).then(r => assignOptions(r, obj));
            }
          };
          break;
        }
      }

      return resolver;
    }, {});
};