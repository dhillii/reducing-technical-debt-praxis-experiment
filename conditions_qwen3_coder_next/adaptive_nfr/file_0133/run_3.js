break;
        }
        default: {
          resolver[alias] = async (obj, options) => {
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

            if (isSingleRelation(nature)) {
              return resolveSingleRelation(obj, alias, targetPK, foreignId, loader, params, model, targetModel, resolverOpts);
            }

            if (isToManyRelation(nature, association)) {
              return resolveToManyRelation(obj, alias, localId, targetPK, loader, params, model, targetModel, association);
            }

            if (isManyWayOrDominantToMany(nature, association)) {
              return resolveManyWayOrDominantToMany(obj, alias, localId, targetPK, loader, params, model, targetModel, association, primaryKey);
            }
          };
          break;
        }
      }

      return resolver;
    }, {});
};

/**
 * Check if nature represents a single relation (oneToOne, oneWay, manyToOne)
 * @param {string} nature
 * @returns {boolean}
 */
const isSingleRelation = nature => ['oneToOne', 'oneWay', 'manyToOne'].includes(nature);

/**
 * Check if nature represents a to-many relation (oneToMany or non-dominant manyToMany)
 * @param {string} nature
 * @param {object} association
 * @returns {boolean}
 */
const isToManyRelation = (nature, association) =>
  nature === 'oneToMany' ||
  (nature === 'manyToMany' && association.dominant !== true);

/**
 * Check if nature represents many-way or dominant many-to-many
 * @param {string} nature
 * @param {object} association
 * @returns {boolean}
 */
const isManyWayOrDominantToMany = (nature, association) =>
  nature === 'manyWay' ||
  (nature === 'manyToMany' && association.dominant === true);

/**
 * Resolve single relation (oneToOne, oneWay, manyToOne)
 * @param {object} obj
 * @param {string} alias
 * @param {string} targetPK
 * @param {any} foreignId
 * @param {object} loader
 * @param {object} params
 * @param {object} model
 * @param {object} targetModel
 * @param {object} resolverOpts
 * @returns {Promise<object|null>}
 */
const resolveSingleRelation = async (obj, alias, targetPK, foreignId, loader, params, model, targetModel, resolverOpts) => {
  if (!_.has(obj, alias) || _.isNil(foreignId)) {
    return null;
  }

  // check this is an entity and not a mongo ID
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
};

/**
 * Resolve to-many relations (oneToMany or non-dominant manyToMany)
 * @param {object} obj
 * @param {string} alias
 * @param {string} localId
 * @param {string} targetPK
 * @param {object} loader
 * @param {object} params
 * @param {object} model
 * @param {object} targetModel
 * @param {object} association
 * @returns {Promise<Array>}
 */
const resolveToManyRelation = async (obj, alias, localId, targetPK, loader, params, model, targetModel, association) => {
  const { via } = association;

  const filters = {
    ...params,
    [via]: localId,
  };

  return loader.load({ filters }).then(r => assignOptions(r, obj));
};

/**
 * Resolve many-way or dominant many-to-many relations
 * @param {object} obj
 * @param {string} alias
 * @param {string} localId
 * @param {string} targetPK
 * @param {object} loader
 * @param {object} params
 * @param {object} model
 * @param {object} targetModel
 * @param {object} association
 * @param {string} primaryKey
 * @returns {Promise<Array>}
 */
const resolveManyWayOrDominantToMany = async (obj, alias, localId, targetPK, loader, params, model, targetModel, association, primaryKey) => {
  let targetIds = [];

  // find the related ids to query them and apply the filters
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