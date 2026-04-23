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
 * Guard predicate: checks if the keys array contains exactly one element equal to the provided key.
 * @param {string[]} keys
 * @param {string} key
 * @returns {boolean}
 */
function isSingleKey(keys, key) {
  return keys.length === 1 && keys.includes(key);
}

/**
 * Guard predicate: checks if a type is a date/time type.
 * @param {string} type
 * @returns {boolean}
 */
function isDateTimeType(type) {
  return ['date', 'datetime', 'time'].includes(type);
}

/**
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
 * @param {Immutable.Map} state
 * @param {object} action
 * @returns {Immutable.Map}
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
 * @param {Immutable.Map} obj
 * @param {any} value
 * @param {string} relationCreator
 * @returns {Immutable.Map}
 */
function updateNature(obj, value, relationCreator) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue =>
      pluralize(snakeCase(oldValue), shouldPluralizeName(value))
    )
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      const base = oldValue === '-' ? snakeCase(relationCreator) : oldValue;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }
      return oldValue;
    });
}

/**
 * Handles target field updates.
 * @param {Immutable.Map} obj
 * @param {object} action
 * @param {any} value
 * @returns {Immutable.Map}
 */
function updateTarget(obj, action, value) {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updated = obj
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
      if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
        return '-';
      }
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(obj.get('nature'))
      );
    });

  return updated;
}

/**
 * Handles ON_CHANGE action.
 * @param {Immutable.Map} state
 * @param {object} action
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

    if (hasDefaultValue && isSingleKey(keys, 'type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && isDateTimeType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isSingleKey(keys, 'nature')) {
      return updateNature(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (isSingleKey(keys, 'target')) {
      return updateTarget(obj, action, value);
    }

    return obj.updateIn(keys, () => value);
  });
}

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 * @param {Immutable.Map} state
 * @param {object} action
 * @returns {Immutable.Map}
 */
function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
    });
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
 * Returns the data schema for a given attribute type.
 * @param {string} attributeType
 * @param {object} params
 * @returns {object}
 */
function getDataToSet(attributeType, params) {
  const { step, options = {}, nameToSetForRelation, targetUid } = params;

  switch (attributeType) {
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
        name: snakeCase(nameToSetForRelation),
        nature: 'oneWay',
        targetAttribute: '-',
        target: targetUid,
        unique: false,
        dominant: null,
        columnName: null,
        targetColumnName: null,
      };
    default:
      return { ...options, type: attributeType, default: null };
  }
}

/**
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
 * @param {Immutable.Map} state
 * @param {object} action
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

  const dataToSet = getDataToSet(attributeType, {
    step,
    options,
    nameToSetForRelation,
    targetUid,
  });

  return state.update('modifiedData', () => fromJS(dataToSet));
}

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 * @param {Immutable.Map} state
 * @param {object} action
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
 * @param {object} action
 * @returns {Immutable.Map}
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/**
 * Main reducer function.
 * @param {Immutable.Map} state
 * @param {object} action
 * @returns {Immutable.Map}
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
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA: {
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
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
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