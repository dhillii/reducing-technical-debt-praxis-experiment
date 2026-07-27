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
      const updatedList = getUpdatedList(
        state.getIn(['modifiedData', name]),
        components,
        isAddingComponents(action)
      );
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
          return handleTargetChange(
            obj,
            value,
            action.targetContentTypeAllowedRelations,
            selectedContentTypeFriendlyName
          );
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return state.updateIn(['modifiedData', 'allowedTypes'], (currentList) => {
        if (action.name === 'all') {
          return handleAllAllowedTypesChange(action.value);
        }
        return handleAllowedTypeChange(currentList, action.name);
      });
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleAddComponentToDZ(state);
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return state.update('modifiedData', () => {
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
          return fromJS(modifiedDataToSetForEditing);
        }

        return getAttributeDataSchema(attributeType, step, options, nameToSetForRelation, targetUid);
      });
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
    .update('dominant', () => {
      if (value === 'manyToMany') {
        return true;
      }
      return null;
    })
    .update('name', (oldValue) => {
      return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
    })
    .update('targetAttribute', (oldValue) => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      return pluralize(
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', (oldValue) => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }
      return oldValue;
    });
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
      if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
        return '-';
      }
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(obj.get('nature'))
      );
    });
};

const handleAllAllowedTypesChange = (value) => {
  if (value) {
    return fromJS(['images', 'videos', 'files']);
  }
  return null;
};

const handleAllowedTypeChange = (currentList, name) => {
  let list = currentList || fromJS([]);
  if (list.includes(name)) {
    list = list.filter((v) => v !== name);
    if (list.size === 0) {
      return null;
    }
    return list;
  }
  return list.push(name);
};

const handleSaveCurrentData = (state, action) => {
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
    .update('isCreatingComponentWhileAddingAField', () =>
      state.getIn(['modifiedData', 'createComponent'])
    );
};

const handleAddComponentToDZ = (state) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
};

const getAttributeDataSchema = (
  attributeType,
  step,
  options,
  nameToSetForRelation,
  targetUid
) => {
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
  return fromJS(dataToSet);
};

export default reducer;
export { initialState };