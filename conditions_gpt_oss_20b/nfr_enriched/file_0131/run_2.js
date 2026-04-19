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
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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
 * Handles ON_CHANGE action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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

    // Remove default key if type changes from date/datetime/time
    if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return updateNature(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (keys.length === 1 && keys.includes('target')) {
      return updateTarget(
        obj,
        value,
        action.targetContentTypeAllowedRelations,
        selectedContentTypeFriendlyName,
        oneThatIsCreatingARelationWithAnother
      );
    }

    return obj.updateIn(keys, () => value);
  });
}

/**
 * Updates object when nature changes.
 * @param {Immutable.Map} obj
 * @param {string} value
 * @param {string} relationName
 * @returns {Immutable.Map}
 */
function updateNature(obj, value, relationName) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) return '-';
      const base = oldValue === '-' ? snakeCase(relationName) : oldValue;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) return null;
      return oldValue;
    });
}

/**
 * Updates object when target changes.
 * @param {Immutable.Map} obj
 * @param {string} value
 * @param {Array|null} allowedRelations
 * @param {string} friendlyName
 * @param {string} relationName
 * @returns {Immutable.Map}
 */
function updateTarget(obj, value, allowedRelations, friendlyName, relationName) {
  let didChangeNature = false;
  return obj
    .update('target', () => value)
    .update('nature', currentNature => {
      if (allowedRelations === null) return currentNature;
      if (!allowedRelations.includes(currentNature)) {
        didChangeNature = true;
        return allowedRelations[0];
      }
      return currentNature;
    })
    .update('name', () => {
      const targetNature = didChangeNature ? allowedRelations[0] : obj.get('nature');
      return pluralize(
        snakeCase(friendlyName),
        shouldPluralizeName(targetNature)
      );
    })
    .update('targetAttribute', () => {
      const currentNature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(currentNature)) return '-';
      if (
        didChangeNature &&
        ['oneWay', 'manyWay'].includes(allowedRelations[0])
      )
        return '-';
      return pluralize(
        snakeCase(relationName),
        shouldPluralizeTargetAttribute(currentNature)
      );
    });
}

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
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
 * Handles RESET_PROPS action.
 * @param {Immutable.Map} state
 * @returns {Immutable.Map}
 */
function handleResetProps(state) {
  return initialState;
}

/**
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleResetPropsAndSetFormForAddingExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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
 * @param {Immutable.Map} state
 * @returns {Immutable.Map}
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
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/**
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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

  const dataToSet = getDataForAttributeType(
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid
  );

  return state.update('modifiedData', () => fromJS(dataToSet));
}

/**
 * Returns data object based on attribute type.
 * @param {string} type
 * @param {string} step
 * @param {Object} options
 * @param {string} relationName
 * @param {string} targetUid
 * @returns {Object}
 */
function getDataForAttributeType(type, step, options, relationName, targetUid) {
  switch (type) {
    case 'component':
      if (step === '1') {
        return {
          type: 'component',
          createComponent: true,
          componentToCreate: { type: 'component' },
        };
      }
      return { ...options, type: 'component', repeatable: true };
    case 'dynamiczone':
      return { ...options, type: 'dynamiczone', components: [] };
    case 'text':
      return { ...options, type: 'string' };
    case 'number':
    case 'date':
      return options;
    case 'media':
      return {
        allowedTypes: ['images', 'files', 'videos'],
        type: 'media',
        multiple: true,
        ...options,
      };
    case 'enumeration':
      return { ...options, type: 'enumeration', enum: [] };
    case 'relation':
      return {
        name: snakeCase(relationName),
        nature: 'oneWay',
        targetAttribute: '-',
        target: targetUid,
        unique: false,
        dominant: null,
        columnName: null,
        targetColumnName: null,
      };
    default:
      return { ...options, type, default: null };
  }
}

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/**
 * Handles SET_ERRORS action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return handleResetProps(state);
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