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
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
function handleAddComponentsToDynamicZone(state, action) {
  const { name, components, shouldAddComponents } = action;
  return state.updateIn(['modifiedData', name], list => {
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updatedList.toJS()));
  });
}

/**
 * Checks if the previous type is a date/time type.
 * @param {string} previousType
 * @returns {boolean}
 */
function isDateTimeType(previousType) {
  return ['date', 'datetime', 'time'].includes(previousType);
}

/**
 * Checks if the value is a many-to-many nature.
 * @param {string} value
 * @returns {boolean}
 */
function isManyToMany(value) {
  return value === 'manyToMany';
}

/**
 * Checks if the value is one-way or many-way.
 * @param {string} value
 * @returns {boolean}
 */
function isOneOrManyWay(value) {
  return ['oneWay', 'manyWay'].includes(value);
}

/**
 * Handles ON_CHANGE action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
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

    if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && isDateTimeType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => (isManyToMany(value) ? true : null))
        .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
        .update('targetAttribute', oldValue => {
          if (isOneOrManyWay(value)) {
            return '-';
          }
          const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', oldValue => {
          if (isOneOrManyWay(value)) {
            return null;
          }
          return oldValue;
        });
    }

    if (keys.length === 1 && keys.includes('target')) {
      const { targetContentTypeAllowedRelations } = action;
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
    }

    return obj.updateIn(keys, () => value);
  });
}

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
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
    const list = currentList || fromJS([]);
    if (list.includes(action.name)) {
      const newList = list.filter(v => v !== action.name);
      return newList.size === 0 ? null : newList;
    }
    return list.push(action.name);
  });
}

/**
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
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
}

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/**
 * Handles SET_ERRORS action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/**
 * Handles RESET_PROPS action.
 * @returns {Object}
 */
function handleResetProps() {
  return initialState;
}

/**
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
function handleResetPropsAndSetFormForAddingExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
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
 * @param {Object} state
 * @returns {Object}
 */
function handleResetPropsAndSetFormForAddingCompoToDZ(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * Handles SET_DATA_TO_EDIT action.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/**
 * Main reducer function.
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
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
      return handleResetProps();
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return handleResetPropsAndSetFormForAddingExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForAddingCompoToDZ(state);
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