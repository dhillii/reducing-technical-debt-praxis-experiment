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

/** Check if attribute is a component or dynamic zone */
const isComponentAttribute = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

/** Check if attribute is scalar (has a defined type) */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/** Check if attribute is relational (no type defined) */
const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

/** Check if association is polymorphic */
const isMorphAssociation = association => {
  return isPolymorphicAssoc(association);
};

/** Check if association is non-polymorphic */
const isNonMorphAssociation = association => {
  return !isPolymorphicAssoc(association);
};

/** Check if morph association array is populated */
const isMorphAssociationPopulated = (association, returned) => {
  return Array.isArray(returned[association.alias]) && returned[association.alias].length > 0;
};

/** Check if component attribute is array type */
const isComponentArrayType = (attribute, returned, name) => {
  return attribute.type === 'component' && Array.isArray(returned[name]);
};

/** Check if dynamic zone attribute exists */
const isDynamicZonePopulated = (attribute, returned, name) => {
  return attribute.type === 'dynamiczone' && returned[name];
};

/** Check if relation exists and needs transformation */
const hasRelationToTransform = (association, returned) => {
  return returned[association.alias];
};

/** Check if association has populate filter */
const hasPopulateFilter = association => {
  return _.isArray(association.populate);
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

    // Set the default values to model settings.
    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });

    addSystemAttributes(definition);

    const componentAttributes = Object.keys(definition.attributes).filter(key =>
      isComponentAttribute(definition.attributes[key])
    );

    const scalarAttributes = Object.keys(definition.attributes).filter(key =>
      isScalarAttribute(definition.attributes[key])
    );

    const relationalAttributes = Object.keys(definition.attributes).filter(key =>
      isRelationalAttribute(definition.attributes[key])
    );

    // handle component and dynamic zone attrs
    if (componentAttributes.length > 0) {
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

    // handle scalar attrs
    scalarAttributes.forEach(name => {
      const attr = definition.attributes[name];
      definition.loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
      };
    });

    // handle relational attrs
    relationalAttributes.forEach(name => {
      buildRelation({
        definition,
        model,
        instance,
        name,
        attribute: definition.attributes[name],
      });
    });

    const schema = new instance.Schema(
      _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
    );

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];

    const morphAssociations = definition.associations.filter(isMorphAssociation);

    const populateFn = createOnFetchPopulateFn({
      componentAttributes,
      morphAssociations,
      definition,
    });

    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });

    // Add virtual key to provide populate and reverse populate
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

    configureTimestamps(definition, target, model, schema);

    schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

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

    const associations = definition.associations.filter(isNonMorphAssociation);

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: function(doc, returned) {
        transformDecimalFields(returned);
        transformMorphAssociations(returned, morphAssociations, refToStrapiRef);
        transformComponentAttributes(returned, componentAttributes, definition, parseComponentRef);
        transformRelations(returned, associations);
      },
    };

    // Instantiate model.
    const Model = instance.model(definition.globalId, schema, definition.collectionName);

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

    // Only sync indexes when not in production env while it's not possible to create complex indexes directly from models
    // In production it will simply create missing indexes (those defined in the models but not present in db)
    if (strapi.app.env !== 'production') {
      Model.syncIndexes(null, handleIndexesErrors);
    } else {
      handleIndexesErrors();
    }

    // Expose ORM functions through the `target` object.
    target[model] = _.assign(Model, target[model]);

    // Push attributes to be aware of model schema.
    target[model]._attributes = definition.attributes;
    target[model].updateRelations = relations.update;
    target[model].deleteRelations = relations.deleteRelations;
    target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
  }

  // Instantiate every models
  Object.keys(models).forEach(mountModel);

  // Migrations + storing schema
  for (const model of Object.keys(models)) {
    const definition = models[model];
    const modelInstance = target[model];
    const definitionDidChange = await didDefinitionChange(definition, instance);

    const previousDefinition = await getDefinitionFromStore(definition, instance);

    // run migrations
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

/** Add system attributes like publishedAt, createdBy, updatedBy */
const addSystemAttributes = definition => {
  if (!isUserDefinedModel(definition)) {
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

/** Configure timestamp attributes on schema */
const configureTimestamps = (definition, target, model, schema) => {
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

/** Transform Decimal128 fields to float */
const transformDecimalFields = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

/** Transform morph associations in returned data */
const transformMorphAssociations = (returned, morphAssociations, refToStrapiRef) => {
  morphAssociations.forEach(association => {
    if (!isMorphAssociationPopulated(association, returned)) {
      return;
    }

    const nature = association.nature;
    if (nature === 'oneMorphToOne') {
      returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
    } else if (nature === 'manyMorphToMany' || nature === 'manyMorphToOne') {
      returned[association.alias] = returned[association.alias].map(obj =>
        refToStrapiRef(obj)
      );
    }
  });
};

/** Transform component attributes in returned data */
const transformComponentAttributes = (returned, componentAttributes, definition, parseComponentRef) => {
  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];

    if (isComponentArrayType(attribute, returned, name)) {
      const components = returned[name].map(parseComponentRef);
      returned[name] =
        attribute.repeatable === true ? components : _.first(components) || null;
    }

    if (isDynamicZonePopulated(attribute, returned, name)) {
      returned[name] = returned[name]
        .filter(el => el && el.kind)
        .map(el => {
          return {
            __component: findComponentByGlobalId(el.kind).uid,
            ...parseDynamicZoneRef(el),
          };
        });
    }
  });
};

/** Parse dynamic zone reference */
const parseDynamicZoneRef = el => {
  if (el.ref instanceof mongoose.Types.ObjectId) {
    return { id: el.ref.toString() };
  }
  return el.ref;
};

/** Transform regular relations in returned data */
const transformRelations = (returned, associations) => {
  associations.forEach(association => {
    if (!hasRelationToTransform(association, returned)) {
      return;
    }

    const relation = returned[association.alias];
    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (!hasPopulateFilter(association)) {
      return;
    }

    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  });
};

// noop migration to match migration API
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

    if (_populateMorphRelations) {
      populateMorphRelations(this, morphAssociations, populatedPaths, publicationState, getMatchQuery);
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
      populateComponentAssociations(this, definition, publicationState, getMatchQuery);
    }
  };
};

