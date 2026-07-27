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

function addComponentsToDynamicZone(state, action) {
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

/* ---------- ON_CHANGE helpers ---------- */

function removeDefaultIfNeeded(obj, keys, value) {
  const hasDefault = Boolean(obj.getIn(['default']));
  if (hasDefault && keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);
    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }
  return null;
}

function updateNatureFields(obj, value, oneThatIsCreatingARelationWithAnother) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
    .update('targetAttribute', old => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      const base = old === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : old;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(value) ? null : old));
}

function updateTargetFields(obj, action, value) {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
  let didChangeNature = false;

  const updated = obj
    .update('target', () => value)
    .update('nature', current => {
      if (targetContentTypeAllowedRelations === null) {
        return current;
      }
      if (!targetContentTypeAllowedRelations.includes(current)) {
        didChangeNature = true;
        return targetContentTypeAllowedRelations[0];
      }
      return current;
    })
    .update('name', () => {
      const nature = didChangeNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(nature));
    })
    .update('targetAttribute', () => {
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) {
        return '-';
      }
      if (didChangeNature && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(nature)
      );
    });

  return updated;
}

function handleOnChange(state, action) {
  return state.update('modifiedData', obj => {
    const { selectedContentTypeFriendlyName, keys, value, oneThatIsCreatingARelationWithAnother } = action;

    const defaultRemoved = removeDefaultIfNeeded(obj, keys, value);
    if (defaultRemoved) {
      return defaultRemoved;
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return updateNatureFields(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (keys.length === 1 && keys.includes('target')) {
      return updateTargetFields(obj, action, value);
    }

    return obj.updateIn(keys, () => value);
  });
}

/* ---------- ON_CHANGE_ALLOWED_TYPE ---------- */

function toggleAllAllowedTypes(state, value) {
  return state.updateIn(['modifiedData', 'allowedTypes'], () => (value ? fromJS(['images', 'videos', 'files']) : null));
}

function toggleSpecificAllowedType(state, name, value) {
  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);
    if (list.includes(name)) {
      list = list.filter(v => v !== name);
      return list.size === 0 ? null : list;
    }
    return list.push(name);
  });
}

function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return toggleAllAllowedTypes(state, action.value);
  }
  return toggleSpecificAllowedType(state, action.name, action.value);
}

/* ---------- RESET & SET actions ---------- */

function resetPropsAndSetFormForAddingExistingComponent(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

function resetPropsAndSaveCurrentData(state, action) {
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
    .update('isCreatingComponentWhileAddingAField', () =>
      state.getIn(['modifiedData', 'createComponent'])
    );
}

function resetPropsAndSetFormForAddingComponentToDZ(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

function setDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/* ---------- ATTRIBUTE SCHEMA ---------- */

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
    return fromJS(modifiedDataToSetForEditing);
  }

  if (attributeType === 'component') {
    return fromJS(
      step === '1'
        ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
        : { ...options, type: 'component', repeatable: true }
    );
  }

  if (attributeType === 'dynamiczone') {
    return fromJS({ ...options, type: 'dynamiczone', components: [] });
  }

  if (attributeType === 'text') {
    return fromJS({ ...options, type: 'string' });
  }

  if (attributeType === 'number' || attributeType === 'date') {
    return fromJS(options);
  }

  if (attributeType === 'media') {
    return fromJS({
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    });
  }

  if (attributeType === 'enumeration') {
    return fromJS({ ...options, type: 'enumeration', enum: [] });
  }

  if (attributeType === 'relation') {
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

function setAttributeDataSchema(state, action) {
  const dataToSet = buildAttributeData(action);
  return state.update('modifiedData', () => dataToSet);
}

/* ---------- OTHER SIMPLE CASES ---------- */

function setDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

function setErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/* ---------- MAIN REDUCER ---------- */

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return addComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
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