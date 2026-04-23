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

/**
 * Checks if an association is polymorphic.
 * @param {Object} assoc
 * @returns {boolean}
 */
const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().indexOf('morph') !== -1;

/**
 * Guard to determine if a definition should receive draft/publish fields.
 * @param {Object} definition
 * @returns {boolean}
 */
const shouldAddDraftPublishFields = definition =>
  !definition.uid.startsWith('strapi::') && definition.modelType !== 'component';

/**
 * Guard to determine if a definition has draft and publish enabled.
 * @param {Object} definition
 * @returns {boolean}
 */
const hasDraftAndPublish = definition => contentTypesUtils.hasDraftAndPublish(definition);

/**
 * Determines if an attribute is a component or dynamic zone.
 * @param {Object} attr
 * @returns {boolean}
 */
const isComponentOrDynamicZone = attr => ['component', 'dynamiczone'].includes(attr.type);

/**
 * Determines if an attribute is scalar (non‑relation, non‑component).
 * @param {Object} attr
 * @returns {boolean}
 */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/**
 * Determines if an attribute is relational (type undefined).
 * @param {Object} attr
 * @returns {boolean}
 */
const isRelationalAttribute = attr => attr.type === undefined;

/**
 * Convert a mongoose reference to Strapi reference format.
 * @param {Object} obj
 * @returns {Object|any}
 */
const refToStrapiRef = obj => {
  const ref = obj.ref;
  const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
  if (typeof plainData !== 'object') return ref;
  return { __contentType: obj.kind, ...ref };
};

/**
 * Parse component reference.
 * @param {Object} el
 * @returns {string|any}
 */
const parseComponentRef = el => (el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref);

/**
 * Parse dynamic zone reference.
 * @param {Object} el
 * @returns {Object}
 */
const parseDynamicZoneRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

/**
 * Build a relation field on the definition.
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

  const getRef = (name, plugin) => strapi.db.getModel(name, plugin).globalId;
  const setField = (fieldName, val) => {
    definition.loadedModel[fieldName] = val;
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
      } else {
        const FK = _.find(definition.associations, { alias: name });
        if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
          setField(name, { type: 'virtual', ref, via: FK.via });
          attribute.isVirtual = true;
        } else {
          setField(name, [{ type: ObjectId, ref }]);
        }
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
      break;
  }
};

/**
 * Create the populate function used on fetch.
 * @param {Object} params
 * @returns {Function}
 */
