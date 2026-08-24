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
 * Checks if the current keys and value indicate a type change that requires default removal.
 */
function shouldRemoveDefaultOnTypeChange(keys, value, previousType) {
  return (
    keys.length === 1 &&
    keys.includes('type') &&
    previousType &&
    ['date', 'datetime', 'time'].includes(previousType)
  );
}

/**
 * Checks if the current keys indicate a nature change.
 */
function isNatureChange(keys) {
  return keys.length === 1 && keys.includes('nature');
}

/**
 * Checks if the current keys indicate a target change.
 */
function isTargetChange(keys) {
  return keys.length === 1 && keys.includes('target');
}

/**
 * Determines if nature should be updated due to restricted relation.
 */
function shouldUpdateNatureDueToRestrictedRelation(currentNature, allowedRelations) {
  return allowedRelations !== null && !allowedRelations.includes(currentNature);
}

/**
 * Determines if the nature is oneWay or manyWay.
 */
function isOneWayOrManyWay(nature) {
  return ['oneWay', 'manyWay'].includes(nature);
}

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name'], list => {
        let updatedList = list;

        if (shouldAddComponents) {
          updatedList = list.concat(components);
        } else {
          updatedList = list.filter(comp => components.indexOf(comp) === -1);
        }

        return List(makeUnique(updatedList.toJS()));
      });
    }
    case actions.ON_CHANGE: {
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
        targetContentTypeAllowedRelations,
      } = action;

      return state.update('modifiedData', obj => {
        const hasDefaultValue = Boolean(obj.getIn(['default']));

        // Guard clause: early return if no default removal needed
        if (!shouldRemoveDefaultOnTypeChange(keys, value, obj.getIn(['type']))) {
          // Handle nature change
          if (isNatureChange(keys)) {
            return obj
              .update('nature', () => value)
              .update('dominant', () => (value === 'manyToMany' ? true : null))
              .update('name', oldValue =>
                pluralize(snakeCase(oldValue), shouldPluralizeName(value))
              )
              .update('targetAttribute', oldValue => {
                if (isOneWayOrManyWay(value)) {
                  return '-';
                }

                return pluralize(
                  oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
                  shouldPluralizeTargetAttribute(value)
                );
              })
              .update('targetColumnName', oldValue => {
                if (isOneWayOrManyWay(value)) {
                  return null;
                }

                return oldValue;
              });
          }

          // Handle target change
          if (isTargetChange(keys)) {
            let didChangeNatureBecauseOfRestrictedRelation = false;

            return obj
              .update('target', () => value)
              .update('nature', currentNature => {
                if (shouldUpdateNatureDueToRestrictedRelation(currentNature, targetContentTypeAllowedRelations)) {
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
          }

          // Default case: update the specified key
          return obj.updateIn(keys, () => value);
        }

        // Handle type change with default removal
        const previousType = obj.getIn(['type']);

        return obj.updateIn(keys, () => value).remove('default');
      });
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
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