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

const isPolymorphicAssoc = (assoc) => {
  return assoc.nature.toLowerCase().indexOf('morph') !== -1;
};

const mountModel = async (model, models, target, ctx) => {
  const { instance } = ctx;
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

  if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
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
  }

  const componentAttributes = Object.keys(definition.attributes).filter((key) =>
    ['component', 'dynamiczone'].includes(definition.attributes[key].type)
  );

  const scalarAttributes = Object.keys(definition.attributes).filter((key) => {
    const { type } = definition.attributes[key];
    return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
  });

  const relationalAttributes = Object.keys(definition.attributes).filter((key) => {
    const { type } = definition.attributes[key];
    return type === undefined;
  });

  handleComponentAndDynamicZoneAttrs(definition, componentAttributes);
  handleScalarAttrs(definition, scalarAttributes, instance, hasDraftAndPublish);
  handleRelationalAttrs(definition, relationalAttributes, instance);

  const schema = new instance.Schema(
    _.omitBy(definition.loadedModel, ({ type }) => type === 'virtual')
  );

  const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];

  const morphAssociations = definition.associations.filter(isPolymorphicAssoc);

  const populateFn = createOnFetchPopulateFn({
    morphAssociations,
    componentAttributes,
    definition,
  });

  findLifecycles.forEach((key) => {
    schema.pre(key, populateFn);
  });

  addVirtualKeyToSchema(schema, definition);

  target[model].allAttributes = _.clone(definition.attributes);

  handleTimestamps(definition, target, instance);

  schema.set('minimize', _.get(definition, 'options.minimize', false) === true);

  const refToStrapiRef = (obj) => {
    const ref = obj.ref;

    let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;

    if (typeof plainData !== 'object') return ref;

    return {
      __contentType: obj.kind,
      ...ref,
    };
  };

  const parseComponentRef = (el) => {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return el.ref.toString();
    } else {
      return el.ref;
    }
  };

  const parseDynamicZoneRef = (el) => {
    if (el.ref instanceof mongoose.Types.ObjectId) {
      return { id: el.ref.toString() };
    } else {
      return el.ref;
    }
  };

  const associations = definition.associations.filter(
    (association) => !isPolymorphicAssoc(association)
  );

  schema.options.toObject = schema.options.toJSON = {
    virtuals: true,
    transform: function (doc, returned) {
      Object.keys(returned)
        .filter((key) => returned[key] instanceof mongoose.Types.Decimal128)
        .forEach((key) => {
          returned[key] = parseFloat(returned[key].toString());
        });

      morphAssociations.forEach((association) => {
        if (
          Array.isArray(returned[association.alias]) &&
          returned[association.alias].length > 0
        ) {
          switch (association.nature) {
            case 'oneMorphToOne':
              returned[association.alias] = refToStrapiRef(returned[association.alias][0]);

              break;

            case 'manyMorphToMany':
            case 'manyMorphToOne': {
              returned[association.alias] = returned[association.alias].map((obj) =>
                refToStrapiRef(obj)
              );

              break;
            }
            default:
          }
        }
      });

      componentAttributes.forEach((name) => {
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
              .filter((el) => el && el.kind)
              .map((el) => {
                return {
                  __component: findComponentByGlobalId(el.kind).uid,
                  ...parseDynamicZoneRef(el),
                };
              });
          }
        }
      });

      associations.forEach((association) => {
        const relation = returned[association.alias];

        if (relation) {
          returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

          if (_.isArray(association.populate)) {
            const { alias, populate } = association;
            const pickPopulate = (entry) => _.pick(entry, populate);

            returned[alias] = _.isArray(returned[alias])
              ? _.map(returned[alias], pickPopulate)
              : pickPopulate(returned[alias]);
          }
        }
      });
    },
  };

  const Model = instance.model(definition.globalId, schema, definition.collectionName);

  const handleIndexesErrors = () => {
    Model.on('index', (error) => {
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

  target[model] = _.assign(Model, target[model]);

  target[model]._attributes = definition.attributes;
  target[model].updateRelations = relations.update;
  target[model].deleteRelations = relations.deleteRelations;
  target[model].privateAttributes = contentTypesUtils.getPrivateAttributes(target[model]);
};

const handleComponentAndDynamicZoneAttrs = (definition, componentAttributes) => {
  componentAttributes.forEach((name) => {
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

const handleScalarAttrs = (definition, scalarAttributes, instance, hasDraftAndPublish) => {
  scalarAttributes.forEach((name) => {
    const attr = definition.attributes[name];
    definition.loadedModel[name] = {
      ...attr,
      ...utils(instance).convertType(name, attr),
      required:
        definition.modelType === 'component' || hasDraftAndPublish ? false : definition.required,
    };
  });
};

const handleRelationalAttrs = (definition, relationalAttributes, instance) => {
  relationalAttributes.forEach((name) => {
    buildRelation({
      definition,
      model: definition.globalId,
      instance,
      name,
      attribute: definition.attributes[name],
    });
  });
};

const addVirtualKeyToSchema = (schema, definition) => {
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

const handleTimestamps = (definition, target, instance) => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');

  if (_.get(definition, 'options.timestamps', false)) {
    _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

    _.assign(target[definition.globalId].allAttributes, {
      [createAtCol]: { type: 'timestamp' },
      [updatedAtCol]: { type: 'timestamp' },
    });

    instance.Schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
  } else {
    _.set(definition, 'options.timestamps', false);
  }
};

const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function () {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    const getMatchQuery = (assoc) => {
      const assocModel = strapi.db.getModelByAssoc(assoc);

      const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);
      if (hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)) {
        return populateQueries.publicationState[publicationState];
      }

      return undefined;
    };

    if (_populateMorphRelations) {
      morphAssociations.forEach((association) => {
        const matchQuery = getMatchQuery(association);
        const { alias, nature } = association;

        if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
          this.populate({ path: alias, match: matchQuery, options: { publicationState } });
        } else if (populatedPaths.includes(alias)) {
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

    if (_populateComponents) {
      componentAttributes.forEach((key) => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType === 'component') {
      definition.associations
        .filter((assoc) => !isPolymorphicAssoc(assoc))
        .filter((ast) => ast.autoPopulate !== false)
        .forEach((ast) => {
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

module.exports = async ({ models, target }, ctx) => {
  Object.keys(models).forEach((model) => {
    mountModel(model, models, target, ctx);
  });

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

const migrateSchema = () => {};
```