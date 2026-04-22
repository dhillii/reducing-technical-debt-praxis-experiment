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
const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().includes('morph');

/**
 * Guard: skip non‑Strapi core models.
 * @param {Object} definition
 * @returns {boolean}
 */
const shouldAddDraftPublishFields = definition =>
  !definition.uid.startsWith('strapi::') && definition.modelType !== 'component';

/**
 * Guard: definition has draft‑and‑publish enabled.
 * @param {Object} definition
 * @returns {boolean}
 */
const hasDraftAndPublish = definition => contentTypesUtils.hasDraftAndPublish(definition);

/**
 * Guard: component attribute type.
 * @param {Object} attr
 * @returns {boolean}
 */
const isComponentOrDynamicZone = attr =>
  ['component', 'dynamiczone'].includes(attr.type);

/**
 * Guard: scalar attribute type.
 * @param {Object} attr
 * @returns {boolean}
 */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type && !['component', 'dynamiczone'].includes(type);
};

/**
 * Guard: relational attribute (no type defined).
 * @param {Object} attr
 * @returns {boolean}
 */
const isRelationalAttribute = attr => attr.type === undefined;

/**
 * Guard: association is not polymorphic.
 * @param {Object} assoc
 * @returns {boolean}
 */
const isNotPolymorphic = assoc => !isPolymorphicAssoc(assoc);

/**
 * Guard: association should be auto‑populated.
 * @param {Object} assoc
 * @returns {boolean}
 */
const shouldAutoPopulate = assoc => assoc.autoPopulate !== false;

/**
 * Guard: publication state requires a match query.
 * @param {Object} assocModel
 * @param {string} publicationState
 * @returns {boolean}
 */
const needsPublicationMatch = (assocModel, publicationState) => {
  const hasDP = contentTypesUtils.hasDraftAndPublish(assocModel);
  return hasDP && DP_PUB_STATES.includes(publicationState);
};

/**
 * Convert a reference to Strapi format.
 * @param {Object} obj
 * @returns {Object}
 */
const refToStrapiRef = obj => {
  const ref = obj.ref;
  const plain = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
  if (typeof plain !== 'object') return ref;
  return { __contentType: obj.kind, ...ref };
};

/**
 * Parse component reference.
 * @param {Object} el
 * @returns {string|Object}
 */
const parseComponentRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref;

/**
 * Parse dynamic zone reference.
 * @param {Object} el
 * @returns {Object}
 */
const parseDynamicZoneRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

/**
 * Build a relation field.
 * @param {Object} params
 */
