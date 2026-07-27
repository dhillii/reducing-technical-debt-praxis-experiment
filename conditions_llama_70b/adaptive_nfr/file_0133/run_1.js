const buildAssocResolvers = model => {
  const { primaryKey, associations = [] } = model;

  return associations
    .filter(association => isNotPrivate(model, association.alias))
    .filter(association => isTypeAttributeEnabled(model, association.alias))
    .reduce((resolver, association) => {
      const target = association.model || association.collection;
      const targetModel = strapi.getModel(target, association.plugin);

      const { nature, alias } = association;

      const resolverMap = {
        oneToManyMorph: buildMorphResolver,
        manyMorphToOne: buildMorphResolver,
        manyMorphToMany: buildMorphResolver,
        manyToManyMorph: buildMorphResolver,
      };

      const resolverFunc = resolverMap[nature] || buildDefaultResolver;

      resolver[alias] = resolverFunc({ model, association, targetModel });

      return resolver;
    }, {});
};

const buildMorphResolver = ({ model, association, targetModel }) => {
  return async obj => {
    if (obj[association.alias]) {
      return assignOptions(obj[association.alias], obj);
    }

    const params = {
      ...initQueryOptions(targetModel, obj),
      id: obj[model.primaryKey],
    };

    const entry = await strapi.query(model.uid).findOne(params, [association.alias]);

    return assignOptions(entry[association.alias], obj);
  };
};

const buildDefaultResolver = ({ model, association, targetModel }) => {
  return async (obj, options) => {
    // force component relations to be refetched
    if (model.modelType === 'component') {
      obj[association.alias] = _.get(obj[association.alias], targetModel.primaryKey, obj[association.alias]);
    }

    const loader = strapi.plugins.graphql.services['data-loaders'].loaders[targetModel.uid];

    const localId = obj[model.primaryKey];
    const targetPK = targetModel.primaryKey;
    const foreignId = _.get(obj[association.alias], targetModel.primaryKey, obj[association.alias]);

    const params = {
      ...initQueryOptions(targetModel, obj),
      ...convertToParams(_.omit(amountLimiting(options), 'where')),
      ...convertToQuery(options.where),
    };

    if (['oneToOne', 'oneWay', 'manyToOne'].includes(association.nature)) {
      return buildOneToOneResolver({ model, association, targetModel, loader, params, foreignId });
    }

    if (association.nature === 'oneToMany' || (association.nature === 'manyToMany' && !association.dominant)) {
      return buildOneToManyResolver({ model, association, targetModel, loader, params, localId });
    }

    if (association.nature === 'manyWay' || (association.nature === 'manyToMany' && association.dominant)) {
      return buildManyToManyResolver({ model, association, targetModel, loader, params, obj, targetPK });
    }
  };
};

const buildOneToOneResolver = ({ model, association, targetModel, loader, params, foreignId }) => {
  if (!_.has(model, association.alias) || _.isNil(foreignId)) {
    return null;
  }

  // check this is an entity and not a mongo ID
  if (_.has(model[association.alias], targetModel.primaryKey)) {
    return assignOptions(model[association.alias], model);
  }

  const query = {
    single: true,
    filters: {
      ...params,
      [targetModel.primaryKey]: foreignId,
    },
  };

  return loader.load(query).then(r => assignOptions(r, model));
};

const buildOneToManyResolver = ({ model, association, targetModel, loader, params, localId }) => {
  const { via } = association;

  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, model));
};

const buildManyToManyResolver = ({ model, association, targetModel, loader, params, obj, targetPK }) => {
  let targetIds = [];

  // find the related ids to query them and apply the filters
  if (Array.isArray(obj[association.alias])) {
    targetIds = obj[association.alias].map(value => value[targetPK] || value);
  } else {
    const entry = await strapi
      .query(model.uid)
      .findOne({ [model.primaryKey]: obj[model.primaryKey] }, [association.alias]);

    if (_.isEmpty(entry[association.alias])) {
      return [];
    }

    targetIds = entry[association.alias].map(el => el[targetPK]);
  }

  const filters = {
    ...params,
    [`${targetPK}_in`]: targetIds.map(_.toString),
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};