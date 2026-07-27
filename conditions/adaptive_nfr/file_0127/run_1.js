'use strict';

const _ = require('lodash');
const mongoose = require('mongoose');

const { models: utilsModels, contentTypes: contentTypesUtils } = require('strapi-utils');
const utils = require('./utils');
const populateQueries = require('./utils/populate-queries');
const relations = require('./relations');
const { findComponentByGlobalId } = require('./utils/helpers');
const {
  didDefinitionChange,
  storeDefinition,
  getDefinitionFromStore,
} = require('./utils/store-definition');

const {
  PUBLISHED_AT_ATTRIBUTE,
  CREATED_BY_ATTRIBUTE,
  UPDATED_BY_ATTRIBUTE,
  DP_PUB_STATES,
} = contentTypesUtils.constants;

const isPolymorphicAssoc = assoc => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

/** Check if model is not a strapi internal model or component */
const isUserDefinedModel = definition => {
  return !definition.uid.startsWith('strapi::') && definition.modelType !== 'component';
};

/** Add draft and publish attributes to model definition */
const addDraftPublishAttributes = (definition, hasDraftAndPublish) => {
  if (!hasDraftAndPublish) return;
  
  definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
    type: 'datetime',
    configurable: false,
    writable: true,
    visible: false,
  };
};

/** Add creator tracking attributes to model definition */
const addCreatorAttributes = (definition) => {
  const isPrivate = !_.get(definition, 'options.populateCreatorFields', false);

  definition.attributes[CREATED_BY_ATTRIBUTE] = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: isPrivate,
  };

  definition.attributes[UPDATED_BY_ATTRIBUTE] = {
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: isPrivate,
  };
};

/** Filter component and dynamic zone attributes */
const getComponentAttributes = (attributes) => {
  return Object.keys(attributes).filter(key =>
    ['component', 'dynamiczone'].includes(attributes[key].type)
  );
};

/** Filter scalar attributes */
const getScalarAttributes = (attributes) => {
  return Object.keys(attributes).filter(key => {
    const { type } = attributes[key];
    return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
  });
};

/** Filter relational attributes */
const getRelationalAttributes = (attributes) => {
  return Object.keys(attributes).filter(key => {
    const { type } = attributes[key];
    return type === undefined;
  });
};

/** Load component attributes into model schema */
const loadComponentAttributes = (loadedModel, componentAttributes) => {
  componentAttributes.forEach(name => {
    loadedModel[name] = [
      {
        kind: String,
        ref: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: `${name}.kind`,
        },
      },
    ];
  });
};

/** Load scalar attributes into model schema */
const loadScalarAttributes = (loadedModel, scalarAttributes, definition, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

/** Load relational attributes into model schema */
const loadRelationalAttributes = (loadedModel, relationalAttributes, definition, model, instance) => {
  relationalAttributes.forEach(name => {
    buildRelation({
      definition,
      model,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  });
};

/** Configure schema timestamps */
const configureTimestamps = (schema, definition, target, model) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

    _.assign(target[model].allAttributes, {
      [createAtCol]: { type: 'timestamp' },
      [updatedAtCol]: { type: 'timestamp' },
    });

    schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }
};

/** Create reference transformation function for morph associations */
const createRefToStrapiRef = () => {
  return obj => {
    const ref = obj.ref;
    let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

    if (typeof plainData !== 'object') return ref;

    return {
      __contentType: obj.kind,
      ...ref,
    };
  };
};

/** Parse component reference to string ID */
const parseComponentRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return el.ref.toString();
  }
  return el.ref;
};

/** Parse dynamic zone reference */
const parseDynamicZoneRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return { id: el.ref.toString() };
  }
  return el.ref;
};

/** Handle decimal128 conversion in transform */
const transformDecimal128 = (returned) => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

/** Check if morph association has data */
const hasMorphAssociationData = (returned, association) => {
  return Array.isArray(returned[association.alias]) && returned[association.alias].length > 0;
};

/** Transform morph association data */
const transformMorphAssociation = (returned, association, refToStrapiRef) => {
  if (association.nature === 'oneMorphToOne') {
    returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
  } else if (association.nature === 'manyMorphToMany' || association.nature === 'manyMorphToOne') {
    returned[association.alias] = returned[association.alias].map(obj => refToStrapiRef(obj));
  }
};

