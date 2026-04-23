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
 * Adds or removes components from a dynamic zone.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function addComponentsToDynamicZone(state, action) {
  const { name, components, shouldAddComponents } = action;
  return state.updateIn(['modifiedData', name], list => {
    let updatedList = list;
    if (shouldAddComponents) {
      updatedList = list.concat(components);
    } else {
      updatedList = list.filter(comp => components.indexOf(comp) === -1);
    }
    return List(makeUnique(updatedList.toJS()));
  });
}

/**
 * Determines if the change is for the 'type' field.
 * @param {Array} keys
 * @returns {boolean}
 */
function isTypeChange(keys) {
  return keys.length === 1 && keys.includes('type');
}

/**
 * Determines if the change is for the 'nature' field.
 * @param {Array} keys
 * @returns {boolean}
 */
function isNatureChange(keys) {
  return keys.length === 1 && keys.includes('nature');
}

/**
 * Determines if the change is for the 'target' field.
 * @param {Array} keys
 * @returns {boolean}
 */
function isTargetChange(keys) {
  return keys.length === 1 && keys.includes('target');
}

/**
 * Handles updates when the 'type' field changes.
 * @param {Immutable.Map} obj
 * @param {Array} keys
 * @param {*} value
 * @returns {Immutable.Map}
 */
function handleTypeChange(obj, keys, value) {
  if (!Boolean(obj.getIn(['default']))) return obj;
  const previousType = obj.getIn(['type']);
  if (!previousType) return obj;
  if (!['date', 'datetime', 'time'].includes(previousType)) return obj;
  return obj.updateIn(keys, () => value).remove('default');
}

/**
 * Handles updates when the 'nature' field changes.
 * @param {Immutable.Map} obj
 * @param {*} value
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleNatureChange(obj, value, action) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      return pluralize(
        oldValue === '-'
          ? snakeCase(action.oneThatIsCreatingARelationWithAnother)
          : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }
      return oldValue;
    });
}

/**
 * Handles updates when the 'target' field changes.
 * @param {Immutable.Map} obj
 * @param {*} value
 * @param {Object} action
 * @param {string} oneThatIsCreatingARelationWithAnother
 * @param {string} selectedContentTypeFriendlyName
 * @returns {Immutable.Map}
 */
function handleTargetChange(
  obj,
  value,
  action,
  oneThatIsCreatingARelationWithAnother,
  selectedContentTypeFriendlyName
) {
  const { targetContentTypeAllowedRelations } = action;
  let didChangeNature = false;
  let updatedObj = obj.update('target', () => value);

  const currentNature = updatedObj.get('nature');
  if (
    targetContentTypeAllowedRelations !== null &&
    !targetContentTypeAllowedRelations.includes(currentNature)
  ) {
    didChangeNature = true;
    updatedObj = updatedObj.set('nature', targetContentTypeAllowedRelations[0]);
  }

  const natureAfter = updatedObj.get('nature');
  updatedObj = updatedObj.update('name', () => {
    if (didChangeNature) {
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(targetContentTypeAllowedRelations[0])
      );
    }
    return pluralize(
      snakeCase(selectedContentTypeFriendlyName),
      shouldPluralizeName(natureAfter)
    );
  });

  updatedObj = updatedObj.update('targetAttribute', () => {
    if (['oneWay', 'manyWay'].includes(natureAfter)) {
      return '-';
    }
    if (
      didChangeNature &&
      ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
    ) {
      return '-';
    }
    return pluralize(
      snakeCase(oneThatIsCreatingARelationWithAnother),
      shouldPluralizeTargetAttribute(natureAfter)
    );
  });

  return updatedObj;
}

/**
 * Handles the ON_CHANGE action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function onChange(state, action) {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    if (isTypeChange(keys)) {
      return handleTypeChange(obj, keys, value);
    }

    if (isNatureChange(keys)) {
      return handleNatureChange(obj, value, action);
    }

    if (isTargetChange(keys)) {
      return handleTargetChange(
        obj,
        value,
        action,
        oneThatIsCreatingARelationWithAnother,
        selectedContentTypeFriendlyName
      );
    }

    return obj.updateIn(keys, () => value);
  });
}

/**
 * Handles the ON_CHANGE_ALLOWED_TYPE action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function onChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      if (action.value) {
        return fromJS(['images', 'videos', 'files']);
      }
      return null;
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
}

/**
 * Resets props and sets form for adding an existing component.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function resetPropsAndSetFormForAddingExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * Resets props and saves current data after creating a component.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function resetPropsAndSaveCurrentData(state, action) {
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

/**
 * Resets props and sets form for adding a component to a dynamic zone.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function resetPropsAndSetTheFormForAddingACompoToADZ(state, action) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * Sets data to edit.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function setDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/**
 * Builds the data schema for an attribute based on its type.
 * @param {Object} action
 * @returns {Object}
 */
function buildAttributeDataSchema(action) {
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
    return fromJS(modifiedDataToSetForEditing);
  }

  if (attributeType === 'component') {
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
  }

  if (attributeType === 'dynamiczone') {
    return {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
  }

  if (attributeType === 'text') {
    return { ...options, type: 'string' };
  }

  if (attributeType === 'number' || attributeType === 'date') {
    return options;
  }

  if (attributeType === 'media') {
    return {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  }

  if (attributeType === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }

  if (attributeType === 'relation') {
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
  }

  return { ...options, type: attributeType, default: null };
}

/**
 * Handles the SET_ATTRIBUTE_DATA_SCHEMA action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function setAttributeDataSchema(state, action) {
  const dataToSet = buildAttributeDataSchema(action);
  return state.update('modifiedData', () => fromJS(dataToSet));
}

/**
 * Handles the SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function setDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/**
 * Handles the SET_ERRORS action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function setErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/**
 * Handles the RESET_PROPS action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function resetProps(state, action) {
  return initialState;
}

/**
 * Default case for unknown actions.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function defaultCase(state, action) {
  return state;
}

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return addComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return onChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return onChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return resetProps(state, action);
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return resetPropsAndSetFormForAddingExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return resetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return resetPropsAndSetTheFormForAddingACompoToADZ(state, action);
    case actions.SET_DATA_TO_EDIT:
      return setDataToEdit(state, action);
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return setAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return setDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return setErrors(state, action);
    default:
      return defaultCase(state, action);
  }
};

export default reducer;
export { initialState };