/** Populate morph relations with appropriate match queries */
const populateMorphRelations = (query, morphAssociations, populatedPaths, publicationState, getMatchQuery) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
      query.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (populatedPaths.includes(alias)) {
      _.set(query._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
      _.set(query._mongooseOptions.populate, [alias, 'options'], {
        publicationState,
      });

      if (matchQuery !== undefined) {
        _.set(query._mongooseOptions.populate, [alias, 'match'], matchQuery);
      }
    }
  });
};

/** Populate component associations with auto-populate filter */
const populateComponentAssociations = (query, definition, publicationState, getMatchQuery) => {
  definition.associations
    .filter(assoc => !isPolymorphicAssoc(assoc))
    .filter(ast => ast.autoPopulate !== false)
    .forEach(ast => {
      query.populate({
        path: ast.alias,
        match: getMatchQuery(ast),
        options: { publicationState, _populateComponents: false },
      });
    });
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  // Build associations key
  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const getRef = (name, plugin) => {
    return strapi.db.getModel(name, plugin).globalId;
  };

  const setField = (name, val) => {
    definition.loadedModel[name] = val;
  };

  const { ObjectId } = instance.Schema.Types;

  switch (verbose) {
    case 'hasOne': {
      const ref = getRef(attribute.model, attribute.plugin);
      setField(name, { type: ObjectId, ref });
      break;
    }
    case 'hasMany': {
      const FK = _.find(definition.associations, {
        alias: name,
      });

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
      break;
    }
    case 'belongsTo': {
      const FK = _.find(definition.associations, {
        alias: name,
      });

      const ref = getRef(attribute.model, attribute.plugin);

      if (shouldSetVirtualBelongsTo(FK)) {
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

      break;
    }
    case 'belongsToMany': {
      const ref = getRef(attribute.collection, attribute.plugin);

      if (nature === 'manyWay') {
        setField(name, [{ type: ObjectId, ref }]);
      } else {
        const FK = _.find(definition.associations, {
          alias: name,
        });

        if (shouldSetVirtualBelongsToMany(FK, attribute)) {
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

/** Check if belongsTo relation should be virtual */
const shouldSetVirtualBelongsTo = FK => {
  if (!FK) {
    return false;
  }

  const nonVirtualNatures = ['oneToOne', 'manyToOne', 'oneWay', 'oneToMorph'];
  return !nonVirtualNatures.includes(FK.nature);
};

/** Check if belongsToMany relation should be virtual */
const shouldSetVirtualBelongsToMany = (FK, attribute) => {
  if (!FK) {
    return false;
  }

  return _.isUndefined(FK.via) || attribute.dominant !== true;
};