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
 * Predicate: checks if the key path is ['type'] with default value present
 */
const isRemovingDefaultField = (obj, keys) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));
  return hasDefaultValue && keys.length === 1 && keys.includes('type');
};

/**
 * Predicate: checks if the previous type field is temporal
 */
const wasTemporalType = (previousType) => {
  return ['date', 'datetime', 'time'].includes(previousType);
};

/**
 * Predicate: checks if changing nature field
 */
const isChangingNature = (keys) => {
  return keys.length === 1 && keys.includes('nature');
};

/**
 * Predicate: checks if changing target field
 */
const isChangingTarget = (keys) => {
  return keys.length === 1 && keys.includes('target');
};

/**
 * Predicate: checks if current relation allows dominant assignment
 */
const isManyToMany = (value) => {
  return value === 'manyToMany';
};

/**
 * Predicate: checks if relation nature is oneWay or manyWay
 */
const isOneOrManyWay = (value) => {
  return ['oneWay', 'manyWay'].includes(value);
};

/**
 * Predicate: checks if current nature is restricted by allowed relations
 */
const isNatureRestricted = (currentNature, allowedRelations) => {
  return allowedRelations !== null && !allowedRelations.includes(currentNature);
};

/**
 * Predicate: checks if nature change was due to restriction
 */
const wasNatureChangedDueToRestriction = (didChange) => {
  return didChange;
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        if (shouldAddComponents) {
          return List(makeUnique(list.concat(components).toJS()));
        }
        return List(makeUnique(list.filter(comp => components.indexOf(comp) === -1).toJS()));
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

        if (isRemovingDefaultField(obj, keys) && wasTemporalType(obj.getIn(['type']))) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (isChangingNature(keys)) {
          const newValue = value;
          const newName = pluralize(snakeCase(obj.get('name')), shouldPluralizeName(newValue));
          const newTargetAttribute = isOneOrManyWay(newValue)
            ? '-'
            : pluralize(
                obj.get('targetAttribute') === '-'
                  ? snakeCase(oneThatIsCreatingARelationWithAnother)
                  : obj.get('targetAttribute'),
                shouldPluralizeTargetAttribute(newValue)
              );
          const newTargetColumnName = isOneOrManyWay(newValue) ? null : obj.get('targetColumnName');

          return obj
            .update('nature', () => newValue)
            .update('dominant', () => (isManyToMany(newValue) ? true : null))
            .update('name', () => newName)
            .update('targetAttribute', () => newTargetAttribute)
            .update('targetColumnName', () => newTargetColumnName);
        }

        if (isChangingTarget(keys)) {
          const currentNature = obj.get('nature');
          let didChangeNatureBecauseOfRestrictedRelation = false;

          const newNature = targetContentTypeAllowedRelations === null
            ? currentNature
            : isNatureRestricted(currentNature, targetContentTypeAllowedRelations)
              ? (didChangeNatureBecauseOfRestrictedRelation = true, targetContentTypeAllowedRelations[0])
              : currentNature;

          const newTargetAttribute = isOneOrManyWay(newNature)
            ? '-'
            : wasNatureChangedDueToRestriction(didChangeNatureBecauseOfRestrictedRelation) &&
              isOneOrManyWay(targetContentTypeAllowedRelations[0])
              ? '-'
              : pluralize(
                  snakeCase(oneThatIsCreatingARelationWithAnother),
                  shouldPluralizeTargetAttribute(newNature)
                );

          const newName = wasNatureChangedDueToRestriction(didChangeNatureBecauseOfRestrictedRelation)
            ? pluralize(
                snakeCase(selectedContentTypeFriendlyName),
                shouldPluralizeName(targetContentTypeAllowedRelations[0])
              )
            : pluralize(
                snakeCase(selectedContentTypeFriendlyName),
                shouldPluralizeName(newNature)
              );

          return obj
            .update('target', () => value)
            .update('nature', () => newNature)
            .update('name', () => newName)
            .update('targetAttribute', () => newTargetAttribute);
        }

        return obj.updateIn(keys, () => value);
      });
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
          return list.size === 0 ? null : list;
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
        dataToSet = step === '1'
          ? {
              type: 'component',
              createComponent: true,
              componentToCreate: { type: 'component' },
            }
          : {
              ...options,
              type: 'component',
              repeatable: true,
            };
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