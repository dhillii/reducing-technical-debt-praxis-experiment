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

// Helper function to update the list of components in the modified data
const updateComponents = (state, name, components, shouldAddComponents) => {
  return state.updateIn(['modifiedData', name], list => {
    let updatedList = list;

    if (shouldAddComponents) {
      updatedList = list.concat(components);
    } else {
      updatedList = list.filter(comp => {
        return components.indexOf(comp) === -1;
      });
    }

    return List(makeUnique(updatedList.toJS()));
  });
};

// Helper function to handle the ON_CHANGE action
const handleOnChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;
  const hasDefaultValue = Boolean(state.getIn(['modifiedData', 'default']));

  // There is no need to remove the default key if the default value isn't defined
  if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
    const previousType = state.getIn(['modifiedData', 'type']);

    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return state.updateIn(['modifiedData', ...keys], () => value).removeIn(['modifiedData', 'default']);
    }
  }

  if (keys.length === 1 && keys.includes('nature')) {
    return state
      .updateIn(['modifiedData', 'nature'], () => value)
      .updateIn(['modifiedData', 'dominant'], () => {
        if (value === 'manyToMany') {
          return true;
        }

        return null;
      })
      .updateIn(['modifiedData', 'name'], oldValue => {
        return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
      })
      .updateIn(['modifiedData', 'targetAttribute'], oldValue => {
        if (['oneWay', 'manyWay'].includes(value)) {
          return '-';
        }

        return pluralize(
          oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
          shouldPluralizeTargetAttribute(value)
        );
      })
      .updateIn(['modifiedData', 'targetColumnName'], oldValue => {
        if (['oneWay', 'manyWay'].includes(value)) {
          return null;
        }

        return oldValue;
      });
  }

  if (keys.length === 1 && keys.includes('target')) {
    const { targetContentTypeAllowedRelations } = action;
    let didChangeNatureBecauseOfRestrictedRelation = false;

    return state
      .updateIn(['modifiedData', 'target'], () => value)
      .updateIn(['modifiedData', 'nature'], currentNature => {
        if (targetContentTypeAllowedRelations === null) {
          return currentNature;
        }

        if (!targetContentTypeAllowedRelations.includes(currentNature)) {
          didChangeNatureBecauseOfRestrictedRelation = true;

          return targetContentTypeAllowedRelations[0];
        }

        return currentNature;
      })
      .updateIn(['modifiedData', 'name'], () => {
        if (didChangeNatureBecauseOfRestrictedRelation) {
          return pluralize(
            snakeCase(selectedContentTypeFriendlyName),
            shouldPluralizeName(targetContentTypeAllowedRelations[0])
          );
        }

        return pluralize(
          snakeCase(selectedContentTypeFriendlyName),

          shouldPluralizeName(state.getIn(['modifiedData', 'nature']))
        );
      })
      .updateIn(['modifiedData', 'targetAttribute'], () => {
        if (['oneWay', 'manyWay'].includes(state.getIn(['modifiedData', 'nature']))) {
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
          shouldPluralizeTargetAttribute(state.getIn(['modifiedData', 'nature']))
        );
      });
  }

  return state.updateIn(['modifiedData', ...keys], () => value);
};

// Helper function to handle the ON_CHANGE_ALLOWED_TYPE action
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

// Helper function to handle the SET_ATTRIBUTE_DATA_SCHEMA action
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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return updateComponents(state, action.name, action.components, action.shouldAddComponents);
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
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      const createdDZ = state.get('modifiedData');
      const dataToSet = createdDZ
        .set('createComponent', true)
        .set('componentToCreate', fromJS({ type: 'component' }));

      return initialState.update('modifiedData', () => dataToSet);
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