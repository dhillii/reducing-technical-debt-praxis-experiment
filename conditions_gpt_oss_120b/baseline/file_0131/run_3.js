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

const addComponentsToDynamicZone = (state, action) => {
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
};

const onChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;
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
      return handleTargetChange(obj, action, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother);
    }

    return obj.updateIn(keys, () => value);
  });
};

const handleNatureChange = (obj, value, relationCreator) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      return pluralize(
        oldValue === '-' ? snakeCase(relationCreator) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => (['oneWay', 'manyWay'].includes(value) ? null : oldValue));
};

const handleTargetChange = (obj, action, value, selectedFriendlyName, relationCreator) => {
  const { targetContentTypeAllowedRelations } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  return obj
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
    })
    .update('name', () => {
      const nature = didChangeNatureBecauseOfRestrictedRelation
        ? targetContentTypeAllowedRelations[0]
        : obj.get('nature');
      return pluralize(
        snakeCase(selectedFriendlyName),
        shouldPluralizeName(nature)
      );
    })
    .update('targetAttribute', () => {
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) {
        return '-';
      }
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(relationCreator),
        shouldPluralizeTargetAttribute(nature)
      );
    });
};

const onChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => (action.value ? fromJS(['images', 'videos', 'files']) : null));
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);
    if (list.includes(action.name)) {
      list = list.filter(v => v !== action.name);
      return list.size === 0 ? null : list;
    }
    return list.push(action.name);
  });
};

const resetProps = () => initialState;

const resetPropsAndSetFormForAddingExistingComponent = (state, action) =>
  initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));

const resetPropsAndSaveCurrentData = (state, action) => {
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
};

const resetPropsAndSetFormForAddingComponentToDZ = (state) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
};

const setDataToEdit = (state, action) =>
  state.updateIn(['modifiedData'], () => fromJS(action.data)).updateIn(['initialData'], () => fromJS(action.data));

const setAttributeDataSchema = (state, action) => {
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

  const dataToSet = getDataToSet(attributeType, step, options, nameToSetForRelation, targetUid);
  return state.update('modifiedData', () => fromJS(dataToSet));
};

const getDataToSet = (type, step, options, relationName, targetUid) => {
  if (type === 'component') {
    return step === '1'
      ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
      : { ...options, type: 'component', repeatable: true };
  }
  if (type === 'dynamiczone') {
    return { ...options, type: 'dynamiczone', components: [] };
  }
  if (type === 'text') {
    return { ...options, type: 'string' };
  }
  if (type === 'number' || type === 'date') {
    return options;
  }
  if (type === 'media') {
    return { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
  }
  if (type === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }
  if (type === 'relation') {
    return {
      name: snakeCase(relationName),
      nature: 'oneWay',
      targetAttribute: '-',
      target: targetUid,
      unique: false,
      dominant: null,
      columnName: null,
      targetColumnName: null,
    };
  }
  return { ...options, type, default: null };
};

const setDynamicZoneDataSchema = (state, action) =>
  state.update('modifiedData', () => fromJS(action.attributeToEdit)).update('initialData', () => fromJS(action.attributeToEdit));

const setErrors = (state, action) => state.update('formErrors', () => fromJS(action.errors));

const handlers = {
  [actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE]: addComponentsToDynamicZone,
  [actions.ON_CHANGE]: onChange,
  [actions.ON_CHANGE_ALLOWED_TYPE]: onChangeAllowedType,
  [actions.RESET_PROPS]: resetProps,
  [actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO]: resetPropsAndSetFormForAddingExistingComponent,
  [actions.RESET_PROPS_AND_SAVE_CURRENT_DATA]: resetPropsAndSaveCurrentData,
  [actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ]: resetPropsAndSetFormForAddingComponentToDZ,
  [actions.SET_DATA_TO_EDIT]: setDataToEdit,
  [actions.SET_ATTRIBUTE_DATA_SCHEMA]: setAttributeDataSchema,
  [actions.SET_DYNAMIC_ZONE_DATA_SCHEMA]: setDynamicZoneDataSchema,
  [actions.SET_ERRORS]: setErrors,
};

const reducer = (state = initialState, action) => {
  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
};

export default reducer;
export { initialState };