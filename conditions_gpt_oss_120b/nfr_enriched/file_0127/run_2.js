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

/* ---------- Helper Functions ---------- */

const isPolymorphicAssoc = assoc => assoc.nature.toLowerCase().indexOf('morph') !== -1;

/**
 * Set default primary key values.
 */
const setPrimaryKeyDefaults = definition => {
  _.defaults(definition, {
    primaryKey: '_id',
    primaryKeyType: 'string',
  });
};

/**
 * Add draft/publish and creator fields for non‑core models.
 */
const addCoreFields = definition => {
  if (definition.uid.startsWith('strapi::') || definition.modelType === 'component') {
    return;
  }

  if (contentTypesUtils.hasDraftAndPublish(definition)) {
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
};

/**
 * Split attribute keys by type.
 */
const splitAttributes = definition => {
  const keys = Object.keys(definition.attributes);
  const component = keys.filter(k => ['component', 'dynamiczone'].includes(definition.attributes[k].type));
  const scalar = keys.filter(k => {
    const t = definition.attributes[k].type;
    return t && t !== 'component' && t !== 'dynamiczone';
  });
  const relational = keys.filter(k => definition.attributes[k].type === undefined);
  return { component, scalar, relational };
};

/**
 * Process component attributes – create join collections.
 */
const processComponentAttributes = (definition, componentAttrs) => {
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

/**
 * Process scalar attributes – convert types and set required flag.
 */
const processScalarAttributes = (definition, scalarAttrs, instance, hasDraftAndPublish) => {
  scalarAttrs.forEach(name => {
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
 * Process relational attributes – delegate to buildRelation.
 */
const processRelationalAttributes = (definition, model, instance, relationalAttrs) => {
  relationalAttrs.forEach(name => {
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
 * Create Mongoose schema, omitting virtual fields.
 */
const createMongooseSchema = definition => {
  return new mongoose.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );
};

/**
 * Attach virtual fields for reverse population.
 */
const attachVirtuals = (schema, definition) => {
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
 * Configure timestamps based on model options.
 */
const configureTimestamps = (definition, schema, targetModel) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);
    _.assign(targetModel.allAttributes, {
      [createAtCol]: { type: 'timestamp' },
      [updatedAtCol]: { type: 'timestamp' },
    });
    schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }
};

/**
 * Set schema minimize option.
 */
const configureMinimize = (definition, schema) => {
  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);
};

/**
 * Convert Decimal128 fields to float.
 */
const convertDecimalFields = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

/**
 * Transform polymorphic association data.
 */
const transformMorphAssociations = (returned, morphAssociations) => {
  const refToStrapiRef = obj => {
    const ref = obj.ref;
    let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
    if (typeof plainData !== 'object') return ref;
    return { __contentType: obj.kind, ...ref };
  };

  morphAssociations.forEach(association => {
    if (Array.isArray(returned[association.alias]) && returned[association.alias].length > 0) {
      switch (association.nature) {
        case 'oneMorphToOne':
          returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
          break;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          returned[association.alias] = returned[association.alias].map(refToStrapiRef);
          break;
        default:
      }
    }
  });
};

/**
 * Transform component and dynamic zone attributes.
 */
const transformComponentAttributes = (definition, returned, componentAttrs) => {
  const parseComponentRef = el => (el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref);
  const parseDynamicZoneRef = el => (el.ref instanceof mongoose.Types.ObjectId ? { id: el.ref.toString() } : el.ref);

  componentAttrs.forEach(name => {
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
};

/**
 * Transform regular associations (non‑polymorphic).
 */
const transformAssociations = (definition, returned, associations) => {
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
 * Attach transform hook to schema.
 */
const attachTransform = (schema, definition, morphAssociations, componentAttrs) => {
  const associations = definition.associations.filter(a => !isPolymorphicAssoc(a));

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform(doc, returned) {
      convertDecimalFields(returned);
      transformMorphAssociations(returned, morphAssociations);
      transformComponentAttributes(definition, returned, componentAttrs);
      transformAssociations(definition, returned, associations);
    },
  };
};

/**
 * Instantiate Mongoose model and sync indexes.
 */
const instantiateModel = async (definition, schema, target, modelKey, instance) => {
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

  target[modelKey] = _.assign(Model, target[modelKey]);
  target[modelKey]._attributes = definition.attributes;
  target[modelKey].updateRelations = relations.update;
  target[modelKey].deleteRelations = relations.deleteRelations;
  target[modelKey].privateAttributes = contentTypesUtils.getPrivateAttributes(target[modelKey]);
};

/* ---------- Core Mount Logic ---------- */

const mountModel = async (modelKey, models, target, ctx) => {
  const { instance } = ctx;
  const definition = models[modelKey];

  definition.orm = 'mongoose';
  definition.associations = [];
  definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
  definition.loadedModel = {};

  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(definition);
  setPrimaryKeyDefaults(definition);
  addCoreFields(definition);

  const { component: componentAttrs, scalar: scalarAttrs, relational: relationalAttrs } = splitAttributes(
    definition
  );

  processComponentAttributes(definition, componentAttrs);
  processScalarAttributes(definition, scalarAttrs, instance, hasDraftAndPublish);
  processRelationalAttributes(definition, modelKey, instance, relationalAttrs);

  const schema = createMongooseSchema(definition);
  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
  const populateFn = createOnFetchPopulateFn({
    morphAssociations,
    componentAttributes: componentAttrs,
    definition,
  });

  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'].forEach(lc => {
    schema.pre(lc, populateFn);
  });

  attachVirtuals(schema, definition);
  target[modelKey] = { allAttributes: _.clone(definition.attributes) };
  configureTimestamps(definition, schema, target[modelKey]);
  configureMinimize(definition, schema);
  attachTransform(schema, definition, morphAssociations, componentAttrs);
  await instantiateModel(definition, schema, target, modelKey, instance);
};

/* ---------- Migration & Export ---------- */

module.exports = async ({ models, target }, ctx) => {
  // Mount all models
  await Promise.all(Object.keys(models).map(key => mountModel(key, models, target, ctx)));

  // Run migrations and store definitions
  for (const modelKey of Object.keys(models)) {
    const definition = models[modelKey];
    const definitionDidChange = await didDefinitionChange(definition, ctx.instance);
    const previousDefinition = await getDefinitionFromStore(definition, ctx.instance);

    await strapi.db.migrations.run(migrateSchema, {
      definition,
      previousDefinition,
      model: target[modelKey],
      ORM: ctx.instance,
    });

    if (definitionDidChange) {
      await storeDefinition(definition, ctx.instance);
    }
  }
};

/* ---------- No‑op Migration ---------- */
const migrateSchema = () => {};

/* ---------- Populate Hook ---------- */
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

/* ---------- Relation Builder ---------- */
const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (modelName, plugin) => strapi.db.getModel(modelName, plugin).globalId;
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
        !['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'].includes(FK.nature)
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
```