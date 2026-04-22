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

/* Predicate helpers ------------------------------------------------------- */

/**
 * Checks if an association is polymorphic.
 * @param {Object} assoc
 * @returns {boolean}
 */
const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().includes('morph');

/**
 * Determines if a definition should receive creator fields.
 * @param {Object} def
 * @returns {boolean}
 */
const shouldAddCreatorFields = def =>
  !def.uid.startsWith('strapi::') && def.modelType !== 'component';

/**
 * Determines if creator fields should be private.
 * @param {Object} def
 * @returns {boolean}
 */
const isPrivateCreatorFields = def => !_.get(def, 'options.populateCreatorFields', false);

/**
 * Checks if an attribute is a component or dynamic zone.
 * @param {Object} attr
 * @returns {boolean}
 */
const isComponentOrDynamicZone = attr =>
  ['component', 'dynamiczone'].includes(attr.type);

/**
 * Checks if an attribute is scalar.
 * @param {Object} attr
 * @returns {boolean}
 */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/**
 * Checks if an attribute is relational.
 * @param {Object} attr
 * @returns {boolean}
 */
const isRelationalAttribute = attr => attr.type === undefined;

/* Core helpers ----------------------------------------------------------- */

/**
 * Initializes a model definition.
 * @param {Object} definition
 */
const initDefinition = definition => {
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};
};

/**
 * Sets default primary key values.
 * @param {Object} definition
 */
const setDefaultValues = definition => {
  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

/**
 * Adds draft/publish and creator fields.
 * @param {Object} definition
 * @param {boolean} hasDraftAndPublish
 */
const addCreatorFields = (definition, hasDraftAndPublish) => {
  if (hasDraftAndPublish) {
    definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
      type: 'datetime',
      configurable: false,
      writable: true,
      visible: false,
    };
  }

  const privateFlag = isPrivateCreatorFields(definition);

  const creatorField = (attr, model) => ({
    model: 'user',
    plugin: 'admin',
    configurable: false,
    writable: false,
    visible: false,
    private: privateFlag,
  });

  definition.attributes[CREATED_BY_ATTRIBUTE] = creatorField('createdBy', 'user');
  definition.attributes[UPDATED_BY_ATTRIBUTE] = creatorField('updatedBy', 'user');
};

/**
 * Retrieves component/dynamic zone attribute names.
 * @param {Object} definition
 * @returns {string[]}
 */
const getComponentAttributes = definition =>
  Object.keys(definition.attributes).filter(key =>
    isComponentOrDynamicZone(definition.attributes[key])
  );

/**
 * Retrieves scalar attribute names.
 * @param {Object} definition
 * @returns {string[]}
 */
const getScalarAttributes = definition =>
  Object.keys(definition.attributes).filter(key =>
    isScalarAttribute(definition.attributes[key])
  );

/**
 * Retrieves relational attribute names.
 * @param {Object} definition
 * @returns {string[]}
 */
const getRelationalAttributes = definition =>
  Object.keys(definition.attributes).filter(key =>
    isRelationalAttribute(definition.attributes[key])
  );

/**
 * Handles component attribute schema.
 * @param {Object} definition
 * @param {string[]} componentAttributes
 */
