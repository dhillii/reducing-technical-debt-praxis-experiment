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
 * Checks if the previous type is a date-related type
 * @param {string} previousType - The previous type value
 * @returns {boolean} - True if type is date, datetime, or time
 */
const isDateType = (previousType) => {
  return ['date', 'datetime', 'time'].includes(previousType);
};

/**
 * Checks if the value is a relation type
 * @param {string} value - The value to check
 * @returns {boolean} - True if value is oneWay or manyWay
 */
const isRelationType = (value) => {
  return ['oneWay', 'manyWay'].includes(value);
};

/**
 * Checks if the nature is a relation type
 * @param {string} nature - The nature value to check
 * @returns {boolean} - True if nature is oneWay or manyWay
 */
const isRelationNature = (nature) => {
  return ['oneWay', 'manyWay'].includes(nature);
};

/**
 * Checks if the targetContentTypeAllowedRelations is null
 * @param {any} targetContentTypeAllowedRelations - The relations to check
 * @returns {boolean} - True if relations is null
 */
const isRelationsNull = (targetContentTypeAllowedRelations) => {
  return targetContentTypeAllowedRelations === null;
};

/**
 * Checks if currentNature is not in the allowed relations
 * @param {any} targetContentTypeAllowedRelations - The allowed relations
 * @param {string} currentNature - The current nature value
 * @returns {boolean} - True if currentNature is not in allowed relations
 */
const isNatureRestricted = (targetContentTypeAllowedRelations, currentNature) => {
  return !targetContentTypeAllowedRelations.includes(currentNature);
};

/**
 * Checks if the target attribute should be set to dash
 * @param {string} nature - The nature value
 * @returns {boolean} - True if nature is relation type
 */
const shouldSetTargetAttributeDash = (nature) => {
  return isRelationNature(nature);
};

/**
 * Checks if the target column name should be set to null
 * @param {string} nature - The nature value
 * @returns {boolean} - True if nature is relation type
 */
const shouldSetTargetColumnNameNull = (nature) => {
  return isRelationNature(nature);
};

/**
 * Checks if the attribute type is a relation
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is relation
 */
const isRelationAttributeType = (attributeType) => {
  return attributeType === 'relation';
};

/**
 * Checks if the attribute type is a media type
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is media
 */
const isMediaAttributeType = (attributeType) => {
  return attributeType === 'media';
};

/**
 * Checks if the attribute type is an enumeration
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is enumeration
 */
const isEnumerationAttributeType = (attributeType) => {
  return attributeType === 'enumeration';
};

/**
 * Checks if the attribute type is a text type
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is text
 */
const isTextAttributeType = (attributeType) => {
  return attributeType === 'text';
};

/**
 * Checks if the attribute type is a number or date
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is number or date
 */
const isNumberOrDateAttributeType = (attributeType) => {
  return attributeType === 'number' || attributeType === 'date';
};

/**
 * Checks if the attribute type is a component
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is component
 */
const isComponentAttributeType = (attributeType) => {
  return attributeType === 'component';
};

/**
 * Checks if the attribute type is a dynamiczone
 * @param {string} attributeType - The attribute type
 * @returns {boolean} - True if attributeType is dynamiczone
 */
const isDynamicZoneAttributeType = (attributeType) => {
  return attributeType === 'dynamiczone';
};

/**
 * Checks if the step is the first step
 * @param {string} step - The step value
 * @returns {boolean} - True if step is '1'
 */
const isFirstStep = (step) => {
  return step === '1';
};

/**
 * Checks if the action name is 'all'
 * @param {string} name - The action name
 * @returns {boolean} - True if name is 'all'
 */
const isAllAction = (name) => {
  return name === 'all';
};

/**
 * Checks if the list includes the action name
 * @param {List} list - The list to check
 * @param {string} actionName - The action name to check
 * @returns {boolean} - True if list includes action name
 */
const listIncludesActionName = (list, actionName) => {
  return list.includes(actionName);
};

/**
 * Checks if the list is empty
 * @param {List} list - The list to check
 * @returns {boolean} - True if list is empty
 */
const isListEmpty = (list) => {
  return list.size === 0;
};

/**
 * Checks if the keys length is 1 and includes type
 * @param {Array} keys - The keys array
 * @returns {boolean} - True if keys length is 1 and includes type
 */
const isTypeKey = (keys) => {
  return keys.length === 1 && keys.includes('type');
};

