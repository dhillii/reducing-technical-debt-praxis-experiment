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
 * Guard predicate: checks if the keys array contains exactly one element equal to target.
 */
function isSingleKey(keys, target) {
  return keys.length === 1 && keys.includes(target);
}

/**
 * Guard predicate: checks if a value is one of the given list.
 */
function isOneOf(value, list) {
  return list.includes(value);
}

/**
 * Guard predicate: checks if a relation nature is one-way or many-way.
 */
function isOneOrManyWay(nature) {
  return isOneOf(nature, ['oneWay', 'manyWay']);
}

/**
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
 */
function handleAddComponentsToDynamicZone(state, { name, components, shouldAddComponents }) {
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
 * Handles nature change within ON_CHANGE action.
 */
function handleNatureChange(obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother) {
  let newObj = obj.update('nature', () => value);

  newObj = newObj.update('dominant', () => (value === 'manyToMany' ? true : null));

  newObj = newObj.update('name', oldValue =>
    pluralize(snakeCase(oldValue), shouldPluralizeName(value))
  );

  newObj = newObj.update('targetAttribute', oldValue => {
    if (isOneOrManyWay(value)) {
      return '-';
    }

    const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
    return pluralize(base, shouldPluralizeTargetAttribute(value));
  });

  newObj = newObj.update('targetColumnName', oldValue => (isOneOrManyWay(value) ? null : oldValue));

  return newObj;
}

/**
 * Handles target change within ON_CHANGE action.
 */
function handleTargetChange(obj, action, value) {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  let newObj = obj.update('target', () => value);

  newObj = newObj.update('nature', currentNature => {
    if (targetContentTypeAllowedRelations === null) {
      return currentNature;
    }

    if (!targetContentTypeAllowedRelations.includes(currentNature)) {
      didChangeNatureBecauseOfRestrictedRelation = true;
      return targetContentTypeAllowedRelations[0];
    }

    return currentNature;
  });

  newObj = newObj.update('name', () => {
    if (didChangeNatureBecauseOfRestrictedRelation) {
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(targetContentTypeAllowedRelations[0])
      );
    }

    return pluralize(
      snakeCase(selectedContentTypeFriendlyName),
      shouldPluralizeName(obj.get('nature'))
    );
  });

  newObj = newObj.update('targetAttribute', () => {
    if (isOneOrManyWay(obj.get('nature'))) {
      return '-';
    }

    if (
      didChangeNatureBecauseOfRestrictedRelation &&
      isOneOrManyWay(targetContentTypeAllowedRelations[0])
    ) {
      return '-';
    }

    return pluralize(
      snakeCase(oneThatIsCreatingARelationWithAnother),
      shouldPluralizeTargetAttribute(obj.get('nature'))
    );
  });

  return newObj;
}

/**
 * Handles ON_CHANGE action.
 */
function handleOnChange(state, action) {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    const hasDefaultValue = Boolean(obj.getIn(['default']));

    if (hasDefaultValue && isSingleKey(keys, 'type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && isOneOf(previousType, ['date', 'datetime', 'time'])) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isSingleKey(keys, 'nature')) {
      return handleNatureChange(
        obj,
        value,
        selectedContentTypeFriendlyName,
        oneThatIsCreatingARelationWithAnother
      );
    }

    if (isSingleKey(keys, 'target')) {
      return handleTargetChange(obj, action, value);
    }

    return obj.updateIn(keys, () => value);
  });
}

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 */
function handleOnChangeAllowedType(state, action) {
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
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 */
function handleResetPropsAndSetFormForAddingAnExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action.
 */
function handleResetPropsAndSaveCurrentData(state, action) {
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
 * Handles RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ action.
 */
function handleResetPropsAndSetTheFormForAddingACompoToADz(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * Handles SET_DATA_TO_EDIT action.
 */
function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/**
 * Builds the data object for SET_ATTRIBUTE_DATA_SCHEMA action.
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
    return { edited: true, data: modifiedDataToSetForEditing };
  }

  if (attributeType === 'component') {
    if (step === '1') {
      return {
        type: 'component',
        createComponent: true,
        componentToCreate: { type: 'component' },
      };
    }
    return { ...options, type: 'component', repeatable: true };
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
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
 */
function handleSetAttributeDataSchema(state, action) {
  const result = buildAttributeDataSchema(action);

  if (result.edited) {
    const data = fromJS(result.data);
    return state.update('modifiedData', () => data).update('initialData', () => data);
  }

  return state.update('modifiedData', () => fromJS(result));
}

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 */
function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/**
 * Handles SET_ERRORS action.
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/**
 * Main reducer function.
 */
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
      return handleResetPropsAndSetFormForAddingAnExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetTheFormForAddingACompoToADz(state);
    case actions.SET_DATA_TO_EDIT:
      return handleSetDataToEdit(state, action);
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return handleSetDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return handleSetErrors(state, action);
    default:
      return state;
  }
};

export default reducer;
export { initialState };