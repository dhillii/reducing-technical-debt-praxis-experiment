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