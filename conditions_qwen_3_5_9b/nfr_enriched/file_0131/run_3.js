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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      const currentList = state.getIn(['modifiedData', name]);

      const updatedList = shouldAddComponents
        ? currentList.concat(components)
        : currentList.filter(comp => components.indexOf(comp) === -1);

      return state.updateIn(['modifiedData', name], () => List(makeUnique(updatedList.toJS())));
    }
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForAddingAComponentToADZ(state, action);
    case actions.SET_DATA_TO_EDIT:
      return handleSetDataToEdit(state, action);
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA:
      return handleSetDynamicZoneDataSchema(state, action);
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

const handleOnChange = (state, action) => {
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
    return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
  }

  if (keys.length === 1 && keys.includes('target')) {
    const { targetContentTypeAllowedRelations } = action;
    return handleTargetChange(obj, value, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, oneThatIsCreatingARelationWithAnother);
  }

  return obj.updateIn(keys, () => value);
};

const handleNatureChange = (obj, value, oneThatIsCreatingARelationWithAnother) => {
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
};

const handleTargetChange = (obj, value, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations, oneThatIsCreatingARelationWithAnother) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedNature = obj.get('nature');
  if (targetContentTypeAllowedRelations === null) {
    return obj
      .update('target', () => value)
      .update('nature', () => updatedNature)
      .update('name', () => pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(updatedNature)))
      .update('targetAttribute', () => {
        if (['oneWay', 'manyWay'].includes(updatedNature)) {
          return '-';
        }
        return pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(updatedNature));
      });
  }

  if (!targetContentTypeAllowedRelations.includes(updatedNature)) {
    didChangeNatureBecauseOfRestrictedRelation = true;
    const newNature = targetContentTypeAllowedRelations[0];
    return obj
      .update('target', () => value)
      .update('nature', () => newNature)
      .update('name', () => pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(newNature)))
      .update('targetAttribute', () => {
        if (['oneWay', 'manyWay'].includes(newNature)) {
          return '-';
        }
        return pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(newNature));
      });
  }

  return obj
    .update('target', () => value)
    .update('nature', () => updatedNature)
    .update('name', () => pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(updatedNature)))
    .update('targetAttribute', () => {
      if (['oneWay', 'manyWay'].includes(updatedNature)) {
        return '-';
      }
      return pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(updatedNature));
    });
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

  const currentList = state.getIn(['modifiedData', 'allowedTypes']);
  const list = currentList || fromJS([]);

  if (list.includes(action.name)) {
    const filteredList = list.filter(v => v !== action.name);
    if (filteredList.size === 0) {
      return state.updateIn(['modifiedData', 'allowedTypes'], () => null);
    }
    return state.updateIn(['modifiedData', 'allowedTypes'], () => filteredList);
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], () => list.push(action.name));
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

  return state
    .update('componentToCreate', () => componentToCreate)
    .update('modifiedData', () => modifiedData)
    .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
};

const handleResetPropsAndSetFormForAddingAComponentToADZ = (state, action) => {
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

  const dataToSet = getDataSetForAttributeType(attributeType, options, nameToSetForRelation, targetUid, step);

  return state.update('modifiedData', () => fromJS(dataToSet));
};

const getDataSetForAttributeType = (attributeType, options, nameToSetForRelation, targetUid, step) => {
  if (attributeType === 'component') {
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
  }

  if (attributeType === 'dynamiczone') {
    return {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
  }

  if (attributeType === 'text') {
    return { ...options, type: 'string' };
  }

  if (attributeType === 'number' || attributeType === 'date') {
    return options;
  }

  if (attributeType === 'media') {
    return {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  }

  if (attributeType === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }

  if (attributeType === 'relation') {
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
  }

  return { ...options, type: attributeType, default: null };
};

const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

export default reducer;
export { initialState };