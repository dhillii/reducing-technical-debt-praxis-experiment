```javascript
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

// Helper function to update the modified data for a given key
/**
 * Updates the modified data for a given key.
 * @param {Object} state - The current state.
 * @param {string} key - The key to update.
 * @param {*} value - The new value.
 * @returns {Object} The updated state.
 */
const updateModifiedData = (state, key, value) => {
  return state.update('modifiedData', obj => obj.updateIn([key], () => value));
};

// Helper function to update the nature and related fields
/**
 * Updates the nature and related fields.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const updateNatureAndRelatedFields = (state, action) => {
  const { selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, value } = action;
  return state.update('modifiedData', obj => {
    return obj
      .update('nature', () => value)
      .update('dominant', () => {
        if (value === 'manyToMany') {
          return true;
        }

        return null;
      })
      .update('name', oldValue => {
        return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
      })
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
  });
};

// Helper function to update the target and related fields
/**
 * Updates the target and related fields.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const updateTargetAndRelatedFields = (state, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, value } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  return state.update('modifiedData', obj => {
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
        if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
          return '-';
        }

        if (
          didChangeNatureBecauseOfRestrictedRelation &&
          ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
        ) {
          return '-';
        }

        return pluralize(
          snakeCase(action.oneThatIsCreatingARelationWithAnother),
          shouldPluralizeTargetAttribute(obj.get('nature'))
        );
      });
  });
};

// Helper function to update the allowed types
/**
 * Updates the allowed types.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const updateAllowedTypes = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      if (action.value) {
        return fromJS(['images', 'videos', 'files']);
      }

      return null;
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

// Helper function to reset props
/**
 * Resets the props.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const resetProps = (state, action) => {
  if (action.options) {
    return initialState.update('modifiedData', () =>
      fromJS({ type: 'component', repeatable: true, ...action.options })
    );
  }

  return initialState;
};

// Helper function to reset props and save current data
/**
 * Resets the props and saves the current data.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const resetPropsAndSaveCurrentData = (state, action) => {
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

// Helper function to reset props and set the form for adding a component to a dynamic zone
/**
 * Resets the props and sets the form for adding a component to a dynamic zone.
 * @param {Object} state - The current state.
 * @returns {Object} The updated state.
 */
const resetPropsAndSetFormForAddingComponentToDynamicZone = state => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
};

// Helper function to set data to edit
/**
 * Sets the data to edit.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const setDataToEdit = (state, action) => {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
};

// Helper function to set attribute data schema
/**
 * Sets the attribute data schema.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const setAttributeDataSchema = (state, action) => {
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

// Helper function to set dynamic zone data schema
/**
 * Sets the dynamic zone data schema.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const setDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

// Helper function to set errors
/**
 * Sets the errors.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const setErrors = (state, action) => {
  return state.update('formErrors', () => fromJS(action.errors));
};

// Helper function to add components to dynamic zone
/**
 * Adds components to dynamic zone.
 * @param {Object} state - The current state.
 * @param {Object} action - The action object.
 * @returns {Object} The updated state.
 */
const addComponentsToDynamicZone = (state, action) => {
  const { name, components, shouldAddComponents } = action;

  return state.updateIn(['modifiedData', name], list => {
    let updatedList = list;

    if (shouldAddComponents) {
      updatedList = list.concat(components);
    } else {
      updatedList = list.filter(comp => {
        return components.indexOf(comp) === -1;
      });
    }

    return List(makeUnique(updatedList.toJS()));
  });
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return addComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      if (action.keys.length === 1 && action.keys.includes('nature')) {
        return updateNatureAndRelatedFields(state, action);
      }

      if (action.keys.length === 1 && action.keys.includes('target')) {
        return updateTargetAndRelatedFields(state, action);
      }

      return updateModifiedData(state, action.keys[0], action.value);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return updateAllowedTypes(state, action);
    case actions.RESET_PROPS:
      return resetProps(state, action);
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return resetProps(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return resetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return resetPropsAndSetFormForAddingComponentToDynamicZone(state);
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
```