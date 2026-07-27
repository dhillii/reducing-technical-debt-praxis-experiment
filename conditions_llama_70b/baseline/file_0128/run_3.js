// Clear relations to refModel
const reverseAssoc = refModel.associations.find(assoc => assoc.alias === obj.field);
if (reverseAssoc?.nature === 'oneToManyMorph') {
  relationUpdates.push(
    removeRelationMorph(
      this,
      {
        alias: association.alias,
        ref: obj.kind || refModel.globalId,
        refId: new mongoose.Types.ObjectId(obj.refId),
        field: obj.field,
        filter: association.filter,
      },
      { session }
    )
      .then(createRelation)
      .then(() => {
        // set field inside refModel
        return refModel.updateMany(
          {
            [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
          },
          {
            [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]),
          },
          { session }
        );
      })
  );
} else {
  relationUpdates.push(
    createRelation().then(() => {
      // push to field inside refModel
      return refModel.updateMany(
        {
          [refModel.primaryKey]: new mongoose.Types.ObjectId(obj.refId),
        },
        {
          $push: { [obj.field]: new mongoose.Types.ObjectId(entry[this.primaryKey]) },
        },
        { session }
      );
    })
  );
}

// ...

case 'manyMorphToMany':
case 'manyMorphToOne': {
  // delete relation inside of the ref model
  // console.log(entry[association.alias]);

  if (Array.isArray(entry[association.alias])) {
    return Promise.all(
      entry[association.alias].map(val => {
        const targetModel = strapi.db.getModelByGlobalId(val.kind);

        // ignore them ghost relations
        if (!targetModel) return;

        const field = val[association.filter];
        const reverseAssoc = targetModel.associations.find(
          assoc => assoc.alias === field
        );

        if (reverseAssoc?.nature === 'oneToManyMorph') {
          return targetModel.updateMany(
            {
              [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
            },
            {
              [field]: null,
            },
            { session }
          );
        }

        return targetModel.updateMany(
          {
            [targetModel.primaryKey]: val.ref && (val.ref._id || val.ref),
          },
          {
            $pull: { [field]: primaryKeyValue },
          },
          { session }
        );
      })
    );
  }

  return;
}