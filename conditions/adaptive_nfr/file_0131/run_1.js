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

/** @param {*} list - The list to update */
/** @param {string[]} components - Components to add or remove */
/** @param {boolean} shouldAddComponents - Whether to add or remove */
const updateDynamicZoneList = (list, components, shouldAddComponents) => {
  if (shouldAddComponents) {
    return List(makeUnique(list.concat(components).toJS()));
  }
  return List(makeUnique(list.filter(comp => components.indexOf(comp) === -1).toJS()));
};

/** @param {*} obj - The object to check */
const hasDefaultValueAndTypeKey = (obj, keys) => {
  return Boolean(obj.getIn(['default'])) && keys.length === 1 && keys.includes('type');
};

/** @param {string} previousType - The previous type value */
const isTemporalType = (previousType) => {
  return previousType && ['date', 'datetime', 'time'].includes(previousType);
};

/** @param {string[]} keys - The keys being updated */
const isNatureKeyUpdate = (keys) => {
  return keys.length === 1 && keys.includes('nature');
};

/** @param {string[]} keys - The keys being updated */
const isTargetKeyUpdate = (keys) => {
  return keys.length === 1 && keys.includes('target');
};

/** @param {string} value - The nature value */
const isOneWayOrManyWay = (value) => {
  return ['oneWay', 'manyWay'].includes(value);
};

/** @param {*} obj - The object to update */
/** @param {string} value - The new nature value */
/** @param {string} oneThatIsCreatingARelationWithAnother - The relation name */
const updateNatureRelation = (obj, value, oneThatIsCreatingARelationWithAnother) => {
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

/** @param {*} obj - The object to update */
/** @param {string} value - The new target value */
/** @param {string} selectedContentTypeFriendlyName - The content type name */
/** @param {string[]} targetContentTypeAllowedRelations - Allowed relations */
/** @param {string} oneThatIsCreatingARelationWithAnother - The relation name */
const updateTargetRelation = (obj, value, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, oneThatIsCreatingARelationWithAnother) => {
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
      if (didChangeNatureBecauseOfRestrictedRelation && isOneWayOrManyWay(targetContentTypeAllowedRelations[0])) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(currentNature)
      );
    });
};

/** @param {*} currentList - The current allowed types list */
/** @param {string} name - The type name to toggle */
const updateAllowedTypesList = (currentList, name) => {
  let list = currentList || fromJS([]);
  if (list.includes(name)) {
    list = list.filter(v => v !== name);
    return list.size === 0 ? null : list;
  }
  return list.push(name);
};

/** @param {string} attributeType - The attribute type */
/** @param {string} step - The step for component creation */
/** @param {*} options - Additional options */
const getComponentDataToSet = (attributeType, step, options) => {
  if (step === '1') {
    return {
      type: 'component',
      createComponent: true,
      componentToCreate: { type: 'component' },
    };
  }
  return {
    ...options,
    type: 'component',
    repeatable: true,
  };
};

/** @param {string} attributeType - The attribute type */
/** @param {*} options - Additional options */
const getAttributeDataToSet = (attributeType, options) => {
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
    return {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  }
  if (attributeType === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }
  return { ...options, type: attributeType, default: null };
};

/** @param {string} nameToSetForRelation - The relation name */
/** @param {string} targetUid - The target UID */
const getRelationDataToSet = (nameToSetForRelation, targetUid) => {
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
};

/** @param {string} attributeType - The attribute type */
/** @param {string} step - The step for component creation */
/** @param {*} options - Additional options */
/** @param {string} nameToSetForRelation - The relation name */
/** @param {string} targetUid - The target UID */
const buildAttributeDataSchema = (attributeType, step, options, nameToSetForRelation, targetUid) => {
  if (attributeType === 'component') {
    return getComponentDataToSet(attributeType, step, options);
  }
  if (attributeType === 'relation') {
    return getRelationDataToSet(nameToSetForRelation, targetUid);
  }
  return getAttributeDataToSet(attributeType, options);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      return state.updateIn(['modifiedData', name], list =>
        updateDynamicZoneList(list, components, shouldAddComponents)
      );
    }
    case actions.ON_CHANGE:
      return state.update('modifiedData', obj => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
        } = action;

        if (hasDefaultValueAndTypeKey(obj, keys)) {
          const previousType = obj.getIn(['type']);
          if (isTemporalType(previousType)) {
            return obj.updateIn(keys, () => value).remove('default');
          }
        }

        if (isNatureKeyUpdate(keys)) {
          return updateNatureRelation(obj, value, oneThatIsCreatingARelationWithAnother);
        }

        if (isTargetKeyUpdate(keys)) {
          const { targetContentTypeAllowedRelations } = action;
          return updateTargetRelation(
            obj,
            value,
            selectedContentTypeFriendlyName,
            targetContentTypeAllowedRelations,
            oneThatIsCreatingARelationWithAnother
          );
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          return action.value ? fromJS(['images', 'videos', 'files']) : null;
        });
      }
      return state.updateIn(['modifiedData', 'allowedTypes'], currentList =>
        updateAllowedTypesList(currentList, action.name)
      );
    }
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

      const dataToSet = buildAttributeDataSchema(
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