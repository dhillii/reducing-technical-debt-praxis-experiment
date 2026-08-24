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
 * Checks if the current keys represent a type change with a default value present.
 */
const isTypeChangeWithDefaultValue = (keys, obj) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));
  return hasDefaultValue && keys.length === 1 && keys.includes('type');
};

/**
 * Checks if a previous type requires default removal.
 */
const previousTypeRequiresDefaultRemoval = previousType => {
  return previousType && ['date', 'datetime', 'time'].includes(previousType);
};

/**
 * Checks if nature change should update dominant to true.
 */
const isManyToManyNature = nature => {
  return nature === 'manyToMany';
};

/**
 * Checks if nature change should reset targetAttribute to '-'.
 */
const shouldResetTargetAttributeToDash = nature => {
  return ['oneWay', 'manyWay'].includes(nature);
};

/**
 * Checks if nature change should reset targetColumnName to null.
 */
const shouldResetTargetColumnNameToNull = nature => {
  return ['oneWay', 'manyWay'].includes(nature);
};

/**
 * Checks if current nature is restricted by allowed relations.
 */
const natureIsRestricted = (currentNature, allowedRelations) => {
  return !allowedRelations.includes(currentNature);
};

/**
 * Returns the first allowed relation as fallback when current nature is restricted.
 */
const getFallbackNature = allowedRelations => {
  return allowedRelations[0];
};

/**
 * Checks if targetAttribute should be set to '-' based on nature.
 */
const shouldTargetAttributeBeDash = nature => {
  return ['oneWay', 'manyWay'].includes(nature);
};

/**
 * Checks if the targetContentTypeFriendlyName is provided.
 */
const hasFriendlyName = friendlyName => {
  return Boolean(friendlyName);
};

/**
 * Checks if targetAttribute should be set to '-' for restricted relation update.
 */
const shouldTargetAttributeBeDashForRestrictedUpdate = nature => {
  return ['oneWay', 'manyWay'].includes(nature);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
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
    }
    case actions.ON_CHANGE: {
      const { keys, value } = action;
      const obj = state.get('modifiedData');

      // Handle type change with default removal
      if (isTypeChangeWithDefaultValue(keys, obj)) {
        const previousType = obj.getIn(['type']);

        if (previousTypeRequiresDefaultRemoval(previousType)) {
          return obj.updateIn(keys, () => value).remove('default');
        }
      }

      // Handle nature change
      if (keys.length === 1 && keys.includes('nature')) {
        const { selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;

        return obj
          .update('nature', () => value)
          .update('dominant', () => {
            if (isManyToManyNature(value)) {
              return true;
            }

            return null;
          })
          .update('name', oldValue => {
            return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
          })
          .update('targetAttribute', oldValue => {
            if (shouldResetTargetAttributeToDash(value)) {
              return '-';
            }

            return pluralize(
              oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
              shouldPluralizeTargetAttribute(value)
            );
          })
          .update('targetColumnName', oldValue => {
            if (shouldResetTargetColumnNameToNull(value)) {
              return null;
            }

            return oldValue;
          });
      }

      // Handle target change
      if (keys.length === 1 && keys.includes('target')) {
        const {
          selectedContentTypeFriendlyName,
          oneThatIsCreatingARelationWithAnother,
          targetContentTypeAllowedRelations,
        } = action;
        let didChangeNatureBecauseOfRestrictedRelation = false;
        const currentNature = obj.get('nature');

        const nextNature = targetContentTypeAllowedRelations === null
          ? currentNature
          : natureIsRestricted(currentNature, targetContentTypeAllowedRelations)
            ? (didChangeNatureBecauseOfRestrictedRelation = true, getFallbackNature(targetContentTypeAllowedRelations))
            : currentNature;

        const natureToUse = didChangeNatureBecauseOfRestrictedRelation
          ? getFallbackNature(targetContentTypeAllowedRelations)
          : obj.get('nature');

        return obj
          .update('target', () => value)
          .update('nature', () => nextNature)
          .update('name', () => {
            if (didChangeNatureBecauseOfRestrictedRelation) {
              return pluralize(
                snakeCase(selectedContentTypeFriendlyName),
                shouldPluralizeName(getFallbackNature(targetContentTypeAllowedRelations))
              );
            }

            return pluralize(
              snakeCase(selectedContentTypeFriendlyName),
              shouldPluralizeName(natureToUse)
            );
          })
          .update('targetAttribute', () => {
            if (shouldTargetAttributeBeDash(obj.get('nature'))) {
              return '-';
            }

            if (
              didChangeNatureBecauseOfRestrictedRelation &&
              shouldTargetAttributeBeDashForRestrictedUpdate(getFallbackNature(targetContentTypeAllowedRelations))
            ) {
              return '-';
            }

            return pluralize(
              snakeCase(oneThatIsCreatingARelationWithAnother),
              shouldPluralizeTargetAttribute(natureToUse)
            );
          });
      }

      return obj.updateIn(keys, () => value);
    }
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
      // This is run when the user doesn't want to create a new component
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    }
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA: {
      // This is run when the user has created a new component
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