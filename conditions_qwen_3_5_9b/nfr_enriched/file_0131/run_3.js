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

const updateDynamicZoneComponents = (list, components, shouldAddComponents) => {
  if (shouldAddComponents) {
    return list.concat(components);
  }
  return list.filter(comp => components.indexOf(comp) === -1);
};

const updateDynamicZoneComponentsWithUnique = (list, components, shouldAddComponents) => {
  const updatedList = updateDynamicZoneComponents(list, components, shouldAddComponents);
  return List(makeUnique(updatedList.toJS()));
};

const handleDateTypeChange = (obj, value, keys) => {
  if (keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);
    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }
  return obj;
};

const updateRelationAttributes = (obj, value, oneThatIsCreatingARelationWithAnother) => {
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
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }
      return oldValue;
    });
};

const updateRelationTarget = (obj, value, targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedNature = targetContentTypeAllowedRelations === null
    ? obj.get('nature')
    : !targetContentTypeAllowedRelations.includes(obj.get('nature'))
      ? (didChangeNatureBecauseOfRestrictedRelation = true, targetContentTypeAllowedRelations[0])
      : obj.get('nature');

  const updatedName = didChangeNatureBecauseOfRestrictedRelation
    ? pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(targetContentTypeAllowedRelations[0]))
    : pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(updatedNature));

  const updatedTargetAttribute = ['oneWay', 'manyWay'].includes(updatedNature)
    ? '-'
    : didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ? '-'
      : pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(updatedNature));

  return obj
    .update('target', () => value)
    .update('nature', () => updatedNature)
    .update('name', () => updatedName)
    .update('targetAttribute', () => updatedTargetAttribute);
};

const updateAllowedTypes = (currentList, name, value) => {
  let list = currentList || fromJS([]);

  if (list.includes(name)) {
    list = list.filter(v => v !== name);
    if (list.size === 0) {
      return null;
    }
    return list;
  }
  return list.push(name);
};

const buildComponentDataToSet = (options, step) => {
  if (step === '1') {
    return {
      type: 'component',
      createComponent: true,
      componentToCreate: { type: 'component' },
    };
  }
  return {
    ...options,
    type: 'component',
    repeatable: true,
  };
};

const buildDynamicZoneDataToSet = (options) => ({
  ...options,
  type: 'dynamiczone',
  components: [],
});

const buildTextDataToSet = (options) => ({ ...options, type: 'string' });

const buildNumberOrDateDataToSet = (options) => options;

const buildMediaDataToSet = (options) => ({
  allowedTypes: ['images', 'files', 'videos'],
  type: 'media',
  multiple: true,
  ...options,
});

const buildEnumerationDataToSet = (options) => ({ ...options, type: 'enumeration', enum: [] });

const buildRelationDataToSet = (nameToSetForRelation, targetUid) => ({
  name: snakeCase(nameToSetForRelation),
  nature: 'oneWay',
  targetAttribute: '-',
  target: targetUid,
  unique: false,
  dominant: null,
  columnName: null,
  targetColumnName: null,
});

const buildDefaultDataToSet = (options, attributeType) => ({ ...options, type: attributeType, default: null });

const handleAttributeDataSchema = (state, action) => {
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
      dataToSet = buildComponentDataToSet(options, step);
      break;
    case 'dynamiczone':
      dataToSet = buildDynamicZoneDataToSet(options);
      break;
    case 'text':
      dataToSet = buildTextDataToSet(options);
      break;
    case 'number':
    case 'date':
      dataToSet = buildNumberOrDateDataToSet(options);
      break;
    case 'media':
      dataToSet = buildMediaDataToSet(options);
      break;
    case 'enumeration':
      dataToSet = buildEnumerationDataToSet(options);
      break;
    case 'relation':
      dataToSet = buildRelationDataToSet(nameToSetForRelation, targetUid);
      break;
    default:
      dataToSet = buildDefaultDataToSet(options, attributeType);
  }

  return state.update('modifiedData', () => fromJS(dataToSet));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      return state.updateIn(['modifiedData', name], list => updateDynamicZoneComponentsWithUnique(list, components, shouldAddComponents));
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

      const result = handleDateTypeChange(obj, value, keys);

      if (keys.length === 1 && keys.includes('nature')) {
        return updateRelationAttributes(result, value, oneThatIsCreatingARelationWithAnother);
      }

      if (keys.length === 1 && keys.includes('target')) {
        const { targetContentTypeAllowedRelations } = action;
        return updateRelationTarget(
          result,
          value,
          targetContentTypeAllowedRelations,
          selectedContentTypeFriendlyName,
          oneThatIsCreatingARelationWithAnother
        );
      }

      return result.updateIn(keys, () => value);
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      const { name, value } = action;
      if (name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (value) {
            return fromJS(['images', 'videos', 'files']);
          }
          return null;
        });
      }
      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => updateAllowedTypes(currentList, name, value));
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
        component: createComponentUid(
          componentToCreate.get('name'),
          componentToCreate.get('category')
        ),
      });
      return initialState
        .update('componentToCreate', () => componentToCreate)
        .update('modifiedData', () => modifiedData)
        .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
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
      return handleAttributeDataSchema(state, action);
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