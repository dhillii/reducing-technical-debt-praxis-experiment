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

function addComponentsToDynamicZone(state, { name, components, shouldAddComponents }) {
  return state.updateIn(['modifiedData', name], list => {
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updatedList.toJS()));
  });
}

/* Handles generic ON_CHANGE actions */
function onChange(state, action) {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
      targetContentTypeAllowedRelations,
    } = action;

    // Remove default when changing type from date/time and default exists
    if (shouldRemoveDefault(obj, keys, value)) {
      return obj.updateIn(keys, () => value).remove('default');
    }

    // Specific handling based on the first key
    const primaryKey = keys[0];
    if (primaryKey === 'nature') {
      return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (primaryKey === 'target') {
      return handleTargetChange(
        obj,
        value,
        action,
        selectedContentTypeFriendlyName,
        oneThatIsCreatingARelationWithAnother,
        targetContentTypeAllowedRelations
      );
    }

    // Fallback generic update
    return obj.updateIn(keys, () => value);
  });
}

/* Determines if default key should be removed */
function shouldRemoveDefault(obj, keys, value) {
  const hasDefault = Boolean(obj.getIn(['default']));
  if (!hasDefault || keys.length !== 1 || !keys.includes('type')) {
    return false;
  }
  const previousType = obj.getIn(['type']);
  return previousType && ['date', 'datetime', 'time'].includes(previousType);
}

/* Handles changes when the 'nature' key is modified */
function handleNatureChange(obj, value, relationCreator) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
    .update('targetAttribute', old => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      const base = old === '-' ? snakeCase(relationCreator) : old;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(value) ? null : old));
}

/* Handles changes when the 'target' key is modified */
function handleTargetChange(
  obj,
  value,
  action,
  selectedContentTypeFriendlyName,
  relationCreator,
  allowedRelations
) {
  let didChangeNature = false;

  const updated = obj
    .update('target', () => value)
    .update('nature', current => {
      if (allowedRelations === null) {
        return current;
      }
      if (!allowedRelations.includes(current)) {
        didChangeNature = true;
        return allowedRelations[0];
      }
      return current;
    })
    .update('name', () => {
      const natureForName = didChangeNature ? allowedRelations[0] : obj.get('nature');
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(natureForName)
      );
    })
    .update('targetAttribute', () => {
      const currentNature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(currentNature)) {
        return '-';
      }
      if (
        didChangeNature &&
        ['oneWay', 'manyWay'].includes(allowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(relationCreator),
        shouldPluralizeTargetAttribute(currentNature)
      );
    });

  return updated;
}

/* Handles ON_CHANGE_ALLOWED_TYPE actions */
function onChangeAllowedType(state, action) {
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

/* Resets props and prepares form for adding an existing component */
function resetPropsAndSetFormForAddingExistingComponent(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/* Resets props, saves current data after creating a new component */
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

/* Resets props and sets form for adding a component to a dynamic zone */
function resetPropsAndSetFormForAddingComponentToDZ(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

/* Sets data for editing */
function setDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/* Sets attribute data schema based on attribute type and context */
function setAttributeDataSchema(state, action) {
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

  const dataToSet = buildAttributeData(attributeType, step, options, {
    nameToSetForRelation,
    targetUid,
  });

  return state.update('modifiedData', () => fromJS(dataToSet));
}

/* Helper to construct attribute data based on type */
function buildAttributeData(type, step, options, extra) {
  if (type === 'component') {
    return step === '1'
      ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
      : { ...options, type: 'component', repeatable: true };
  }
  if (type === 'dynamiczone') {
    return { ...options, type: 'dynamiczone', components: [] };
  }
  if (type === 'text') {
    return { ...options, type: 'string' };
  }
  if (type === 'number' || type === 'date') {
    return options;
  }
  if (type === 'media') {
    return { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
  }
  if (type === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }
  if (type === 'relation') {
    return {
      name: snakeCase(extra.nameToSetForRelation),
      nature: 'oneWay',
      targetAttribute: '-',
      target: extra.targetUid,
      unique: false,
      dominant: null,
      columnName: null,
      targetColumnName: null,
    };
  }
  return { ...options, type, default: null };
}

/* Sets dynamic zone data schema */
function setDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/* Sets form errors */
function setErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/* Main reducer delegating to specialized handlers */
const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return addComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return onChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return onChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return resetPropsAndSetFormForAddingExistingComponent(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return resetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return resetPropsAndSetFormForAddingComponentToDZ(state);
    case actions.SET_DATA_TO_EDIT:
      return setDataToEdit(state, action);
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return setAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return setDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return setErrors(state, action);
    default:
      return state;
  }
};

export default reducer;
export { initialState };