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

/**
 * Handles adding or removing components from a dynamic zone
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing name, components, and shouldAddComponents
 * @returns {Object} Updated state
 */
const handleAddComponentsToDynamicZone = (state, action) => {
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

/**
 * Handles field changes in the form
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing keys, value, and related data
 * @returns {Object} Updated state
 */
const handleChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;
  const modifiedData = state.get('modifiedData');
  const hasDefaultValue = Boolean(modifiedData.getIn(['default']));

  // Handle type changes for date/time fields
  if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
    const previousType = modifiedData.getIn(['type']);

    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return modifiedData.updateIn(keys, () => value).remove('default');
    }
  }

  // Handle nature changes
  if (keys.length === 1 && keys.includes('nature')) {
    return modifiedData
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
  }

  // Handle target changes
  if (keys.length === 1 && keys.includes('target')) {
    const { targetContentTypeAllowedRelations } = action;
    let didChangeNatureBecauseOfRestrictedRelation = false;

    return modifiedData
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
          shouldPluralizeName(modifiedData.get('nature'))
        );
      })
      .update('targetAttribute', () => {
        if (['oneWay', 'manyWay'].includes(modifiedData.get('nature'))) {
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
          shouldPluralizeTargetAttribute(modifiedData.get('nature'))
        );
      });
  }

  return modifiedData.updateIn(keys, () => value);
};

/**
 * Handles allowed type changes
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing name and value
 * @returns {Object} Updated state
 */
const handleChangeAllowedType = (state, action) => {
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

/**
 * Handles setting attribute data schema based on attribute type
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing attributeType and related data
 * @returns {Object} Updated state
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
 * Handles setting dynamic zone data schema
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing attributeToEdit
 * @returns {Object} Updated state
 */
const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

/**
 * Handles setting data to edit
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing data
 * @returns {Object} Updated state
 */
const handleSetDataToEdit = (state, action) => {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
};

/**
 * Handles setting form errors
 * @param {Object} state - Current reducer state
 * @param {Object} action - Action containing errors
 * @returns {Object} Updated state
 */
const handleSetErrors = (state, action) => {
  return state.update('formErrors', () => fromJS(action.errors));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);

    case actions.ON_CHANGE:
      return handleChange(state, action);

    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleChangeAllowedType(state, action);

    case actions.RESET_PROPS:
      return initialState;

    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMO:
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
```