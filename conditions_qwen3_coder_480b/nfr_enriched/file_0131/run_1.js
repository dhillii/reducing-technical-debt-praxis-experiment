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

/**
 * Handles updating the modified data when a field value changes
 */
const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;
    const hasDefaultValue = Boolean(obj.getIn(['default']));

    if (needsToRemoveDefault(hasDefaultValue, keys)) {
      const previousType = obj.getIn(['type']);
      
      if (isDateType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isNatureKeyUpdate(keys)) {
      return updateNatureRelatedFields(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (isTargetKeyUpdate(keys)) {
      return updateTargetRelatedFields(obj, action, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother);
    }

    return obj.updateIn(keys, () => value);
  });
};

/**
 * Checks if we need to remove the default value based on keys and presence of default
 */
const needsToRemoveDefault = (hasDefaultValue, keys) => {
  return hasDefaultValue && keys.length === 1 && keys.includes('type');
};

/**
 * Checks if the type is a date-related type
 */
const isDateType = (type) => {
  return type && ['date', 'datetime', 'time'].includes(type);
};

/**
 * Checks if the update is for the 'nature' key
 */
const isNatureKeyUpdate = (keys) => {
  return keys.length === 1 && keys.includes('nature');
};

/**
 * Updates fields related to nature changes
 */
const updateNatureRelatedFields = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => getDominantValue(value))
    .update('name', oldValue => pluralizeName(oldValue, value))
    .update('targetAttribute', oldValue => updateTargetAttribute(oldValue, value, oneThatIsCreatingARelationWithAnother))
    .update('targetColumnName', oldValue => updateTargetColumnName(oldValue, value));
};

/**
 * Gets the dominant value based on nature
 */
const getDominantValue = (nature) => {
  return nature === 'manyToMany' ? true : null;
};

/**
 * Pluralizes the name based on nature
 */
const pluralizeName = (oldValue, nature) => {
  return pluralize(snakeCase(oldValue), shouldPluralizeName(nature));
};

/**
 * Updates the target attribute based on nature
 */
const updateTargetAttribute = (oldValue, nature, oneThatIsCreatingARelationWithAnother) => {
  if (['oneWay', 'manyWay'].includes(nature)) {
    return '-';
  }

  return pluralize(
    oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
    shouldPluralizeTargetAttribute(nature)
  );
};

/**
 * Updates the target column name based on nature
 */
const updateTargetColumnName = (oldValue, nature) => {
  if (['oneWay', 'manyWay'].includes(nature)) {
    return null;
  }

  return oldValue;
};

/**
 * Checks if the update is for the 'target' key
 */
const isTargetKeyUpdate = (keys) => {
  return keys.length === 1 && keys.includes('target');
};

/**
 * Updates fields related to target changes
 */
const updateTargetRelatedFields = (obj, action, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother) => {
  const { targetContentTypeAllowedRelations, value } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  return obj
    .update('target', () => value)
    .update('nature', currentNature => {
      if (targetContentTypeAllowedRelations === null) {
        return currentNature;
      }

      if (!targetContentTypeAllowedRelations.includes(currentNature)) {
        didChangeNatureBecauseOfRestrictedRelation = true;
        return targetContentTypeAllowedRelations[0];
      }

      return currentNature;
    })
    .update('name', () => updateNameField(obj, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation))
    .update('targetAttribute', () => updateTargetAttributeField(obj, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation));
};

/**
 * Updates the name field based on various conditions
 */
const updateNameField = (obj, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, didChangeNature) => {
  if (didChangeNature) {
    return pluralize(
      snakeCase(selectedContentTypeFriendlyName),
      shouldPluralizeName(targetContentTypeAllowedRelations[0])
    );
  }

  return pluralize(
    snakeCase(selectedContentTypeFriendlyName),
    shouldPluralizeName(obj.get('nature'))
  );
};

/**
 * Updates the target attribute field based on various conditions
 */
const updateTargetAttributeField = (obj, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations, didChangeNature) => {
  const nature = obj.get('nature');
  
  if (['oneWay', 'manyWay'].includes(nature)) {
    return '-';
  }

  if (
    didChangeNature &&
    targetContentTypeAllowedRelations &&
    ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
  ) {
    return '-';
  }

  return pluralize(
    snakeCase(oneThatIsCreatingARelationWithAnother),
    shouldPluralizeTargetAttribute(nature)
  );
};

/**
 * Handles adding/removing components to dynamic zone
 */
