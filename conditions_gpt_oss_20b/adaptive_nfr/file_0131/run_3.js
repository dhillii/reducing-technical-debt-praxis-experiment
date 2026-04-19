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
 * @private
 * @param {Immutable.Map} list
 * @param {Array} components
 * @param {boolean} shouldAdd
 * @returns {Immutable.List}
 */
function updateDynamicZoneList(list, components, shouldAdd) {
  if (shouldAdd) {
    return List(makeUnique(list.concat(components).toJS()));
  }
  return List(makeUnique(list.filter((comp) => components.indexOf(comp) === -1).toJS()));
}

/**
 * @private
 * @param {Immutable.Map} obj
 * @param {Array} keys
 * @param {any} value
 * @param {string} selectedContentTypeFriendlyName
 * @param {string} oneThatIsCreatingARelationWithAnother
 * @param {Array|null} targetContentTypeAllowedRelations
 * @returns {Immutable.Map}
 */
function handleOnChangeLogic(obj, keys, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations) {
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
      .update('targetColumnName', () => (['oneWay', 'manyWay'].includes(value) ? null : undefined));
  }

  if (keys.length === 1 && keys.includes('target')) {
    let didChangeNatureBecauseOfRestrictedRelation = false;

    const updated = obj
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
        const nature = didChangeNatureBecauseOfRestrictedRelation
          ? targetContentTypeAllowedRelations[0]
          : obj.get('nature');
        return pluralize(
          snakeCase(selectedContentTypeFriendlyName),
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
          snakeCase(oneThatIsCreatingARelationWithAnother),
          shouldPluralizeTargetAttribute(nature)
        );
      });

    return updated;
  }

  return obj.updateIn(keys, () => value);
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleAddComponentsToDynamicZone(state, action) {
  const { name, components, shouldAddComponents } = action;
  return state.updateIn(['modifiedData', name], (list) =>
    updateDynamicZoneList(list, components, shouldAddComponents)
  );
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleOnChange(state, action) {
  return state.update('modifiedData', (obj) =>
    handleOnChangeLogic(
      obj,
      action.keys,
      action.value,
      action.selectedContentTypeFriendlyName,
      action.oneThatIsCreatingARelationWithAnother,
      action.targetContentTypeAllowedRelations
    )
  );
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleOnChangeAllowedType(state, action) {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], (currentList) => {
    let list = currentList || fromJS([]);
    if (list.includes(action.name)) {
      list = list.filter((v) => v !== action.name);
      return list.size === 0 ? null : list;
    }
    return list.push(action.name);
  });
}

/**
 * @private
 * @param {Immutable.Map} state
 * @returns {Immutable.Map}
 */
function handleResetProps(state) {
  return initialState;
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleResetPropsAndSetFormForAddingAnExistingCompo(state, action) {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleResetPropsAndSaveCurrentData(state, action) {
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
}

/**
 * @private
 * @param {Immutable.Map} state
 * @returns {Immutable.Map}
 */
function handleResetPropsAndSetTheFormForAddingACompoToADZ(state) {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetDataToEdit(state, action) {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetAttributeDataSchema(state, action) {
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
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetDynamicZoneDataSchema(state, action) {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
}

/**
 * @private
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
function handleSetErrors(state, action) {
  return state.update('formErrors', () => fromJS(action.errors));
}

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return handleResetProps(state);
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return handleResetPropsAndSetFormForAddingAnExistingCompo(state, action);
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