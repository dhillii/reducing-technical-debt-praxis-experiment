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
 * Checks if the default value should be removed.
 * @param {Object} obj - The object to check.
 * @param {Array} keys - The keys to check.
 * @param {String} value - The new value.
 * @returns {Boolean} True if the default value should be removed, false otherwise.
 */
function shouldRemoveDefaultValue(obj, keys, value) {
  return Boolean(obj.getIn(['default'])) && keys.length === 1 && keys.includes('type');
}

/**
 * Updates the nature and target attribute based on the new value.
 * @param {Object} obj - The object to update.
 * @param {String} value - The new value.
 * @param {String} oneThatIsCreatingARelationWithAnother - The name of the component creating the relation.
 * @returns {Object} The updated object.
 */
function updateNatureAndTargetAttribute(obj, value, oneThatIsCreatingARelationWithAnother) {
  if (value === 'manyToMany') {
    return obj.update('dominant', () => true);
  }

  return obj.update('dominant', () => null);
}

/**
 * Updates the name based on the new value.
 * @param {Object} obj - The object to update.
 * @param {String} value - The new value.
 * @param {String} oldValue - The old value.
 * @returns {Object} The updated object.
 */
function updateName(obj, value, oldValue) {
  return obj.update('name', oldValue => {
    return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
  });
}

/**
 * Updates the target attribute based on the new value.
 * @param {Object} obj - The object to update.
 * @param {String} value - The new value.
 * @param {String} oldValue - The old value.
 * @param {String} oneThatIsCreatingARelationWithAnother - The name of the component creating the relation.
 * @returns {Object} The updated object.
 */
function updateTargetAttribute(obj, value, oldValue, oneThatIsCreatingARelationWithAnother) {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('targetAttribute', () => '-');
  }

  return obj.update('targetAttribute', oldValue => {
    return pluralize(
      oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
      shouldPluralizeTargetAttribute(value)
    );
  });
}

/**
 * Updates the target column name based on the new value.
 * @param {Object} obj - The object to update.
 * @param {String} value - The new value.
 * @param {String} oldValue - The old value.
 * @returns {Object} The updated object.
 */
function updateTargetColumnName(obj, value, oldValue) {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('targetColumnName', () => null);
  }

  return obj.update('targetColumnName', () => oldValue);
}

/**
 * Checks if the nature should be updated based on the target content type allowed relations.
 * @param {Object} obj - The object to check.
 * @param {Array} targetContentTypeAllowedRelations - The target content type allowed relations.
 * @returns {Boolean} True if the nature should be updated, false otherwise.
 */
function shouldUpdateNature(obj, targetContentTypeAllowedRelations) {
  return targetContentTypeAllowedRelations !== null && !targetContentTypeAllowedRelations.includes(obj.get('nature'));
}

/**
 * Updates the nature based on the target content type allowed relations.
 * @param {Object} obj - The object to update.
 * @param {Array} targetContentTypeAllowedRelations - The target content type allowed relations.
 * @returns {Object} The updated object.
 */
function updateNature(obj, targetContentTypeAllowedRelations) {
  if (shouldUpdateNature(obj, targetContentTypeAllowedRelations)) {
    return obj.update('nature', () => targetContentTypeAllowedRelations[0]);
  }

  return obj;
}

/**
 * Updates the name based on the new nature.
 * @param {Object} obj - The object to update.
 * @param {String} selectedContentTypeFriendlyName - The selected content type friendly name.
 * @param {Array} targetContentTypeAllowedRelations - The target content type allowed relations.
 * @returns {Object} The updated object.
 */
function updateNameBasedOnNature(obj, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations) {
  return obj.update('name', () => {
    return pluralize(
      snakeCase(selectedContentTypeFriendlyName),
      shouldPluralizeName(targetContentTypeAllowedRelations[0])
    );
  });
}

/**
 * Updates the target attribute based on the new nature.
 * @param {Object} obj - The object to update.
 * @param {String} oneThatIsCreatingARelationWithAnother - The name of the component creating the relation.
 * @param {Array} targetContentTypeAllowedRelations - The target content type allowed relations.
 * @returns {Object} The updated object.
 */
function updateTargetAttributeBasedOnNature(obj, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations) {
  if (['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) {
    return obj.update('targetAttribute', () => '-');
  }

  return obj.update('targetAttribute', () => {
    return pluralize(
      snakeCase(oneThatIsCreatingARelationWithAnother),
      shouldPluralizeTargetAttribute(obj.get('nature'))
    );
  });
}

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
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
    }
    case actions.ON_CHANGE:
      return state.update('modifiedData', obj => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
        } = action;

        if (shouldRemoveDefaultValue(obj, keys, value)) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (keys.length === 1 && keys.includes('nature')) {
          return obj
            .update('nature', () => value)
            .update('dominant', () => updateNatureAndTargetAttribute(obj, value, oneThatIsCreatingARelationWithAnother).get('dominant'))
            .update('name', oldValue => updateName(obj, value, oldValue).get('name'))
            .update('targetAttribute', oldValue => updateTargetAttribute(obj, value, oldValue, oneThatIsCreatingARelationWithAnother).get('targetAttribute'))
            .update('targetColumnName', oldValue => updateTargetColumnName(obj, value, oldValue).get('targetColumnName'));
        }

        if (keys.length === 1 && keys.includes('target')) {
          const { targetContentTypeAllowedRelations } = action;
          let didChangeNatureBecauseOfRestrictedRelation = false;

          return obj
            .update('target', () => value)
            .update('nature', currentNature => {
              const updatedObj = updateNature(obj, targetContentTypeAllowedRelations);
              didChangeNatureBecauseOfRestrictedRelation = updatedObj.get('nature') !== currentNature;
              return updatedObj.get('nature');
            })
            .update('name', () => {
              if (didChangeNatureBecauseOfRestrictedRelation) {
                return updateNameBasedOnNature(obj, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations).get('name');
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

              return updateTargetAttributeBasedOnNature(obj, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations).get('targetAttribute');
            });
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
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

      let dataToSet;

      switch (attributeType) {
        case 'component':
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
          break;
        case 'dynamiczone':
          dataToSet = {
            ...options,
            type: 'dynamiczone',
            components: [],
          };
          break;
        case 'text':
          dataToSet = { ...options, type: 'string' };
          break;
        case 'number':
        case 'date':
          dataToSet = options;
          break;
        case 'media':
          dataToSet = {
            allowedTypes: ['images', 'files', 'videos'],
            type: 'media',
            multiple: true,
            ...options,
          };
          break;
        case 'enumeration':
          dataToSet = { ...options, type: 'enumeration', enum: [] };
          break;
        case 'relation':
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
          break;
        default:
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
```