/** Transform component attribute data */
const transformComponentAttribute = (returned, name, attribute, definition) => {
  const { type } = attribute;

  if (type === 'component') {
    if (Array.isArray(returned[name])) {
      const components = returned[name].map(parseComponentRef);
      returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
    }
  }

  if (type === 'dynamiczone') {
    if (returned[name]) {
      returned[name] = returned[name]
        .filter(el => el && el.kind)
        .map(el => {
          return {
            __component: findComponentByGlobalId(el.kind).uid,
            ...parseDynamicZoneRef(el),
          };
        });
    }
  }
};

/** Check if association has relation data */
const hasRelationData = (returned, association) => {
  return returned[association.alias];
};

/** Transform regular association data */
const transformAssociation = (returned, association) => {
  const relation = returned[association.alias];
  returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

  if (_.isArray(association.populate)) {
    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  }
};

/** Create schema transform function */
const createSchemaTransform = (morphAssociations, componentAttributes, definition, associations) => {
  return function(doc, returned) {
    const refToStrapiRef = createRefToStrapiRef();

    transformDecimal128(returned);

    morphAssociations.forEach(association => {
      if (hasMorphAssociationData(returned, association)) {
        transformMorphAssociation(returned, association, refToStrapiRef);
      }
    });

    componentAttributes.forEach(name => {
      const attribute = definition.attributes[name];
      transformComponentAttribute(returned, name, attribute, definition);
    });

    associations.forEach(association => {
      if (hasRelationData(returned, association)) {
        transformAssociation(returned, association);
      }
    });
  };
};

