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
 */
function handleAddComponentsToDynamicZone(state, { name, components, shouldAddComponents }) {
  return state.updateIn(['modifiedData', name], list => {
    const updated = shouldAddComponents ? list.concat(components) : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updated.toJS()));
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
      targetContentTypeAllowedRelations,
    } = action;

    const hasDefault = Boolean(obj.getIn(['default']));

    // Remove default when changing type from date‑related fields
    if (hasDefault && keys.length === 1 && keys.includes('type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    // Update relation nature
    if (keys.length === 1 && keys.includes('nature')) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => (value === 'manyToMany' ? true : null))
        .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
        .update('targetAttribute', old => {
          if (['oneWay', 'manyWay'].includes(value)) return '-';
          const base = old === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : old;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(value) ? null : old));
    }

    // Update target and possibly adjust nature
    if (keys.length === 1 && keys.includes('target')) {
      let changedNature = false;
      return obj
        .update('target', () => value)
        .update('nature', cur => {
          if (!targetContentTypeAllowedRelations) return cur;
          if (!targetContentTypeAllowedRelations.includes(cur)) {
            changedNature = true;
            return targetContentTypeAllowedRelations[0];
          }
          return cur;
        })
        .update('name', () => {
          const nature = changedNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
          const base = changedNature ? snakeCase(selectedContentTypeFriendlyName) : snakeCase(selectedContentTypeFriendlyName);
          return pluralize(base, shouldPluralizeName(nature));
        })
        .update('targetAttribute', () => {
          const nature = obj.get('nature');
          if (['oneWay', 'manyWay'].includes(nature)) return '-';
          if (changedNature && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) return '-';
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
    return state.updateIn(['modifiedData', 'allowedTypes'], () => (action.value ? fromJS(['images', 'videos', 'files']) : null));
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], current => {
    let list = current || fromJS([]);
    if (list.includes(action.name)) {
      list = list.filter(v => v !== action.name);
      return list.size === 0 ? null : list;
    }
    return list.push(action.name);
  });
}

/**
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 */
function handleResetPropsAndSetFormForAddingAnExistingCompo(state, action) {
  return initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));
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
    component: createComponentUid(componentToCreate.get('name'), componentToCreate.get('category')),
  });

  return initialState
    .update('componentToCreate', () => componentToCreate)
    .update('modifiedData', () => modifiedData)
    .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
}

/**
 * Handles RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ action.
 */
function handleResetPropsAndSetFormForAddingCompoToDz(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * Handles SET_DATA_TO_EDIT action.
 */
function handleSetDataToEdit(state, action) {
  const data = fromJS(action.data);
  return state.updateIn(['modifiedData'], () => data).updateIn(['initialData'], () => data);
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
    dataToSet = step === '1'
      ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
      : { ...options, type: 'component', repeatable: true };
  } else if (attributeType === 'dynamiczone') {
    dataToSet = { ...options, type: 'dynamiczone', components: [] };
  } else if (attributeType === 'text') {
    dataToSet = { ...options, type: 'string' };
  } else if (attributeType === 'number' || attributeType === 'date') {
    dataToSet = options;
  } else if (attributeType === 'media') {
    dataToSet = { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
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
 */
function handleSetDynamicZoneDataSchema(state, action) {
  const data = fromJS(action.attributeToEdit);
  return state.update('modifiedData', () => data).update('initialData', () => data);
}

/**
 * Handles SET_ERRORS action.
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/**
 * Main reducer delegating to specialized handlers.
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
      return handleResetPropsAndSetFormForAddingCompoToDz(state);
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