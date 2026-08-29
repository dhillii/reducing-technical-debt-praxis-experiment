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

/**
 * Checks if the model is a content type
 * @param {Object} definition - The model definition
 * @returns {boolean}
 */
const isContentType = definition => {
  return !definition.uid.startsWith('strapi::') && definition.modelType !== 'component';
};

/**
 * Checks if the attribute is a component or dynamic zone
 * @param {Object} attribute - The attribute to check
 * @returns {boolean}
 */
const isComponentOrDynamicZone = attribute => {
  return ['component', 'dynamiczone'].includes(attribute.type);
};

/**
 * Checks if the attribute is scalar (not a relation, component or dynamic zone)
 * @param {Object} attribute - The attribute to check
 * @returns {boolean}
 */
const isScalarAttribute = attribute => {
  const { type } = attribute;
  return type !== undefined && type !== null && type !== 'component' && type !== 'dynamiczone';
};

/**
 * Checks if the attribute is relational (undefined type)
 * @param {Object} attribute - The attribute to check
 * @returns {boolean}
 */
const isRelationalAttribute = attribute => {
  const { type } = attribute;
  return type === undefined;
};

/**
 * Checks if the association is oneToManyMorph or manyToManyMorph
 * @param {string} nature - The association nature
 * @returns {boolean}
 */
const isOneToManyOrManyToManyMorph = nature => {
  return ['oneToManyMorph', 'manyToManyMorph'].includes(nature);
};

/**
 * Checks if the path is already populated
 * @param {Array} populatedPaths - The list of populated paths
 * @param {string} alias - The association alias
 * @returns {boolean}
 */
const isPathPopulated = (populatedPaths, alias) => {
  return populatedPaths.includes(alias);
};

/**
 * Checks if the association should be auto populated
 * @param {Object} assoc - The association
 * @returns {boolean}
 */
const shouldAutoPopulate = assoc => {
  return assoc.autoPopulate !== false;
};

/**
 * Checks if the association nature is valid for virtual field
 * @param {string} nature - The association nature
 * @returns {boolean}
 */
const isValidVirtualNature = nature => {
  return nature !== 'oneToOne' && 
         nature !== 'manyToOne' && 
         nature !== 'oneWay' && 
         nature !== 'oneToMorph';
};

/**
 * Checks if the association is one side without via or dominant
 * @param {Object} FK - The foreign key
 * @param {Object} attribute - The attribute
 * @returns {boolean}
 */
const isOneSideWithoutViaOrDominant = (FK, attribute) => {
  return (FK && _.isUndefined(FK.via)) || attribute.dominant !== true;
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

    if (isContentType(definition)) {
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

    const componentAttributes = Object.keys(definition.attributes).filter(key =>
      isComponentOrDynamicZone(definition.attributes[key])
    );

    const scalarAttributes = Object.keys(definition.attributes).filter(key => {
      return isScalarAttribute(definition.attributes[key]);
    });

    const relationalAttributes = Object.keys(definition.attributes).filter(key => {
      return isRelationalAttribute(definition.attributes[key]);
    });

    // handle component and dynamic zone attrs
    if (componentAttributes.length > 0) {
      // create join morph collection thingy
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
        // no require constraint to allow components in drafts
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

    /*
        Override populate path for polymorphic association.
        It allows us to make Upload.find().populate('related')
        instead of Upload.find().populate('related.item')
      */
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
        // Remover $numberDecimal nested property.

        Object.keys(returned)
          .filter(key => returned[key] instanceof mongoose.Types.Decimal128)
          .forEach(key => {
            // Parse to float number.
            returned[key] = parseFloat(returned[key].toString());
          });

        morphAssociations.forEach(association => {
          if (
            Array.isArray(returned[association.alias]) &&
            returned[association.alias].length > 0
          ) {
            // Reformat data by bypassing the many-to-many relationship.
            switch (association.nature) {
              case 'oneMorphToOne':
                returned[association.alias] = refToStrapiRef(returned[association.alias][0]);
                break;
              case 'manyMorphToMany':
              case 'manyMorphToOne': {
                returned[association.alias] = returned[association.alias].map(obj =>
                  refToStrapiRef(obj)
                );
                break;
              }
              default:
                break;
            }
          }
        });

        componentAttributes.forEach(name => {
          processComponentAttribute(name, definition, returned, parseComponentRef, parseDynamicZoneRef);
        });

        associations.forEach(association => {
          processAssociation(association, returned);
        });
      },
    };

    // Instantiate model.
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

    // Only sync indexes when not in production env while it's not possible to create complex indexes directly from models
    // In production it will simply create missing indexes (those defined in the models but not present in db)
    if (strapi.app.env !== 'production') {
      // Ensure indexes are synced with the model, prevent duplicate index errors
      // Side-effect: Delete all the indexes not present in the model.json
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

  /**
   * Process a component attribute during transformation
   * @param {string} name - Attribute name
   * @param {Object} definition - Model definition
   * @param {Object} returned - Returned object
   * @param {Function} parseComponentRef - Component reference parser
   * @param {Function} parseDynamicZoneRef - Dynamic zone reference parser
   */
  const processComponentAttribute = (name, definition, returned, parseComponentRef, parseDynamicZoneRef) => {
    const attribute = definition.attributes[name];
    const { type } = attribute;

    if (type === 'component') {
      if (Array.isArray(returned[name])) {
        const components = returned[name].map(parseComponentRef);
        // Reformat data by bypassing the many-to-many relationship.
        returned[name] =
          attribute.repeatable === true ? components : _.first(components) || null;
      }
    }

    if (type === 'dynamiczone') {
      if (!returned[name]) return;
      
      returned[name] = returned[name]
        .filter(el => el && el.kind)
        .map(el => {
          return {
            __component: findComponentByGlobalId(el.kind).uid,
            ...parseDynamicZoneRef(el),
          };
        });
    }
  };

  /**
   * Process an association during transformation
   * @param {Object} association - The association
   * @param {Object} returned - Returned object
   */
  const processAssociation = (association, returned) => {
    const relation = returned[association.alias];
    if (!relation) return;

    // Extract raw JSON data.
    returned[association.alias] = relation.toJSON ? relation.toJSON() : relation;

    if (!_.isArray(association.populate)) return;

    const { alias, populate } = association;
    const pickPopulate = entry => _.pick(entry, populate);

    returned[alias] = _.isArray(returned[alias])
      ? _.map(returned[alias], pickPopulate)
      : pickPopulate(returned[alias]);
  };

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

    if (!definitionDidChange) continue;
    
    await storeDefinition(definition, instance);
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

    if (_populateMorphRelations) {
      processMorphRelations(morphAssociations, populatedPaths, publicationState, getMatchQuery, this);
    }

    if (_populateComponents) {
      componentAttributes.forEach(key => {
        this.populate({ path: `${key}.ref`, options: { publicationState } });
      });
    }

    if (definition.modelType !== 'component') return;
    
    definition.associations
      .filter(assoc => !isPolymorphicAssoc(assoc))
      .filter(shouldAutoPopulate)
      .forEach(ast => {
        this.populate({
          path: ast.alias,
          match: getMatchQuery(ast),
          options: { publicationState, _populateComponents: false },
        });
      });
  };
};

