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

const addComponentsToDynamicZone = (state, { name, components, shouldAddComponents }) =>
  state.updateIn(['modifiedData', name], list => {
    const updated = shouldAddComponents ? list.concat(components) : list.filter(c => !components.includes(c));
    return List(makeUnique(updated.toJS()));
  });

const updateNature = (obj, value, oneThatIsCreatingARelationWithAnother) =>
  obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
    .update('targetAttribute', old =>
      ['oneWay', 'manyWay'].includes(value)
        ? '-'
        : pluralize(
            old === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : old,
            shouldPluralizeTargetAttribute(value)
          )
    )
    .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(value) ? null : old));

const updateTarget = (obj, value, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
  let didChangeNature = false;

  const updated = obj
    .update('target', () => value)
    .update('nature', current => {
      if (!targetContentTypeAllowedRelations) return current;
      if (!targetContentTypeAllowedRelations.includes(current)) {
        didChangeNature = true;
        return targetContentTypeAllowedRelations[0];
      }
      return current;
    })
    .update('name', () => {
      const nature = didChangeNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
      return pluralize(snakeCase(selectedContentTypeFriendlyName), shouldPluralizeName(nature));
    })
    .update('targetAttribute', () => {
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) return '-';
      if (didChangeNature && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations?.[0])) return '-';
      return pluralize(snakeCase(oneThatIsCreatingARelationWithAnother), shouldPluralizeTargetAttribute(nature));
    });

  return updated;
};

const handleOnChange = (state, action) =>
  state.update('modifiedData', obj => {
    const { selectedContentTypeFriendlyName, keys, value, oneThatIsCreatingARelationWithAnother } = action;
    const hasDefault = Boolean(obj.getIn(['default']));

    if (hasDefault && keys.length === 1 && keys.includes('type')) {
      const prevType = obj.getIn(['type']);
      if (prevType && ['date', 'datetime', 'time'].includes(prevType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (keys.length === 1 && keys.includes('nature')) {
      return updateNature(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (keys.length === 1 && keys.includes('target')) {
      return updateTarget(obj, value, action);
    }

    return obj.updateIn(keys, () => value);
  });

const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
  }

  return state.updateIn(['modifiedData', 'allowedTypes'], list => {
    let current = list || fromJS([]);
    if (current.includes(action.name)) {
      current = current.filter(v => v !== action.name);
      return current.size === 0 ? null : current;
    }
    return current.push(action.name);
  });
};

const resetPropsAndSetFormForAddingExistingCompo = (state, action) =>
  initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));

const resetPropsAndSaveCurrentData = (state, action) => {
  const componentToCreate = state.getIn(['modifiedData', 'componentToCreate']);
  const modifiedData = fromJS({
    name: componentToCreate.get('name'),
    type: 'component',
    repeatable: false,
    ...action.options,
    component: createComponentUid(componentToCreate.get('name'), componentToCreate.get('category')),
  });

  return initialState
    .update('componentToCreate', () => componentToCreate)
    .update('modifiedData', () => modifiedData)
    .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
};

const resetPropsAndSetFormForAddingCompoToDz = state => {
  const createdDZ = state.get('modifiedData');
  const dataToSet = createdDZ.set('createComponent', true).set('componentToCreate', fromJS({ type: 'component' }));
  return initialState.update('modifiedData', () => dataToSet);
};

const setAttributeDataSchema = (state, action) => {
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

  const buildData = () => {
    if (attributeType === 'component') {
      return step === '1'
        ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
        : { ...options, type: 'component', repeatable: true };
    }
    if (attributeType === 'dynamiczone') return { ...options, type: 'dynamiczone', components: [] };
    if (attributeType === 'text') return { ...options, type: 'string' };
    if (attributeType === 'number' || attributeType === 'date') return options;
    if (attributeType === 'media')
      return { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
    if (attributeType === 'enumeration') return { ...options, type: 'enumeration', enum: [] };
    if (attributeType === 'relation')
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
    return { ...options, type: attributeType, default: null };
  };

  return state.update('modifiedData', () => fromJS(buildData()));
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return addComponentsToDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleOnChangeAllowedType(state, action);
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return resetPropsAndSetFormForAddingExistingCompo(state, action);
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA:
      return resetPropsAndSaveCurrentData(state, action);
    case actions.RESET_PROPS_AND_SET_THE_FORM_FOR_ADDING_A_COMPO_TO_A_DZ:
      return resetPropsAndSetFormForAddingCompoToDz(state);
    case actions.SET_DATA_TO_EDIT:
      return state
        .updateIn(['modifiedData'], () => fromJS(action.data))
        .updateIn(['initialData'], () => fromJS(action.data));
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return setAttributeDataSchema(state, action);
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