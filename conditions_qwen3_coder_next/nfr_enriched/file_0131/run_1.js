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
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action
 * Updates the list of components in a dynamic zone
 */
const handleAddComponentsToDynamicZone = (state, { name, components, shouldAddComponents }) => {
  return state.updateIn(['modifiedData', name], list => {
    let updatedList = list;

    if (shouldAddComponents) {
      updatedList = list.concat(components);
    } else {
      updatedList = list.filter(comp => components.indexOf(comp) === -1);
    }

    return List(makeUnique(updatedList.toJS()));
  });
};

/**
 * Handles ON_CHANGE action for nature field changes
 */
const handleNatureChange = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
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

/**
 * Handles ON_CHANGE action for target field changes
 */
const handleTargetChange = (obj, value, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedObj = obj.update('target', () => value);

  const natureValue = updatedObj.update('nature', currentNature => {
    if (targetContentTypeAllowedRelations === null) {
      return currentNature;
    }

    if (!targetContentTypeAllowedRelations.includes(currentNature)) {
      didChangeNatureBecauseOfRestrictedRelation = true;

      return targetContentTypeAllowedRelations[0];
    }

    return currentNature;
  });

  return natureValue
    .update('name', () => {
      if (didChangeNatureBecauseOfRestrictedRelation) {
        return pluralize(
          snakeCase(selectedContentTypeFriendlyName),
          shouldPluralizeName(targetContentTypeAllowedRelations[0])
        );
      }

      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(natureValue.get('nature'))
      );
    })
    .update('targetAttribute', () => {
      const currentNature = natureValue.get('nature');

      if (['oneWay', 'manyWay'].includes(currentNature)) {
        return '-';
      }

      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }

      return pluralize(
        snakeCase(action.oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(currentNature)
      );
    });
};

/**
 * Handles ON_CHANGE action for default value cleanup
 */
const handleDefaultValueCleanup = (obj, keys, value) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));

  if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);

    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }

  return obj;
};

/**
 * Main reducer handler for ON_CHANGE action
 */
const handleOnChange = (state, action) => {
  const { keys, value, oneThatIsCreatingARelationWithAnother } = action;
  const obj = state.get('modifiedData');

  // Handle default value cleanup first
  let updatedObj = handleDefaultValueCleanup(obj, keys, value);

  // Handle nature changes
  if (keys.length === 1 && keys.includes('nature')) {
    updatedObj = handleNatureChange(updatedObj, value, oneThatIsCreatingARelationWithAnother);
  }
  // Handle target changes
  else if (keys.length === 1 && keys.includes('target')) {
    updatedObj = handleTargetChange(updatedObj, value, action);
  }
  // Default update
  else {
    updatedObj = updatedObj.updateIn(keys, () => value);
  }

  return state.update('modifiedData', () => updatedObj);
};

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action
 */
const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);

    if (list.includes(action.name)) {
      list = list.filter(v => v !== action.name);

      if (list.size === 0) {
        return null;
      }

      return list;
    }

    return list.push(action.name);
  });
};

/**
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action
 */
const handleResetPropsAndSetFormForAddingExistingComp = (state, action) => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
};

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action
 */
const handleResetPropsAndSaveCurrentData = (state, action) => {
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
};

/**
 * Handles RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ action
 */
const handleResetPropsAndSetFormForAddingCompToDZ = (state) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
};

/**
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action
 */
const handleSetAttributeDataSchema = (state, action) => {
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

  let dataToSet;

  if (attributeType === 'component') {
    if (step === '1') {
      dataToSet = {
        type: 'component',
        createComponent: true,
        componentToCreate: { type: 'component' },
      };
    } else {
      dataToSet = {
        ...options,
        type: 'component',
        repeatable: true,
      };
    }
  } else if (attributeType === 'dynamiczone') {
    dataToSet = {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
  } else if (attributeType === 'text') {
    dataToSet = { ...options, type: 'string' };
  } else if (attributeType === 'number' || attributeType === 'date') {
    dataToSet = options;
  } else if (attributeType === 'media') {
    dataToSet = {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  } else if (attributeType === 'enumeration') {
    dataToSet = { ...options, type: 'enumeration', enum: [] };
  } else if (attributeType === 'relation') {
    dataToSet = {
      name: snakeCase(nameToSetForRelation),
      nature: 'oneWay',
      targetAttribute: '-',
      target: targetUid,
      unique: false,
      dominant: null,
      columnName: null,
      targetColumnName: null,
    };
  } else {
    dataToSet = { ...options, type: attributeType, default: null };
  }

  return state.update('modifiedData', () => fromJS(dataToSet));
};

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action
 */
const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
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
      return handleResetPropsAndSetFormForAddingExistingComp(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForAddingCompToDZ(state);
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return handleSetDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

export default reducer;
export { initialState };