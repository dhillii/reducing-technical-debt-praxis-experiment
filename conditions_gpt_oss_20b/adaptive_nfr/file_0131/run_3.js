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
 * @param {Immutable.Map} obj
 * @returns {boolean}
 */
const hasDefaultValue = obj => Boolean(obj.getIn(['default']));

/**
 * @param {string} type
 * @returns {boolean}
 */
const isDateTimeOrTime = type => ['date', 'datetime', 'time'].includes(type);

/**
 * @param {string} value
 * @returns {boolean}
 */
const isManyToMany = value => value === 'manyToMany';

/**
 * @param {string} value
 * @returns {boolean}
 */
const isOneOrManyWay = value => ['oneWay', 'manyWay'].includes(value);

/**
 * @param {Immutable.Map} obj
 * @param {Array} keys
 * @param {*} value
 * @returns {Immutable.Map}
 */
const updateInKeys = (obj, keys, value) => obj.updateIn(keys, () => value);

/**
 * @param {Immutable.Map} obj
 * @param {Array} keys
 * @param {string} value
 * @returns {Immutable.Map}
 */
const updateNatureDominantNameTargetAttributeTargetColumnName = (obj, value) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (isManyToMany(value) ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (isOneOrManyWay(value)) {
        return '-';
      }
      return pluralize(
        oldValue === '-' ? snakeCase(action.oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (isOneOrManyWay(value)) {
        return null;
      }
      return oldValue;
    });
};

/**
 * @param {Immutable.Map} obj
 * @param {string} value
 * @returns {Immutable.Map}
 */
const updateTargetRelatedFields = (obj, value, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
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
      if (isOneOrManyWay(obj.get('nature'))) {
        return '-';
      }
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        isOneOrManyWay(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(obj.get('nature'))
      );
    });
};

const handleAddComponentsToDynamicZone = (state, action) => {
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

const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;
    if (hasDefaultValue(obj) && keys.length === 1 && keys.includes('type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && isDateTimeOrTime(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }
    if (keys.length === 1 && keys.includes('nature')) {
      return updateNatureDominantNameTargetAttributeTargetColumnName(obj, value);
    }
    if (keys.length === 1 && keys.includes('target')) {
      return updateTargetRelatedFields(obj, value, action);
    }
    return updateInKeys(obj, keys, value);
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

const handleResetProps = () => initialState;

const handleResetPropsAndSetFormForAddingAnExistingCompo = state => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
};

const handleResetPropsAndSaveCurrentData = state => {
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

const handleResetPropsAndSetTheFormForAddingACompoToADZ = state => {
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
  if (attributeType === 'component') {
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
  } else if (attributeType === 'dynamiczone') {
    dataToSet = {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
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
      return handleResetPropsAndSetFormForAddingAnExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetTheFormForAddingACompoToADZ(state, action);
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