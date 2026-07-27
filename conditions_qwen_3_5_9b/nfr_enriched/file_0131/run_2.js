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
    case actions.ON_CHANGE: {
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
      } = action;
      const currentModifiedData = state.get('modifiedData');
      const hasDefaultValue = Boolean(currentModifiedData.getIn(['default']));

      if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
        const previousType = currentModifiedData.getIn(['type']);
        if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
          return state.update('modifiedData', obj =>
            obj.updateIn(keys, () => value).remove('default')
          );
        }
      }

      if (keys.length === 1 && keys.includes('nature')) {
        return handleNatureChange(currentModifiedData, value, oneThatIsCreatingARelationWithAnother);
      }

      if (keys.length === 1 && keys.includes('target')) {
        const { targetContentTypeAllowedRelations } = action;
        return handleTargetChange(
          currentModifiedData,
          value,
          targetContentTypeAllowedRelations,
          selectedContentTypeFriendlyName,
          oneThatIsCreatingARelationWithAnother
        );
      }

      return state.update('modifiedData', obj => obj.updateIn(keys, () => value));
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (action.value) {
            return fromJS(['images', 'videos', 'files']);
          }
          return null;
        });
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
        const list = currentList || fromJS([]);

        if (list.includes(action.name)) {
          const filteredList = list.filter(v => v !== action.name);
          if (filteredList.size === 0) {
            return null;
          }
          return filteredList;
        }

        return list.push(action.name);
      });
    }
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
    case actions.SET_DATA_TO_EDIT: {
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    }
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

      const dataToSet = getSchemaDataForAttributeType(
        attributeType,
        options,
        nameToSetForRelation,
        targetUid,
        step
      );

      return state.update('modifiedData', () => fromJS(dataToSet));
    }
    case actions.SET_DYNAMIC_ZONE_DATA_SCHEMA: {
      return state
        .update('modifiedData', () => fromJS(action.attributeToEdit))
        .update('initialData', () => fromJS(action.attributeToEdit));
    }
    case actions.SET_ERRORS:
      return state.update('formErrors', () => fromJS(action.errors));
    default:
      return state;
  }
};

/**
 * Handles the logic when the 'nature' attribute of a relation is changed.
 * Updates nature, dominant, name, targetAttribute, and targetColumnName based on the new value.
 *
 * @param {Object} currentModifiedData - The current state of modified data.
 * @param {string} value - The new value for the 'nature' attribute.
 * @param {string} oneThatIsCreatingARelationWithAnother - The name of the related content type.
 * @returns {Immutable.Map} The updated state.
 */
const handleNatureChange = (currentModifiedData, value, oneThatIsCreatingARelationWithAnother) => {
  return currentModifiedData
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
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
};

/**
 * Handles the logic when the 'target' attribute of a relation is changed.
 * Updates target, nature, name, and targetAttribute based on allowed relations and current state.
 *
 * @param {Object} currentModifiedData - The current state of modified data.
 * @param {string} value - The new value for the 'target' attribute.
 * @param {Array|null} targetContentTypeAllowedRelations - The list of allowed relations for the target.
 * @param {string} selectedContentTypeFriendlyName - The friendly name of the selected content type.
 * @param {string} oneThatIsCreatingARelationWithAnother - The name of the related content type.
 * @returns {Immutable.Map} The updated state.
 */
const handleTargetChange = (
  currentModifiedData,
  value,
  targetContentTypeAllowedRelations,
  selectedContentTypeFriendlyName,
  oneThatIsCreatingARelationWithAnother
) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedNature = currentModifiedData.get('nature');
  if (targetContentTypeAllowedRelations === null) {
    return currentModifiedData
      .update('target', () => value)
      .update('name', () =>
        pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(updatedNature))
      )
      .update('targetAttribute', () => {
        if (['oneWay', 'manyWay'].includes(updatedNature)) {
          return '-';
        }
        return pluralize(
          snakeCase(oneThatIsCreatingARelationWithAnother),
          shouldPluralizeTargetAttribute(updatedNature)
        );
      });
  }

  if (!targetContentTypeAllowedRelations.includes(updatedNature)) {
    didChangeNatureBecauseOfRestrictedRelation = true;
    const restrictedNature = targetContentTypeAllowedRelations[0];
    return currentModifiedData
      .update('target', () => value)
      .update('nature', () => restrictedNature)
      .update('name', () =>
        pluralize(
          snakeCase(selectedContentTypeFriendlyName),
          shouldPluralizeName(restrictedNature)
        )
      )
      .update('targetAttribute', () => {
        if (['oneWay', 'manyWay'].includes(restrictedNature)) {
          return '-';
        }
        return pluralize(
          snakeCase(oneThatIsCreatingARelationWithAnother),
          shouldPluralizeTargetAttribute(restrictedNature)
        );
      });
  }

  return currentModifiedData
    .update('target', () => value)
    .update('name', () =>
      pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(updatedNature))
    )
    .update('targetAttribute', () => {
      if (['oneWay', 'manyWay'].includes(updatedNature)) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(updatedNature)
      );
    });
};

/**
 * Determines the data schema to set based on the attribute type.
 *
 * @param {string} attributeType - The type of the attribute (e.g., 'component', 'relation').
 * @param {Object} options - Additional options for the schema.
 * @param {string} nameToSetForRelation - The name to use for relation attributes.
 * @param {string} targetUid - The target UID for relation attributes.
 * @param {string} step - The current step in the wizard (used for component creation).
 * @returns {Object} The data schema object.
 */
const getSchemaDataForAttributeType = (
  attributeType,
  options,
  nameToSetForRelation,
  targetUid,
  step
) => {
  if (attributeType === 'component') {
    if (step === '1') {
      return {
        type: 'component',
        createComponent: true,
        componentToCreate: { type: 'component' },
      };
    }
    return { ...options, type: 'component', repeatable: true };
  }

  if (attributeType === 'dynamiczone') {
    return { ...options, type: 'dynamiczone', components: [] };
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

export default reducer;
export { initialState };