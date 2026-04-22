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
      return handleResetPropsAndSetFormForExistingComponent(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForDz(state);
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

/* -------------------------------------------------------------------------- */
/* Helper functions for each action type                                      */
/* -------------------------------------------------------------------------- */

function handleAddComponentsToDynamicZone(state, { name, components, shouldAddComponents }) {
  return state.updateIn(['modifiedData', name], list => {
    const updated = shouldAddComponents ? list.concat(components) : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updated.toJS()));
  });
}

/**
 * Handles generic field changes, delegating to more specific handlers when needed.
 */
function handleOnChange(state, action) {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    // 1️⃣ Default removal for date‑like types
    if (shouldRemoveDefaultForDateType(obj, keys, value)) {
      return removeDefaultAndUpdate(obj, keys, value);
    }

    // 2️⃣ Nature change (relation specifics)
    if (keys.length === 1 && keys.includes('nature')) {
      return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    // 3️⃣ Target change (relation specifics)
    if (keys.length === 1 && keys.includes('target')) {
      return handleTargetChange(obj, action, value);
    }

    // 4️⃣ Simple value update
    return obj.updateIn(keys, () => value);
  });
}

/* ---------- Default removal for date‑like types ---------- */
function shouldRemoveDefaultForDateType(obj, keys, value) {
  const hasDefault = Boolean(obj.getIn(['default']));
  return (
    hasDefault &&
    keys.length === 1 &&
    keys.includes('type') &&
    ['date', 'datetime', 'time'].includes(obj.getIn(['type'])) &&
    value !== undefined
  );
}

function removeDefaultAndUpdate(obj, keys, value) {
  return obj.updateIn(keys, () => value).remove('default');
}

/* ---------- Nature change handling ---------- */
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

/* ---------- Target change handling ---------- */
function handleTargetChange(obj, action, value) {
  const { selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations } = action;
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
      const natureForName = didChangeNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(natureForName));
    })
    .update('targetAttribute', () => {
      const currentNature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(currentNature)) {
        return '-';
      }
      if (
        didChangeNature &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(currentNature)
      );
    });

  return updated;
}

/* ---------- Allowed type toggle handling ---------- */
function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => (action.value ? fromJS(['images', 'videos', 'files']) : null));
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

/* ---------- Reset + set form for existing component ---------- */
function handleResetPropsAndSetFormForExistingComponent(_, { options }) {
  return initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...options }));
}

/* ---------- Reset + save newly created component ---------- */
function handleResetPropsAndSaveCurrentData(state, { options }) {
  const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
  const modifiedData = fromJS({
    name: componentToCreate.get('name'),
    type: 'component',
    repeatable: false,
    ...options,
    component: createComponentUid(componentToCreate.get('name'), componentToCreate.get('category')),
  });

  return initialState
    .update('componentToCreate', () => componentToCreate)
    .update('modifiedData', () => modifiedData)
    .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
}

/* ---------- Reset + set form for adding component to DZ ---------- */
function handleResetPropsAndSetFormForDz(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

/* ---------- Set data for editing ---------- */
function handleSetDataToEdit(state, { data }) {
  return state
    .updateIn(['modifiedData'], () => fromJS(data))
    .updateIn(['initialData'], () => fromJS(data));
}

/* ---------- Set attribute data schema ---------- */
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

  const dataToSet = buildAttributeSchema({
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid,
  });

  return state.update('modifiedData', () => fromJS(dataToSet));
}

/* ---------- Build attribute schema based on type ---------- */
function buildAttributeSchema({ attributeType, step, options, nameToSetForRelation, targetUid }) {
  if (attributeType === 'component') {
    return step === '1'
      ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
      : { ...options, type: 'component', repeatable: true };
  }

  if (attributeType === 'dynamiczone') {
    return { ...options, type: 'dynamiczone', components: [] };
  }

  if (attributeType === 'text') {
    return { ...options, type: 'string' };
  }

  if (attributeType === 'number' || attributeType === 'date') {
    return options;
  }

  if (attributeType === 'media') {
    return { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
  }

  if (attributeType === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }

  if (attributeType === 'relation') {
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
  }

  return { ...options, type: attributeType, default: null };
}

/* ---------- Set dynamic zone data schema ---------- */
function handleSetDynamicZoneDataSchema(state, { attributeToEdit }) {
  const data = fromJS(attributeToEdit);
  return state.update('modifiedData', () => data).update('initialData', () => data);
}

/* ---------- Set form errors ---------- */
function handleSetErrors(state, { errors }) {
  return state.update('formErrors', () => fromJS(errors));
}

export default reducer;
export { initialState };