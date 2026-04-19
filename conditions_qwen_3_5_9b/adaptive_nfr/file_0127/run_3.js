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

const hasDraftAndPublish = definition => {
  return contentTypesUtils.hasDraftAndPublish(definition);
};

const isComponentOrDynamicZone = (key, attribute) => {
  return ['component', 'dynamiczone'].includes(attribute.type);
};

const isScalarAttribute = (key, attribute) => {
  const { type } = attribute;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

const isRelationalAttribute = (key, attribute) => {
  const { type } = attribute;
  return type === undefined;
};

const isPrivateAttribute = definition => {
  return !_.get(definition, 'options.populateCreatorFields', false);
};

const shouldAddTimestamps = definition => {
  return _.get(definition, 'options.timestamps', false);
};

const getTimestampColumns = definition => {
  const createAtCol = _.get(definition, 'options.timestamps.0', 'createdAt');
  const updatedAtCol = _.get(definition, 'options.timestamps.1', 'updatedAt');
  return [createAtCol, updatedAtCol];
};

const shouldMinimizeSchema = definition => {
  return _.get(definition, 'options.minimize', false) === true;
};

const getRef = (name, plugin) => {
  return strapi.db.getModel(name, plugin).globalId;
};

const setField = (name, val) => {
  definition.loadedModel[name] = val;
};

const getMatchQuery = (assoc, publicationState) => {
  const assocModel = strapi.db.getModelByAssoc(assoc);
  const hasDraftAndPublish = contentTypesUtils.hasDraftAndPublish(assocModel);
  if (hasDraftAndPublish && DP_PUB_STATES.includes(publicationState)) {
    return populateQueries.publicationState[publicationState];
  }
  return undefined;
};

const shouldPopulateMorphRelations = options => {
  return options._populateMorphRelations === true;
};

const shouldPopulateComponents = options => {
  return options._populateComponents === true;
};

const shouldPopulateComponentAttributes = (key, attribute) => {
  return attribute.type === 'component';
};

const shouldPopulateDynamicZone = (name, returned) => {
  return returned[name] && returned[name].length > 0;
};

const shouldPopulateAssociations = (relation, association) => {
  return relation && (relation.toJSON ? relation.toJSON() : relation);
};

const shouldPickPopulate = (entry, populate) => {
  return _.pick(entry, populate);
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

const refToStrapiRef = obj => {
  const ref = obj.ref;
  let plainData = ref && typeof ref.toJSON === 'function' ? ref.toJSON() : ref;
  if (typeof plainData !== 'object') return ref;
  return {
    __contentType: obj.kind,
    ...ref,
  };
};

const handleDecimal128 = returned => {
  Object.keys(returned)
    .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
    .forEach(key => {
      returned[key] = parseFloat(returned[key].toString());
    });
};

const handleMorphAssociations = (returned, morphAssociations, refToStrapiRef) => {
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
          returned[association.alias] = returned[association.alias].map(obj =>
            refToStrapiRef(obj)
          );
          break;
        default:
          break;
      }
    }
  });
};

const handleComponentAttributes = (returned, definition, componentAttributes, parseComponentRef) => {
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
  });
};

const handleDynamicZoneAttributes = (returned, definition, componentAttributes, parseDynamicZoneRef, findComponentByGlobalId) => {
  componentAttributes.forEach(name => {
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
  });
};

const handleAssociations = (returned, associations) => {
  associations.forEach(association => {
    const relation = returned[association.alias];
    if (relation) {
      returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;
      if (_.isArray(association.populate)) {
        const { alias, populate } = association;
        returned[alias] = _.isArray(returned[alias])
          ? _.map(returned[alias], entry => _.pick(entry, populate))
          : _.pick(returned[alias], populate);
      }
    }
  });
};

const handleMorphRelations = (thisObj, morphAssociations, getMatchQuery, publicationState) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association, publicationState);
    const { alias, nature } = association;
    if (['oneToManyMorph', 'manyToManyMorph'].includes(nature)) {
      thisObj.populate({ path: alias, match: matchQuery, options: { publicationState } });
    } else if (thisObj.getPopulatedPaths().includes(alias)) {
      _.set(thisObj._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
      _.set(thisObj._mongooseOptions.populate, [alias, 'options'], {
        publicationState,
      });
      if (matchQuery !== undefined) {
        _.set(thisObj._mongooseOptions.populate, [alias, 'match'], matchQuery);
      }
    }
  });
};

const handleComponentPopulate = (thisObj, componentAttributes, publicationState) => {
  componentAttributes.forEach(key => {
    thisObj.populate({ path: `${key}.ref`, options: { publicationState } });
  });
};

const handleComponentAssociations = (thisObj, definition, getMatchQuery, publicationState) => {
  definition.associations
    .filter(assoc => !isPolymorphicAssoc(assoc))
    .filter(ast => ast.autoPopulate !== false)
    .forEach(ast => {
      thisObj.populate({
        path: ast.alias,
        match: getMatchQuery(ast, publicationState),
        options: { publicationState, _populateComponents: false },
      });
    });
};

const handleHasOneRelation = (definition, attribute, name, getRef, setField) => {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
};

const handleHasManyRelation = (definition, attribute, name, getRef, setField, associations) => {
  const FK = _.find(associations, { alias: name });
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
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
  }
};

