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

const updateRelation = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  if (params.id) {
    await model.updateOne(
      { [model.primaryKey]: params.id },
      { [alias]: null },
      { session }
    );
  } else {
    await model.updateMany(
      {
        [alias]: {
          $elemMatch: {
            ref: refId,
            kind: ref,
            [filter]: field,
          },
        },
      },
      {
        $pull: {
          [alias]: {
            ref: refId,
            kind: ref,
            [filter]: field,
          },
        },
      },
      { session }
    );

    await model.updateOne(
      {
        [model.primaryKey]: refId,
      },
      { [filter]: field },
      { session }
    );
  }
};

const updateVirtuals = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  if (params.id) {
    await model.updateOne(
      { [model.primaryKey]: params.id },
      { [alias]: null },
      { session }
    );
  } else {
    await model.updateMany(
      {
        [alias]: {
          $elemMatch: {
            ref: refId,
            kind: ref,
            [filter]: field,
          },
        },
      },
      {
        $pull: {
          [alias]: {
            ref: refId,
            kind: ref,
            [filter]: field,
          },
        },
      },
      { session }
    );

    await model.updateOne(
      {
        [model.primaryKey]: refId,
      },
      { [filter]: field },
      { session }
    );
  }
};

const updateRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  if (params.id) {
    updatePromises.push(
      model.updateOne(
        { [model.primaryKey]: params.id },
        { [alias]: null },
        { session }
      )
    );
  } else {
    updatePromises.push(
      model.updateMany(
        {
          [alias]: {
            $elemMatch: {
              ref: refId,
              kind: ref,
              [filter]: field,
            },
          },
        },
        {
          $pull: {
            [alias]: {
              ref: refId,
              kind: ref,
              [filter]: field,
            },
          },
        },
        { session }
      )
    );

    updatePromises.push(
      model.updateOne(
        {
          [model.primaryKey]: refId,
        },
        { [filter]: field },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelation = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toAdd.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $addToSet: { [filter]: id },
        },
        { session }
      )
    );
  }

  if (toRemove.length) {
    updatePromises.push(
      model.updateMany(
        {
          [model.primaryKey]: {
            $in: toRemove.map(val => new mongoose.Types.ObjectId(val[ref].toString())),
          },
        },
        {
          $pull: { [filter]: id },
        },
        { session }
      )
    );
  }

  await Promise.all(updatePromises);
};

const updateManyMorphRelationMorph = async (model, params, { session = null } = {}) => {
  const { id, alias, refId, ref, field, filter } = params;

  const updatePromises = [];

  const toAdd = params.newValues.filter(val => !params.currentValues.includes(val));
  const toRemove = params.currentValues.filter(val => !params.newValues.includes(val));

  if (toAdd.length) {
    updatePromises