const handleComponentAttributes = (definition, componentAttributes) => {
  if (componentAttributes.length === 0) return;

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

/**
 * Handles scalar attribute schema.
 * @param {Object} definition
 * @param {string[]} scalarAttributes
 * @param {boolean} hasDraftAndPublish
 */
const handleScalarAttributes = (definition, scalarAttributes, hasDraftAndPublish) => {
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

/**
 * Handles relational attribute schema.
 * @param {Object} definition
 * @param {string[]} relationalAttributes
 * @param {string} model
 * @param {Object} instance
 */
const handleRelationalAttributes = (definition, relationalAttributes, model, instance) => {
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

/**
 * Creates a Mongoose schema from a definition.
 * @param {Object} instance
 * @param {Object} definition
 * @returns {mongoose.Schema}
 */
const createSchema = (instance, definition) => {
  return new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );
};

/**
 * Adds lifecycle hooks for population.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 * @param {string[]} componentAttributes
 */
const setupLifecycleHooks = (schema, definition, componentAttributes) => {
  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(key => {
    schema.pre(key, populateFn);
  });
};

/**
 * Adds virtual fields to the schema.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 */
const addVirtuals = (schema, definition) => {
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

/**
 * Configures timestamps on the target model.
 * @param {Object} target
 * @param {string} model
 * @param {Object} definition
 * @param {mongoose.Schema} schema
 */
const setTimestamps = (target, model, definition, schema) => {
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

/**
 * Sets up the toObject/toJSON transform for the schema.
 * @param {mongoose.Schema} schema
 * @param {Object} definition
 * @param {string[]} componentAttributes
 * @param {Object[]} morphAssociations
 */
const setupTransform = (schema, definition, componentAttributes, morphAssociations) => {
  const associations = definition.associations.filter(assoc => !isPolymorphicAssoc(assoc));

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: (doc, returned) => {
      transformDecimalFields(returned);
      transformMorphAssociations(returned, morphAssociations);
      transformComponentAttributes(returned, definition, componentAttributes);
      transformAssociations(returned, associations);
    },
  };
};

/**
 * Parses Decimal128 fields.
 * @param {Object} returned
 */
const transformDecimalFields = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

/**
 * Transforms polymorphic association data.
 * @param {Object} returned
 * @param {Object[]} morphAssociations
 */
const transformMorphAssociations = (returned, morphAssociations) => {
  const refToStrapiRef = obj => {
    const ref = obj.ref;
    const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
    if (typeof plainData !== 'object') return ref;
    return { __contentType: obj.kind, ...ref };
  };

  morphAssociations.forEach(association => {
    const data = returned[association.alias];
    if (!Array.isArray(data) || data.length === 0) return;

    switch (association.nature) {
      case 'oneMorphToOne':
        returned[association.alias] = refToStrapiRef(data[0]);
        break;
      case 'manyMorphToMany':
      case 'manyMorphToOne':
        returned[association.alias] = data.map(refToStrapiRef);
        break;
      default:
    }
  });
};

/**
 * Transforms component and dynamic zone attributes.
 * @param {Object} returned
 * @param {Object} definition
 * @param {string[]} componentAttributes
 */
const transformComponentAttributes = (returned, definition, componentAttributes) => {
  const parseComponentRef = el => (el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref);
  const parseDynamicZoneRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (type === 'component' && Array.isArray(returned[name])) {
      const components = returned[name].map(parseComponentRef);
      returned[name] = attribute.repeatable ? components : _.first(components) || null;
    }

    if (type === 'dynamiczone' && returned[name]) {
      returned[name] = returned[name]
        .filter(el => el && el.kind)
        .map(el => ({
          __component: findComponentByGlobalId(el.kind).uid,
          ...parseDynamicZoneRef(el),
        }));
    }
  });
};

/**
 * Transforms regular associations.
 * @param {Object} returned
 * @param {Object[]} associations
 */
const transformAssociations = (returned, associations) => {
  associations.forEach(association => {
    const relation = returned[association.alias];
    if (!relation) return;

    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (_.isArray(association.populate)) {
      const { alias, populate } = association;
      const pick = entry => _.pick(entry, populate);
      returned[alias] = _.isArray(returned[alias])
        ? _.map(returned[alias], pick)
        : pick(returned[alias]);
    }
  });
};

/**
 * Synchronizes indexes based on environment.
 * @param {mongoose.Model} Model
 */
const syncIndexes = Model => {
  const handleIndexesErrors = () => {
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

  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

/**
 * Finalizes the model on the target object.
 * @param {Object} target
 * @param {string} model
 * @param {Object} definition
 */
const finalizeModel = (target, model, definition) => {
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

/* Main export ------------------------------------------------------------ */

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  const mountModel = model => {
    const definition = models[model];
    initDefinition(definition);
    const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
    setDefaultValues(definition);

    if (shouldAddCreatorFields(definition)) {
      addCreatorFields(definition, hasDraftAndPublish);
    }

    const componentAttributes = getComponentAttributes(definition);
    const scalarAttributes = getScalarAttributes(definition);
    const relationalAttributes = getRelationalAttributes(definition);

    handleComponentAttributes(definition, componentAttributes);
    handleScalarAttributes(definition, scalarAttributes, hasDraftAndPublish);
    handleRelationalAttributes(definition, relationalAttributes, model, instance);

    const schema = createSchema(instance, definition);
    setupLifecycleHooks(schema, definition, componentAttributes);
    addVirtuals(schema, definition);
    setTimestamps(target, model, definition, schema);
    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    setupTransform(schema, definition, componentAttributes, morphAssociations);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);
    syncIndexes(Model);
    target[model] = _.assign(Model, target[model]);
    finalizeModel(target, model, definition);
  };

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

/* No-op migration -------------------------------------------------------- */
const migrateSchema = () => {};

/**
 * Creates a populate function for fetch operations.
 * @param {Object} params
 * @returns {Function}
 */
const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function () {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    const getMatchQuery = assoc => {
      const assocModel = strapi.db.getModelByAssoc(assoc);
      const hasDP = contentTypesUtils.hasDraftAndPublish(assocModel);
      if (hasDP && DP_PUB_STATES.includes(publicationState)) {
        return populateQueries.publicationState[publicationState];
      }
      return undefined;
    };

    if (_populateMorphRelations) {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;

        if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
          return;
        }

        if (!populatedPaths.includes(alias)) return;

        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], { publicationState });
        if (matchQuery !== undefined) {
          _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
        }
      });
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
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
    }
  };
};

