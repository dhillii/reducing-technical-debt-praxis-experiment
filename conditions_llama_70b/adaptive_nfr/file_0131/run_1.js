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

const isAddingComponents = (action) => action.shouldAddComponents;
const isRemovingComponents = (action) => !isAddingComponents(action);

const getUpdatedList = (list, components, shouldAdd) => {
  if (shouldAdd) {
    return list.concat(components);
  }
  return list.filter((comp) => components.indexOf(comp) === -1);
};

const getUniqueList = (list) => List(makeUnique(list.toJS()));

const handleAddComponentsToDynamicZone = (state, action) => {
  const { name, components, shouldAddComponents } = action;
  const updatedList = getUpdatedList(
    state.getIn(['modifiedData', name]),
    components,
    shouldAddComponents
  );
  return state.updateIn(['modifiedData', name], () => getUniqueList(updatedList));
};

const hasDefaultValue = (obj) => Boolean(obj.getIn(['default']));

const isTypeChange = (keys) => keys.length === 1 && keys.includes('type');

const isNatureChange = (keys) => keys.length === 1 && keys.includes('nature');

const isTargetChange = (keys) => keys.length === 1 && keys.includes('target');

const handleOnChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
    targetContentTypeAllowedRelations,
  } = action;

  if (isTypeChange(keys)) {
    return handleTypeChange(state, action);
  }

  if (isNatureChange(keys)) {
    return handleNatureChange(state, action);
  }

  if (isTargetChange(keys)) {
    return handleTargetChange(state, action);
  }

  return state.updateIn(['modifiedData'], (obj) => obj.updateIn(keys, () => value));
};

const handleTypeChange = (state, action) => {
  const { value } = action;
  const obj = state.getIn(['modifiedData']);
  const previousType = obj.getIn(['type']);

  if (hasDefaultValue(obj) && previousType && ['date', 'datetime', 'time'].includes(previousType)) {
    return obj.updateIn(['type'], () => value).remove('default');
  }

  return obj.updateIn(['type'], () => value);
};

const handleNatureChange = (state, action) => {
  const { value, oneThatIsCreatingARelationWithAnother } = action;
  const obj = state.getIn(['modifiedData']);

  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', (oldValue) => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', (oldValue) =>
      oldValue === '-' || ['oneWay', 'manyWay'].includes(value)
        ? '-'
        : pluralize(
            snakeCase(oneThatIsCreatingARelationWithAnother),
            shouldPluralizeTargetAttribute(value)
          )
    )
    .update('targetColumnName', (oldValue) =>
      ['oneWay', 'manyWay'].includes(value) ? null : oldValue
    );
};

const handleTargetChange = (state, action) => {
  const { value, targetContentTypeAllowedRelations, selectedContentTypeFriendlyName } = action;
  const obj = state.getIn(['modifiedData']);
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const newNature = targetContentTypeAllowedRelations
    ? targetContentTypeAllowedRelations.includes(obj.get('nature'))
      ? obj.get('nature')
      : (didChangeNatureBecauseOfRestrictedRelation = true, targetContentTypeAllowedRelations[0])
    : obj.get('nature');

  return obj
    .update('target', () => value)
    .update('nature', () => newNature)
    .update('name', () =>
      didChangeNatureBecauseOfRestrictedRelation
        ? pluralize(
            snakeCase(selectedContentTypeFriendlyName),
            shouldPluralizeName(targetContentTypeAllowedRelations[0])
          )
        : pluralize(
            snakeCase(selectedContentTypeFriendlyName),
            shouldPluralizeName(obj.get('nature'))
          )
    )
    .update('targetAttribute', () =>
      ['oneWay', 'manyWay'].includes(newNature) ? '-' : pluralize(snakeCase(action.oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(newNature))
    );
};

const handleOnChangeAllowedType = (state, action) => {
  const { name, value } = action;

  if (name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      value ? fromJS(['images', 'videos', 'files']) : null
    );
  }

  const currentList = state.getIn(['modifiedData', 'allowedTypes']) || fromJS([]);

  if (currentList.includes(name)) {
    return state.updateIn(['modifiedData', 'allowedTypes'], (list) =>
      list.filter((v) => v !== name).size === 0 ? null : list.filter((v) => v !== name)
    );
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], (list) => list.push(name));
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