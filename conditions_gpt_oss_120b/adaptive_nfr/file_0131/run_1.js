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
 * Guard predicate: checks if the action targets a single key and that key matches the provided name.
 */
const isSingleKey = (keys, name) => keys.length === 1 && keys.includes(name);

/**
 * Guard predicate: checks if default value exists and the key is exactly ['type'].
 */
const hasDefaultAndSingleTypeKey = (obj, keys) => Boolean(obj.getIn(['default'])) && isSingleKey(keys, 'type');

/**
 * Guard predicate: checks if the previous type is a date‑time variant.
 */
const isDateTimeVariant = previousType =>
  previousType && ['date', 'datetime', 'time'].includes(previousType);

/**
 * Guard predicate: checks if the nature value is a many‑to‑many relation.
 */
const isManyToMany = value => value === 'manyToMany';

/**
 * Guard predicate: checks if the relation nature is one‑way or many‑way.
 */
const isOneOrManyWay = value => ['oneWay', 'manyWay'].includes(value);

/**
 * Guard predicate: checks if the target content type allowed relations list is defined.
 */
const hasAllowedRelations = targetContentTypeAllowedRelations => targetContentTypeAllowedRelations !== null;

/**
 * Guard predicate: checks if a nature is allowed for the target content type.
 */
const isNatureAllowed = (nature, allowed) => allowed.includes(nature);

/**
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
 */
function handleAddComponentsToDynamicZone(state, { name, components, shouldAddComponents }) {
  return state.updateIn(['modifiedData', name], list => {
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updatedList.toJS()));
  });
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

    // Remove default when changing type from a date‑time variant
    if (hasDefaultAndSingleTypeKey(obj, keys)) {
      const previousType = obj.getIn(['type']);
      if (isDateTimeVariant(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    // Update nature‑related fields
    if (isSingleKey(keys, 'nature')) {
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
        .update('targetColumnName', oldValue => (isOneOrManyWay(value) ? null : oldValue));
    }

    // Update target‑related fields
    if (isSingleKey(keys, 'target')) {
      const { targetContentTypeAllowedRelations } = action;
      let didChangeNatureBecauseOfRestrictedRelation = false;

      return obj
        .update('target', () => value)
        .update('nature', currentNature => {
          if (!hasAllowedRelations(targetContentTypeAllowedRelations)) {
            return currentNature;
          }
          if (!isNatureAllowed(currentNature, targetContentTypeAllowedRelations)) {
            didChangeNatureBecauseOfRestrictedRelation = true;
            return targetContentTypeAllowedRelations[0];
          }
          return currentNature;
        })
        .update('name', () => {
          const nature = didChangeNatureBecauseOfRestrictedRelation
            ? targetContentTypeAllowedRelations[0]
            : obj.get('nature');
          return pluralize(
            snakeCase(selectedContentTypeFriendlyName),
            shouldPluralizeName(nature)
          );
        })
        .update('targetAttribute', () => {
          const nature = obj.get('nature');
          if (isOneOrManyWay(nature)) {
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
            shouldPluralizeTargetAttribute(nature)
          );
        });
    }

    // Generic key update
    return obj.updateIn(keys, () => value);
  });
}

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
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
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
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
    const data = fromJS(modifiedDataToSetForEditing);
    return state.update('modifiedData', () => data).update('initialData', () => data);
  }

  let dataToSet;

  if (attributeType === 'component') {
    dataToSet =
      step === '1'
        ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
        : { ...options, type: 'component', repeatable: true };
  } else if (attributeType === 'dynamiczone') {
    dataToSet = { ...options, type: 'dynamiczone', components: [] };
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
      return state
        .update('modifiedData', () => fromJS(action.attributeToEdit))
        .update('initialData', () => fromJS(action.attributeToEdit));

    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));

    default:
      return state;
  }
};

export default reducer;
export { initialState };