/**
 * Builds relation fields for a model definition.
 * @param {Object} params
 */
const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);
  const getRef = (n, p) => strapi.db.getModel(n, p).globalId;
  const setField = (n, val) => {
    definition.loadedModel[n] = val;
  };
  const { ObjectId } = instance.Schema.Types;

  switch (verbose) {
    case 'hasOne': {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(name, { type: ObjectId, ref });
      break;
    }
    case 'hasMany': {
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.collection, attribute.plugin);
      if (FK) {
        setField(name, { type: 'virtual', ref, via: FK.via, justOne: false });
        attribute.isVirtual = true;
      } else {
        setField(name, [{ type: ObjectId, ref }]);
      }
      break;
    }
    case 'belongsTo': {
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.model, attribute.plugin);
      if (
        FK &&
        FK.nature !== 'oneToOne' &&
        FK.nature !== 'manyToOne' &&
        FK.nature !== 'oneWay' &&
        FK.nature !== 'oneToMorph'
      ) {
        setField(name, { type: 'virtual', ref, via: FK.via, justOne: true });
        attribute.isVirtual = true;
      } else {
        setField(name, { type: ObjectId, ref });
      }
      break;
    }
    case 'belongsToMany': {
      const ref = getRef(attribute.collection, attribute.plugin);
      if (nature === 'manyWay') {
        setField(name, [{ type: ObjectId, ref }]);
        break;
      }
      const FK = _.find(definition.associations, { alias: name });
      if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
        setField(name, { type: 'virtual', ref, via: FK.via });
        attribute.isVirtual = true;
      } else {
        setField(name, [{ type: ObjectId, ref }]);
      }
      break;
    }
    case 'morphOne': {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(name, { type: ObjectId, ref });
      break;
    }
    case 'morphMany': {
      const ref = getRef(attribute.collection, attribute.plugin);
      setField(name, [{ type: ObjectId, ref }]);
      break;
    }
    case 'belongsToMorph': {
      setField(name, {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      });
      break;
    }
    case 'belongsToManyMorph': {
      setField(name, [
        {
          kind: String,
          [attribute.filter]: String,
          ref: { type: ObjectId, refPath: `${name}.kind` },
        },
      ]);
      break;
    }
    default:
  }
};
```