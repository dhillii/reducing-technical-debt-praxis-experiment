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
 * @param {Array} keys
 * @param {string} key
 * @returns {boolean}
 */
const isSingleKey = (keys, key) => keys.length === 1 && keys.includes(key);

/**
 * @param {string} type
 * @returns {boolean}
 */
const isDateType = type => ['date', 'datetime', 'time'].includes(type);

/**
 * @param {string} value
 * @returns {boolean}
 */
const isManyToMany = value => value === 'manyToMany';

/**
 * @param {string} value
 * @returns {boolean}
 */
const isOneWayOrManyWay = value => ['oneWay', 'manyWay'].includes(value);

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleOnChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;

  return state.update('modifiedData', obj => {
    if (hasDefaultValue(obj) && isSingleKey(keys, 'type')) {
      const previousType = obj.getIn(['type']);
      if (previousType && isDateType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isSingleKey(keys, 'nature')) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => (isManyToMany(value) ? true : null))
        .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
        .update('targetAttribute', oldValue => {
          if (isOneWayOrManyWay(value)) {
            return '-';
          }
          const base =
            oldValue === '-'
              ? snakeCase(oneThatIsCreatingARelationWithAnother)
              : oldValue;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', oldValue => (isOneWayOrManyWay(value) ? null : oldValue));
    }

    if (isSingleKey(keys, 'target')) {
      const { targetContentTypeAllowedRelations } = action;
      let didChangeNature = false;

      return obj
        .update('target', () => value)
        .update('nature', currentNature => {
          if (targetContentTypeAllowedRelations === null) {
            return currentNature;
          }
          if (!targetContentTypeAllowedRelations.includes(currentNature)) {
            didChangeNature = true;
            return targetContentTypeAllowedRelations[0];
          }
          return currentNature;
        })
        .update('name', () => {
          if (didChangeNature) {
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
          const nature = obj.get('nature');
          if (isOneWayOrManyWay(nature)) {
            return '-';
          }
          if (
            didChangeNature &&
            isOneWayOrManyWay(targetContentTypeAllowedRelations[0])
          ) {
            return '-';
          }
          return pluralize(
            snakeCase(oneThatIsCreatingARelationWithAnother),
            shouldPluralizeTargetAttribute(nature)
          );
        });
    }

    return obj.updateIn(keys, () => value);
  });
};

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
    });
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    const list = currentList || fromJS([]);
    if (list.includes(action.name)) {
      const newList = list.filter(v => v !== action.name);
      return newList.size === 0 ? null : newList;
    }
    return list.push(action.name);
  });
};

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleResetPropsAndSetFormForAddingAnExistingCompo = (state, action) => {
  return initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );
};

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
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

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleResetPropsAndSetTheFormForAddingACompoToADZ = (state, action) => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
};

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleSetDataToEdit = (state, action) => {
  return state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));
};

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleSetDynamicZoneDataSchema = (state, action) => {
  return state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));
};

/**
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
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
      return initialState;
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