const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  /**
   * @this {mongoose.Document}
   */
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
        } else if (populatedPaths.includes(alias)) {
          _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
          _.set(this._mongooseOptions.populate, [alias, 'options'], { publicationState });
          if (matchQuery !== undefined) {
            _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
          }
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
 * Mount a single model definition onto the target.
 * @param {string} model
 * @param {Object} models
 * @param {Object} target
 * @param {Object} ctx
 */
const mountModel = (model, models, target, ctx) => {
  const { instance } = ctx;
  const definition = models[model];

  // Basic definition setup
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  // Default primary key
  _.defaults(definition, { primaryKey: '_id', primaryKeyType: 'string' });

  // Draft & publish fields
  if (shouldAddDraftPublishFields(definition) && hasDraftAndPublish(definition)) {
    definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
      type: 'datetime',
      configurable: false,
      writable: true,
      visible: false,
    };
  }

  // Creator fields
  if (shouldAddDraftPublishFields(definition)) {
    const isPrivate = !_.get(definition, 'options.populateCreatorFields', false);
    const creatorAttrs = {
      model: 'user',
      plugin: 'admin',
      configurable: false,
      writable: false,
      visible: false,
      private: isPrivate,
    };
    definition.attributes[CREATED_BY_ATTRIBUTE] = { ...creatorAttrs };
    definition.attributes[UPDATED_BY_ATTRIBUTE] = { ...creatorAttrs };
  }

  // Attribute categorisation
  const componentAttributes = Object.keys(definition.attributes).filter(
    key => isComponentOrDynamicZone(definition.attributes[key])
  );
  const scalarAttributes = Object.keys(definition.attributes).filter(
    key => isScalarAttribute(definition.attributes[key])
  );
  const relationalAttributes = Object.keys(definition.attributes).filter(
    key => isRelationalAttribute(definition.attributes[key])
  );

  // Component handling
  componentAttributes.forEach(name => {
    definition.loadedModel[name] = [
      {
        kind: String,
        ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
      },
    ];
  });

  // Scalar handling
  scalarAttributes.forEach(name => {
    const attr = definition.attributes[name];
    const required =
      definition.modelType === 'compo' || hasDraftAndPublish(definition) ? false : definition.required;
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required,
    };
  });

  // Relational handling
  relationalAttributes.forEach(name => {
    buildRelation({
      definition,
      model,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  });

  // Schema creation
  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  // Populate lifecycle hooks
  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const populateFn = createOnFetchPopulateFn({
    morphAssociations,
    componentAttributes,
    definition,
  });
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(key => {
    schema.pre(key, populateFn);
  });

  // Virtual fields
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

  // Timestamps handling
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

  // Minimize option
  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  // Transform output
  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform(doc, returned) {
      // Decimal128 conversion
      Object.keys(returned)
        .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach(key => {
          returned[key] = parseFloat(returned[key].toString());
        });

      // Polymorphic association handling
      morphAssociations.forEach(association => {
        const arr = returned[association.alias];
        if (Array.isArray(arr) && arr.length > 0) {
          switch (association.nature) {
            case 'oneMorphToOne':
              returned[association.alias] = refToStrapiRef(arr[0]);
              break;
            case 'manyMorphToMany':
            case 'manyMorphToOne':
              returned[association.alias] = arr.map(refToStrapiRef);
              break;
            default:
              break;
          }
        }
      });

      // Component & dynamic zone handling
      componentAttributes.forEach(name => {
        const attribute = definition.attributes[name];
        const { type } = attribute;
        if (type === 'component') {
          if (Array.isArray(returned[name])) {
            const comps = returned[name].map(parseComponentRef);
            returned[name] = attribute.repeatable ? comps : _.first(comps) || null;
          }
        }
        if (type === 'dynamiczone') {
          if (returned[name]) {
            returned[name] = returned[name]
              .filter(el => el && el.kind)
              .map(el => ({
                __component: findComponentByGlobalId(el.kind).uid,
                ...parseDynamicZoneRef(el),
              }));
          }
        }
      });

      // Regular associations handling
      const nonPolyAssociations = definition.associations.filter(
        assoc => !isPolymorphicAssoc(assoc)
      );
      nonPolyAssociations.forEach(association => {
        const relation = returned[association.alias];
        if (!relation) return;
        returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;
        if (_.isArray(association.populate)) {
          const pick = entry => _.pick(entry, association.populate);
          returned[association.alias] = _.isArray(returned[association.alias])
            ? _.map(returned[association.alias], pick)
            : pick(returned[association.alias]);
        }
      });
    },
  };

  // Model instantiation
  const Model = instance.model(definition.globalId, schema, definition.collectionName);

  // Index handling
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

  // Expose model
  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

/**
 * Main export – mounts all models and runs migrations.
 * @param {Object} param0
 * @param {Object} ctx
 */
module.exports = async ({ models, target }, ctx) => {
  // Mount each model
  Object.keys(models).forEach(model => mountModel(model, models, target, ctx));

  // Run migrations and store definitions
  for (const model of Object.keys(models)) {
    const definition = models[model];
    const modelInstance = target[model];
    const definitionDidChange = await didDefinitionChange(definition, ctx.instance);
    const previousDefinition = await getDefinitionFromStore(definition, ctx.instance);

    await strapi.db.migrations.run(migrateSchema, {
      definition,
      previousDefinition,
      model: modelInstance,
      ORM: ctx.instance,
    });

    if (definitionDidChange) {
      await storeDefinition(definition, ctx.instance);
    }
  }
};

// noop migration to match migration API
const migrateSchema = () => {};
```