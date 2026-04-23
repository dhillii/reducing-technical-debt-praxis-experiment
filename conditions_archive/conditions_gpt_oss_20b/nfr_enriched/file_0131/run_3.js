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

/**
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
 */
const handleAddComponentsToDynamicZone = (state, action) => {
  const { name, components, shouldAddComponents } = action;
  return state.updateIn(['modifiedData', name], list => {
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updatedList.toJS()));
  });
};

/**
 * Handles ON_CHANGE action.
 */
const handleOnChange = (state, action) => {
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
      return obj
        .update('nature', () => value)
        .update('dominant', () => (value === 'manyToMany' ? true : null))
        .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
        .update('targetAttribute', oldValue => {
          if (['oneWay', 'manyWay'].includes(value)) return '-';
          const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', oldValue => {
          if (['oneWay', 'manyWay'].includes(value)) return null;
          return oldValue;
        });
    }

    if (keys.length === 1 && keys.includes('target')) {
      const { targetContentTypeAllowedRelations } = action;
      let didChangeNatureBecauseOfRestrictedRelation = false;

      return obj
        .update('target', () => value)
        .update('nature', currentNature => {
          if (targetContentTypeAllowedRelations === null) return currentNature;
          if (!targetContentTypeAllowedRelations.includes(currentNature)) {
            didChangeNatureBecauseOfRestrictedRelation = true;
            return targetContentTypeAllowedRelations[0];
          }
          return currentNature;
        })
        .update('name', () => {
          const targetNature = didChangeNatureBecauseOfRestrictedRelation
            ? targetContentTypeAllowedRelations[0]
            : obj.get('nature');
          return pluralize(
            snakeCase(selectedContentTypeFriendlyName),
            shouldPluralizeName(targetNature)
          );
        })
        .update('targetAttribute', () => {
          const currentNature = obj.get('nature');
          if (['oneWay', 'manyWay'].includes(currentNature)) return '-';
          if (
            didChangeNatureBecauseOfRestrictedRelation &&
            ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
          )
            return '-';
          return pluralize(
            snakeCase(oneThatIsCreatingARelationWithAnother),
            shouldPluralizeTargetAttribute(currentNature)
          );
        });
    }

    return obj.updateIn(keys, () => value);
  });
};

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 */
const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
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

/**
 * Handles RESET_PROPS action.
 */
const handleResetProps = () => initialState;

/**
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 */
const handleResetPropsAndSetFormForAddingAnExistingCompo = state => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...state.options })
  );
};

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action.
 */
const handleResetPropsAndSaveCurrentData = state => {
  const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
  const modifiedData = fromJS({
    name: componentToCreate.get('name'),
    type: 'component',
    repeatable: false,
    ...state.options,
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

/**
 * Handles RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ action.
 */
const handleResetPropsAndSetTheFormForAddingACompoToADZ = state => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
};

/**
 * Handles SET_DATA_TO_EDIT action.
 */
const handleSetDataToEdit = (state, action) => {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
};

/**
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
 */
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
  if (attributeType === 'component') {
    dataToSet = step === '1'
      ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
      : { ...options, type: 'component', repeatable: true };
  } else if (attributeType === 'dynamiczone') {
    dataToSet = { ...options, type: 'dynamiczone', components: [] };
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
};

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 */
const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

/**
 * Handles SET_ERRORS action.
 */
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
      return handleResetPropsAndSetFormForAddingAnExistingCompo(state);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state);
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