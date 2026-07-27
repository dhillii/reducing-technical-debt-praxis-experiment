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

/* ---------- ON_CHANGE helpers ---------- */

function shouldRemoveDefault(obj, keys) {
  const hasDefault = Boolean(obj.getIn(['default']));
  return (
    hasDefault &&
    keys.length === 1 &&
    keys.includes('type') &&
    ['date', 'datetime', 'time'].includes(obj.getIn(['type']))
  );
}

function updateNatureRelated(obj, action) {
  const { value, oneThatIsCreatingARelationWithAnother } = action;

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
      const base =
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }
      return oldValue;
    });
}

function updateTargetRelated(obj, action) {
  const {
    value,
    selectedContentTypeFriendlyName,
    oneThatIsCreatingARelationWithAnother,
    targetContentTypeAllowedRelations,
  } = action;

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
      const natureForName = didChangeNatureBecauseOfRestrictedRelation
        ? targetContentTypeAllowedRelations[0]
        : obj.get('nature');
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(natureForName)
      );
    })
    .update('targetAttribute', () => {
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) {
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
        shouldPluralizeTargetAttribute(nature)
      );
    });

  return updated;
}

function handleOnChange(state, action) {
  return state.update('modifiedData', obj => {
    const { keys, value } = action;

    if (shouldRemoveDefault(obj, keys)) {
      return obj.updateIn(keys, () => value).remove('default');
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return updateNatureRelated(obj, action);
    }

    if (keys.length === 1 && keys.includes('target')) {
      return updateTargetRelated(obj, action);
    }

    return obj.updateIn(keys, () => value);
  });
}

/* ---------- ON_CHANGE_ALLOWED_TYPE ---------- */

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

/* ---------- RESET_PROPS ---------- */

function handleResetProps() {
  return initialState;
}

/* ---------- RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO ---------- */

function handleResetPropsAndSetFormForAddingExisting(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/* ---------- RESET_PROPS_AND_SAVE_CURRENT_DATA ---------- */

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

/* ---------- RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ ---------- */

function handleResetPropsAndSetFormForAddingComponentToDZ(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
}

/* ---------- SET_DATA_TO_EDIT ---------- */

function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/* ---------- SET_ATTRIBUTE_DATA_SCHEMA ---------- */

function buildAttributeDataSchema(action) {
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

  if (attributeType === 'component') {
    dataToSet =
      step === '1'
        ? {
            type: 'component',
            createComponent: true,
            componentToCreate: { type: 'component' },
          }
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

  return { modified: fromJS(dataToSet) };
}

function handleSetAttributeDataSchema(state, action) {
  const result = buildAttributeDataSchema(action);

  if (action.isEditing) {
    return state
      .update('modifiedData', () => result.modified)
      .update('initialData', () => result.initial);
  }

  return state.update('modifiedData', () => result.modified);
}

/* ---------- SET_DYNAMIC_ZONE_DATA_SCHEMA ---------- */

function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/* ---------- SET_ERRORS ---------- */

function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/* ---------- MAIN REDUCER ---------- */

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
      return handleResetPropsAndSetFormForAddingExisting(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForAddingComponentToDZ(state);
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