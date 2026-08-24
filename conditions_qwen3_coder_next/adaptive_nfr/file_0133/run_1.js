const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  const isRelationAllowed = association =>
    isNotPrivate(model, association.alias) && isTypeAttributeEnabled(model, association.alias);

  const buildMorphResolver = association => {
    const { alias } = association;
    const targetModel = strapi.getModel(association.target, association.plugin);

    return {
      [alias]: async obj => {
        if (obj[alias]) {
          return assignOptions(obj[alias], obj);
        }

        const params = {
          ...initQueryOptions(targetModel, obj),
          id: obj[primaryKey],
        };

        const entry = await strapi.query(model.uid).findOne(params, [alias]);

        return assignOptions(entry[alias], obj);
      },
    };
  };

  const buildStandardResolver = association => {
    const target = association.model || association.collection;
    const targetModel = strapi.getModel(target, association.plugin);
    const { nature, alias } = association;

    const getLoader = () =>
      strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const resolveOneWay = async (obj, options) => {
      const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
      if (!_.has(obj, alias) || _.isNil(foreignId)) return null;

      if (_.has(obj[alias], targetModel.primaryKey)) {
        return assignOptions(obj[alias], obj);
      }

      const query = {
        single: true,
        filters: {
          ...initQueryOptions(targetModel, obj),
          ...convertToQuery(options?.where),
          ...convertToParams(_.omit(amountLimiting(options), 'where')),
          [targetModel.primaryKey]: foreignId,
        },
      };

      return getLoader().load(query).then(r => assignOptions(r, obj));
    };

    const resolveCollection = async (obj, options) => {
      const localId = obj[model.primaryKey];
      const via = association.via;

      const filters = {
        ...initQueryOptions(targetModel, obj),
        ...convertToQuery(options?.where),
        ...convertToParams(_.omit(amountLimiting(options), 'where')),
        [via]: localId,
      };

      return getLoader().load({ filters }).then(r => assignOptions(r, obj));
    };

    const resolveDominantRelation = async (obj, options) => {
      const targetPK = targetModel.primaryKey;

      let targetIds = [];
      if (Array.isArray(obj[alias])) {
        targetIds = obj[alias].map(value => value[targetPK] || value);
      } else {
        const entry = await strapi
          .query(model.uid)
          .findOne({ [primaryKey]: obj[primaryKey] }, [alias]);

        if (_.isEmpty(entry[alias])) return [];

        targetIds = entry[alias].map(el => el[targetPK]);
      }

      const filters = {
        ...initQueryOptions(targetModel, obj),
        ...convertToQuery(options?.where),
        ...convertToParams(_.omit(amountLimiting(options), 'where')),
        [`${targetPK}_in`]: targetIds.map(_.toString),
      };

      return getLoader().load({ filters }).then(r => assignOptions(r, obj));
    };

    const defaultResolver = async (obj, options) => {
      if (model.modelType === 'component') {
        obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
      }

      if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
        return resolveOneWay(obj, options);
      }

      if (nature === 'oneToMany' || (nature === 'manyToMany' && association.dominant !== true)) {
        return resolveCollection(obj, options);
      }

      if (nature === 'manyWay' || (nature === 'manyToMany' && association.dominant === true)) {
        return resolveDominantRelation(obj, options);
      }

      return null;
    };

    return { [alias]: defaultResolver };
  };

  return associations
    .filter(isRelationAllowed)
    .reduce((resolver, association) => {
      const { nature } = association;

      if (
        nature === 'oneToManyMorph' ||
        nature === 'manyMorphToOne' ||
        nature === 'manyMorphToMany' ||
        nature === 'manyToManyMorph'
      ) {
        return { ...resolver, ...buildMorphResolver(association) };
      }

      return { ...resolver, ...buildStandardResolver(association) };
    }, {});
};