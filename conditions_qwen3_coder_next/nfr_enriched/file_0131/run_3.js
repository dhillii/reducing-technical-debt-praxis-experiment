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
 * Updates the list of components in a dynamic zone based on whether to add or remove them.
 */
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

/**
 * Handles value changes in the form with special handling for nature/target attribute interdependencies.
 */
const handleChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;

  return state.update('modifiedData', obj => {
    // Handle removal of default when type changes from date/datetime/time
    if (keys.length === 1 && keys.includes('type')) {
      const hasDefaultValue = Boolean(obj.getIn(['default']));
      const previousType = obj.getIn(['type']);

      if (hasDefaultValue && ['date', 'datetime', 'time'].includes(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    // Handle nature change
    if (keys.length === 1 && keys.includes('nature')) {
      return handleChangeNature(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    // Handle target change
    if (keys.length === 1 && keys.includes('target')) {
      const { targetContentTypeAllowedRelations } = action;

      return handleChangeTarget(
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
 * Updates nature and related fields (name, targetAttribute, targetColumnName) based on the new nature value.
 */
const handleChangeNature = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  const targetIsOneWayOrManyWay = ['oneWay', 'manyWay'].includes(value);

  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (targetIsOneWayOrManyWay) {
        return '-';
      }

      return pluralize(
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => (targetIsOneWayOrManyWay ? null : oldValue));
};

/**
 * Handles targetUid changes and adjusts related fields accordingly based on allowed relations.
 */
const handleChangeTarget = (
  obj,
  value,
  targetContentTypeAllowedRelations,
  selectedContentTypeFriendlyName,
  oneThatIsCreatingARelationWithAnother
) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;
  let newNature = obj.get('nature');

  if (targetContentTypeAllowedRelations !== null) {
    if (!targetContentTypeAllowedRelations.includes(newNature)) {
      didChangeNatureBecauseOfRestrictedRelation = true;
      newNature = targetContentTypeAllowedRelations[0];
    }
  }

  const targetIsOneWayOrManyWay = newNature && ['oneWay', 'manyWay'].includes(newNature);

  const namePluralization = didChangeNatureBecauseOfRestrictedRelation
    ? targetContentTypeAllowedRelations[0]
    : obj.get('nature');

  return obj
    .update('target', () => value)
    .update('nature', () => newNature)
    .update('name', () =>
      pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(namePluralization))
    )
    .update('targetAttribute', () => {
      if (targetIsOneWayOrManyWay) {
        return '-';
      }

      const shouldUseRestrictedNature =
        didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(newNature);

      if (shouldUseRestrictedNature) {
        return '-';
      }

      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(newNature)
      );
    });
};

/**
 * Handles allowed types changes for media attributes.
 */
const handleChangeAllowedType = (state, action) => {
  const { name, value } = action;

  if (name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      value ? fromJS(['images', 'videos', 'files']) : null
    );
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
    let list = currentList || fromJS([]);

    if (list.includes(name)) {
      list = list.filter(v => v !== name);

      if (list.size === 0) {
        return null;
      }

      return list;
    }

    return list.push(name);
  });
};

/**
 * Resets state to initial or modified state with provided options.
 */
const handleResetAndSetFormData = (state, action, optionBuilder) => {
  const resetState = initialState;

  if (action.type === actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO) {
    return resetState.update('modifiedData', () =>
      fromJS({ type: 'component', repeatable: true, ...action.options })
    );
  }

  if (action.type === actions.RESET_PROPS_AND_SAVE_CURRENT_DATA) {
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

    return resetState
      .update('componentToCreate', () => componentToCreate)
      .update('modifiedData', () => modifiedData)
      .update('isCreatingComponentWhileAddingAField', () =>
        state.getIn(['modifiedData', 'createComponent'])
      );
  }

  if (action.type === actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ) {
    const createdDZ = state.get('modifiedData');
    const dataToSet = createdDZ
      .set('createComponent', true)
      .set('componentToCreate', fromJS({ type: 'component' }));

    return resetState.update('modifiedData', () => dataToSet);
  }

  return resetState;
};

/**
 * Applies attribute schema data to modified and initial data.
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
 * Reducer for managing state changes to Strapi content-type builder form.
 */
const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return handleAddComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleChangeAllowedType(state, action);
    case actions.RESET_PROPS:
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetAndSetFormData(state, action);
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