const buildRelation = params => {
  const { definition, model, instance, attribute, name } = params;
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);
  const getRef = (n, p) => strapi.db.getModel(n, p).globalId;
  const setField = (n, v) => (definition.loadedModel[n] = v);
  const { ObjectId } = instance.Schema.Types;

  const handleHasOne = () => {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  };

  const handleHasMany = () => {
    const fk = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.collection, attribute.plugin);
    if (fk) {
      setField(name, { type: 'virtual', ref, via: fk.via, justOne: false });
      attribute.isVirtual = true;
    } else {
      setField(name, [{ type: ObjectId, ref }]);
    }
  };

  const handleBelongsTo = () => {
    const fk = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.model, attribute.plugin);
    const isVirtual =
      fk &&
      !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(fk.nature);
    if (isVirtual) {
      setField(name, { type: 'virtual', ref, via: fk.via, justOne: true });
      attribute.isVirtual = true;
    } else {
      setField(name, { type: ObjectId, ref });
    }
  };

  const handleBelongsToMany = () => {
    const ref = getRef(attribute.collection, attribute.plugin);
    if (nature === 'manyWay') {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }
    const fk = _.find(definition.associations, { alias: name });
    const needVirtual = (fk && _.isUndefined(fk.via)) || attribute.dominant !== true;
    if (needVirtual) {
      setField(name, { type: 'virtual', ref, via: fk.via });
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

  const handlers = {
    hasOne: handleHasOne,
    hasMany: handleHasMany,
    belongsTo: handleBelongsTo,
    belongsToMany: handleBelongsToMany,
    morphOne: handleMorphOne,
    morphMany: handleMorphMany,
    belongsToMorph: handleBelongsToMorph,
    belongsToManyMorph: handleBelongsToManyMorph,
  };

  const exec = handlers[verbose];
  if (exec) exec();
};

/**
 * Create populate function for fetch lifecycle.
 * @param {Object} opts
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
      if (needsPublicationMatch(assocModel, publicationState)) {
        return populateQueries.publicationState[publicationState];
      }
      return undefined;
    };

    if (_populateMorphRelations) {
      for (const association of morphAssociations) {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;
        const isMany = ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
        if (isMany) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
          continue;
        }
        if (!populatedPaths.includes(alias)) continue;
        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], { publicationState });
        if (matchQuery) _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
      }
    }

    if (_populateComponents) {
      for (const key of componentAttributes) {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      }
    }

    if (definition.modelType === 'component') {
      const nonPoly = definition.associations.filter(isNotPolymorphic);
      for (const assoc of nonPoly) {
        if (!shouldAutoPopulate(assoc)) continue;
        this.populate({
          path: assoc.alias,
          match: getMatchQuery(assoc),
          options: { publicationState, _populateComponents: false },
        });
      }
    }
  };
};

/**
 * Mount a single model.
 * @param {string} model
 */
function mountModel(model) {
  const definition = models[model];
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  const draftAndPublish = hasDraftAndPublish(definition);
  _.defaults(definition, { primaryKey: '_id', primaryKeyType: 'string' });

  if (shouldAddDraftPublishFields(definition)) {
    if (draftAndPublish) {
      definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
        type: 'datetime',
        configurable: false,
        writable: true,
        visible: false,
      };
    }

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

  const componentAttributes = Object.keys(definition.attributes).filter(
    key => isComponentOrDynamicZone(definition.attributes[key])
  );
  const scalarAttributes = Object.keys(definition.attributes).filter(
    key => isScalarAttribute(definition.attributes[key])
  );
  const relationalAttributes = Object.keys(definition.attributes).filter(
    key => isRelationalAttribute(definition.attributes[key])
  );

  // Component attributes
  for (const name of componentAttributes) {
    definition.loadedModel[name] = [
      {
        kind: String,
        ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
      },
    ];
  }

  // Scalar attributes
  for (const name of scalarAttributes) {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || draftAndPublish ? false : definition.required,
    };
  }

  // Relational attributes
  for (const name of relationalAttributes) {
    buildRelation({
      definition,
      model,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  }

  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  for (const key of findLifecycles) {
    schema.pre(key, populateFn);
  }

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

  target[model].allAttributes = _.clone(definition.attributes);

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

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  // Transform output
  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform(doc, returned) {
      // Decimal128 handling
      for (const key of Object.keys(returned)) {
        if (returned[key] instanceof mongoose.Types.Decimal128) {
          returned[key] = parseFloat(returned[key].toString());
        }
      }

      // Polymorphic associations
      for (const association of morphAssociations) {
        const arr = returned[association.alias];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        if (association.nature === 'oneMorphToOne') {
          returned[association.alias] = refToStrapiRef(arr[0]);
          continue;
        }
        if (['manyMorphToMany', 'manyMorphToOne'].includes(association.nature)) {
          returned[association.alias] = arr.map(refToStrapiRef);
        }
      }

      // Component & dynamic zone handling
      for (const name of componentAttributes) {
        const attribute = definition.attributes[name];
        const { type } = attribute;
        if (type === 'component' && Array.isArray(returned[name])) {
          const comps = returned[name].map(parseComponentRef);
          returned[name] = attribute.repeatable ? comps : _.first(comps) || null;
        }
        if (type === 'dynamiczone' && returned[name]) {
          returned[name] = returned[name]
            .filter(el => el && el.kind)
            .map(el => ({
              __component: findComponentByGlobalId(el.kind).uid,
              ...parseDynamicZoneRef(el),
            }));
        }
      }

      // Regular associations
      for (const association of definition.associations.filter(isNotPolymorphic)) {
        const relation = returned[association.alias];
        if (!relation) continue;
        returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;
        if (_.isArray(association.populate)) {
          const pick = entry => _.pick(entry, association.populate);
          returned[association.alias] = _.isArray(returned[association.alias])
            ? _.map(returned[association.alias], pick)
            : pick(returned[association.alias]);
        }
      }
    },
  };

  const Model = instance.model(definition.globalId, schema, definition.collectionName);

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

  target[model] = _.assign(Model, target[model]);
  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
}

// Exported async entry point
module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  // Mount all models
  for (const model of Object.keys(models)) {
    mountModel(model);
  }

  // Migrations & store definition
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

// No‑op migration to match migration API
const migrateSchema = () => {};
```