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

const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().indexOf('morph') !== -1;

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  const mountModel = (modelName, definition) => {
    prepareDefinition(definition);
    handleDraftAndPublish(definition);
    handleCreatorFields(definition);
    const componentAttrs = getComponentAttributes(definition);
    const scalarAttrs = getScalarAttributes(definition);
    const relationalAttrs = getRelationalAttributes(definition);

    handleComponentAttributes(definition, componentAttrs);
    handleScalarAttributes(definition, scalarAttrs);
    handleRelationalAttributes(definition, relationalAttrs, modelName, instance);

    const schema = createSchema(definition, instance);
    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const populateFn = createOnFetchPopulateFn({
      morphAssociations,
      componentAttributes: componentAttrs,
      definition,
    });

    applyPreHooks(schema, populateFn);
    applyVirtuals(schema, definition);
    applyTimestamps(schema, definition);
    applyToObjectTransform(schema, definition, componentAttrs, morphAssociations, instance);

    const Model = instance.model(definition.globalId, schema, definition.collectionName);
    handleIndexes(Model);

    exposeORM(target, modelName, Model, definition);
  };

  Object.keys(models).forEach(mountModel);

  for (const modelName of Object.keys(models)) {
    const definition = models[modelName];
    const modelInstance = target[modelName];
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

const prepareDefinition = definition => {
  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

const handleDraftAndPublish = definition => {
  if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
    if (contentTypesUtils.hasDraftAndPublish(definition)) {
      definition.attributes[PUBLISHED_AT_ATTRIBUTE] = {
        type: 'datetime',
        configurable: false,
        writable: true,
        visible: false,
      };
    }
  }
};

const handleCreatorFields = definition => {
  if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
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
};

const getComponentAttributes = definition =>
  Object.keys(definition.attributes).filter(key =>
    ['component', 'dynamiczone'].includes(definition.attributes[key].type)
  );

const getScalarAttributes = definition =>
  Object.keys(definition.attributes).filter(key => {
    const { type } = definition.attributes[key];
    return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
  });

const getRelationalAttributes = definition =>
  Object.keys(definition.attributes).filter(key => {
    const { type } = definition.attributes[key];
    return type === undefined;
  });

const handleComponentAttributes = (definition, componentAttrs) => {
  componentAttrs.forEach(name => {
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

const handleScalarAttributes = (definition, scalarAttrs) => {
  scalarAttrs.forEach(name => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'compo' || contentTypesUtils.hasDraftAndPublish(definition)
          ? false
          : definition.required,
    };
  });
};

const handleRelationalAttributes = (definition, relationalAttrs, modelName, instance) => {
  relationalAttrs.forEach(name => {
    buildRelation({
      definition,
      model: modelName,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  });
};

const createSchema = (definition, instance) =>
  new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

const applyPreHooks = (schema, populateFn) => {
  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
  findLifecycles.forEach(key => schema.pre(key, populateFn));
};

const applyVirtuals = (schema, definition) => {
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

const applyTimestamps = (schema, definition) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

    _.assign(definition.allAttributes, {
      [createAtCol]: { type: 'timestamp' },
      [updatedAtCol]: { type: 'timestamp' },
    });

    schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);
};

const applyToObjectTransform = (schema, definition, componentAttrs, morphAssociations, instance) => {
  const refToStrapiRef = obj => {
    const ref = obj.ref;
    let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
    if (typeof plainData !== 'object') return ref;
    return { __contentType: obj.kind, ...ref };
  };

  const parseComponentRef = el => (el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref);
  const parseDynamicZoneRef = el =>
    el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref;

  const associations = definition.associations.filter(
    association => !isPolymorphicAssoc(association)
  );

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function(doc, returned) {
      Object.keys(returned)
        .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach(key => {
          returned[key] = parseFloat(returned[key].toString());
        });

      morphAssociations.forEach(association => {
        if (Array.isArray(returned[association.alias]) && returned[association.alias].length > 0) {
          switch (association.nature) {
            case 'oneMorphToOne':
              returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
              break;
            case 'manyMorphToMany':
            case 'manyMorphToOne':
              returned[association.alias] = returned[association.alias].map(obj =>
                refToStrapiRef(obj)
              );
              break;
            default:
          }
        }
      });

      componentAttrs.forEach(name => {
        const attribute = definition.attributes[name];
        const { type } = attribute;

        if (type === 'component') {
          if (Array.isArray(returned[name])) {
            const components = returned[name].map(parseComponentRef);
            returned[name] =
              attribute.repeatable === true ? components : _.first(components) || null;
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

      associations.forEach(association => {
        const relation = returned[association.alias];
        if (relation) {
          returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;
          if (_.isArray(association.populate)) {
            const { alias, populate } = association;
            const pickPopulate = entry => _.pick(entry, populate);
            returned[alias] = _.isArray(returned[alias])
              ? _.map(returned[alias], pickPopulate)
              : pickPopulate(returned[alias]);
          }
        }
      });
    },
  };
};

const handleIndexes = Model => {
  const handleIndexesErrors = () => {
    Model.on('index', error => {
      if (error) {
        if (error.code === 11000) {
          strapi.log.error(
            `Unique constraint fails, make sure to update your data and restart to apply the unique constraint.\n\t- ${error.message}`
          );
        } else {
          strapi.log.error(`An index error happened, it wasn't applied.\n\t- ${error.message}`);
        }
      }
    });
  };

  if (strapi.app.env !== 'production') {
    Model.syncIndexes(null, handleIndexesErrors);
  } else {
    handleIndexesErrors();
  }
};

const exposeORM = (target, modelName, Model, definition) => {
  target[modelName] = _.assign(Model, target[modelName]);

  target[modelName]._attributes = definition.attributes;
  target[modelName].updateRelations = relations.update;
  target[modelName].deleteRelations = relations.deleteRelations;
  target[modelName].privateAttributes = contentTypesUtils.getPrivateAttributes(target[modelName]);
};

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

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (name, plugin) => strapi.db.getModel(name, plugin).globalId;
  const setField = (name, val) => (definition.loadedModel[name] = val);
  const { ObjectId } = instance.Schema.Types;

  switch (verbose) {
    case 'hasOne':
      setField(name, { type: ObjectId, ref: getRef(attribute.model, attribute.plugin) });
      break;
    case 'hasMany':
      handleHasMany(definition, name, attribute, setField, ObjectId);
      break;
    case 'belongsTo':
      handleBelongsTo(definition, name, attribute, setField, ObjectId);
      break;
    case 'belongsToMany':
      handleBelongsToMany(definition, name, attribute, setField, ObjectId);
      break;
    case 'morphOne':
      setField(name, { type: ObjectId, ref: getRef(attribute.model, attribute.plugin) });
      break;
    case 'morphMany':
      setField(name, [{ type: ObjectId, ref: getRef(attribute.collection, attribute.plugin) }]);
      break;
    case 'belongsToMorph':
      setField(name, {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      });
      break;
    case 'belongsToManyMorph':
      setField(name, [
        {
          kind: String,
          [attribute.filter]: String,
          ref: { type: ObjectId, refPath: `${name}.kind` },
        },
      ]);
      break;
    default:
      break;
  }
};

const handleHasMany = (definition, name, attribute, setField, ObjectId) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = strapi.db.getModel(attribute.collection, attribute.plugin).globalId;

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

const handleBelongsTo = (definition, name, attribute, setField, ObjectId) => {
  const FK = _.find(definition.associations, { alias: name });
  const ref = strapi.db.getModel(attribute.model, attribute.plugin).globalId;

  if (
    FK &&
    FK.nature !== 'oneToOne' &&
    FK.nature !== 'manyToOne' &&
    FK.nature !== 'oneWay' &&
    FK.nature !== 'oneToMorph'
  ) {
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

const handleBelongsToMany = (definition, name, attribute, setField, ObjectId) => {
  const ref = strapi.db.getModel(attribute.collection, attribute.plugin).globalId;

  if (attribute.nature === 'manyWay') {
    setField(name, [{ type: ObjectId, ref }]);
  } else {
    const FK = _.find(definition.associations, { alias: name });

    if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
      });
      attribute.isVirtual = true;
    } else {
      setField(name, [{ type: ObjectId, ref }]);
    }
  }
};