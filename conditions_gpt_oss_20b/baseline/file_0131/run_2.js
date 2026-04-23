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

const updateNature = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) return '-';
      const base = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) return null;
      return oldValue;
    });
};

const updateTarget = (obj, value, action) => {
  const { targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother } = action;
  let didChangeNatureBecauseOfRestrictedRelation = false;

  return obj
    .update('target', () => value)
    .update('nature', currentNature => {
      if (targetContentTypeAllowedRelations === null) return currentNature;
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
      const nature = obj.get('nature');
      if (['oneWay', 'manyWay'].includes(nature)) return '-';
      if (
        didChangeNatureBecauseOfRestrictedRelation &&
        ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
      )
        return '-';
      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(nature)
      );
    });
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
    case actions.ON_CHANGE: {
      return state.update('modifiedData', obj => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
          targetContentTypeAllowedRelations,
        } = action;
        const hasDefaultValue = Boolean(obj.getIn(['default']));

        if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
          const previousType = obj.getIn(['type']);
          if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
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
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (action.value) return fromJS(['images', 'videos', 'files']);
          return null;
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
      if (attributeType === 'component') {
        dataToSet = step === '1'
          ? { type: 'component', createComponent: true, componentToCreate: { type: 'component' } }
          : { ...options, type: 'component', repeatable: true };
      } else if (attributeType === 'dynamiczone') {
        dataToSet = { ...options, type: 'dynamiczone', components: [] };
      } else if (attributeType === 'text') {
        dataToSet = { ...options, type: 'string' };
      } else if (attributeType === 'number' || attributeType === 'date') {
        dataToSet = options;
      } else if (attributeType === 'media') {
        dataToSet = { allowedTypes: ['images', 'files', 'videos'], type: 'media', multiple: true, ...options };
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
    }
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