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
 * Reduces state for ADD_COMPONENTS_TO_DYNAMIC_ZONE action
 * Adds or removes components from a dynamic zone list
 */
const handleAddComponentsToDynamicZone = (state, action) => {
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
};

/**
 * Reduces state for ON_CHANGE action when nature field changes
 * Updates related fields based on relation nature change
 */
const handleNatureChange = (obj, action) => {
  const { value, oneThatIsCreatingARelationWithAnother } = action;

  return obj
    .update('nature', () => value)
    .update('dominant', () => {
      return value === 'manyToMany' ? true : null;
    })
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }

      return pluralize(
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }

      return oldValue;
    });
};

/**
 * Reduces state for ON_CHANGE action when target field changes
 * Updates relation properties based on target restrictions
 */
const handleTargetChange = (obj, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, action: innerAction } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedObj = obj
    .update('target', () => action.value)
    .update('nature', currentNature => {
      if (targetContentTypeAllowedRelations === null) {
        return currentNature;
      }

      if (!targetContentTypeAllowedRelations.includes(currentNature)) {
        didChangeNatureBecauseOfRestrictedRelation = true;

        return targetContentTypeAllowedRelations[0];
      }

      return currentNature;
    });

  return updatedObj
    .update('name', () => {
      if (didChangeNatureBecauseOfRestrictedRelation) {
        return pluralize(
          snakeCase(selectedContentTypeFriendlyName),
          shouldPluralizeName(targetContentTypeAllowedRelations[0])
        );
      }

      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(updatedObj.get('nature'))
      );
    })
    .update('targetAttribute', () => {
      const nature = updatedObj.get('nature');

      if (['oneWay', 'manyWay'].includes(nature)) {
        return '-';
      }

      if (
        didChangeNatureCannotBeIncluded &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }

      return pluralize(
        snakeCase(innerAction.oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(nature)
      );
    });
};

/**
 * Reduces state for ON_CHANGE action - handles default date/time fields
 * Removes default value when switching away from date-like types
 */
const handleTypeDefaultCleanup = (obj, keys, value) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));

  if (
    hasDefaultValue &&
    keys.length === 1 &&
    keys.includes('type') &&
    ['date', 'datetime', 'time'].includes(obj.getIn(['type']))
  ) {
    return obj.updateIn(keys, () => value).remove('default');
  }

  return null;
};

/**
 * Main reducer handler for ON_CHANGE action
 * Coordinates field-specific updates based on keys and value
 */
const handleOnChange = (state, action) => {
  const { keys, value, selectedContentTypeFriendlyName } = action;
  const { oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations } = action;

  return state.update('modifiedData', obj => {
    // Handle default field cleanup for date/time types
    const typeCleanupResult = handleTypeDefaultCleanup(obj, keys, value);
    if (typeCleanupResult) {
      return typeCleanupResult;
    }

    // Handle nature field changes
    if (keys.length === 1 && keys.includes('nature')) {
      return handleNatureChange(obj, action);
    }

    // Handle target field changes
    if (keys.length === 1 && keys.includes('target')) {
      return handleTargetChange(obj, { ...action, selectedContentTypeFriendlyName });
    }

    // Default update for other fields
    return obj.updateIn(keys, () => value);
  });
};

/**
 * Reduces state for ON_CHANGE_ALLOWED_TYPE action
 * Manages the list of allowed media types (images, videos, files)
 */
const handleAllowedTypeChange = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);

    if (list.includes(action.name)) {
      list = list.filter(v => v !== action.name);

      if (list.size === 0) {
        return null;
      }

      return list;
    }

    return list.push(action.name);
  });
};

/**
 * Reduces state for RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action
 * Resets state but pre-fills form with component configuration
 */
const handleResetAndSetExistingComponent = (state, action) => {
  const { options } = action;

  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...options })
  );
};

/**
 * Reduces state for RESET_PROPS_AND_SAVE_CURRENT_DATA action
 * Finalizes component creation process
 */
const handleSaveComponentData = (state, action) => {
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
};

/**
 * Reduces state for RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ action
 * Prepares form for adding component to dynamic zone
 */
const handleAddComponentToDZForm = (state) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
};

/**
 * Reduces state for SET_DATA_TO_EDIT action
 * Populates form with existing data for editing
 */
const handleSetDataToEdit = (state, action) => {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
};

/**
 * Reduces state for SET_ATTRIBUTE_DATA_SCHEMA action
 * Initializes form state based on attribute type being created
 */
const handleSetAttributeDataSchema = (state, action) => {
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

  let dataToSet;

  if (attributeType === 'component') {
    if (step === '1') {
      dataToSet = {
        type: 'component',
        createComponent: true,
        componentToCreate: { type: 'component' },
      };
    } else {
      dataToSet = {
        ...options,
        type: 'component',
        repeatable: true,
      };
    }
  } else if (attributeType === 'dynamiczone') {
    dataToSet = {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
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
};

/**
 * Reduces state for SET_DYNAMIC_ZONE_DATA_SCHEMA action
 * Initializes dynamic zone form state for editing
 */
const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleAllowedTypeChange(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return handleResetAndSetExistingComponent(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleSaveComponentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleAddComponentToDZForm(state, action);
    case actions.SET_DATA_TO_EDIT:
      return handleSetDataToEdit(state, action);
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return handleSetDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

export default reducer;
export { initialState };