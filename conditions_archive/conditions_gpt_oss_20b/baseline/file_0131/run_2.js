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

const updateDynamicZone = (state, { name, components, shouldAddComponents }) => {
  return state.updateIn(['modifiedData', name], list => {
    const updatedList = shouldAddComponents
      ? list.concat(components)
      : list.filter(comp => !components.includes(comp));
    return List(makeUnique(updatedList.toJS()));
  });
};

const removeDefaultIfNeeded = (obj, keys, value) => {
  const hasDefault = Boolean(obj.getIn(['default']));
  if (!hasDefault) return obj;
  if (keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);
    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }
  return obj;
};

const updateNature = (obj, value, action) => {
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
    .update('targetColumnName', old => {
      if (['oneWay', 'manyWay'].includes(value)) return null;
      return old;
    });
};

const updateTarget = (obj, value, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
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
      if (didChangeNature && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) return '-';
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(nature)
      );
    });

  return updated;
};

const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const { selectedContentTypeFriendlyName, keys, value, oneThatIsCreatingARelationWithAnother } = action;
    let updatedObj = removeDefaultIfNeeded(obj, keys, value);

    if (keys.length === 1 && keys.includes('nature')) {
      updatedObj = updateNature(updatedObj, value, action);
    } else if (keys.length === 1 && keys.includes('target')) {
      updatedObj = updateTarget(updatedObj, value, action);
    } else {
      updatedObj = updatedObj.updateIn(keys, () => value);
    }

    return updatedObj;
  });
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE:
      return updateDynamicZone(state, action);
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () =>
          action.value ? fromJS(['images', 'videos', 'files']) : null
        );
      }
      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
        const list = currentList || fromJS([]);
        if (list.includes(action.name)) {
          const newList = list.filter(v => v !== action.name);
          return newList.size === 0 ? null : newList;
        }
        return list.push(action.name);
      });
    }
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

      let dataToSet;
      switch (attributeType) {
        case 'component':
          dataToSet = step === '1'
            ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
            : { ...options, type: 'component', repeatable: true };
          break;
        case 'dynamiczone':
          dataToSet = { ...options, type: 'dynamiczone', components: [] };
          break;
        case 'text':
          dataToSet = { ...options, type: 'string' };
          break;
        case 'number':
        case 'date':
          dataToSet = options;
          break;
        case 'media':
          dataToSet = { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
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
    }
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