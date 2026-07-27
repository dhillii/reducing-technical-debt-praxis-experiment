const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  const resolver = {};

  associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .forEach(association => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);

      const { nature, alias } = association;

      const resolverStrategy = getResolverStrategy(nature, model, targetModel, alias);

      resolver[alias] = resolverStrategy;
    });

  return resolver;
};

const getResolverStrategy = (nature, model, targetModel, alias) => {
  switch (nature) {
    case 'oneToManyMorph':
    case 'manyMorphToOne':
    case 'manyMorphToMany':
    case 'manyToManyMorph':
      return getMorphResolver(model, targetModel, alias);
    default:
      return getDefaultResolver(model, targetModel, alias);
  }
};

const getMorphResolver = (model, targetModel, alias) => {
  return async obj => {
    if (obj[alias]) {
      return assignOptions(obj[alias], obj);
    }

    const params = {
      ...initQueryOptions(targetModel, obj),
      id: obj[model.primaryKey],
    };

    const entry = await strapi.query(model.uid).findOne(params, [alias]);

    return assignOptions(entry[alias], obj);
  };
};

const getDefaultResolver = (model, targetModel, alias) => {
  return async (obj, options) => {
    // force component relations to be refetched
    if (model.modelType === 'component') {
      obj[alias] = _.get(obj[alias], targetModel.primaryKey, obj[alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const localId = obj[model.primaryKey];
    const targetPK = targetModel.primaryKey;
    const foreignId = _.get(obj[alias], targetModel.primaryKey, obj[alias]);

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    return getResolverForNature(model, targetModel, alias, nature, loader, params, localId, targetPK, foreignId);
  };
};

const getResolverForNature = (model, targetModel, alias, nature, loader, params, localId, targetPK, foreignId) => {
  if (['oneToOne', 'oneWay', 'manyToOne'].includes(nature)) {
    return getOneToOneResolver(loader, params, targetPK, foreignId);
  }

  if (nature === 'oneToMany' || (nature === 'manyToMany' && !association.dominant)) {
    return getOneToManyResolver(loader, params, localId);
  }

  if (nature === 'manyWay' || (nature === 'manyToMany' && association.dominant)) {
    return getManyToManyResolver(loader, params, localId, targetPK, obj, alias);
  }
};

const getOneToOneResolver = (loader, params, targetPK, foreignId) => {
  if (!foreignId) {
    return null;
  }

  const query = {
    single: true,
    filters: {
      ...params,
      [targetPK]: foreignId,
    },
  };

  return loader.load(query).then(r => assignOptions(r, obj));
};

const getOneToManyResolver = (loader, params, localId) => {
  const { via } = association;

  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

const getManyToManyResolver = (loader, params, localId, targetPK, obj, alias) => {
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
};