const handleAddComponentsToDynamicZone = (state, action) => {
  const { name, components, shouldAddComponents } = action;

  return state.updateIn(['modifiedData', name], list => {
    let updatedList = list;

    if (shouldAddComponents) {
      updatedList = list.concat(components);
    } else {
      updatedList = list.filter(comp => !components.includes(comp));
    }

    return List(makeUnique(updatedList.toJS()));
  });
};

/**
 * Handles changing allowed types
 */
const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      if (action.value) {
        return fromJS(['images', 'videos', 'files']);
      }

      return null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    return updateAllowedTypesList(currentList, action);
  });
};

/**
 * Updates the allowed types list
 */
const updateAllowedTypesList = (currentList, action) => {
  let list = currentList || fromJS([]);

  if (list.includes(action.name)) {
    list = list.filter(v => v !== action.name);

    if (list.size === 0) {
      return null;
    }

    return list;
  }

  return list.push(action.name);
};

/**
 * Sets data for editing
 */
const setAttributeDataSchema = (state, action) => {
  const {
    attributeType,
    isEditing,
    modifiedDataToSetForEditing,
    nameToSetForRelation,
    targetUid,
    step,
    options = {},
  } = action;

  if (isEditing) {
    return state
      .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
      .update('initialData', () => fromJS(modifiedDataToSetForEditing));
  }

  const dataToSet = getDataToSetForAttribute(attributeType, step, options, nameToSetForRelation, targetUid);
  
  return state.update('modifiedData', () => fromJS(dataToSet));
};

/**
 * Gets the data to set based on attribute type
 */
const getDataToSetForAttribute = (attributeType, step, options, nameToSetForRelation, targetUid) => {
  if (attributeType === 'component') {
    return getComponentData(step, options);
  }
  
  if (attributeType === 'dynamiczone') {
    return { ...options, type: 'dynamiczone', components: [] };
  }
  
  if (attributeType === 'text') {
    return { ...options, type: 'string' };
  }
  
  if (attributeType === 'number' || attributeType === 'date') {
    return options;
  }
  
  if (attributeType === 'media') {
    return getMediaData(options);
  }
  
  if (attributeType === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }
  
  if (attributeType === 'relation') {
    return getRelationData(nameToSetForRelation, targetUid);
  }
  
  return { ...options, type: attributeType, default: null };
};

/**
 * Gets component data based on step
 */
const getComponentData = (step, options) => {
  if (step === '1') {
    return {
      type: 'component',
      createComponent: true,
      componentToCreate: { type: 'component' },
    };
  }
  
  return {
    ...options,
    type: 'component',
    repeatable: true,
  };
};

/**
 * Gets media data with defaults
 */
const getMediaData = (options) => {
  return {
    allowedTypes: ['images', 'files', 'videos'],
    type: 'media',
    multiple: true,
    ...options,
  };
};

/**
 * Gets relation data structure
 */
const getRelationData = (nameToSetForRelation, targetUid) => {
  return {
    name: snakeCase(nameToSetForRelation),
    nature: 'oneWay',
    targetAttribute: '-',
    target: targetUid,
    unique: false,
    dominant: null,
    columnName: null,
    targetColumnName: null,
  };
};

/**
 * Resets props and sets form for adding existing component
 */
const resetPropsAndSetFormForAddingExistingCompo = (state, action) => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
};

/**
 * Resets props and saves current data
 */
const resetPropsAndSaveCurrentData = (state, action) => {
  const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
  const modifiedData = fromJS(getModifiedDataForComponent(componentToCreate, action.options));

  return initialState
    .update('componentToCreate', () => componentToCreate)
    .update('modifiedData', () => modifiedData)
    .update('isCreatingComponentWhileAddingAField', () =>
      state.getIn(['modifiedData', 'createComponent'])
    );
};

/**
 * Gets modified data for component creation
 */
const getModifiedDataForComponent = (componentToCreate, options) => {
  return {
    name: componentToCreate.get('name'),
    type: 'component',
    repeatable: false,
    ...options,
    component: createComponentUid(
      componentToCreate.get('name'),
      componentToCreate.get('category')
    ),
  };
};

/**
 * Resets props and sets form for adding component to dynamic zone
 */
const resetPropsAndSetFormForAddingCompoToDZ = (state, action) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);
      
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
      
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
      
    case actions.RESET_PROPS:
      return initialState;
      
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return resetPropsAndSetFormForAddingExistingCompo(state, action);
      
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return resetPropsAndSaveCurrentData(state, action);
      
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return resetPropsAndSetFormForAddingCompoToDZ(state, action);
      
    case actions.SET_DATA_TO_EDIT: {
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    }
    
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return setAttributeDataSchema(state, action);
      
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