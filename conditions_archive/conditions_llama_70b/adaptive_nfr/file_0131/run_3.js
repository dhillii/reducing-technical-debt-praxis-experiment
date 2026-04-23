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
 * @returns {Boolean} True if the default value should be removed, false otherwise.
 */
function shouldRemoveDefaultValue(obj, keys) {
  return Boolean(obj.getIn(['default'])) && keys.length === 1 && keys.includes('type');
}

/**
 * Updates the nature and target attribute of the object.
 * @param {Object} obj - The object to update.
 * @param {String} value - The new value.
 * @param {Array} targetContentTypeAllowedRelations - The allowed relations.
 * @returns {Object} The updated object.
 */
function updateNatureAndTargetAttribute(obj, value, targetContentTypeAllowedRelations) {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const currentNature = obj.get('nature');
  const newNature = targetContentTypeAllowedRelations === null ? currentNature : targetContentTypeAllowedRelations[0];

  if (!targetContentTypeAllowedRelations.includes(currentNature)) {
    didChangeNatureBecauseOfRestrictedRelation = true;
  }

  return obj
    .update('nature', () => newNature)
    .update('name', () => {
      if (didChangeNatureBecauseOfRestrictedRelation) {
        return pluralize(snakeCase(obj.get('selectedContentTypeFriendlyName')), shouldPluralizeName(newNature));
      }

      return pluralize(snakeCase(obj.get('selectedContentTypeFriendlyName')), shouldPluralizeName(currentNature));
    })
    .update('targetAttribute', () => {
      if (['oneWay', 'manyWay'].includes(newNature)) {
        return '-';
      }

      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }

      return pluralize(snakeCase(obj.get('oneThatIsCreatingARelationWithAnother')), shouldPluralizeTargetAttribute(newNature));
    });
}

/**
 * Updates the object based on the keys and value.
 * @param {Object} obj - The object to update.
 * @param {Array} keys - The keys to update.
 * @param {String} value - The new value.
 * @returns {Object} The updated object.
 */
function updateObject(obj, keys, value) {
  if (keys.length === 1 && keys.includes('nature')) {
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
          oldValue === '-' ? snakeCase(obj.get('oneThatIsCreatingARelationWithAnother')) : oldValue,
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

  if (keys.length === 1 && keys.includes('target')) {
    const { targetContentTypeAllowedRelations } = obj;
    return updateNatureAndTargetAttribute(obj, value, targetContentTypeAllowedRelations);
  }

  return obj.updateIn(keys, () => value);
}

/**
 * Creates the data to set for the attribute.
 * @param {String} attributeType - The type of attribute.
 * @param {Object} options - The options for the attribute.
 * @param {String} nameToSetForRelation - The name to set for the relation.
 * @param {String} targetUid - The target UID.
 * @param {String} step - The step.
 * @returns {Object} The data to set for the attribute.
 */
function createDataToSet(attributeType, options, nameToSetForRelation, targetUid, step) {
  switch (attributeType) {
    case 'component':
      if (step === '1') {
        return {
          type: 'component',
          createComponent: true,
          componentToCreate: { type: 'component' },
        };
      } else {
        return {
          ...options,
          type: 'component',
          repeatable: true,
        };
      }
    case 'dynamiczone':
      return {
        ...options,
        type: 'dynamiczone',
        components: [],
      };
    case 'text':
      return { ...options, type: 'string' };
    case 'number':
    case 'date':
      return options;
    case 'media':
      return {
        allowedTypes: ['images', 'files', 'videos'],
        type: 'media',
        multiple: true,
        ...options,
      };
    case 'enumeration':
      return { ...options, type: 'enumeration', enum: [] };
    case 'relation':
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
    default:
      return { ...options, type: attributeType, default: null };
  }
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
          targetContentTypeAllowedRelations,
        } = action;

        if (shouldRemoveDefaultValue(obj, keys)) {
          const previousType = obj.getIn(['type']);

          if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
            return obj.updateIn(keys, () => value).remove('default');
          }
        }

        return updateObject(obj, keys, value);
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

      const dataToSet = createDataToSet(attributeType, options, nameToSetForRelation, targetUid, step);

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