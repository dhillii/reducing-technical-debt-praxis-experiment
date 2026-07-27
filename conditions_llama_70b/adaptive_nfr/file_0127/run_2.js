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

const isDraftAndPublishEnabled = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

const getRef = (name, plugin) => {
  return strapi.db.getModel(name, plugin).globalId;
};

const setField = (definition, name, val) => {
  definition.loadedModel[name] = val;
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const { ObjectId } = instance.Schema.Types;

  switch (verbose) {
    case 'hasOne':
      setField(definition, name, { type: ObjectId, ref: getRef(attribute.model, attribute.plugin) });
      break;
    case 'hasMany':
      const FK = _.find(definition.associations, { alias: name });
      const ref = getRef(attribute.collection, attribute.plugin);
      if (FK) {
        setField(definition, name, {
          type: 'virtual',
          ref,
          via: FK.via,
          justOne: false,
        });
        attribute.isVirtual = true;
      } else {
        setField(definition, name, [{ type: ObjectId, ref }]);
      }
      break;
    case 'belongsTo':
      const FK2 = _.find(definition.associations, { alias: name });
      const ref2 = getRef(attribute.model, attribute.plugin);
      if (
        FK2 &&
        FK2.nature !== 'oneToOne' &&
        FK2.nature !== 'manyToOne' &&
        FK2.nature !== 'oneWay' &&
        FK2.nature !== 'oneToMorph'
      ) {
        setField(definition, name, {
          type: 'virtual',
          ref: ref2,
          via: FK2.via,
          justOne: true,
        });
        attribute.isVirtual = true;
      } else {
        setField(definition, name, { type: ObjectId, ref: ref2 });
      }
      break;
    case 'belongsToMany':
      const ref3 = getRef(attribute.collection, attribute.plugin);
      if (nature === 'manyWay') {
        setField(definition, name, [{ type: ObjectId, ref: ref3 }]);
      } else {
        const FK3 = _.find(definition.associations, { alias: name });
        if ((FK3 && _.isUndefined(FK3.via)) || attribute.dominant !== true) {
          setField(definition, name, {
            type: 'virtual',
            ref: ref3,
            via: FK3.via,
          });
          attribute.isVirtual = true;
        } else {
          setField(definition, name, [{ type: ObjectId, ref: ref3 }]);
        }
      }
      break;
    case 'morphOne':
      setField(definition, name, { type: ObjectId, ref: getRef(attribute.model, attribute.plugin) });
      break;
    case 'morphMany':
      setField(definition, name, [{ type: ObjectId, ref: getRef(attribute.collection, attribute.plugin) }]);
      break;
    case 'belongsToMorph':
      setField(definition, name, {
        kind: String,
        [attribute.filter]: String,
        ref: { type: ObjectId, refPath: `${name}.kind` },
      });
      break;
    case 'belongsToManyMorph':
      setField(definition, name, [
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
      if (isDraftAndPublishEnabled(assocModel) && DP_PUB_STATES.includes(publicationState)) {
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

const transformReturnedData = (doc, returned, definition, morphAssociations, associations, componentAttributes) => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });

  morphAssociations.forEach(association => {
    if (
      Array.isArray(returned[association.alias]) &&
      returned[association.alias].length > 0
    ) {
      switch (association.nature) {
        case 'oneMorphToOne':
          returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
          break;
        case 'manyMorphToMany':
        case 'manyMorphToOne':
          returned[association.alias] = returned[association.alias].map(obj => refToStrapiRef(obj));
          break;
        default:
      }
    }
  });

  componentAttributes.forEach(name => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (type === 'component') {
      if (Array.isArray(returned[name])) {
        const components = returned[name].map(parseComponentRef);
        returned[name] = attribute.repeatable === true ? components : _.first(components) || null;
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
  return returned;
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  const mountModel = model => {
    const definition = models[model];
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    const hasDraftAndPublish = isDraftAndPublishEnabled(definition);

    _.defaults(definition, {
      primaryKey: '_id',
      primaryKeyType: 'string',
    });

    if (!definition.uid.startsWith('strapi::') && definition.modelType !== 'component') {
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
      ['component', 'dynamiczone'].includes(definition.attributes[key].type)
    );

    const scalarAttributes = Object.keys(definition.attributes).filter(key => {
      const { type } = definition.attributes[key];
      return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
    });

    const relationalAttributes = Object.keys(definition.attributes).filter(key => {
      const { type } = definition.attributes[key];
      return type === undefined;
    });

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

    scalarAttributes.forEach(name => {
      const attr = definition.attributes[name];
      definition.loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'component' || hasDraftAndPublish ? false : definition.required,
      };
    });

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

    const morphAssociations = definition.associations.filter(isPolymorphicAssoc);
    const associations = definition.associations.filter(association => !isPolymorphicAssoc(association));

    const populateFn = createOnFetchPopulateFn({
      morphAssociations,
      componentAttributes,
      definition,
    });

    const findLifecycles = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndRemove'];
    findLifecycles.forEach(key => {
      schema.pre(key, populateFn);
    });

    schema.virtual('id', {
      ref: 'id',
      localField: '_id',
      foreignField: '_id',
      justOne: true,
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

    schema.options.toObject = schema.options.toJSON = {
      virtuals: true,
      transform: doc => transformReturnedData(doc, doc.toObject(), definition, morphAssociations, associations, componentAttributes),
    };

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

const migrateSchema = () => {};