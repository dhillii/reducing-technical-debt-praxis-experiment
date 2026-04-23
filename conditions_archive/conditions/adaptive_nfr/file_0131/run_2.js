```javascript
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
 * Checks if default value exists and type key is being changed to a temporal type
 */
const shouldRemoveDefaultOnTypeChange = (obj, keys, value) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));
  if (!hasDefaultValue || keys.length !== 1 || !keys.includes('type')) {
    return false;
  }
  const previousType = obj.getIn(['type']);
  return previousType && ['date', 'datetime', 'time'].includes(previousType);
};

/**
 * Handles nature field updates with related field cascades
 */
const handleNatureUpdate = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
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
 * Determines if nature changed due to restricted relations
 */
const isNatureRestrictedByTarget = (targetContentTypeAllowedRelations, currentNature) => {
  return (
    targetContentTypeAllowedRelations !== null &&
    !targetContentTypeAllowedRelations.includes(currentNature)
  );
};

/**
 * Checks if target attribute should be set to dash based on nature
 */
const shouldSetTargetAttributeToDash = (nature) => {
  return ['oneWay', 'manyWay'].includes(nature);
};

/**
 * Handles target field updates with nature and attribute cascades
 */
const handleTargetUpdate = (
  obj,
  value,
  targetContentTypeAllowedRelations,
  selectedContentTypeFriendlyName,
  oneThatIsCreatingARelationWithAnother
) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedObj = obj
    .update('target', () => value)
    .update('nature', currentNature => {
      if (isNatureRestrictedByTarget(targetContentTypeAllowedRelations, currentNature)) {
        didChangeNatureBecauseOfRestrictedRelation = true;
        return targetContentTypeAllowedRelations[0];
      }
      return currentNature;
    });

  const finalNature = didChangeNatureBecauseOfRestrictedRelation
    ? targetContentTypeAllowedRelations[0]
    : updatedObj.get('nature');

  return updatedObj
    .update('name', () => {
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(finalNature)
      );
    })
    .update('targetAttribute', () => {
      if (shouldSetTargetAttributeToDash(updatedObj.get('nature'))) {
        return '-';
      }
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        shouldSetTargetAttributeToDash(targetContentTypeAllowedRelations[0])
      ) {
        return '-';
      }
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(updatedObj.get('nature'))
      );
    });
};

/**
 * Handles ON_CHANGE action for modifiedData
 */
const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    if (shouldRemoveDefaultOnTypeChange(obj, keys, value)) {
      return obj.updateIn(keys, () => value).remove('default');
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return handleNatureUpdate(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (keys.length === 1 && keys.includes('target')) {
      const { targetContentTypeAllowedRelations } = action;
      return handleTargetUpdate(
        obj,
        value,
        targetContentTypeAllowedRelations,
        selectedContentTypeFriendlyName,
        oneThatIsCreatingARelationWithAnother
      );
    }

    return obj.updateIn(keys, () => value);
  });
};

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action
 */
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

/**
 * Builds data schema for component attribute type
 */
const buildComponentDataSchema = (step, options) => {
  if (step === '1') {
    return {
      type: 'component',
      createComponent: true,
      componentToCreate: { type: 'component' },
    };
  }
  return {
    ...options,
    type: 'component',
    repeatable: true,
  };
};

/**
 * Builds data schema based on attribute type
 */
const buildAttributeDataSchema = (attributeType, step, options, nameToSetForRelation, targetUid) => {
  if (attributeType === 'component') {
    return buildComponentDataSchema(step, options);
  }

  if (attributeType === 'dynamiczone') {
    return {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
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

/**
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action
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

  const dataToSet = buildAttributeDataSchema(
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid
  );

  return state.update('modifiedData', () => fromJS(dataToSet));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        const updatedList = shouldAddComponents
          ? list.concat(components)
          : list.filter(comp => components.indexOf(comp) === -1);

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
    case actions.SET_DATA_TO_EDIT: {
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    }
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
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

export default reducer;
export { initialState };
```