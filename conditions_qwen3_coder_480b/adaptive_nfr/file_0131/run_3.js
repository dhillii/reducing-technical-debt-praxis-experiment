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

const isDateType = (type) => ['date', 'datetime', 'time'].includes(type);

const shouldRemoveDefaultKey = (obj, keys, value) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));
  const isSingleTypeKey = keys.length === 1 && keys.includes('type');
  const isPreviousTypeDateRelated = isDateType(obj.getIn(['type']));

  return hasDefaultValue && isSingleTypeKey && isPreviousTypeDateRelated;
};

const isNatureKeyUpdate = (keys) => keys.length === 1 && keys.includes('nature');

const isTargetKeyUpdate = (keys) => keys.length === 1 && keys.includes('target');

const isAllAllowedType = (name) => name === 'all';

const isComponentType = (attributeType) => attributeType === 'component';

const isDynamicZoneType = (attributeType) => attributeType === 'dynamiczone';

const isTextType = (attributeType) => attributeType === 'text';

const isNumberOrDateType = (attributeType) => attributeType === 'number' || attributeType === 'date';

const isMediaType = (attributeType) => attributeType === 'media';

const isEnumerationType = (attributeType) => attributeType === 'enumeration';

const isRelationType = (attributeType) => attributeType === 'relation';

const handleComponentStepOne = (step) => step === '1';

const updateComponentsForDynamicZone = (state, action) => {
  const { name, components, shouldAddComponents } = action;

  return state.updateIn(['modifiedData', name], list => {
    let updatedList = list;

    if (shouldAddComponents) {
      updatedList = list.concat(components);
    } else {
      updatedList = list.filter(comp => !components.includes(comp));
    }

    return List(makeUnique(updatedList.toJS()));
  });
};

const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    if (shouldRemoveDefaultKey(obj, keys, value)) {
      return obj.updateIn(keys, () => value).remove('default');
    }

    if (isNatureKeyUpdate(keys)) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => value === 'manyToMany' ? true : null)
        .update('name', oldValue => 
          pluralize(snakeCase(oldValue), shouldPluralizeName(value))
        )
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
    }

    if (isTargetKeyUpdate(keys)) {
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
    }

    return obj.updateIn(keys, () => value);
  });
};

const handleOnChangeAllowedType = (state, action) => {
  if (isAllAllowedType(action.name)) {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      if (action.value) {
        return fromJS(['images', 'videos', 'files']);
      }

      return null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);

    if (list.includes(action.name)) {
      list = list.filter(v => v !== action.name);

      if (list.size === 0) {
        return null;
      }

      return list;
    }

    return list.push(action.name);
  });
};

const handleResetPropsAndSetFormForAddingExistingCompo = (state, action) => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
};

const handleResetPropsAndSaveCurrentData = (state) => {
  const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
  const modifiedData = fromJS({
    name: componentToCreate.get('name'),
    type: 'component',
    repeatable: false,
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

const handleResetPropsAndSetFormForAddingCompoToDz = (state) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
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

  if (isComponentType(attributeType)) {
    if (handleComponentStepOne(step)) {
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
  } else if (isDynamicZoneType(attributeType)) {
    dataToSet = {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
  } else if (isTextType(attributeType)) {
    dataToSet = { ...options, type: 'string' };
  } else if (isNumberOrDateType(attributeType)) {
    dataToSet = options;
  } else if (isMediaType(attributeType)) {
    dataToSet = {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  } else if (isEnumerationType(attributeType)) {
    dataToSet = { ...options, type: 'enumeration', enum: [] };
  } else if (isRelationType(attributeType)) {
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
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return updateComponentsForDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return handleResetPropsAndSetFormForAddingExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForAddingCompoToDz(state);
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
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