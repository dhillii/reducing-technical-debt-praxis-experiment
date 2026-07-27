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
 * Predicate: checks if the provided keys array contains exactly one element equal to the given key.
 * @param {string[]} keys
 * @param {string} key
 * @returns {boolean}
 */
const isSingleKey = (keys, key) => keys.length === 1 && keys.includes(key);

/**
 * Predicate: checks if a type string is a date/time type.
 * @param {string} type
 * @returns {boolean}
 */
const isDateTimeType = type => ['date', 'datetime', 'time'].includes(type);

/**
 * Predicate: checks if a relation nature is one of the one-way types.
 * @param {string} nature
 * @returns {boolean}
 */
const isOneWayNature = nature => ['oneWay', 'manyWay'].includes(nature);

/**
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleAddComponentsToDynamicZone(state, action) {
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
 * Handles nature field updates.
 * @param {object} obj
 * @param {any} value
 * @param {string} relationCreator
 * @returns {object}
 */
function handleNatureUpdate(obj, value, relationCreator) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue =>
      pluralize(snakeCase(oldValue), shouldPluralizeName(value))
    )
    .update('targetAttribute', oldValue => {
      if (isOneWayNature(value)) {
        return '-';
      }
      const base = oldValue === '-' ? snakeCase(relationCreator) : oldValue;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', oldValue => (isOneWayNature(value) ? null : oldValue));
}

/**
 * Handles target field updates.
 * @param {object} obj
 * @param {any} value
 * @param {object} action
 * @returns {object}
 */
function handleTargetUpdate(obj, value, action) {
  const {
    selectedContentTypeFriendlyName,
    oneThatIsCreatingARelationWithAnother,
    targetContentTypeAllowedRelations,
  } = action;
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
    .update('name', () => {
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
    })
    .update('targetAttribute', () => {
      if (isOneWayNature(obj.get('nature'))) {
        return '-';
      }
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        isOneWayNature(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(obj.get('nature'))
      );
    });
}

/**
 * Handles ON_CHANGE action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleOnChange(state, action) {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;

  return state.update('modifiedData', obj => {
    const hasDefaultValue = Boolean(obj.getIn(['default']));

    if (hasDefaultValue && isSingleKey(keys, 'type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && isDateTimeType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isSingleKey(keys, 'nature')) {
      return handleNatureUpdate(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (isSingleKey(keys, 'target')) {
      return handleTargetUpdate(obj, value, action);
    }

    return obj.updateIn(keys, () => value);
  });
}

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);

    if (list.includes(action.name)) {
      list = list.filter(v => v !== action.name);
      return list.size === 0 ? null : list;
    }

    return list.push(action.name);
  });
}

/**
 * Builds data object for SET_ATTRIBUTE_DATA_SCHEMA based on attribute type.
 * @param {object} params
 * @returns {object}
 */
function buildAttributeData(params) {
  const {
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid,
  } = params;

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
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleSetAttributeDataSchema(state, action) {
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

  const dataToSet = buildAttributeData({
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid,
  });

  return state.update('modifiedData', () => fromJS(dataToSet));
}

/**
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleResetPropsAndSetFormForAddingExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
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
 * @param {object} state
 * @returns {object}
 */
function handleResetPropsAndSetFormForAddingCompoToDz(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * Handles SET_DATA_TO_EDIT action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/**
 * Handles SET_ERRORS action.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/**
 * Main reducer function delegating to specific handlers.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
function reducer(state = initialState, action) {
  const handlers = {
    [actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE]: handleAddComponentsToDynamicZone,
    [actions.ON_CHANGE]: handleOnChange,
    [actions.ON_CHANGE_ALLOWED_TYPE]: handleOnChangeAllowedType,
    [actions.RESET_PROPS]: () => initialState,
    [actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO]:
      handleResetPropsAndSetFormForAddingExistingCompo,
    [actions.RESET_PROPS_AND_SAVE_CURRENT_DATA]: handleResetPropsAndSaveCurrentData,
    [actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ]:
      handleResetPropsAndSetFormForAddingCompoToDz,
    [actions.SET_DATA_TO_EDIT]: handleSetDataToEdit,
    [actions.SET_ATTRIBUTE_DATA_SCHEMA]: handleSetAttributeDataSchema,
    [actions.SET_DYNAMIC_ZONE_DATA_SCHEMA]: handleSetDynamicZoneDataSchema,
    [actions.SET_ERRORS]: handleSetErrors,
  };

  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
}

export default reducer;
export { initialState };