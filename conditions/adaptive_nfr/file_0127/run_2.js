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

/** @param {string} nature - Relation nature */
const isOneToOneOrManyToOne = nature => {
  return nature === 'oneToOne' || nature === 'manyToOne';
};

/** @param {string} nature - Relation nature */
const isOneWayOrMorph = nature => {
  return nature === 'oneWay' || nature === 'oneToMorph';
};

/** @param {Object} FK - Foreign key association */
const isVirtualBelongsTo = (FK, nature) => {
  if (!FK) return false;
  return !(isOneToOneOrManyToOne(FK.nature) || isOneWayOrMorph(FK.nature));
};

/** @param {Object} FK - Foreign key association */
const isVirtualBelongsToMany = (FK, nature, isDominant) => {
  if (nature === 'manyWay') return false;
  if (!FK) return false;
  return _.isUndefined(FK.via) || isDominant !== true;
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

const addAuditAttributesIfNeeded = definition => {
  if (shouldSkipAuditAttributes(definition)) {
    return;
  }

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
    addPublishedAtAttribute(definition);
  }

  const isPrivate = !shouldPopulateCreatorFields(definition);
  addAuditAttributes(definition, isPrivate);
};

const filterAttributesByType = (attributes, predicate) => {
  return Object.keys(attributes).filter(key => predicate(attributes[key]));
};

const getComponentAttributes = attributes => {
  return filterAttributesByType(attributes, isComponentOrDynamicZone);
};

const getScalarAttributes = attributes => {
  return filterAttributesByType(attributes, isScalarAttribute);
};

const getRelationalAttributes = attributes => {
  return filterAttributesByType(attributes, isRelationalAttribute);
};

const addComponentAttributesToModel = (definition, componentAttributes) => {
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

const addScalarAttributesToModel = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
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

const addRelationalAttributesToModel = (definition, model, instance, relationalAttributes) => {
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

const createSchemaFromModel = (instance, definition) => {
  return new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );
};

const addVirtualKeysToSchema = (schema, definition) => {
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

const addPreHooksToSchema = (schema, findLifecycles, populateFn) => {
  findLifecycles.forEach(key => {
    schema.pre(key, populateFn);
  });
};

const configureSchemaTimestamps = (schema, definition, target, model) => {
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

const refToStrapiRef = obj => {
  const ref = obj.ref;
  let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

  if (typeof plainData !== 'object') return ref;

  return {
    __contentType: obj.kind,
    ...ref,
  };
};

const parseComponentRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return el.ref.toString();
  }
  return el.ref;
};

const parseDynamicZoneRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return { id: el.ref.toString() };
  }
  return el.ref;
};

const transformDecimalValues = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const transformMorphAssociations = (returned, morphAssociations) => {
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

const transformComponentAttributes = (returned, componentAttributes, definition) => {
  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];

    if (isComponentAttribute(attribute)) {
      transformComponentAttribute(returned, name, attribute);
    }

    if (isDynamicZoneAttribute(attribute)) {
      transformDynamicZoneAttribute(returned, name);
    }
  });
};

const transformComponentAttribute = (returned, name, attribute) => {
  if (!Array.isArray(returned[name])) {
    return;
  }

  const components = returned[name].map(parseComponentRef);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

const transformDynamicZoneAttribute = (returned, name) => {
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

    if (_.isArray(association.populate)) {
      applyPopulateFilter(returned, association);
    }
  });
};

const applyPopulateFilter = (returned, association) => {
  const { alias, populate } = association;
  const pickPopulate = entry => _.pick(entry, populate);

  returned[alias] = _.isArray(returned[alias])
    ? _.map(returned[alias], pickPopulate)
    : pickPopulate(returned[alias]);
};

const createTransformFunction = (morphAssociations, componentAttributes, definition, associations) => {
  return function(doc, returned) {
    transformDecimalValues(returned);
    transformMorphAssociations(returned, morphAssociations);
    transformComponentAttributes(returned, componentAttributes, definition);
    transformAssociations(returned, associations);
  };
};

const configureSchemaToJSON = (schema, morphAssociations, componentAttributes, definition, associations) => {
  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: createTransformFunction(morphAssociations, componentAttributes, definition, associations),
  };
};

const handleIndexesErrors = Model => {
  Model.on('index', error => {
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
  });
};

const syncModelIndexes = Model => {
  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, () => handleIndexesErrors(Model));
  } else {
    handleIndexesErrors(Model);
  }
};

const exposeOrmFunctions = (target, model, Model, definition) => {
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

    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
    addAuditAttributesIfNeeded(definition);

    const componentAttributes = getComponentAttributes(definition.attributes);
    const scalarAttributes = getScalarAttributes(definition.attributes);
    const relationalAttributes = getRelationalAttributes(definition.attributes);

    addComponentAttributesToModel(definition, componentAttributes);
    addScalarAttributesToModel(definition, scalarAttributes, instance, hasDraftAndPublish);
    addRelationalAttributesToModel(definition, model, instance, relationalAttributes);

    const schema = createSchemaFromModel(instance, definition);
    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    addPreHooksToSchema(schema, findLifecycles, populateFn);
    addVirtualKeysToSchema(schema, definition);

    target[model].allAttributes = _.clone(definition.attributes);
    configureSchemaTimestamps(schema, definition, target, model);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

    const associations = definition.associations.filter(isNonPolymorphicAssoc);
    configureSchemaToJSON(schema, morphAssociations, componentAttributes, definition, associations);

    const Model = instance.model(definition.globalId, schema, definition