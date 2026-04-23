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
 * Determines if a definition should receive draft/publish fields.
 * @param {Object} definition
 * @returns {boolean}
 */
const shouldAddDraftPublishFields = definition =>
  !definition.uid.startsWith('strapi::') && definition.modelType !== 'component';

/**
 * Returns true if the attribute is a component or dynamic zone.
 * @param {Object} attr
 * @returns {boolean}
 */
const isComponentOrDynamicZone = attr => ['component', 'dynamiczone'].includes(attr.type);

/**
 * Returns true if the attribute is a scalar (non-relation, non-component).
 * @param {Object} attr
 * @returns {boolean}
 */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/**
 * Returns true if the attribute is relational (type undefined).
 * @param {Object} attr
 * @returns {boolean}
 */
const isRelationalAttribute = attr => attr.type === undefined;

/**
 * Guard clause to exit early if definition lacks component attributes.
 * @param {Array<string>} componentAttributes
 * @returns {boolean}
 */
const hasComponentAttributes = componentAttributes => componentAttributes.length > 0;

/**
 * Guard clause to exit early if definition lacks scalar attributes.
 * @param {Array<string>} scalarAttributes
 * @returns {boolean}
 */
const hasScalarAttributes = scalarAttributes => scalarAttributes.length > 0;

/**
 * Guard clause to exit early if definition lacks relational attributes.
 * @param {Array<string>} relationalAttributes
 * @returns {boolean}
 */
const hasRelationalAttributes = relationalAttributes => relationalAttributes.length > 0;

/**
 * Parses a reference from a component element.
 * @param {Object} el
 * @returns {string|Object}
 */
const parseComponentRef = el => (el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref);

/**
 * Parses a reference from a dynamic zone element.
 * @param {Object} el
 * @returns {Object}
 */
const parseDynamicZoneRef = el =>
  el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

/**
 * Converts a mongoose reference to Strapi format.
 * @param {Object} obj
 * @returns {Object}
 */
const refToStrapiRef = obj => {
  const ref = obj.ref;
  const plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
  if (typeof plainData !== 'object') return ref;
  return { __contentType: obj.kind, ...ref };
};

/**
 * Handles transformation of returned documents.
 * @param {Object} definition
 * @param {Array<string>} componentAttributes
 * @param {Array<Object>} morphAssociations
 * @param {Array<Object>} associations
 * @returns {Function}
 */
const createTransformFunction = (definition, componentAttributes, morphAssociations, associations) => {
  return function (doc, returned) {
    // Remove Decimal128 nested property.
    Object.keys(returned)
      .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
      .forEach(key => {
        returned[key] = parseFloat(returned[key].toString());
      });

    // Process polymorphic associations.
    morphAssociations.forEach(association => {
      const aliasData = returned[association.alias];
      if (!Array.isArray(aliasData) || aliasData.length === 0) return;

      switch (association.nature) {
        case 'oneMorphToOne':
          returned[association.alias] = refToStrapiRef(aliasData[0]);
          break;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          returned[association.alias] = aliasData.map(refToStrapiRef);
          break;
        default:
      }
    });

    // Process component and dynamic zone attributes.
    componentAttributes.forEach(name => {
      const attribute = definition.attributes[name];
      const { type } = attribute;

      if (type === 'component') {
        if (Array.isArray(returned[name])) {
          const components = returned[name].map(parseComponentRef);
          returned[name] = attribute.repeatable ? components : _.first(components) || null;
        }
        return;
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

    // Process regular associations.
    associations.forEach(association => {
      const relation = returned[association.alias];
      if (!relation) return;

      returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

      if (_.isArray(association.populate)) {
        const { alias, populate } = association;
        const pickPopulate = entry => _.pick(entry, populate);
        returned[alias] = _.isArray(returned[alias])
          ? _.map(returned[alias], pickPopulate)
          : pickPopulate(returned[alias]);
      }
    });
  };
};

/**
 * Creates the populate function used on fetch.
 * @param {Object} params
 * @returns {Function}
 */
const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function () {
    const populatedPaths = this.getPopulatedPaths();
    const { publicationState, _populateComponents = true, _populateMorphRelations = true } = this.getOptions();

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
 * Builds a relation based on attribute nature.
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

  const getRef = (targetName, plugin) => strapi.db.getModel(targetName, plugin).globalId;
  const setField = (fieldName, val) => {
    definition.loadedModel[fieldName] = val;
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
      setField(name, { type: 'virtual', ref, via: FK.via, justOne: false });
      attribute.isVirtual = true;
    } else {
      setField(name, [{ type: ObjectId, ref }]);
    }
  };

  const handleBelongsTo = () => {
    const FK = _.find(definition.associations, { alias: name });
    const ref = getRef(attribute.model, attribute.plugin);
    const isInvalidFK =
      FK &&
      FK.nature !== 'oneToOne' &&
      FK.nature !== 'manyToOne' &&
      FK.nature !== 'oneWay' &&
      FK.nature !== 'oneToMorph';
    if (isInvalidFK) {
      setField(name, { type: 'virtual', ref, via: FK.via, justOne: true });
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
    const FK = _.find(definition.associations, { alias: name });
    const shouldBeVirtual = (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;
    if (shouldBeVirtual) {
      setField(name, { type: 'virtual', ref, via: FK.via });
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

  const handler = handlers[verbose];
  if (handler) handler();
};

/**
 * Mounts a single model into the target.
 * @param {string} model
 */
const mountModel = model => {
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

  if (shouldAddDraftPublishFields(definition)) {
    if (hasDraftAndPublish) {
      definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
        type: 'datetime',
        configurable: false,
        writable: true,
        visible: false,
      };
    }

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

  if (hasComponentAttributes(componentAttributes)) {
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
  }

  if (hasScalarAttributes(scalarAttributes)) {
    scalarAttributes.forEach(name => {
      const attr = definition.attributes[name];
      definition.loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
      };
    });
  }

  if (hasRelationalAttributes(relationalAttributes)) {
    relationalAttributes.forEach(name => {
      buildRelation({
        definition,
        model,
        instance,
        name,
        attribute: definition.attributes[name],
      });
    });
  }

  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const populateFn = createOnFetchPopulateFn({
    componentAttributes,
    morphAssociations,
    definition,
  });

  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(key => {
    schema.pre(key, populateFn);
  });

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

  const associations = definition.associations.filter(assoc => !isPolymorphicAssoc(assoc));

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: createTransformFunction(definition, componentAttributes, morphAssociations, associations),
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
};

/**
 * Main exported function.
 */
module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

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

// noop migration to match migration API
const migrateSchema = () => {};