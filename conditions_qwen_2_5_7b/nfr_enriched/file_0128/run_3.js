```javascript
'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const _ = require('lodash');
const mongoose = require('mongoose');

// Utils
const {
  models: { getValuePrimaryKey },
} = require('strapi-utils');

const transformToArrayID = (array, pk) => {
  if (_.isArray(array)) {
    return array
      .map(value => value && (getValuePrimaryKey(value, pk) || value))
      .filter(n => n)
      .map(val => _.toString(val));
  }

  return transformToArrayID([array]);
};

const removeUndefinedKeys = (obj = {}) => _.pickBy(obj, _.negate(_.isUndefined));

const addRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  await model.updateMany(
    {
      [model.primaryKey]: id,
    },
    {
      $push: {
        [alias]: {
          ref: new mongoose.Types.ObjectId(refId),
          kind: ref,
          [filter]: field,
        },
      },
    },
    { session }
  );
};

const removeRelationMorph = async (model, params, { session = null } = {}) => {
  const { alias } = params;

  let opts;
  // if entry id is provided simply query it
  if (params.id) {
    opts = {
      _id: params.id,
    };
  } else {
    opts = {
      [alias]: {
        $elemMatch: {
          ref: params.refId,
          kind: params.ref,
          [params.filter]: params.field,
        },
      },
    };
  }

  await model.updateMany(
    opts,
    {
      $pull: {
        [alias]: {
          ref: params.refId,
          kind: params.ref,
          [params.filter]: params.field,
        },
      },
    },
    { session }
  );
};

const updateSimpleAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];

  if (_.get(details, 'isVirtual') !== true) {
    if (currentValue === newValue) return;

    if (_.isNull(newValue)) {
      const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
      await assocModel.updateOne(
        {
          [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
        },
        { [details.via]: null },
        { session }
      );
      return _.set(entry, attribute, null);
    }

    const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);
    await assocModel.updateOne(
      {
        [assocModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
      },
      { [details.via]: primaryKeyValue },
      { session }
    );
    return _.set(entry, attribute, newValue);
  }
};

const updateOneToOneAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    await assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );
    return _.set(entry, attribute, null);
  }

  await assocModel.updateOne(
    {
      [assocModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
    },
    { [details.via]: primaryKeyValue },
    { session }
  );
  return _.set(entry, attribute, newValue);
};

const updateOneToManyAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  await assocModel.updateMany(
    {
      [assocModel.primaryKey]: {
        $in: toRemove.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    { [details.via]: null },
    { session }
  );

  await assocModel.updateMany(
    {
      [assocModel.primaryKey]: {
        $in: newValue.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    { [details.via]: primaryKeyValue },
    { session }
  );
  return entry;
};

const updateManyToOneAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    await assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );
    return _.set(entry, attribute, null);
  }

  await assocModel.updateOne(
    {
      [assocModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
    },
    { [details.via]: primaryKeyValue },
    { session }
  );
  return _.set(entry, attribute, newValue);
};

const updateManyToManyAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const toAdd = _.differenceWith(newValue, currentValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  const toRemove = _.differenceWith(currentValue, newValue, (a, b) => {
    return `${a[assocModel.primaryKey] || a}` === `${b[assocModel.primaryKey] || b}`;
  });

  await assocModel.updateMany(
    {
      [assocModel.primaryKey]: {
        $in: toRemove.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    {
      $pull: {
        [details.via]: new mongoose.Types.ObjectId(primaryKeyValue),
      },
    },
    { session }
  );

  await assocModel.updateMany(
    {
      [assocModel.primaryKey]: {
        $in: toAdd.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    {
      $addToSet: { [details.via]: [primaryKeyValue] },
    },
    { session }
  );
  return entry;
};

const updateManyMorphToManyAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  newValue.forEach(obj => {
    const refModel = strapi.db.getModel(obj.ref, obj.source);

    const createRelation = () => {
      return addRelationMorph(
        this,
        {
          id: entry[this.primaryKey],
          alias: details.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: details.filter,
        },
        { session }
      );
    };

    // Clear relations to refModel
    const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
    if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {
      await removeRelationMorph(
        this,
        {
          id: entry[this.primaryKey],
          alias: details.alias,
          ref: obj.kind || refModel.globalId,
          refId: new mongoose.Types.ObjectId(obj.refId),
          field: obj.field,
          filter: details.filter,
        },
        { session }
      ).then(createRelation).then(() => {
        return refModel.updateMany(
          {
            [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
          },
          {
            [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
          },
          { session }
        );
      });
    } else {
      await createRelation().then(() => {
        return refModel.updateMany(
          {
            [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
          },
          {
            $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
          },
          { session }
        );
      });
    }
  });
  return entry;
};

const updateOneToManyMorphAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  await Promise.all(
    toAdd.map(id => {
      return addRelationMorph(
        assocModel,
        {
          id,
          alias: details.via,
          ref: this.globalId,
          refId: entry._id,
          field: details.alias,
          filter: details.filter,
        },
        { session }
      );
    })
  );

  toRemove.forEach(id => {
    removeRelationMorph(
      assocModel,
      {
        id,
        alias: details.via,
        ref: this.globalId,
        refId: entry._id,
        field: details.alias,
        filter: details.filter,
      },
      { session }
    );
  });
  return entry;
};

const updateManyToManyMorphAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  const currentIds = transformToArrayID(currentValue, this.primaryKey);
  const newIds = transformToArrayID(newValue, this.primaryKey);

  const toAdd = _.difference(newIds, currentIds);
  const toRemove = _.difference(currentIds, newIds);

  await Promise.all(
    toAdd.map(id => {
      return addRelationMorph(
        assocModel,
        {
          id,
          alias: details.via,
          ref: this.globalId,
          refId: entry._id,
          field: details.alias,
          filter: details.filter,
        },
        { session }
      );
    })
  );

  toRemove.forEach(id => {
    removeRelationMorph(
      assocModel,
      {
        id,
        alias: details.via,
        ref: this.globalId,
        refId: entry._id,
        field: details.alias,
        filter: details.filter,
      },
      { session }
    );
  });
  return entry;
};

const updateOneMorphToOneAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    await assocModel.updateOne(
      {
        [assocModel.primaryKey]: getValuePrimaryKey(currentValue, assocModel.primaryKey),
      },
      { [details.via]: null },
      { session }
    );
    return _.set(entry, attribute, null);
  }

  await assocModel.updateOne(
    {
      [assocModel.primaryKey]: new mongoose.Types.ObjectId(newValue),
    },
    { [details.via]: primaryKeyValue },
    { session }
  );
  return _.set(entry, attribute, newValue);
};

const updateOneMorphToManyAttribute = async (entry, attribute, newValue, primaryKeyValue, session) => {
  const currentValue = entry[attribute];
  const details = this._attributes[attribute];
  const assocModel = strapi.db.getModel(details.model || details.collection, details.plugin);

  if (currentValue === newValue) return;

  if (_.isNull(newValue)) {
    await assocModel.updateMany(
      {
        [assocModel.primaryKey]: {
          $in: currentValue.map(
            val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
          ),
        },
      },
      {
        $pull: {
          [details.via]: new mongoose.Types.ObjectId(primaryKeyValue),
        },
      },
      { session }
    );
    return _.set(entry, attribute, null);
  }

  await assocModel.updateMany(
    {
      [assocModel.primaryKey]: {
        $in: newValue.map(
          val => new mongoose.Types.ObjectId(val[assocModel.primaryKey] || val)
        ),
      },
    },
    {
      $addToSet: { [details.via]: [primaryKeyValue] },
    },
    { session }
  );
  return _.set(entry, attribute, newValue);
};

const update(params, { session = null } = {}) {
  const relationUpdates = [];
  const populate = this.associations.map(x => x.alias);
  const primaryKeyValue = getValuePrimaryKey(params, this.primaryKey);

  const entry = await this.findOne({ [this.primaryKey]: primaryKeyValue })
    .session(session)
    .populate(populate)
    .lean();

  // Only update fields which are on this document.
  const values = Object.keys(removeUndefinedKeys(params.values)).reduce((acc, attribute) => {
    const currentValue = entry[attribute];
    const newValue = params.values[attribute];

    const association = this.associations.find(x => x.alias === attribute);

    const details = this._attributes[attribute];

    // set simple attributes
    if (!association && _.get(details, 'isVirtual') !== true) {
      return _.set(acc, attribute, newValue);
    }

    switch (association.nature) {
      case 'oneWay':
        return updateSimpleAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToOne':
        return updateOneToOneAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToOne':
        return updateOneToOneAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToOne':
        return updateOneToOneAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue, session);
      case 'oneToMany':
        return updateOneToManyAttribute(entry, attribute, newValue, primaryKeyValue