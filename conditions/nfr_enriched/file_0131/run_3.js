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

// Handle adding or removing components from dynamic zone
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

// Handle default value removal when type changes
const handleDefaultValueRemoval = (obj, keys, value) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));

  if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);

    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }

  return null;
};

// Handle nature field updates for relations
const handleNatureUpdate = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
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

// Handle target field updates for relations
const handleTargetUpdate = (obj, value, action) => {
  const { selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations } = action;
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
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(nature)
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
};

// Handle onChange action for modifiedData
const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const { keys, value, oneThatIsCreatingARelationWithAnother } = action;

    const defaultRemovalResult = handleDefaultValueRemoval(obj, keys, value);
    if (defaultRemovalResult) {
      return defaultRemovalResult;
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return handleNatureUpdate(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (keys.length === 1 && keys.includes('target')) {
      return handleTargetUpdate(obj, value, action);
    }

    return obj.updateIn(keys, () => value);
  });
};

// Handle allowed types changes
const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
    });
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

// Build data schema for different attribute types
const buildAttributeDataSchema = (attributeType, action, options) => {
  const { nameToSetForRelation, targetUid, step } = action;

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

// Handle setting attribute data schema
const handleSetAttributeDataSchema = (state, action) => {
  const { attributeType, isEditing, modifiedDataToSetForEditing, options = {} } = action;

  if (isEditing) {
    return state
      .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
      .update('initialData', () => fromJS(modifiedDataToSetForEditing));
  }

  const dataToSet = buildAttributeDataSchema(attributeType, action, options);
  return state.update('modifiedData', () => fromJS(dataToSet));
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
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );

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