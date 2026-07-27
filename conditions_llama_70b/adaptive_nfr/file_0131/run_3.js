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

const handleAddComponentsToDynamicZone = (state, action) => {
  const { name, components, shouldAddComponents } = action;
  const updatedList = getUpdatedList(
    state.getIn(['modifiedData', name]),
    components,
    shouldAddComponents
  );
  return state.updateIn(['modifiedData', name], () => getUniqueList(updatedList));
};

const hasDefaultValue = (obj) => Boolean(obj.getIn(['default']));

const isTypeChange = (keys) => keys.length === 1 && keys.includes('type');

const isNatureChange = (keys) => keys.length === 1 && keys.includes('nature');

const isTargetChange = (keys) => keys.length === 1 && keys.includes('target');

const handleTypeChange = (obj, action) => {
  const { value } = action;
  const previousType = obj.getIn(['type']);
  if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
    return obj.updateIn(['type'], () => value).remove('default');
  }
  return obj.updateIn(['type'], () => value);
};

const handleNatureChange = (obj, action) => {
  const { value, oneThatIsCreatingARelationWithAnother } = action;
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', (oldValue) => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
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

const handleTargetChange = (obj, action) => {
  const { value, targetContentTypeAllowedRelations, selectedContentTypeFriendlyName } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;
  const currentNature = obj.get('nature');
  if (targetContentTypeAllowedRelations === null) {
    return obj.update('target', () => value).update('nature', () => currentNature);
  }
  if (!targetContentTypeAllowedRelations.includes(currentNature)) {
    didChangeNatureBecauseOfRestrictedRelation = true;
    return obj
      .update('target', () => value)
      .update('nature', () => targetContentTypeAllowedRelations[0])
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
          snakeCase(action.oneThatIsCreatingARelationWithAnother),
          shouldPluralizeTargetAttribute(obj.get('nature'))
        );
      });
  }
  return obj.update('target', () => value).update('nature', () => currentNature);
};

const handleOnChange = (state, action) => {
  const { selectedContentTypeFriendlyName, keys, value, oneThatIsCreatingARelationWithAnother } = action;
  const obj = state.get('modifiedData');
  if (hasDefaultValue(obj) && isTypeChange(keys)) {
    return state.update('modifiedData', (obj) => handleTypeChange(obj, action));
  }
  if (isNatureChange(keys)) {
    return state.update('modifiedData', (obj) => handleNatureChange(obj, action));
  }
  if (isTargetChange(keys)) {
    return state.update('modifiedData', (obj) => handleTargetChange(obj, action));
  }
  return state.update('modifiedData', (obj) => obj.updateIn(keys, () => value));
};

const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      if (action.value) {
        return fromJS(['images', 'videos', 'files']);
      }
      return null;
    });
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
};

const handleResetProps = () => initialState;

const handleResetPropsAndSetFormForAddingAnExistingCompo = (action) => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
};

const handleResetPropsAndSaveCurrentData = (state, action) => {
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
};

const handleResetPropsAndSetTheFormForAddingACompoToADZ = (state) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
};

const handleSetDataToEdit = (state, action) => {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
};

const handleSetAttributeDataSchema = (state, action) => {
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
};

const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

const handleSetErrors = (state, action) => {
  return state.update('formErrors', () => fromJS(action.errors));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return handleResetProps();
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return handleResetPropsAndSetFormForAddingAnExistingCompo(action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetTheFormForAddingACompoToADZ(state);
    case actions.SET_DATA_TO_EDIT:
      return handleSetDataToEdit(state, action);
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return handleSetDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return handleSetErrors(state, action);
    default:
      return state;
  }
};

export default reducer;
export { initialState };