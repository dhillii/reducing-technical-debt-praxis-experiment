```javascript
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

/** @param {Object} assoc - Association object */
const isPolymorphicAssoc = assoc => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

/** @param {string} uid - Model UID */
const isStrapiInternalModel = uid => uid.startsWith('strapi::');

/** @param {string} modelType - Model type */
const isComponentModel = modelType => modelType === 'component';

/** @param {Object} definition - Model definition */
const shouldSkipAuditAttributes = definition => {
  return isStrapiInternalModel(definition.uid) || isComponentModel(definition.modelType);
};

/** @param {Object} definition - Model definition */
const shouldPopulateCreatorFields = definition => {
  return _.get(definition, 'options.populateCreatorFields', false);
};

/** @param {Object} attr - Attribute object */
const isComponentOrDynamicZone = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

/** @param {Object} attr - Attribute object */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && !isComponentOrDynamicZone(attr);
};

/** @param {Object} attr - Attribute object */
const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

/** @param {Object} attr - Attribute object */
const isVirtualAttribute = attr => {
  return attr.type === 'virtual';
};

/** @param {Object} attr - Attribute object */
const isComponentAttribute = attr => {
  return attr.type === 'component';
};

/** @param {Object} attr - Attribute object */
const isDynamicZoneAttribute = attr => {
  return attr.type === 'dynamiczone';
};

/** @param {Object} association - Association object */
const isNonPolymorphicAssoc = association => {
  return !isPolymorphicAssoc(association);
};

/** @param {Object} association - Association object */
const isMorphToOneOrMany = nature => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
};

/** @param {Object} association - Association object */
const shouldAutoPopulate = assoc => {
  return assoc.autoPopulate !== false;
};

/** @param {Object} fk - Foreign key association */
const isVirtualForeignKey = (fk, nature) => {
  if (!fk) return false;
  const nonVirtualNatures = ['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'];
  return !nonVirtualNatures.includes(nature);
};

/** @param {Object} fk - Foreign key association */
const isManyWayRelation = nature => {
  return nature === 'manyWay';
};

/** @param {Object} fk - Foreign key association */
const shouldBeDominantField = (fk, isDominant) => {
  return fk && !_.isUndefined(fk.via) && isDominant === true;
};

const addAuditAttributes = (definition, isPrivate) => {
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

const addPublishedAtAttribute = definition => {
  definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
    type: 'datetime',
    configurable: false,
    writable: true,
    visible: false,
  };
};

const initializeDefinition = definition => {
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

const setupAuditAttributes = definition => {
  if (shouldSkipAuditAttributes(definition)) {
    return;
  }

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
    addPublishedAtAttribute(definition);
  }

  const isPrivate = !shouldPopulateCreatorFields(definition);
  addAuditAttributes(definition, isPrivate);
};

const getAttributesByType = definition => {
  const componentAttributes = [];
  const scalarAttributes = [];
  const relationalAttributes = [];

  Object.keys(definition.attributes).forEach(key => {
    const attr = definition.attributes[key];
    if (isComponentOrDynamicZone(attr)) {
      componentAttributes.push(key);
    } else if (isScalarAttribute(attr)) {
      scalarAttributes.push(key);
    } else if (isRelationalAttribute(attr)) {
      relationalAttributes.push(key);
    }
  });

  return { componentAttributes, scalarAttributes, relationalAttributes };
};

const setupComponentAttributes = (definition, componentAttributes) => {
  if (componentAttributes.length === 0) {
    return;
  }

  componentAttributes.forEach(name => {
    definition.loadedModel[name] = [
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

const setupScalarAttributes = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

const setupRelationalAttributes = (definition, model, instance, relationalAttributes) => {
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

const setupSchemaVirtuals = (schema, definition) => {
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

const setupSchemaTimestamps = (schema, definition, target, model) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (!_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', false);
    return;
  }

  _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

  _.assign(target[model].allAttributes, {
    [createAtCol]: { type: 'timestamp' },
    [updatedAtCol]: { type: 'timestamp' },
  });

  schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
};

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

const createParseComponentRef = () => {
  return el => {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return el.ref.toString();
    }
    return el.ref;
  };
};

const createParseDynamicZoneRef = () => {
  return el => {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return { id: el.ref.toString() };
    }
    return el.ref;
  };
};

const transformDecimalValues = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const transformMorphAssociations = (returned, morphAssociations, refToStrapiRef) => {
  morphAssociations.forEach(association => {
    if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
      return;
    }

    const { nature, alias } = association;

    if (nature === 'oneMorphToOne') {
      returned[alias] = refToStrapiRef(returned[alias][0]);
    } else if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
      returned[alias] = returned[alias].map(obj => refToStrapiRef(obj));
    }
  });
};

const transformComponentAttributes = (returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef) => {
  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (isComponentAttribute(attribute)) {
      transformComponentField(returned, name, attribute, parseComponentRef);
    }

    if (isDynamicZoneAttribute(attribute)) {
      transformDynamicZoneField(returned, name, parseDynamicZoneRef);
    }
  });
};

const transformComponentField = (returned, name, attribute, parseComponentRef) => {
  if (!Array.isArray(returned[name])) {
    return;
  }

  const components = returned[name].map(parseComponentRef);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

const transformDynamicZoneField = (returned, name, parseDynamicZoneRef) => {
  if (!returned[name]) {
    return;
  }

  returned[name] = returned[name]
    .filter(el => el && el.kind)
    .map(el => {
      return {
        __component: findComponentByGlobalId(el.kind).uid,
        ...parseDynamicZoneRef(el),
      };
    });
};

const transformAssociations = (returned, associations) => {
  associations.forEach(association => {
    const relation = returned[association.alias];

    if (!relation) {
      return;
    }

    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (!_.isArray(association.populate)) {
      return;
    }

    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  });
};

const createSchemaTransform = (morphAssociations, componentAttributes, definition, associations) => {
  const refToStrapiRef = createRefToStrapiRef();
  const parseComponentRef = createParseComponentRef();
  const parseDynamicZoneRef = createParseDynamicZoneRef();

  return function(doc, returned) {
    transformDecimalValues(returned);
    transformMorphAssociations(returned, morphAssociations, refToStrapiRef);
    transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef, parseDynamicZoneRef);
    transformAssociations(returned, associations);
  };
};

const setupSchemaToJSON = (schema, morphAssociations, componentAttributes, definition, associations) => {
  const transform = createSchemaTransform(morphAssociations, componentAttributes, definition, associations);

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform,
  };
};

const handleIndexError = error => {
  if (!error) {
    return;
  }

  if (error.code === 11000) {
    strapi.log.error(
      `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
    );
  } else {
    strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
  }
};

const setupModelIndexes = Model => {
  const handleIndexesErrors = () => {
    Model.on('index', handleIndexError);
  };

  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

const exposeModelFunctions = (target, model, Model, definition) => {
  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

const mountModel = (models, target, instance) => {
  return model => {
    const definition = models[model];

    initializeDefinition(definition);
    setupAuditAttributes(definition);

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
    const { componentAttributes, scalarAttributes, relationalAttributes } = getAttributesByType(definition);

    setupComponentAttributes(definition, componentAttributes);
    setupScalarAttributes(definition, scalarAttributes, instance, hasDraftAndPublish);
    setupRelationalAttributes(definition, model, instance, relationalAttributes);

    const schema = new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );

    setupSchemaVirtuals(schema, definition);

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const associations = definition.associations.filter(isNonPolymorphicAssoc);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });

    target[model].allAttributes = _.clone(definition.attributes);

    setupSchemaTimestamps(schema, definition, target, model);
    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    setupSchemaToJSON(schema, morphAssociations, componentAttributes, definition, associations);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    setupModelIndexes(Model);
    exposeModelFunctions(target