import { fromJS, List } from 'immutable';
import pluralize from 'pluralize';
import { snakeCase } from 'lodash';
import makeUnique from '../../utils/makeUnique';
import { createComponentUid } from './utils/createUid';
import { shouldPluralizeName, shouldPluralizeTargetAttribute } from './utils/relations';
import * as actions from './constants';

/**
 * Initial reducer state.
 */
const initialState = fromJS({
  formErrors: {},
  modifiedData: {},
  initialData: {},
  componentToCreate: {},
  isCreatingComponentWhileAddingAField: false,
});

/* Predicate helpers */

/**
 * @param {boolean} hasDefault
 * @param {Array<string>} keys
 * @returns {boolean}
 */
function shouldRemoveDefault(hasDefault, keys) {
  return hasDefault && keys.length === 1 && keys.includes('type');
}

/**
 * @param {string|undefined} previousType
 * @returns {boolean}
 */
function isDateTimeType(previousType) {
  return (
    previousType &&
    ['date', 'datetime', 'time'].includes(previousType)
  );
}

/**
 * @param {Array<string>} keys
 * @returns {boolean}
 */
function isNatureKey(keys) {
  return keys.length === 1 && keys.includes('nature');
}

/**
 * @param {Array<string>} keys
 * @returns {boolean}
 */
function isTargetKey(keys) {
  return keys.length === 1 && keys.includes('target');
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isOneWayOrManyWay(value) {
  return ['oneWay', 'manyWay'].includes(value);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isAllAllowedType(name) {
  return name === 'all';
}

/**
 * @param {Immutable.List|Array} list
 * @param {string} name
 * @returns {boolean}
 */
function includesInList(list, name) {
  return list && list.includes(name);
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isComponentAttribute(attributeType) {
  return attributeType === 'component';
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isDynamicZoneAttribute(attributeType) {
  return attributeType === 'dynamiczone';
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isTextAttribute(attributeType) {
  return attributeType === 'text';
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isNumberOrDateAttribute(attributeType) {
  return attributeType === 'number' || attributeType === 'date';
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isMediaAttribute(attributeType) {
  return attributeType === 'media';
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isEnumerationAttribute(attributeType) {
  return attributeType === 'enumeration';
}

/**
 * @param {string} attributeType
 * @returns {boolean}
 */
function isRelationAttribute(attributeType) {
  return attributeType === 'relation';
}

/* Action handlers */

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

function handleOnChange(state, action) {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
    targetContentTypeAllowedRelations,
  } = action;

  return state.update('modifiedData', obj => {
    const hasDefaultValue = Boolean(obj.getIn(['default']));

    if (shouldRemoveDefault(hasDefaultValue, keys)) {
      const previousType = obj.getIn(['type']);
      if (isDateTimeType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isNatureKey(keys)) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => (value === 'manyToMany' ? true : null))
        .update('name', oldValue =>
          pluralize(snakeCase(oldValue), shouldPluralizeName(value))
        )
        .update('targetAttribute', oldValue => {
          if (isOneWayOrManyWay(value)) {
            return '-';
          }
          const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', oldValue => (isOneWayOrManyWay(value) ? null : oldValue));
    }

    if (isTargetKey(keys)) {
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
          if (isOneWayOrManyWay(obj.get('nature'))) {
            return '-';
          }
          if (
            didChangeNatureBecauseOfRestrictedRelation &&
            isOneWayOrManyWay(targetContentTypeAllowedRelations[0])
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

function handleOnChangeAllowedType(state, action) {
  if (isAllAllowedType(action.name)) {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      if (action.value) {
        return fromJS(['images', 'videos', 'files']);
      }
      return null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    const list = currentList || fromJS([]);
    if (includesInList(list, action.name)) {
      const filtered = list.filter(v => v !== action.name);
      return filtered.size === 0 ? null : filtered;
    }
    return list.push(action.name);
  });
}

function handleResetPropsAndSetFormForAddingExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

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

function handleResetPropsAndSetTheFormForAddingACompoToADZ(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
}

function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

function getDataToSetForAttribute(action) {
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

  if (isComponentAttribute(attributeType)) {
    if (step === '1') {
      return fromJS({
        type: 'component',
        createComponent: true,
        componentToCreate: { type: 'component' },
      });
    }
    return fromJS({ ...options, type: 'component', repeatable: true });
  }

  if (isDynamicZoneAttribute(attributeType)) {
    return fromJS({ ...options, type: 'dynamiczone', components: [] });
  }

  if (isTextAttribute(attributeType)) {
    return fromJS({ ...options, type: 'string' });
  }

  if (isNumberOrDateAttribute(attributeType)) {
    return fromJS(options);
  }

  if (isMediaAttribute(attributeType)) {
    return fromJS({
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    });
  }

  if (isEnumerationAttribute(attributeType)) {
    return fromJS({ ...options, type: 'enumeration', enum: [] });
  }

  if (isRelationAttribute(attributeType)) {
    return fromJS({
      name: snakeCase(nameToSetForRelation),
      nature: 'oneWay',
      targetAttribute: '-',
      target: targetUid,
      unique: false,
      dominant: null,
      columnName: null,
      targetColumnName: null,
    });
  }

  return fromJS({ ...options, type: attributeType, default: null });
}

function handleSetAttributeDataSchema(state, action) {
  const dataToSet = getDataToSetForAttribute(action);
  return state.update('modifiedData', () => dataToSet);
}

function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/* Main reducer */

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
      return handleResetPropsAndSetFormForAddingExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetTheFormForAddingACompoToADZ(state);
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