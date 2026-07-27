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
const isRemovingComponents = (action) => !isAddingComponents(action);

const getUpdatedList = (list, components, shouldAdd) => {
  if (shouldAdd) {
    return list.concat(components);
  }
  return list.filter((comp) => components.indexOf(comp) === -1);
};

const getUniqueList = (list) => List(makeUnique(list.toJS()));

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      const updatedList = getUpdatedList(state.getIn(['modifiedData', name]), components, shouldAddComponents);
      return state.updateIn(['modifiedData', name], () => getUniqueList(updatedList));
    }
    case actions.ON_CHANGE:
      return state.update('modifiedData', (obj) => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
        } = action;
        const hasDefaultValue = Boolean(obj.getIn(['default']));

        if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
          return handleTypeChange(obj, value);
        }

        if (keys.length === 1 && keys.includes('nature')) {
          return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
        }

        if (keys.length === 1 && keys.includes('target')) {
          return handleTargetChange(obj, value, action.targetContentTypeAllowedRelations, selectedContentTypeFriendlyName);
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => (action.value ? fromJS(['images', 'videos', 'files']) : null));
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], (currentList) => {
        const list = currentList || fromJS([]);
        return handleAllowedTypeChange(list, action.name);
      });
    }
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO: {
      return initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));
    }
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

      const dataToSet = getAttributeDataSchema(attributeType, step, options, nameToSetForRelation, targetUid);
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

const handleTypeChange = (obj, value) => {
  const previousType = obj.getIn(['type']);
  if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
    return obj.updateIn(['type'], () => value).remove('default');
  }
  return obj;
};

const handleNatureChange = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', (oldValue) => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', (oldValue) => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      return pluralize(oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', (oldValue) => (['oneWay', 'manyWay'].includes(value) ? null : oldValue));
};

const handleTargetChange = (obj, value, targetContentTypeAllowedRelations, selectedContentTypeFriendlyName) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;
  return obj
    .update('target', () => value)
    .update('nature', (currentNature) => {
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
      if (didChangeNatureBecauseOfRestrictedRelation) {
        return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(targetContentTypeAllowedRelations[0]));
      }
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(obj.get('nature')));
    })
    .update('targetAttribute', () => {
      if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
        return '-';
      }
      if (didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) {
        return '-';
      }
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeTargetAttribute(obj.get('nature')));
    });
};

const handleAllowedTypeChange = (list, name) => {
  if (list.includes(name)) {
    const newList = list.filter((v) => v !== name);
    return newList.size === 0 ? null : newList;
  }
  return list.push(name);
};

const getAttributeDataSchema = (attributeType, step, options, nameToSetForRelation, targetUid) => {
  switch (attributeType) {
    case 'component':
      return step === '1'
        ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
        : { ...options, type: 'component', repeatable: true };
    case 'dynamiczone':
      return { ...options, type: 'dynamiczone', components: [] };
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
};

export default reducer;
export { initialState };