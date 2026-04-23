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

const updateComponentsList = (list, components, shouldAddComponents) => {
  if (shouldAddComponents) {
    return list.concat(components);
  }
  return list.filter(comp => components.indexOf(comp) === -1);
};

const updateComponentName = (obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother) => {
  const pluralizeName = shouldPluralizeName(value);
  return pluralize(snakeCase(selectedContentTypeFriendlyName), pluralizeName);
};

const updateComponentTargetAttribute = (obj, value, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations, didChangeNatureBecauseOfRestrictedRelation) => {
  if (['oneWay', 'manyWay'].includes(value)) {
    return '-';
  }

  const nature = obj.get('nature');
  const targetNature = didChangeNatureBecauseOfRestrictedRelation ? targetContentTypeAllowedRelations[0] : nature;
  const pluralizeTarget = shouldPluralizeTargetAttribute(targetNature);

  const baseName = didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0]) ? '-' : oneThatIsCreatingARelationWithAnother;

  return pluralize(snakeCase(baseName), pluralizeTarget);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      const updatedList = updateComponentsList(state.getIn(['modifiedData', name]), components, shouldAddComponents);
      return state.updateIn(['modifiedData', name], () => List(makeUnique(updatedList.toJS())));
    }
    case actions.ON_CHANGE: {
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
      } = action;
      const obj = state.get('modifiedData');
      const hasDefaultValue = Boolean(obj.getIn(['default']));

      if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
        const previousType = obj.getIn(['type']);
        if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
          return obj.updateIn(keys, () => value).remove('default');
        }
      }

      if (keys.length === 1 && keys.includes('nature')) {
        return obj
          .update('nature', () => value)
          .update('dominant', () => (value === 'manyToMany' ? true : null))
          .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
          .update('targetAttribute', oldValue => {
            if (['oneWay', 'manyWay'].includes(value)) {
              return '-';
            }
            return pluralize(
              oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
              shouldPluralizeTargetAttribute(value)
            );
          })
          .update('targetColumnName', oldValue => (['oneWay', 'manyWay'].includes(value) ? null : oldValue));
      }

      if (keys.length === 1 && keys.includes('target')) {
        const { targetContentTypeAllowedRelations } = action;
        let didChangeNatureBecauseOfRestrictedRelation = false;

        const updatedObj = obj
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
          });

        return updatedObj
          .update('name', () => {
            if (didChangeNatureBecauseOfRestrictedRelation) {
              return updateComponentName(
                updatedObj,
                targetContentTypeAllowedRelations[0],
                selectedContentTypeFriendlyName,
                oneThatIsCreatingARelationWithAnother
              );
            }
            return updateComponentName(updatedObj, obj.get('nature'), selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother);
          })
          .update('targetAttribute', () => updateComponentTargetAttribute(
            updatedObj,
            obj.get('nature'),
            oneThatIsCreatingARelationWithAnother,
            targetContentTypeAllowedRelations,
            didChangeNatureBecauseOfRestrictedRelation
          ));
      }

      return obj.updateIn(keys, () => value);
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => (action.value ? fromJS(['images', 'videos', 'files']) : null));
      }
      const currentList = state.getIn(['modifiedData', 'allowedTypes']);
      const list = currentList || fromJS([]);
      if (list.includes(action.name)) {
        const filteredList = list.filter(v => v !== action.name);
        return filteredList.size === 0 ? null : filteredList;
      }
      return list.push(action.name);
    }
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA: {
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
    }
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ: {
      const createdDZ = state.get('modifiedData');
      const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
      return initialState.update('modifiedData', () => dataToSet);
    }
    case actions.SET_DATA_TO_EDIT:
      return state.updateIn(['modifiedData'], () => fromJS(action.data)).updateIn(['initialData'], () => fromJS(action.data));
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
          dataToSet = step === '1'
            ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
            : { ...options, type: 'component', repeatable: true };
          break;
        case 'dynamiczone':
          dataToSet = { ...options, type: 'dynamiczone', components: [] };
          break;
        case 'text':
          dataToSet = { ...options, type: 'string' };
          break;
        case 'number':
        case 'date':
          dataToSet = options;
          break;
        case 'media':
          dataToSet = { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
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