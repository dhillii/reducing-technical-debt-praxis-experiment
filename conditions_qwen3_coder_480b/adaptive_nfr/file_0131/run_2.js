import { fromJS, List } from 'immutable';
import pluralize from 'pluralize';
import { snakeCase } from 'lodash';
import makeUnique from '../../utils/makeUnique';
import { createComponentUid } from './utils/createUid';
import { shouldPluralizeName, shouldPluralizeTargetAttribute } from './utils/relations';
import * as actions from './constants';

const initialState = fromJS({
  formErrors: {},
  modifiedData: {},
  initialData: {},
  componentToCreate: {},
  isCreatingComponentWhileAddingAField: false,
});

const isDateType = (type) => ['date', 'datetime', 'time'].includes(type);

const shouldRemoveDefaultKey = (hasDefaultValue, keys, previousType) => {
  return hasDefaultValue && keys.length === 1 && keys.includes('type') && previousType && isDateType(previousType);
};

const updateRelationNature = (obj, value) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => {
      if (value === 'manyToMany') {
        return true;
      }

      return null;
    });
};

const updateRelationName = (obj, value) => {
  return obj.update('name', oldValue => {
    return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
  });
};

const updateRelationTargetAttribute = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj.update('targetAttribute', oldValue => {
    if (['oneWay', 'manyWay'].includes(value)) {
      return '-';
    }

    return pluralize(
      oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
      shouldPluralizeTargetAttribute(value)
    );
  });
};

const updateRelationTargetColumnName = (obj, value) => {
  return obj.update('targetColumnName', oldValue => {
    if (['oneWay', 'manyWay'].includes(value)) {
      return null;
    }

    return oldValue;
  });
};

const handleNatureChange = (obj, action) => {
  const { value, oneThatIsCreatingARelationWithAnother } = action;
  
  return updateRelationNature(obj, value)
    .update('name', oldValue => {
      return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
    })
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }

      return pluralize(
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }

      return oldValue;
    });
};

const isRestrictedRelation = (targetContentTypeAllowedRelations, currentNature) => {
  return targetContentTypeAllowedRelations !== null && 
         !targetContentTypeAllowedRelations.includes(currentNature);
};

const getUpdatedNature = (obj, action) => {
  const { targetContentTypeAllowedRelations } = action;
  const currentNature = obj.get('nature');
  
  if (isRestrictedRelation(targetContentTypeAllowedRelations, currentNature)) {
    return targetContentTypeAllowedRelations[0];
  }
  
  return currentNature;
};

const getUpdatedName = (obj, action, didChangeNature) => {
  const { selectedContentTypeFriendlyName, targetContentTypeAllowedRelations } = action;
  const nature = didChangeNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
  
  return pluralize(
    snakeCase(selectedContentTypeFriendlyName),
    shouldPluralizeName(nature)
  );
};

const isOneOrManyWay = (nature) => ['oneWay', 'manyWay'].includes(nature);

const getUpdatedTargetAttribute = (obj, action, didChangeNature) => {
  const { oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations } = action;
  const nature = obj.get('nature');
  
  if (isOneOrManyWay(nature)) {
    return '-';
  }

  if (didChangeNature && isOneOrManyWay(targetContentTypeAllowedRelations[0])) {
    return '-';
  }

  return pluralize(
    snakeCase(oneThatIsCreatingARelationWithAnother),
    shouldPluralizeTargetAttribute(nature)
  );
};

const handleTargetChange = (obj, action) => {
  const { value } = action;
  const targetContentTypeAllowedRelations = action.targetContentTypeAllowedRelations;
  let didChangeNature = false;
  
  const updatedObj = obj
    .update('target', () => value)
    .update('nature', currentNature => {
      if (isRestrictedRelation(targetContentTypeAllowedRelations, currentNature)) {
        didChangeNature = true;
        return targetContentTypeAllowedRelations[0];
      }
      
      return currentNature;
    });
    
  return updatedObj
    .update('name', () => getUpdatedName(updatedObj, action, didChangeNature))
    .update('targetAttribute', () => getUpdatedTargetAttribute(updatedObj, action, didChangeNature));
};

const isAllAllowedType = (name) => name === 'all';

const handleAllAllowedType = (state, action) => {
  return state.updateIn(['modifiedData', 'allowedTypes'], () => {
    if (action.value) {
      return fromJS(['images', 'videos', 'files']);
    }

    return null;
  });
};

const updateAllowedTypesList = (currentList, name) => {
  let list = currentList || fromJS([]);
  
  if (list.includes(name)) {
    list = list.filter(v => v !== name);

    if (list.size === 0) {
      return null;
    }

    return list;
  }

  return list.push(name);
};

const handleSpecificAllowedType = (state, action) => {
  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    return updateAllowedTypesList(currentList, action.name);
  });
};

const handleOnChangeAllowedType = (state, action) => {
  if (isAllAllowedType(action.name)) {
    return handleAllAllowedType(state, action);
  }
  
  return handleSpecificAllowedType(state, action);
};

const isComponentAttribute = (attributeType, step) => attributeType === 'component' && step === '1';

const isSimpleComponentAttribute = (attributeType, step) => attributeType === 'component' && step !== '1';

