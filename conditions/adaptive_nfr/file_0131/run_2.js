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

/** @param {string} previousType - The previous attribute type */
const isTemporalType = (previousType) => ['date', 'datetime', 'time'].includes(previousType);

/** @param {string} nature - The relation nature */
const isOneWayOrManyWay = (nature) => ['oneWay', 'manyWay'].includes(nature);

/** @param {Array} keys - The keys being updated */
const isUpdatingType = (keys) => keys.length === 1 && keys.includes('type');

/** @param {Array} keys - The keys being updated */
const isUpdatingNature = (keys) => keys.length === 1 && keys.includes('nature');

/** @param {Array} keys - The keys being updated */
const isUpdatingTarget = (keys) => keys.length === 1 && keys.includes('target');

/** @param {*} defaultValue - The default value to check */
const hasDefaultValue = (defaultValue) => Boolean(defaultValue);

/**
 * Handles type change with default value removal for temporal types
 * @param {*} obj - The immutable object
 * @param {Array} keys - The keys being updated
 * @param {*} value - The new value
 * @returns {*} Updated object or null if no update needed
 */
const handleTypeChange = (obj, keys, value) => {
  if (!isUpdatingType(keys)) {
    return null;
  }

  const previousType = obj.getIn(['type']);
  if (!previousType || !isTemporalType(previousType)) {
    return null;
  }

  return obj.updateIn(keys, () => value).remove('default');
};

/**
 * Handles nature change with related field updates
 * @param {*} obj - The immutable object
 * @param {*} value - The new nature value
 * @param {string} oneThatIsCreatingARelationWithAnother - The relation source
 * @returns {*} Updated object or null if no update needed
 */
const handleNatureChange = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (isOneWayOrManyWay(value)) {
        return '-';
      }
      return pluralize(
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => (isOneWayOrManyWay(value) ? null : oldValue));
};

/**
 * Handles target change with nature and attribute updates
 * @param {*} obj - The immutable object
 * @param {*} value - The new target value
 * @param {Array} targetContentTypeAllowedRelations - Allowed relations
 * @param {string} selectedContentTypeFriendlyName - The content type name
 * @param {string} oneThatIsCreatingARelationWithAnother - The relation source
 * @returns {*} Updated object
 */
const handleTargetChange = (
  obj,
  value,
  targetContentTypeAllowedRelations,
  selectedContentTypeFriendlyName,
  oneThatIsCreatingARelationWithAnother
) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

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
      const nature = didChangeNatureBecauseOfRestrictedRelation
        ? targetContentTypeAllowedRelations[0]
        : obj.get('nature');
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(nature));
    })
    .update('targetAttribute', () => {
      const currentNature = obj.get('nature');
      if (isOneWayOrManyWay(currentNature)) {
        return '-';
      }

      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        isOneWayOrManyWay(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }

      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(currentNature)
      );
    });
};

/**
 * Handles ON_CHANGE action for modifiedData
 * @param {*} obj - The immutable object
 * @param {Object} actionData - The action data
 * @returns {*} Updated object
 */
const handleOnChange = (obj, actionData) => {
  const { keys, value, oneThatIsCreatingARelationWithAnother, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations } = actionData;

  const typeChangeResult = handleTypeChange(obj, keys, value);
  if (typeChangeResult) {
    return typeChangeResult;
  }

  if (isUpdatingNature(keys)) {
    return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
  }

  if (isUpdatingTarget(keys)) {
    return handleTargetChange(
      obj,
      value,
      targetContentTypeAllowedRelations,
      selectedContentTypeFriendlyName,
      oneThatIsCreatingARelationWithAnother
    );
  }

  return obj.updateIn(keys, () => value);
};

/**
 * Handles allowed types change
 * @param {*} state - The current state
 * @param {Object} action - The action object
 * @returns {*} Updated state
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
      return list.size === 0 ? null : list;
    }

    return list.push(action.name);
  });
};

/**
 * Determines the data to set based on attribute type
 * @param {string} attributeType - The attribute type
 * @param {string} step - The current step
 * @param {Object} options - Additional options
 * @param {string} nameToSetForRelation - The relation name
 * @param {string} targetUid - The target UID
 * @returns {Object} The data to set
 */
const getDataToSetForAttributeType = (attributeType, step, options, nameToSetForRelation, targetUid) => {
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
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        const updatedList = shouldAddComponents
          ? list.concat(components)
          : list.filter(comp => components.indexOf(comp) === -1);

        return List(makeUnique(updatedList.toJS()));
      });
    }
    case actions.ON_CHANGE:
      return state.update('modifiedData', obj => handleOnChange(obj, action));
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleAllowedTypeChange(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO: {
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    }
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
    case actions.SET_DATA_TO_EDIT: {
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    }
    case actions.SET_ATTRIBUTE_DATA_SCHEMA: {
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

      const dataToSet = getDataToSetForAttributeType(
        attributeType,
        step,
        options,
        nameToSetForRelation,
        targetUid
      );

      return state.update('modifiedData', () => fromJS(dataToSet));
    }
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA: {
      return state
        .update('modifiedData', () => fromJS(action.attributeToEdit))
        .update('initialData', () => fromJS(action.attributeToEdit));
    }
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

export default reducer;
export { initialState };