const handleBelongsToRelation = (definition, attribute, name, getRef, setField, associations) => {
  const FK = _.find(associations, { alias: name });
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
    setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
  }
};

const handleBelongsToManyRelation = (definition, attribute, name, nature, getRef, setField, associations) => {
  const ref = getRef(attribute.collection, attribute.plugin);
  if (nature === 'manyWay') {
    setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
  } else {
    const FK = _.find(associations, { alias: name });
    if ((FK && _.isUndefined(FK.via)) || attribute.dominant !== true) {
      setField(name, {
        type: 'virtual',
        ref,
        via: FK.via,
      });
      attribute.isVirtual = true;
    } else {
      setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
    }
  }
};

const handleMorphOneRelation = (definition, attribute, name, getRef, setField) => {
  const ref = getRef(attribute.model, attribute.plugin);
  setField(name, { type: mongoose.Schema.Types.ObjectId, ref });
};

const handleMorphManyRelation = (definition, attribute, name, getRef, setField) => {
  const ref = getRef(attribute.collection, attribute.plugin);
  setField(name, [{ type: mongoose.Schema.Types.ObjectId, ref }]);
};

const handleBelongsToMorphRelation = (definition, attribute, name, setField) => {
  setField(name, {
    kind: String,
    [attribute.filter]: String,
    ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
  });
};

const handleBelongsToManyMorphRelation = (definition, attribute, name, setField) => {
  setField(name, [
    {
      kind: String,
      [attribute.filter]: String,
      ref: { type: mongoose.Schema.Types.ObjectId, refPath: `${name}.kind` },
    },
  ]);
};

const buildRelation = ({ definition, model, instance, attribute, name }) => {
  const { nature, verbose } =
    utilsModels.getNature({
      attribute,
      attributeName: name,
      modelName: model.toLowerCase(),
    }) || {};

  utilsModels.defineAssociations(model.toLowerCase(), definition, attribute, name);

  const handleRelations = (verbose, nature) => {
    switch (verbose) {
      case 'hasOne':
        handleHasOneRelation(definition, attribute, name, getRef, setField);
        break;
      case 'hasMany':
        handleHasManyRelation(definition, attribute, name, getRef, setField, definition.associations);
        break;
      case 'belongsTo':
        handleBelongsToRelation(definition, attribute, name, getRef, setField, definition.associations);
        break;
      case 'belongsToMany':
        handleBelongsToManyRelation(definition, attribute, name, nature, getRef, setField, definition.associations);
        break;
      case 'morphOne':
        handleMorphOneRelation(definition, attribute, name, getRef, setField);
        break;
      case 'morphMany':
        handleMorphManyRelation(definition, attribute, name, getRef, setField);
        break;
      case 'belongsToMorph':
        handleBelongsToMorphRelation(definition, attribute, name, setField);
        break;
      case 'belongsToManyMorph':
        handleBelongsToManyMorphRelation(definition, attribute, name, setField);
        break;
      default:
        break;
    }
  };

  handleRelations(verbose, nature);
};

const createOnFetchPopulateFn = ({ morphAssociations, componentAttributes, definition }) => {
  return function() {
    const populatedPaths = this.getPopulatedPaths();
    const {
      publicationState,
      _populateComponents = true,
      _populateMorphRelations = true,
    } = this.getOptions();

    handleMorphRelations(this, morphAssociations, getMatchQuery, publicationState);

    if (shouldPopulateComponents(this.getOptions())) {
      handleComponentPopulate(this, componentAttributes, publicationState);
    }

    if (definition.modelType === 'component') {
      handleComponentAssociations(this, definition, getMatchQuery, publicationState);
    }
  };
};

module.exports = async ({ models, target }, ctx) => {
  const { instance } = ctx;

  const mountModel = model => {
    const definition = models[model];
    definition.orm = 'mongoose';
    definition.associations = [];
    definition.globalName = _.upperFirst(_.camelCase(definition.globalId));
    definition.loadedModel = {};

    const hasDraftAndPublish = hasDraftAndPublish(definition);

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

      const isPrivate = isPrivateAttribute(definition);

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
      isComponentOrDynamicZone(key, definition.attributes[key])
    );

    const scalarAttributes = Object.keys(definition.attributes).filter(key =>
      isScalarAttribute(key, definition.attributes[key])
    );

    const relationalAttributes = Object.keys(definition.attributes).filter(key =>
      isRelationalAttribute(key, definition.attributes[key])
    );

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

    scalarAttributes.forEach(name => {
      const attr = definition.attributes[name];
      definition.loadedModel[name] = {
        ...attr,
        ...utils(instance).convertType(name, attr),
        required:
          definition.modelType === 'compo' || hasDraftAndPublish ? false : definition.required,
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

    const [createAtCol, updatedAtCol] = getTimestampColumns(definition);

    if (shouldAddTimestamps(definition)) {
      _.set(definition, 'options.timestamps', [createAtCol, updatedAtCol]);

      _.assign(target[model].allAttributes, {
        [createAtCol]: { type: 'timestamp' },
        [updatedAtCol]: { type: 'timestamp' },
      });

      schema.set('timestamps', { createdAt: createAtCol, updatedAt: updatedAtCol });
    } else {
      _.set(definition, 'options.timestamps', false);
    }

    schema.set('minimize', shouldMinimizeSchema(definition));

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