/** Setup model indexes error handling */
const setupIndexErrorHandling = (Model) => {
  Model.on('index', error => {
    if (!error) return;

    if (error.code === 11000) {
      strapi.log.error(
        `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
      );
    } else {
      strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
    }
  });
};

/** Sync or handle model indexes based on environment */
const configureModelIndexes = (Model) => {
  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, () => setupIndexErrorHandling(Model));
  } else {
    setupIndexErrorHandling(Model);
  }
};

/** Setup schema pre-hooks for find operations */
const setupFindHooks = (schema, populateFn) => {
  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });
};

/** Setup virtual fields for relationships */
const setupVirtualFields = (schema, definition) => {
  _.forEach(
    _.pickBy(definition.loadedModel, ({ type }) => type === 'virtual'),
    (value, key) => {
      schema.virtual(key, {
        ref: value.ref,
        localField: '_id',
        foreignField: value.via,
        justOne: value.justOne || false,
      });
    }
  );
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  function mountModel(model) {
    const definition = models[model];
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);

    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });

    if (isUserDefinedModel(definition)) {
      addDraftPublishAttributes(definition, hasDraftAndPublish);
      addCreatorAttributes(definition);
    }

    const componentAttributes = getComponentAttributes(definition.attributes);
    const scalarAttributes = getScalarAttributes(definition.attributes);
    const relationalAttributes = getRelationalAttributes(definition.attributes);

    if (componentAttributes.length > 0) {
      loadComponentAttributes(definition.loadedModel, componentAttributes);
    }

    loadScalarAttributes(definition.loadedModel, scalarAttributes, definition, instance, hasDraftAndPublish);
    loadRelationalAttributes(definition.loadedModel, relationalAttributes, definition, model, instance);

    const schema = new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    setupFindHooks(schema, populateFn);
    setupVirtualFields(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);

    configureTimestamps(schema, definition, target, model);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: createSchemaTransform(morphAssociations, componentAttributes, definition, associations),
    };

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    configureModelIndexes(Model);

    target[model] = _.assign(Model, target[model]);

    target[model]._attributes = definition.attributes;
    target[model].updateRelations = relations.update;
    target[model].deleteRelations = relations.deleteRelations;
    target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
  }

  Object.keys(models).forEach(mountModel);

  for (const model of Object.keys(models)) {
    const definition = models[model];
    const modelInstance = target[model];
    const definitionDidChange = await didDefinitionChange(definition, instance);

    const previousDefinition = await getDefinitionFromStore(definition, instance);

    await strapi.db.migrations.run(migrateSchema, {
      definition,
      previousDefinition,
      model: modelInstance,
      ORM: instance,
    });

    if (definitionDidChange) {
      await storeDefinition(definition, instance);
    }
  }
};

const migrateSchema = () => {};

const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function() {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    const getMatchQuery = assoc => {
      const assocModel = strapi.db.getModelByAssoc(assoc);
      const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);

      if (hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)) {
        return populateQueries.publicationState[publicationState];
      }

      return undefined;
    };

    const populateMorphAssociations = () => {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;

        if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
        } else if (populatedPaths.includes(alias)) {
          _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
          _.set(this._mongooseOptions.populate, [alias, 'options'], {
            publicationState,
          });

          if (matchQuery !== undefined) {
            _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
          }
        }
      });
    };

    const populateComponentAttributes = () => {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    };

    const populateComponentAssociations = () => {
      definition.associations
        .filter(assoc => !isPolymorphicAssoc(assoc))
        .filter(ast => ast.autoPopulate !== false)
        .forEach(ast => {
          this.populate({
            path: ast.alias,
            match: getMatchQuery(ast),
            options: { publicationState, _populateComponents: false },
          });
        });
    };

    if (_populateMorphRelations) {
      populateMorphAssociations();
    }

    if (_populateComponents) {
      populateComponentAttributes();
    }

    if (definition.modelType === 'component') {
      populateComponentAssociations();
    }
  };
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (name, plugin) => {
    return strapi.db.getModel(name, plugin).globalId;
  };

  const setField = (name, val) => {
    definition.loadedModel[name] = val;
  };

  const { ObjectId } = instance.Schema.Types;

  const handleHasOne = () => {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  };

  const handleHasMany = () => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.collection, attribute.plugin);

    if (FK) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: false,
      });
      attribute.isVirtual = true;
    } else {
      setField(name, [{ type: ObjectId, ref }]);
    }
  };

  const isBelongsToVirtual = (FK) => {
    if (!FK) return false;
    return FK.nature !== 'oneToOne' && FK.nature !== 'manyToOne' && 
           FK.nature !== 'oneWay' && FK.nature !== 'oneToMorph';
  };

  const handleBelongsTo = () => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.model, attribute.plugin);

    if (isBelongsToVirtual(FK)) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: true,
      });
      attribute.isVirtual = true;
    } else {
      setField(name, { type: ObjectId, ref });
    }
  };

  const isBelongsToManyVirtual = (FK) => {
    if (!FK) return attribute.dominant !== true;
    return _.isUndefined(FK.via) || attribute.dominant !== true;
  };

  const handleBelongsToMany = () => {
    const ref = getRef(attribute.collection, attribute.plugin);

    if (nature === 'manyWay') {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }

    const FK = _.find(definition.associations, { alias: name });

    if (isBelongsToManyVirtual(FK)) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
      });
      attribute.isVirtual = true;
    } else {
      setField(name, [{ type: ObjectId, ref }]);
    }
  };

  const handleMorphOne = () => {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  };

  const handleMorphMany = () => {
    const ref = getRef(attribute.collection, attribute.plugin);
    setField(name, [{ type: ObjectId, ref }]);
  };

  const handleBelongsToMorph = () => {
    setField(name, {
      kind: String,
      [attribute.filter]: String,
      ref: { type: ObjectId, refPath: `${name}.kind` },
    });
  };

  const handleBelongsToManyMorph = () => {
    setField(name, [
      {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      },
    ]);
  };

  switch (verbose) {
    case 'hasOne':
      handleHasOne();
      break;
    case 'hasMany':
      handleHasMany();
      break;
    case 'belongsTo':
      handleBelongsTo();
      break;
    case 'belongsToMany':
      handleBelongsToMany();
      break;
    case 'morphOne':
      handleMorphOne();
      break;
    case 'morphMany':
      handleMorphMany();
      break;
    case 'belongsToMorph':
      handleBelongsToMorph();
      break;
    case 'belongsToManyMorph':
      handleBelongsToManyMorph();
      break;
    default:
      break;
  }
};