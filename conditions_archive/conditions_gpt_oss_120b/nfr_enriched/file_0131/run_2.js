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

/* ---------- Helper Functions ---------- */

/**
 * Handles adding or removing components from a dynamic zone.
 */
function handleAddComponentsToDynamicZone(state, { name, components, shouldAddComponents }) {
  return state.updateIn(['modifiedData', name], list => {
    const updated = shouldAddComponents ? list.concat(components) : list.filter(c => components.indexOf(c) === -1);
    return List(makeUnique(updated.toJS()));
  });
}

/**
 * Handles generic onChange actions.
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

    // Remove default when changing type from date‑like values
    if (hasDefault && keys.length === 1 && keys.includes('type')) {
      const previous = obj.getIn(['type']);
      if (previous && ['date', 'datetime', 'time'].includes(previous)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    // Change nature – update related fields
    if (keys.length === 1 && keys.includes('nature')) {
      return updateNatureFields(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    // Change target – may affect nature, name, targetAttribute
    if (keys.length === 1 && keys.includes('target')) {
      return updateTargetFields(obj, action, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother);
    }

    // Default simple update
    return obj.updateIn(keys, () => value);
  });
}

/**
 * Updates fields when the relation nature changes.
 */
function updateNatureFields(obj, nature, creatorName) {
  return obj
    .update('nature', () => nature)
    .update('dominant', () => (nature === 'manyToMany' ? true : null))
    .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(nature)))
    .update('targetAttribute', old => {
      if (['oneWay', 'manyWay'].includes(nature)) {
        return '-';
      }
      const base = old === '-' ? snakeCase(creatorName) : old;
      return pluralize(base, shouldPluralizeTargetAttribute(nature));
    })
    .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(nature) ? null : old));
}

/**
 * Updates fields when the relation target changes.
 */
function updateTargetFields(obj, action, targetValue, friendlyName, creatorName) {
  const { targetContentTypeAllowedRelations } = action;
  let natureChanged = false;

  const updated = obj
    .update('target', () => targetValue)
    .update('nature', current => {
      if (!targetContentTypeAllowedRelations) return current;
      if (!targetContentTypeAllowedRelations.includes(current)) {
        natureChanged = true;
        return targetContentTypeAllowedRelations[0];
      }
      return current;
    })
    .update('name', () => {
      const nature = natureChanged ? targetContentTypeAllowedRelations[0] : obj.get('nature');
      return pluralize(snakeCase(friendlyName), shouldPluralizeName(nature));
    })
    .update('targetAttribute', () => {
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) return '-';
      if (natureChanged && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) return '-';
      return pluralize(snakeCase(creatorName), shouldPluralizeTargetAttribute(nature));
    });

  return updated;
}

/**
 * Handles allowed type toggling.
 */
function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], list => {
    let current = list || fromJS([]);
    if (current.includes(action.name)) {
      current = current.filter(v => v !== action.name);
      return current.size === 0 ? null : current;
    }
    return current.push(action.name);
  });
}

/**
 * Resets state and prepares form for adding an existing component.
 */
function handleResetPropsAndSetFormForAddingExistingComp(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * Resets state and saves data for a newly created component.
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
 * Resets state and prepares form for adding a component to a dynamic zone.
 */
function handleResetPropsAndSetFormForAddingCompoToDz(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * Sets data for editing an existing attribute.
 */
function handleSetDataToEdit(state, action) {
  const data = fromJS(action.data);
  return state.updateIn(['modifiedData'], () => data).updateIn(['initialData'], () => data);
}

/**
 * Sets the attribute data schema based on the attribute type.
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

  const dataToSet = buildAttributeSchema({
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid,
  });

  return state.update('modifiedData', () => fromJS(dataToSet));
}

/**
 * Builds attribute schema objects for various attribute types.
 */
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

/**
 * Sets dynamic zone data schema.
 */
function handleSetDynamicZoneDataSchema(state, action) {
  const data = fromJS(action.attributeToEdit);
  return state.update('modifiedData', () => data).update('initialData', () => data);
}

/**
 * Sets form errors.
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

/* ---------- Reducer ---------- */

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
      return handleResetPropsAndSetFormForAddingExistingComp(state, action);

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