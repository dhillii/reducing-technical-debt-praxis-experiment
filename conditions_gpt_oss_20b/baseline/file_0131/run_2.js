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

const updateType = (obj, value, hasDefault) => {
  const previousType = obj.getIn(['type']);
  let updated = obj.updateIn(['type'], () => value);
  if (hasDefault && previousType && ['date', 'datetime', 'time'].includes(previousType)) {
    updated = updated.remove('default');
  }
  return updated;
};

const updateNature = (obj, value, oneThatIsCreatingARelationWithAnother) => {
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

const updateTarget = (
  obj,
  value,
  selectedContentTypeFriendlyName,
  targetContentTypeAllowedRelations,
  oneThatIsCreatingARelationWithAnother
) => {
  let didChangeNature = false;
  const currentNature = obj.get('nature');
  const newNature =
    targetContentTypeAllowedRelations === null
      ? currentNature
      : targetContentTypeAllowedRelations.includes(currentNature)
      ? currentNature
      : (didChangeNature = true, targetContentTypeAllowedRelations[0]);

  const newName = didChangeNature
    ? pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(targetContentTypeAllowedRelations[0])
      )
    : pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(currentNature)
      );

  const newTargetAttribute = (() => {
    if (['oneWay', 'manyWay'].includes(obj.get('nature'))) return '-';
    if (didChangeNature && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0]))
      return '-';
    return pluralize(
      snakeCase(oneThatIsCreatingARelationWithAnother),
      shouldPluralizeTargetAttribute(obj.get('nature'))
    );
  })();

  return obj
    .update('target', () => value)
    .update('nature', () => newNature)
    .update('name', () => newName)
    .update('targetAttribute', () => newTargetAttribute);
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
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
        targetContentTypeAllowedRelations,
      } = action;
      const obj = state.get('modifiedData');
      const hasDefault = Boolean(obj.getIn(['default']));

      if (keys.length === 1) {
        const key = keys[0];
        if (key === 'type') {
          return state.update('modifiedData', obj => updateType(obj, value, hasDefault));
        }
        if (key === 'nature') {
          return state.update('modifiedData', obj =>
            updateNature(obj, value, oneThatIsCreatingARelationWithAnother)
          );
        }
        if (key === 'target') {
          return state.update('modifiedData', obj =>
            updateTarget(
              obj,
              value,
              selectedContentTypeFriendlyName,
              targetContentTypeAllowedRelations,
              oneThatIsCreatingARelationWithAnother
            )
          );
        }
      }
      return state.update('modifiedData', obj => obj.updateIn(keys, () => value));
    }
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () =>
          action.value ? fromJS(['images', 'videos', 'files']) : null
        );
      }
      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
        const list = currentList || fromJS([]);
        if (list.includes(action.name)) {
          const filtered = list.filter(v => v !== action.name);
          return filtered.size === 0 ? null : filtered;
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