/**
 * Checks if the keys length is 1 and includes nature
 * @param {Array} keys - The keys array
 * @returns {boolean} - True if keys length is 1 and includes nature
 */
const isNatureKey = (keys) => {
  return keys.length === 1 && keys.includes('nature');
};

/**
 * Checks if the keys length is 1 and includes target
 * @param {Array} keys - The keys array
 * @returns {boolean} - True if keys length is 1 and includes target
 */
const isTargetKey = (keys) => {
  return keys.length === 1 && keys.includes('target');
};

/**
 * Checks if the action has default value
 * @param {Object} obj - The object to check
 * @returns {boolean} - True if obj has default
 */
const hasDefaultValue = (obj) => {
  return Boolean(obj.getIn(['default']));
};

/**
 * Checks if the action is editing
 * @param {Object} action - The action object
 * @returns {boolean} - True if action is editing
 */
const isEditingAction = (action) => {
  return action.isEditing;
};

/**
 * Checks if the action is creating a component
 * @param {Object} action - The action object
 * @returns {boolean} - True if action is creating component
 */
const isCreatingComponentAction = (action) => {
  return action.isCreatingComponent;
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        if (!shouldAddComponents) {
          return List(makeUnique(list.filter(comp => {
            return components.indexOf(comp) === -1;
          }).toJS()));
        }

        return List(makeUnique(list.concat(components).toJS()));
      });
    }
    case actions.ON_CHANGE: {
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
      } = action;
      const obj = state.get('modifiedData');
      const hasDefaultValue = hasDefaultValue(obj);

      if (isTypeKey(keys) && hasDefaultValue) {
        const previousType = obj.getIn(['type']);
        if (isDateType(previousType)) {
          return obj.updateIn(keys, () => value).remove('default');
        }
      }

      if (isNatureKey(keys)) {
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
            if (isRelationType(value)) {
              return '-';
            }
            return pluralize(
              oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
              shouldPluralizeTargetAttribute(value)
            );
          })
          .update('targetColumnName', oldValue => {
            if (isRelationType(value)) {
              return null;
            }
            return oldValue;
          });
      }

      if (isTargetKey(keys)) {
        const { targetContentTypeAllowedRelations } = action;
        let didChangeNatureBecauseOfRestrictedRelation = false;

        return obj
          .update('target', () => value)
          .update('nature', currentNature => {
            if (isRelationsNull(targetContentTypeAllowedRelations)) {
              return currentNature;
            }
            if (isNatureRestricted(targetContentTypeAllowedRelations, currentNature)) {
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
            if (shouldSetTargetAttributeDash(obj.get('nature'))) {
              return '-';
            }
            if (
              didChangeNatureBecauseOfRestrictedRelation &&
              shouldSetTargetAttributeDash(targetContentTypeAllowedRelations[0])
            ) {
              return '-';
            }
            return pluralize(
              snakeCase(oneThatIsCreatingARelationWithAnother),
              shouldPluralizeTargetAttribute(obj.get('nature'))
            );
          });
      }

      return obj.updateIn(keys, () => value);
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (isAllAction(action.name)) {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (action.value) {
            return fromJS(['images', 'videos', 'files']);
          }
          return null;
        });
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
        const list = currentList || fromJS([]);
        if (listIncludesActionName(list, action.name)) {
          const filteredList = list.filter(v => v !== action.name);
          if (isListEmpty(filteredList)) {
            return null;
          }
          return filteredList;
        }
        return list.push(action.name);
      });
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

      if (isEditingAction(action)) {
        return state
          .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
          .update('initialData', () => fromJS(modifiedDataToSetForEditing));
      }

      let dataToSet;

      if (isComponentAttributeType(attributeType)) {
        if (isFirstStep(step)) {
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
      } else if (isDynamicZoneAttributeType(attributeType)) {
        dataToSet = {
          ...options,
          type: 'dynamiczone',
          components: [],
        };
      } else if (isTextAttributeType(attributeType)) {
        dataToSet = { ...options, type: 'string' };
      } else if (isNumberOrDateAttributeType(attributeType)) {
        dataToSet = options;
      } else if (isMediaAttributeType(attributeType)) {
        dataToSet = {
          allowedTypes: ['images', 'files', 'videos'],
          type: 'media',
          multiple: true,
          ...options,
        };
      } else if (isEnumerationAttributeType(attributeType)) {
        dataToSet = { ...options, type: 'enumeration', enum: [] };
      } else if (isRelationAttributeType(attributeType)) {
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