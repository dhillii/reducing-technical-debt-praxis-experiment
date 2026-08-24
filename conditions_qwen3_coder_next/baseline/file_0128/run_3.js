// Clear relations to refModel
            const reverseAssoc = refModel.associations?.find(assoc => assoc.alias === obj.field);
            if (reverseAssoc && reverseAssoc.nature === 'oneToManyMorph') {