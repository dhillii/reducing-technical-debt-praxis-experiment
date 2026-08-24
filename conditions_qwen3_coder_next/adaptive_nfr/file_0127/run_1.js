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

// Predicate functions for simplified control flow
const hasManyMorphNature = association => {
  return association.nature === 'manyMorphToMany';
};

const isOneMorphToOneNature = association => {
  return association.nature === 'oneMorphToOne';
};

const hasDraftAndPublish = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

const isComponentType = definition => {
  return definition.modelType === 'component';
};

const isComponentOrDynamicZoneAttribute = attr => {
  return ['component', 'dynamiczone'].includes(attr.type);
};

const isScalarAttribute = attr => {
  return attr.type !== undefined && attr.type !== null && attr.type !== 'component' && attr.type !== 'dynamiczone';
};

const isRelationalAttribute = attr => {
  return attr.type === undefined;
};

const isVirtualField = ({ type }) => {
  return type === 'virtual';
};

const isPolymorphicAndPopulated = (populatedPaths, association) => {
  return populatedPaths.includes(association.alias);
};

const isOneOrManyMorphRelation = nature => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
};

const shouldPopulateMorphRelations = options => {
  return options._populateMorphRelations !== false;
};

const shouldPopulateComponents = options => {
  return options._populateComponents !== false;
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  function mountModel(model) {
    const definition = models[model];
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    // Set the default values to model settings.
    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });

    if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
      if (hasDraftAndPublish(definition)) {
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
      isComponentOrDynamicZoneAttribute(definition.attributes[key])
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
          isComponentType(definition) || hasDraftAndPublish(definition) ? false : definition.required,
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
      _.omitBy(definition.loadedModel, isVirtualField)
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
      _.pickBy(definition.loadedModel, isVirtualField),
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

      if (typeof plainData !== 'object') return ref;

      return {
        __contentType: obj.kind,
        ...ref,
      };
    };

    const parseComponentRef = el => {
      if (el.ref instanceof mongoose.Types.ObjectId) {
        return el.ref.toString();
      } else {
        return el.ref;
      }
    };

    const parseDynamicZoneRef = el => {
      if (el.ref instanceof mongoose.Types.ObjectId) {
        return { id: el.ref.toString() };
      } else {
        return el.ref;
      }
    };

    const associations = definition.associations.filter(
      association => !isPolymorphicAssoc(association)
    );

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: function(doc, returned) {
        // Remove $numberDecimal nested property.
        Object.keys(returned)
          .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
          .forEach(key => {
            returned[key] = parseFloat(returned[key].toString());
          });

        morphAssociations.forEach(association => {
          if (!Array.isArray(returned[association.alias]) || returned[association.alias].length === 0) {
            return;
          }

          if (isOneMorphToOneNature(association)) {
            returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
            return;
          }

          if (hasManyMorphNature(association)) {
            returned[association.alias] = returned[association.alias].map(refToStrapiRef);
          }
        });

        componentAttributes.forEach(name => {
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
                .map(el => {
                  return {
                    __component: findComponentByGlobalId(el.kind).uid,
                    ...parseDynamicZoneRef(el),
                  };
                });
            }
          }
        });

        associations.forEach(association => {
          const relation = returned[association.alias];

          if (!relation) {
            return;
          }

          // Extract raw JSON data.
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

    if (shouldPopulateMorphRelations({ _populateMorphRelations })) {
      morphAssociations.forEach(association => {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;

        if (isOneOrManyMorphRelation(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
        } else if (isPolymorphicAndPopulated(populatedPaths, association)) {
          _.set(this._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
          _.set(this._mongooseOptions.populate, [alias, 'options'], {
            publicationState,
          });

          if (matchQuery !== undefined) {
            _.set(this._mongooseOptions.populate, [alias, 'match'], matchQuery);
          }
        }
      });
    }

    if (shouldPopulateComponents({ _populateComponents })) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (isComponentType(definition)) {
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

      const isValidFKCondition = (
        FK &&
        FK.nature !== 'oneToOne' &&
        FK.nature !== 'manyToOne' &&
        FK.nature !== 'oneWay' &&
        FK.nature !== 'oneToMorph'
      );

      if (isValidFKCondition) {
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

        const isOneSideVirtual = (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;

        if (isOneSideVirtual) {
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