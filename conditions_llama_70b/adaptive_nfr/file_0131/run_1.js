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

const isTypeChange = (keys) => keys.length === 1 && keys.includes('type');

const isNatureChange = (keys) => keys.length === 1 && keys.includes('nature');

const isTargetChange = (keys) => keys.length === 1 && keys.includes('target');

const updateNature = (obj, value) => {
  if (value === 'manyToMany') {
    return obj.update('dominant', () => true);
  }
  return obj.update('dominant', () => null);
};

const updateName = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('name', () => pluralize(snakeCase(obj.get('name')), shouldPluralizeName(value)));
  }
  return obj.update('name', () => pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeName(value)));
};

const updateTargetAttribute = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('targetAttribute', () => '-');
  }
  return obj.update('targetAttribute', () => pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(value)));
};

const updateTargetColumnName = (obj, value) => {
  if (['oneWay', 'manyWay'].includes(value)) {
    return obj.update('targetColumnName', () => null);
  }
  return obj;
};

const updateNatureBasedOnTargetContentTypeAllowedRelations = (obj, targetContentTypeAllowedRelations) => {
  if (targetContentTypeAllowedRelations === null) {
    return obj;
  }
  if (!targetContentTypeAllowedRelations.includes(obj.get('nature'))) {
    return obj.update('nature', () => targetContentTypeAllowedRelations[0]);
  }
  return obj;
};

const updateNameBasedOnNatureChange = (obj, selectedContentTypeFriendlyName, didChangeNatureBecauseOfRestrictedRelation, nature) => {
  if (didChangeNatureBecauseOfRestrictedRelation) {
    return obj.update('name', () => pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(nature)));
  }
  return obj.update('name', () => pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(obj.get('nature'))));
};

const updateTargetAttributeBasedOnNatureChange = (obj, oneThatIsCreatingARelationWithAnother, didChangeNatureBecauseOfRestrictedRelation, nature) => {
  if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
    return obj.update('targetAttribute', () => '-');
  }
  if (didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(nature)) {
    return obj.update('targetAttribute', () => '-');
  }
  return obj.update('targetAttribute', () => pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(obj.get('nature'))));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return state.updateIn(['modifiedData', action.name], (list) => updateComponentsList(list, action.components, isAddingComponents(action)));
    case actions.ON_CHANGE:
      return state.update('modifiedData', (obj) => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
          targetContentTypeAllowedRelations,
        } = action;

        if (isTypeChange(keys) && hasDefaultValue(obj)) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (isNatureChange(keys)) {
          return obj
            .update('nature', () => value)
            .update('dominant', () => updateNature(obj, value))
            .update('name', () => updateName(obj, value, oneThatIsCreatingARelationWithAnother))
            .update('targetAttribute', () => updateTargetAttribute(obj, value, oneThatIsCreatingARelationWithAnother))
            .update('targetColumnName', () => updateTargetColumnName(obj, value));
        }

        if (isTargetChange(keys)) {
          let didChangeNatureBecauseOfRestrictedRelation = false;
          return obj
            .update('target', () => value)
            .update('nature', () => updateNatureBasedOnTargetContentTypeAllowedRelations(obj, targetContentTypeAllowedRelations).get('nature'))
            .update('name', () => updateNameBasedOnNatureChange(obj, selectedContentTypeFriendlyName, didChangeNatureBecauseOfRestrictedRelation, obj.get('nature')))
            .update('targetAttribute', () => updateTargetAttributeBasedOnNatureChange(obj, oneThatIsCreatingARelationWithAnother, didChangeNatureBecauseOfRestrictedRelation, obj.get('nature')));
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE:
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => (action.value ? fromJS(['images', 'videos', 'files']) : null));
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
      const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
      return initialState.update('modifiedData', () => dataToSet);
    case actions.SET_DATA_TO_EDIT:
      return state.updateIn(['modifiedData'], () => fromJS(action.data)).updateIn(['initialData'], () => fromJS(action.data));
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
        return state.update('modifiedData', () => fromJS(modifiedDataToSetForEditing)).update('initialData', () => fromJS(modifiedDataToSetForEditing));
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
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return state.update('modifiedData', () => fromJS(action.attributeToEdit)).update('initialData', () => fromJS(action.attributeToEdit));
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

export default reducer;
export { initialState };