const isDynamicZoneAttribute = (attributeType) => attributeType === 'dynamiczone';

const isTextAttribute = (attributeType) => attributeType === 'text';

const isNumberOrDateAttribute = (attributeType) => attributeType === 'number' || attributeType === 'date';

const isMediaAttribute = (attributeType) => attributeType === 'media';

const isEnumerationAttribute = (attributeType) => attributeType === 'enumeration';

const isRelationAttribute = (attributeType) => attributeType === 'relation';

const getDataForComponentStep1 = (options) => ({
  type: 'component',
  createComponent: true,
  componentToCreate: { type: 'component' },
});

const getDataForComponentOtherSteps = (options) => ({
  ...options,
  type: 'component',
  repeatable: true,
});

const getDataForDynamicZone = (options) => ({
  ...options,
  type: 'dynamiczone',
  components: [],
});

const getDataForText = (options) => ({ ...options, type: 'string' });

const getDataForNumberOrDate = (options) => options;

const getDataForMedia = (options) => ({
  allowedTypes: ['images', 'files', 'videos'],
  type: 'media',
  multiple: true,
  ...options,
});

const getDataForEnumeration = (options) => ({ ...options, type: 'enumeration', enum: [] });

const getDataForRelation = (nameToSetForRelation, targetUid) => ({
  name: snakeCase(nameToSetForRelation),
  nature: 'oneWay',
  targetAttribute: '-',
  target: targetUid,
  unique: false,
  dominant: null,
  columnName: null,
  targetColumnName: null,
});

const getDataForDefaultAttribute = (attributeType, options) => ({ ...options, type: attributeType, default: null });

const getDataToSet = (action) => {
  const {
    attributeType,
    step,
    options = {},
    nameToSetForRelation,
    targetUid,
  } = action;

  if (isComponentAttribute(attributeType, step)) {
    return getDataForComponentStep1(options);
  }
  
  if (isSimpleComponentAttribute(attributeType, step)) {
    return getDataForComponentOtherSteps(options);
  }
  
  if (isDynamicZoneAttribute(attributeType)) {
    return getDataForDynamicZone(options);
  }
  
  if (isTextAttribute(attributeType)) {
    return getDataForText(options);
  }
  
  if (isNumberOrDateAttribute(attributeType)) {
    return getDataForNumberOrDate(options);
  }
  
  if (isMediaAttribute(attributeType)) {
    return getDataForMedia(options);
  }
  
  if (isEnumerationAttribute(attributeType)) {
    return getDataForEnumeration(options);
  }
  
  if (isRelationAttribute(attributeType)) {
    return getDataForRelation(nameToSetForRelation, targetUid);
  }
  
  return getDataForDefaultAttribute(attributeType, options);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        let updatedList = list;

        if (shouldAddComponents) {
          updatedList = list.concat(components);
        } else {
          updatedList = list.filter(comp => {
            return components.indexOf(comp) === -1;
          });
        }

        return List(makeUnique(updatedList.toJS()));
      });
    }
    case actions.ON_CHANGE:
      return state.update('modifiedData', obj => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
        } = action;
        const hasDefaultValue = Boolean(obj.getIn(['default']));
        const previousType = obj.getIn(['type']);

        if (shouldRemoveDefaultKey(hasDefaultValue, keys, previousType)) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (keys.length === 1 && keys.includes('nature')) {
          return handleNatureChange(obj, action);
        }

        if (keys.length === 1 && keys.includes('target')) {
          return handleTargetChange(obj, action);
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      return handleOnChangeAllowedType(state, action);
    }
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO: {
      // This is run when the user doesn't want to create a new component
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    }
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA: {
      // This is run when the user has created a new component
      const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
      const modifiedData = fromJS({
        name: componentToCreate.get('name'),
        type: 'component',
        repeatable: false,
        ...action.options,
        component: createComponentUid(
          componentToCreate.get('name'),
          componentToCreate.get('category')
        ),
      });

      return initialState
        .update('componentToCreate', () => componentToCreate)
        .update('modifiedData', () => modifiedData)
        .update('isCreatingComponentWhileAddingAField', () =>
          state.getIn(['modifiedData', 'createComponent'])
        );
    }
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ: {
      const createdDZ = state.get('modifiedData');
      const dataToSet = createdDZ
        .set('createComponent', true)
        .set('componentToCreate', fromJS({ type: 'component' }));

      return initialState.update('modifiedData', () => dataToSet);
    }
    case actions.SET_DATA_TO_EDIT: {
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    }
    case actions.SET_ATTRIBUTE_DATA_SCHEMA: {
      const {
        isEditing,
        modifiedDataToSetForEditing,
      } = action;

      if (isEditing) {
        return state
          .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
          .update('initialData', () => fromJS(modifiedDataToSetForEditing));
      }

      const dataToSet = getDataToSet(action);

      return state.update('modifiedData', () => fromJS(dataToSet));
    }
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA: {
      return state
        .update('modifiedData', () => fromJS(action.attributeToEdit))
        .update('initialData', () => fromJS(action.attributeToEdit));
    }

    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

export default reducer;
export { initialState };