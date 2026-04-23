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
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => components.indexOf(comp) === -1);
    return List(makeUnique(updatedList.toJS()));
  });

const removeDefaultIfNeeded = (obj, keys, value) => {
  const hasDefault = Boolean(obj.getIn(['default']));
  if (hasDefault && keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);
    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }
  return null;
};

const updateNature = (obj, action, value) => {
  const { oneThatIsCreatingARelationWithAnother } = action;
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
    .update('targetAttribute', old => {
      if (['oneWay', 'manyWay'].includes(value)) return '-';
      const base = old === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : old;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(value) ? null : old));
};

const updateTarget = (obj, action, value) => {
  const {
    selectedContentTypeFriendlyName,
    oneThatIsCreatingARelationWithAnother,
    targetContentTypeAllowedRelations,
  } = action;

  let didChangeNature = false;

  const updated = obj
    .update('target', () => value)
    .update('nature', current => {
      if (targetContentTypeAllowedRelations === null) return current;
      if (!targetContentTypeAllowedRelations.includes(current)) {
        didChangeNature = true;
        return targetContentTypeAllowedRelations[0];
      }
      return current;
    })
    .update('name', () => {
      const nature = didChangeNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(nature)
      );
    })
    .update('targetAttribute', () => {
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) return '-';
      if (
        didChangeNature &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      )
        return '-';
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(nature)
      );
    });

  return updated;
};

const handleOnChange = (state, action) =>
  state.update('modifiedData', obj => {
    const { keys, value } = action;

    const early = removeDefaultIfNeeded(obj, keys, value);
    if (early) return early;

    if (keys.length === 1 && keys.includes('nature')) {
      return updateNature(obj, action, value);
    }

    if (keys.length === 1 && keys.includes('target')) {
      return updateTarget(obj, action, value);
    }

    return obj.updateIn(keys, () => value);
  });

const handleOnChangeAllowedType = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () =>
      action.value ? fromJS(['images', 'videos', 'files']) : null
    );
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

  const buildData = () => {
    if (attributeType === 'component') {
      return step === '1'
        ? {
            type: 'component',
            createComponent: true,
            componentToCreate: { type: 'component' },
          }
        : { ...options, type: 'component', repeatable: true };
    }
    if (attributeType === 'dynamiczone') {
      return { ...options, type: 'dynamiczone', components: [] };
    }
    if (attributeType === 'text') return { ...options, type: 'string' };
    if (attributeType === 'number' || attributeType === 'date') return options;
    if (attributeType === 'media') {
      return {
        allowedTypes: ['images', 'files', 'videos'],
        type: 'media',
        multiple: true,
        ...options,
      };
    }
    if (attributeType === 'enumeration') return { ...options, type: 'enumeration', enum: [] };
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