/**
 * Process morph relations population
 * @param {Array} morphAssociations - Morph associations
 * @param {Array} populatedPaths - Populated paths
 * @param {string} publicationState - Publication state
 * @param {Function} getMatchQuery - Function to get match query
 * @param {Object} context - The mongoose context
 */
const processMorphRelations = (morphAssociations, populatedPaths, publicationState, getMatchQuery, context) => {
  morphAssociations.forEach(association => {
    const matchQuery = getMatchQuery(association);
    const { alias, nature } = association;

    if (isOneToManyOrManyToManyMorph(nature)) {
      context.populate({ path: alias, match: matchQuery, options: { publicationState } });
      return;
    }
    
    if (!isPathPopulated(populatedPaths, alias)) return;

    _.set(context._mongooseOptions.populate, [alias, 'path'], `${alias}.ref`);
    _.set(context._mongooseOptions.populate, [alias, 'options'], {
      publicationState,
    });

    if (matchQuery === undefined) return;
    
    _.set(context._mongooseOptions.populate, [alias, 'match'], matchQuery);
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
      processHasManyRelation(definition, attribute, name, getRef, setField, ObjectId);
      break;
    }
    case 'belongsTo': {
      processBelongsToRelation(definition, attribute, name, getRef, setField, ObjectId);
      break;
    }
    case 'belongsToMany': {
      processBelongsToManyRelation(definition, attribute, name, getRef, setField, ObjectId);
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

/**
 * Process hasMany relation
 * @param {Object} definition - Model definition
 * @param {Object} attribute - The attribute
 * @param {string} name - Field name
 * @param {Function} getRef - Reference getter
 * @param {Function} setField - Field setter
 * @param {Object} ObjectId - Mongoose ObjectId type
 */
const processHasManyRelation = (definition, attribute, name, getRef, setField, ObjectId) => {
  const FK = _.find(definition.associations, {
    alias: name,
  });

  const ref = getRef(attribute.collection, attribute.plugin);

  if (!FK) {
    setField(name, [{ type: ObjectId, ref }]);
    return;
  }

  setField(name, {
    type: 'virtual',
    ref,
    via: FK.via,
    justOne: false,
  });

  // Set this info to be able to see if this field is a real database's field.
  attribute.isVirtual = true;
};

/**
 * Process belongsTo relation
 * @param {Object} definition - Model definition
 * @param {Object} attribute - The attribute
 * @param {string} name - Field name
 * @param {Function} getRef - Reference getter
 * @param {Function} setField - Field setter
 * @param {Object} ObjectId - Mongoose ObjectId type
 */
const processBelongsToRelation = (definition, attribute, name, getRef, setField, ObjectId) => {
  const FK = _.find(definition.associations, {
    alias: name,
  });

  const ref = getRef(attribute.model, attribute.plugin);

  if (!FK) {
    setField(name, { type: ObjectId, ref });
    return;
  }

  if (isValidVirtualNature(FK.nature)) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
      justOne: true,
    });

    // Set this info to be able to see if this field is a real database's field.
    attribute.isVirtual = true;
    return;
  }

  setField(name, { type: ObjectId, ref });
};

/**
 * Process belongsToMany relation
 * @param {Object} definition - Model definition
 * @param {Object} attribute - The attribute
 * @param {string} name - Field name
 * @param {Function} getRef - Reference getter
 * @param {Function} setField - Field setter
 * @param {Object} ObjectId - Mongoose ObjectId type
 */
const processBelongsToManyRelation = (definition, attribute, name, getRef, setField, ObjectId) => {
  const ref = getRef(attribute.collection, attribute.plugin);

  if (attribute.nature === 'manyWay') {
    setField(name, [{ type: ObjectId, ref }]);
    return;
  }

  const FK = _.find(definition.associations, {
    alias: name,
  });

  // One-side of the relationship has to be a virtual field to be bidirectional.
  if (isOneSideWithoutViaOrDominant(FK, attribute)) {
    setField(name, {
      type: 'virtual',
      ref,
      via: FK.via,
    });

    // Set this info to be able to see if this field is a real database's field.
    attribute.isVirtual = true;
    return;
  }

  setField(name, [{ type: ObjectId, ref }]);
};