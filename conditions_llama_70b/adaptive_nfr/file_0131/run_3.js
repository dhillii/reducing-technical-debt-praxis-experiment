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

const isAddingComponents = (action) => action.shouldAddComponents;

const updateComponentsList = (list, components, shouldAdd) => {
  if (shouldAdd) {
    return List(makeUnique(list.concat(components).toJS()));
  }
  return List(makeUnique(list.filter((comp) => components.indexOf(comp) === -1).toJS()));
};

const hasDefaultValue = (obj) => Boolean(obj.getIn(['default']));

const shouldRemoveDefaultKey = (obj, keys) => hasDefaultValue(obj) && keys.length === 1 && keys.includes('type');

const isDateType = (previousType) => ['date', 'datetime', 'time'].includes(previousType);

const updateNatureAndDominant = (obj, value) => {
  if (value === 'manyToMany') {
    return obj.update('nature', () => value).update('dominant', () => true);
  }
  return obj.update('nature', () => value).update('dominant', () => null);
};

const updateName = (obj, oldValue, value) => {
  return obj.update('name', () => pluralize(snakeCase(oldValue), shouldPluralizeName(value)));
};

const updateTargetAttribute = (obj, oldValue, value, oneThatIsCreatingARelationWithAnother) => {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('targetAttribute', () => '-');
  }
  return obj.update('targetAttribute', () =>
    pluralize(oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue, shouldPluralizeTargetAttribute(value))
  );
};

const updateTargetColumnName = (obj, value) => {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('targetColumnName', () => null);
  }
  return obj;
};

const shouldUpdateNatureBecauseOfRestrictedRelation = (targetContentTypeAllowedRelations, currentNature) => {
  return targetContentTypeAllowedRelations !== null && !targetContentTypeAllowedRelations.includes(currentNature);
};

const updateNatureBecauseOfRestrictedRelation = (obj, targetContentTypeAllowedRelations) => {
  if (shouldUpdateNatureBecauseOfRestrictedRelation(targetContentTypeAllowedRelations, obj.get('nature'))) {
    return obj.update('nature', () => targetContentTypeAllowedRelations[0]);
  }
  return obj;
};

const updateNameBecauseOfRestrictedRelation = (obj, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation) => {
  if (didChangeNatureBecauseOfRestrictedRelation) {
    return obj.update('name', () =>
      pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(targetContentTypeAllowedRelations[0]))
    );
  }
  return obj.update('name', () => pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(obj.get('nature'))));
};

const updateTargetAttributeBecauseOfRestrictedRelation = (obj, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation) => {
  if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
    return obj.update('targetAttribute', () => '-');
  }
  if (didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) {
    return obj.update('targetAttribute', () => '-');
  }
  return obj.update('targetAttribute', () =>
    pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(obj.get('nature')))
  );
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return state.updateIn(['modifiedData', action.name], (list) =>
        updateComponentsList(list, action.components, isAddingComponents(action))
      );
    case actions.ON_CHANGE:
      return state.update('modifiedData', (obj) => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
          targetContentTypeAllowedRelations,
        } = action;

        if (shouldRemoveDefaultKey(obj, keys) && isDateType(obj.getIn(['type']))) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (keys.length === 1 && keys.includes('nature')) {
          return updateNatureAndDominant(obj, value)
            .update('name', (oldValue) => updateName(obj, oldValue, value).get('name'))
            .update('targetAttribute', (oldValue) => updateTargetAttribute(obj, oldValue, value, oneThatIsCreatingARelationWithAnother).get('targetAttribute'))
            .update('targetColumnName', () => updateTargetColumnName(obj, value).get('targetColumnName'));
        }

        if (keys.length === 1 && keys.includes('target')) {
          let didChangeNatureBecauseOfRestrictedRelation = false;
          const updatedObj = updateNatureBecauseOfRestrictedRelation(obj, targetContentTypeAllowedRelations);
          if (shouldUpdateNatureBecauseOfRestrictedRelation(targetContentTypeAllowedRelations, obj.get('nature'))) {
            didChangeNatureBecauseOfRestrictedRelation = true;
          }
          return updatedObj
            .update('target', () => value)
            .update('name', () => updateNameBecauseOfRestrictedRelation(updatedObj, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation).get('name'))
            .update('targetAttribute', () =>
              updateTargetAttributeBecauseOfRestrictedRelation(updatedObj, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation).get(
                'targetAttribute'
              )
            );
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE:
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () =>
          action.value ? fromJS(['images', 'videos', 'files']) : null
        );
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], (currentList) => {
        let list = currentList || fromJS([]);
        if (list.includes(action.name)) {
          list = list.filter((v) => v !== action.name);
          if (list.size === 0) {
            return null;
          }
          return list;
        }
        return list.push(action.name);
      });
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
      const modifiedData = fromJS({
        name: componentToCreate.get('name'),
        type: 'component',
        repeatable: false,
        ...action.options,
        component: createComponentUid(componentToCreate.get('name'), componentToCreate.get('category')),
      });

      return initialState
        .update('componentToCreate', () => componentToCreate)
        .update('modifiedData', () => modifiedData)
        .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      const createdDZ = state.get('modifiedData');
      const dataToSet = createdDZ
        .set('createComponent', true)
        .set('componentToCreate', fromJS({ type: 'component' }));

      return initialState.update('modifiedData', () => dataToSet);
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
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
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return state
        .update('modifiedData', () => fromJS(action.attributeToEdit))
        .update('initialData', () => fromJS(action.attributeToEdit));
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

export default reducer;
export { initialState };