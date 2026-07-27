import { fromJS, List } from 'immutable';
import pluralize from 'pluralize';
import { snakeCase } from 'lodash';
import makeUnique from '../../utils/makeUnique';
import { createComponentUid } from './utils/createUid';
import { shouldPluralizeName, shouldPluralizeTargetAttribute } from './utils/relations';
import * as actions from './constants';

/**
 * Initial reducer state.
 */
const initialState = fromJS({
  formErrors: {},
  modifiedData: {},
  initialData: {},
  componentToCreate: {},
  isCreatingComponentWhileAddingAField: false,
});

/* Predicate helpers */

/**
 * Checks if the provided keys array contains exactly one element equal to the given key.
 */
const isSingleKeyIncluding = (keys, key) => keys.length === 1 && keys.includes(key);

/**
 * Returns true if the object has a defined default value.
 */
const hasDefaultValue = obj => Boolean(obj.getIn(['default']));

/**
 * Returns true if the previous type is a date‑time related type.
 */
const isDateTimeType = previousType =>
  previousType && ['date', 'datetime', 'time'].includes(previousType);

/**
 * Returns true if the relation nature is many‑to‑many.
 */
const isManyToMany = value => value === 'manyToMany';

/**
 * Returns true if the relation nature is one‑way or many‑way.
 */
const isOneOrManyWay = value => ['oneWay', 'manyWay'].includes(value);

/**
 * Returns true when the action targets all allowed types.
 */
const isAllAllowedType = action => action.name === 'all';

/**
 * Returns true when the attribute type is a component.
 */
const isComponentType = type => type === 'component';

/**
 * Returns true when the attribute type is a dynamic zone.
 */
const isDynamicZoneType = type => type === 'dynamiczone';

/**
 * Returns true when the attribute type is a text field.
 */
const isTextType = type => type === 'text';

/**
 * Returns true when the attribute type is a number or date.
 */
const isNumberOrDateType = type => type === 'number' || type === 'date';

/**
 * Returns true when the attribute type is media.
 */
const isMediaType = type => type === 'media';

/**
 * Returns true when the attribute type is enumeration.
 */
const isEnumerationType = type => type === 'enumeration';

/**
 * Returns true when the attribute type is relation.
 */
const isRelationType = type => type === 'relation';

/* Action handlers */

/**
 * Handles ADD_COMPONENTS_TO_DYNAMIC_ZONE action.
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
 * Handles ON_CHANGE action.
 */
const handleOnChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;

  return state.update('modifiedData', obj => {
    if (hasDefaultValue(obj) && isSingleKeyIncluding(keys, 'type')) {
      const previousType = obj.getIn(['type']);
      if (isDateTimeType(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (isSingleKeyIncluding(keys, 'nature')) {
      return obj
        .update('nature', () => value)
        .update('dominant', () => (isManyToMany(value) ? true : null))
        .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
        .update('targetAttribute', old => {
          if (isOneOrManyWay(value)) {
            return '-';
          }
          const base = old === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : old;
          return pluralize(base, shouldPluralizeTargetAttribute(value));
        })
        .update('targetColumnName', old => (isOneOrManyWay(value) ? null : old));
    }

    if (isSingleKeyIncluding(keys, 'target')) {
      const { targetContentTypeAllowedRelations } = action;
      let didChangeNatureBecauseOfRestrictedRelation = false;

      const updated = obj
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

      return updated;
    }

    return obj.updateIn(keys, () => value);
  });
};

/**
 * Handles ON_CHANGE_ALLOWED_TYPE action.
 */
const handleOnChangeAllowedType = (state, action) => {
  if (isAllAllowedType(action)) {
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
 * Builds the data object for SET_ATTRIBUTE_DATA_SCHEMA action.
 */
const buildAttributeDataSchema = ({
  attributeType,
  step,
  options = {},
  nameToSetForRelation,
  targetUid,
}) => {
  if (isComponentType(attributeType)) {
    if (step === '1') {
      return {
        type: 'component',
        createComponent: true,
        componentToCreate: { type: 'component' },
      };
    }
    return { ...options, type: 'component', repeatable: true };
  }

  if (isDynamicZoneType(attributeType)) {
    return { ...options, type: 'dynamiczone', components: [] };
  }

  if (isTextType(attributeType)) {
    return { ...options, type: 'string' };
  }

  if (isNumberOrDateType(attributeType)) {
    return options;
  }

  if (isMediaType(attributeType)) {
    return {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  }

  if (isEnumerationType(attributeType)) {
    return { ...options, type: 'enumeration', enum: [] };
  }

  if (isRelationType(attributeType)) {
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
 * Handles SET_ATTRIBUTE_DATA_SCHEMA action.
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
    const data = fromJS(modifiedDataToSetForEditing);
    return state.update('modifiedData', () => data).update('initialData', () => data);
  }

  const dataToSet = buildAttributeDataSchema({
    attributeType,
    step,
    options,
    nameToSetForRelation,
    targetUid,
  });

  return state.update('modifiedData', () => fromJS(dataToSet));
};

/**
 * Handles RESET_PROPS_AND_SAVE_CURRENT_DATA action.
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
 * Handles RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO action.
 */
const handleResetPropsAndSetFormForAddingExistingCompo = (state, action) =>
  initialState.update('modifiedData', () =>
    fromJS({ type: 'component', repeatable: true, ...action.options })
  );

/**
 * Handles RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ action.
 */
const handleResetPropsAndSetFormForAddingCompoToDz = state => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ
    .set('createComponent', true)
    .set('componentToCreate', fromJS({ type: 'component' }));

  return initialState.update('modifiedData', () => dataToSet);
};

/**
 * Handles SET_DATA_TO_EDIT action.
 */
const handleSetDataToEdit = (state, action) =>
  state
    .updateIn(['modifiedData'], () => fromJS(action.data))
    .updateIn(['initialData'], () => fromJS(action.data));

/**
 * Handles SET_DYNAMIC_ZONE_DATA_SCHEMA action.
 */
const handleSetDynamicZoneDataSchema = (state, action) =>
  state
    .update('modifiedData', () => fromJS(action.attributeToEdit))
    .update('initialData', () => fromJS(action.attributeToEdit));

/**
 * Handles SET_ERRORS action.
 */
const handleSetErrors = (state, action) =>
  state.update('formErrors', () => fromJS(action.errors));

/**
 * Main reducer function.
 */
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
      return handleResetPropsAndSetFormForAddingExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return handleResetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return handleResetPropsAndSetFormForAddingCompoToDz(state);
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