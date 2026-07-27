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

/** Check if attribute is scalar (has a type and is not component/dynamiczone) */
const isScalarAttribute = attr => {
  const { type } = attr;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/** Check if attribute is relational (no type defined) */
const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

/** Check if morph association is array and has items */
const isMorphAssocWithItems = (association, returned) => {
  return Array.isArray(returned[association.alias]) && returned[association.alias].length > 0;
};

/** Check if component attribute is array type */
const isArrayComponent = (attribute, returned, name) => {
  return attribute.type === 'component' && Array.isArray(returned[name]);
};

/** Check if dynamic zone attribute exists and has items */
const isDynamicZoneWithItems = (returned, name) => {
  return returned[name] && Array.isArray(returned[name]);
};

/** Check if relation exists and needs transformation */
const hasRelationToTransform = (association, returned) => {
  return returned[association.alias];
};

/** Check if association has populate filter */
const hasPopulateFilter = association => {
  return _.isArray(association.populate);
};

/** Transform morph association based on nature */
const transformMorphAssociation = (association, returned, refToStrapiRef) => {
  if (association.nature === 'oneMorphToOne') {
    returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
  } else if (association.nature === 'manyMorphToMany' || association.nature === 'manyMorphToOne') {
    returned[association.alias] = returned[association.alias].map(obj => refToStrapiRef(obj));
  }
};

/** Transform component attribute in returned object */
const transformComponentAttribute = (name, attribute, returned, parseComponentRef) => {
  if (attribute.type !== 'component') {
    return;
  }

  if (!isArrayComponent(attribute, returned, name)) {
    return;
  }

  const components = returned[name].map(parseComponentRef);
  returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
};

/** Transform dynamic zone attribute in returned object */
const transformDynamicZoneAttribute = (name, returned) => {
  if (!isDynamicZoneWithItems(returned, name)) {
    return;
  }

  returned[name] = returned[name]
    .filter(el => el && el.kind)
    .map(el => {
      return {
        __component: findComponentByGlobalId(el.kind).uid,
        id: el.ref instanceof mongoose.Types.ObjectId ? el.ref.toString() : el.ref,
      };
    });
};

/** Transform relational attribute in returned object */
const transformRelationalAttribute = (association, returned) => {
  const relation = returned[association.alias];

  if (!hasRelationToTransform(association, returned)) {
    return;
  }

  returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

  if (!hasPopulateFilter(association)) {
    return;
  }

  const { alias, populate } = association;
  const pickPopulate = entry => _.pick(entry, populate);

  returned[alias] = _.isArray(returned[alias])
    ? _.map(returned[alias], pickPopulate)
    : pickPopulate(returned[alias]);
};

/** Parse decimal values in returned object */
const parseDecimalValues = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
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

    if (isUserDefinedModel(definition)) {
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

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

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

    const refToStrapiRef = obj => {
      const ref = obj.ref;
      let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

      if (typeof plainData !== 'object') {
        return ref;
      }

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

    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: function(doc, returned) {
        parseDecimalValues(returned);

        morphAssociations.forEach(association => {
          if (!isMorphAssocWithItems(association, returned)) {
            return;
          }
          transformMorphAssociation(association, returned, refToStrapiRef);
        });

        componentAttributes.forEach(name => {
          const attribute = definition.attributes[name];

          transformComponentAttribute(name, attribute, returned, parseComponentRef);
          transformDynamicZoneAttribute(name, returned);
        });

        associations.forEach(association => {
          transformRelationalAttribute(association, returned);
        });
      },
    };

    // Instantiate model.
    const Model = instance.model(definition.globalId, schema, definition.collectionName);

    const handleIndexesErrors = () => {
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

    const populateMorphAssociations = () => {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;

        if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
          return;
        }

        if (!populatedPaths.includes(alias)) {
          return;
        }

        _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
        _.set(this._mongooseOptions.populate, [alias, 'options'], {
          publicationState,
        });

        if (matchQuery !== undefined) {
          _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
        }
      });
    };

    const populateComponentAttributes = () => {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    };

    const populateComponentAssociations = () => {
      if (definition.modelType !== 'component') {
        return;
      }

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

    populateComponentAssociations();
  };
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

  const buildHasOneRelation = () => {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  };

  const buildHasManyRelation = () => {
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
      return;
    }

    setField(name, [{ type: ObjectId, ref }]);
  };

  const buildBelongsToRelation = () => {
    const FK = _.find(definition.associations, {
      alias: name,
    });

    const ref = getRef(attribute.model, attribute.plugin);

    const isVirtualRelation = FK &&
      FK.nature !== 'oneToOne' &&
      FK.nature !== 'manyToOne' &&
      FK.nature !== 'oneWay' &&
      FK.nature !== 'oneToMorph';

    if (isVirtualRelation) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
        justOne: true,
      });
      attribute.isVirtual = true;
      return;
    }

    setField(name, { type: ObjectId, ref });
  };

  const buildBelongsToManyRelation = () => {
    const ref = getRef(attribute.collection, attribute.plugin);

    if (nature === 'manyWay') {
      setField(name, [{ type: ObjectId, ref }]);
      return;
    }

    const FK = _.find(definition.associations, {
      alias: name,
    });

    const isVirtualRelation = (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;

    if (isVirtualRelation) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
      });
      attribute.isVirtual = true;
      return;
    }

    setField(name, [{ type: ObjectId, ref }]);
  };

  const buildMorphOneRelation = () => {
    const ref = getRef(attribute.model, attribute.plugin);
    setField(name, { type: ObjectId, ref });
  };

  const buildMorphManyRelation = () => {
    const ref = getRef(attribute.collection, attribute.plugin);
    setField(name, [{ type: ObjectId, ref }]);
  };

  const buildBelongsToMorphRelation = () => {
    setField(name, {
      kind: String,
      [attribute.filter]: String,
      ref: { type: ObjectId, refPath: `${name}.kind` },
    });
  };

  const buildBelongsToManyMorphRelation = () => {
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
      buildHasOneRelation();
      break;
    case 'hasMany':
      buildHasManyRelation();
      break;
    case 'belongsTo':
      buildBelongsToRelation();
      break;
    case 'belongsToMany':
      buildBelongsToManyRelation();
      break;
    case 'morphOne':
      buildMorphOneRelation();
      break;
    case 'morphMany':
      buildMorphManyRelation();
      break;
    case 'belongsToMorph':
      buildBelongsToMorphRelation();
      break;
    case 'belongsToManyMorph':
      buildBelongsToManyMorphRelation();
      break;
    default:
      break;
  }
};