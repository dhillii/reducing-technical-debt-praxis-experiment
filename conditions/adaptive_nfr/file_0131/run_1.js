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

/** Check if default value exists and type key is being changed from temporal type */
const shouldRemoveDefaultOnTypeChange = (obj, keys) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));
  const isTypeKeyChange = keys.length === 1 && keys.includes('type');
  if (!hasDefaultValue || !isTypeKeyChange) return false;
  
  const previousType = obj.getIn(['type']);
  return previousType && ['date', 'datetime', 'time'].includes(previousType);
};

/** Check if nature key is being updated */
const isNatureKeyChange = (keys) => keys.length === 1 && keys.includes('nature');

/** Check if target key is being updated */
const isTargetKeyChange = (keys) => keys.length === 1 && keys.includes('target');

/** Check if value is a one-way or many-way relation */
const isOneWayOrManyWayRelation = (value) => ['oneWay', 'manyWay'].includes(value);

/** Check if nature changed due to restricted relations */
const didNatureChangeFromRestriction = (targetContentTypeAllowedRelations, currentNature) => {
  if (targetContentTypeAllowedRelations === null) return false;
  return !targetContentTypeAllowedRelations.includes(currentNature);
};

/** Get the new nature value based on restrictions */
const getRestrictedNature = (targetContentTypeAllowedRelations, currentNature) => {
  if (targetContentTypeAllowedRelations === null) return currentNature;
  if (!targetContentTypeAllowedRelations.includes(currentNature)) {
    return targetContentTypeAllowedRelations[0];
  }
  return currentNature;
};

/** Handle nature key change updates */
const handleNatureChange = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => value === 'manyToMany' ? true : null)
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (isOneWayOrManyWayRelation(value)) return '-';
      const attrName = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
      return pluralize(attrName, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', oldValue => isOneWayOrManyWayRelation(value) ? null : oldValue);
};

/** Handle target key change updates */
const handleTargetChange = (obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  return obj
    .update('target', () => value)
    .update('nature', currentNature => {
      const newNature = getRestrictedNature(targetContentTypeAllowedRelations, currentNature);
      didChangeNatureBecauseOfRestrictedRelation = didNatureChangeFromRestriction(targetContentTypeAllowedRelations, currentNature);
      return newNature;
    })
    .update('name', () => {
      const nature = didChangeNatureBecauseOfRestrictedRelation 
        ? targetContentTypeAllowedRelations[0] 
        : obj.get('nature');
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(nature));
    })
    .update('targetAttribute', () => {
      const currentNature = obj.get('nature');
      if (isOneWayOrManyWayRelation(currentNature)) return '-';
      if (didChangeNatureBecauseOfRestrictedRelation && isOneWayOrManyWayRelation(targetContentTypeAllowedRelations[0])) {
        return '-';
      }
      return pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(currentNature));
    });
};

/** Handle ON_CHANGE action for modifiedData */
const handleOnChange = (obj, action) => {
  const { keys, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;

  if (shouldRemoveDefaultOnTypeChange(obj, keys)) {
    return obj.updateIn(keys, () => value).remove('default');
  }

  if (isNatureKeyChange(keys)) {
    return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
  }

  if (isTargetKeyChange(keys)) {
    const { targetContentTypeAllowedRelations } = action;
    return handleTargetChange(obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations);
  }

  return obj.updateIn(keys, () => value);
};

/** Build data schema for component attribute type */
const buildComponentSchema = (step, options) => {
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

/** Build data schema for attribute based on type */
const buildAttributeSchema = (attributeType, options, nameToSetForRelation, targetUid) => {
  if (attributeType === 'component') {
    return buildComponentSchema(options.step, options);
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

/** Handle SET_ATTRIBUTE_DATA_SCHEMA action */
const handleSetAttributeDataSchema = (state, action) => {
  const { attributeType, isEditing, modifiedDataToSetForEditing, nameToSetForRelation, targetUid, step, options = {} } = action;

  if (isEditing) {
    return state
      .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
      .update('initialData', () => fromJS(modifiedDataToSetForEditing));
  }

  const dataToSet = buildAttributeSchema(attributeType, { ...options, step }, nameToSetForRelation, targetUid);
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
      return state.update('modifiedData', obj => handleOnChange(obj, action));
    case actions.ON_CHANGE_ALLOWED_TYPE: {
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