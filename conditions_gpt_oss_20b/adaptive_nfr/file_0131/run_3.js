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
 * Determines if the action payload indicates a default value change for a type key.
 * @param {Array<string>} keys
 * @param {Immutable.Map} obj
 * @returns {boolean}
 */
const hasDefaultValueAndTypeKey = (keys, obj) =>
  Boolean(obj.getIn(['default'])) && keys.length === 1 && keys.includes('type');

/**
 * Determines if the previous type is a date/time related type.
 * @param {string} previousType
 * @returns {boolean}
 */
const isDateTimeOrTime = (previousType) =>
  ['date', 'datetime', 'time'].includes(previousType);

/**
 * Determines if the action payload indicates a nature key change.
 * @param {Array<string>} keys
 * @returns {boolean}
 */
const isNatureKey = (keys) => keys.length === 1 && keys.includes('nature');

/**
 * Determines if the action payload indicates a target key change.
 * @param {Array<string>} keys
 * @returns {boolean}
 */
const isTargetKey = (keys) => keys.length === 1 && keys.includes('target');

/**
 * Handles the ON_CHANGE action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
const handleOnChange = (state, action) => {
  return state.update('modifiedData', (obj) => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    if (hasDefaultValueAndTypeKey(keys, obj)) {
      const previousType = obj.getIn(['type']);
      if (previousType && isDateTimeOrTime(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isNatureKey(keys)) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => (value === 'manyToMany' ? true : null))
        .update('name', (oldValue) => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
        .update('targetAttribute', (oldValue) => {
          if (['oneWay', 'manyWay'].includes(value)) {
            return '-';
          }
          const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', (oldValue) => {
          if (['oneWay', 'manyWay'].includes(value)) {
            return null;
          }
          return oldValue;
        });
    }

    if (isTargetKey(keys)) {
      const { targetContentTypeAllowedRelations } = action;
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
          const targetName = didChangeNatureBecauseOfRestrictedRelation
            ? targetContentTypeAllowedRelations[0]
            : obj.get('nature');
          return pluralize(
            snakeCase(selectedContentTypeFriendlyName),
            shouldPluralizeName(targetName)
          );
        })
        .update('targetAttribute', () => {
          const currentNature = obj.get('nature');
          if (['oneWay', 'manyWay'].includes(currentNature)) {
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
            shouldPluralizeTargetAttribute(currentNature)
          );
        });
    }

    return obj.updateIn(keys, () => value);
  });
};

/**
 * Handles the ON_CHANGE_ALLOWED_TYPE action.
 * @param {Immutable.Map} state
 * @param {Object} action
 * @returns {Immutable.Map}
 */
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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      return state.updateIn(['modifiedData', name], (list) => {
        const updatedList = shouldAddComponents
          ? list.concat(components)
          : list.filter((comp) => components.indexOf(comp) === -1);
        return List(makeUnique(updatedList.toJS()));
      });
    }
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO: {
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
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
        .update('isCreatingComponentWhileAddingAField', () =>
          state.getIn(['modifiedData', 'createComponent'])
        );
    }
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ: {
      const createdDZ = state.get('modifiedData');
      const dataToSet = createdDZ
        .set('createComponent', true)
        .set('componentToCreate', fromJS({ type: 'component' }));
      return initialState.update('modifiedData', () => dataToSet);
    }
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    case actions.SET_ATTRIBUTE_DATA_SCHEMA: {
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