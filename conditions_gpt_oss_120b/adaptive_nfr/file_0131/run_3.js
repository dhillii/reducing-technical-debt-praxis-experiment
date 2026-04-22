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

/* ---------- Predicate helpers ---------- */

/**
 * Checks whether the default key should be removed.
 */
function shouldRemoveDefault(keys, hasDefaultValue) {
  return hasDefaultValue && keys.length === 1 && keys.includes('type');
}

/**
 * Checks if the previous type is a date‑time variant.
 */
function isDateTimeType(previousType) {
  return previousType && ['date', 'datetime', 'time'].includes(previousType);
}

/**
 * Checks whether the changed key is `nature`.
 */
function isNatureKey(keys) {
  return keys.length === 1 && keys.includes('nature');
}

/**
 * Checks whether the changed key is `target`.
 */
function isTargetKey(keys) {
  return keys.length === 1 && keys.includes('target');
}

/**
 * Checks if a relation nature is one‑way or many‑way.
 */
function isOneOrManyWay(nature) {
  return ['oneWay', 'manyWay'].includes(nature);
}

/**
 * Checks whether the allowed type name is `all`.
 */
function isAllAllowedType(name) {
  return name === 'all';
}

/**
 * Checks if the attribute type is a component.
 */
function isComponentAttribute(type) {
  return type === 'component';
}

/**
 * Checks if the attribute type is a dynamic zone.
 */
function isDynamicZoneAttribute(type) {
  return type === 'dynamiczone';
}

/**
 * Checks if the attribute type is a text field.
 */
function isTextAttribute(type) {
  return type === 'text';
}

/**
 * Checks if the attribute type is a number or date.
 */
function isNumberOrDateAttribute(type) {
  return type === 'number' || type === 'date';
}

/**
 * Checks if the attribute type is media.
 */
function isMediaAttribute(type) {
  return type === 'media';
}

/**
 * Checks if the attribute type is enumeration.
 */
function isEnumerationAttribute(type) {
  return type === 'enumeration';
}

/**
 * Checks if the attribute type is a relation.
 */
function isRelationAttribute(type) {
  return type === 'relation';
}

/* ---------- Case handlers ---------- */

function handleAddComponentsToDynamicZone(state, action) {
  const { name, components, shouldAddComponents } = action;

  return state.updateIn(['modifiedData', name], list => {
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => components.indexOf(comp) === -1);

    return List(makeUnique(updatedList.toJS()));
  });
}

function handleOnChange(state, action) {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    const hasDefaultValue = Boolean(obj.getIn(['default']));

    if (shouldRemoveDefault(keys, hasDefaultValue)) {
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
          if (isOneOrManyWay(value)) {
            return '-';
          }
          const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', oldValue => (isOneOrManyWay(value) ? null : oldValue));
    }

    if (isTargetKey(keys)) {
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

function handleOnChangeAllowedType(state, action) {
  if (isAllAllowedType(action.name)) {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    const list = currentList || fromJS([]);
    if (list.includes(action.name)) {
      const filtered = list.filter(v => v !== action.name);
      return filtered.size === 0 ? null : filtered;
    }
    return list.push(action.name);
  });
}

function handleResetPropsAndSetFormForAddingAnExistingCompo(state, action) {
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

/**
 * Builds the data object for a new attribute based on its type.
 */
function buildAttributeData(action) {
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
    return {
      modified: fromJS(modifiedDataToSetForEditing),
      initial: fromJS(modifiedDataToSetForEditing),
    };
  }

  let dataToSet;

  if (isComponentAttribute(attributeType)) {
    dataToSet = step === '1'
      ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
      : { ...options, type: 'component', repeatable: true };
  } else if (isDynamicZoneAttribute(attributeType)) {
    dataToSet = { ...options, type: 'dynamiczone', components: [] };
  } else if (isTextAttribute(attributeType)) {
    dataToSet = { ...options, type: 'string' };
  } else if (isNumberOrDateAttribute(attributeType)) {
    dataToSet = options;
  } else if (isMediaAttribute(attributeType)) {
    dataToSet = {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  } else if (isEnumerationAttribute(attributeType)) {
    dataToSet = { ...options, type: 'enumeration', enum: [] };
  } else if (isRelationAttribute(attributeType)) {
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

  return { dataToSet };
}

function handleSetAttributeDataSchema(state, action) {
  const result = buildAttributeData(action);

  if (result.modified && result.initial) {
    return state
      .update('modifiedData', () => result.modified)
      .update('initialData', () => result.initial);
  }

  return state.update('modifiedData', () => fromJS(result.dataToSet));
}

function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/* ---------- Main reducer ---------- */

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