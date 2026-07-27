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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      const currentList = state.getIn(['modifiedData', name]);

      const updatedList = shouldAddComponents
        ? currentList.concat(components)
        : currentList.filter(comp => components.indexOf(comp) === -1);

      return state.updateIn(['modifiedData', name], () => List(makeUnique(updatedList.toJS())));
    }

    case actions.ON_CHANGE: {
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
      } = action;
      const currentModifiedData = state.get('modifiedData');
      const hasDefaultValue = Boolean(currentModifiedData.getIn(['default']));

      if (keys.length === 1 && keys.includes('type')) {
        const previousType = currentModifiedData.getIn(['type']);

        if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
          return currentModifiedData
            .updateIn(keys, () => value)
            .remove('default');
        }
      }

      if (keys.length === 1 && keys.includes('nature')) {
        return currentModifiedData
          .update('nature', () => value)
          .update('dominant', () => (value === 'manyToMany' ? true : null))
          .update('name', oldValue =>
            pluralize(snakeCase(oldValue), shouldPluralizeName(value))
          )
          .update('targetAttribute', oldValue => {
            if (['oneWay', 'manyWay'].includes(value)) {
              return '-';
            }
            return pluralize(
              oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
              shouldPluralizeTargetAttribute(value)
            );
          })
          .update('targetColumnName', oldValue =>
            ['oneWay', 'manyWay'].includes(value) ? null : oldValue
          );
      }

      if (keys.length === 1 && keys.includes('target')) {
        const { targetContentTypeAllowedRelations } = action;
        const currentNature = currentModifiedData.get('nature');
        let didChangeNatureBecauseOfRestrictedRelation = false;

        if (targetContentTypeAllowedRelations !== null) {
          if (!targetContentTypeAllowedRelations.includes(currentNature)) {
            didChangeNatureBecauseOfRestrictedRelation = true;
            currentModifiedData = currentModifiedData.set('nature', targetContentTypeAllowedRelations[0]);
          }
        }

        const finalNature = didChangeNatureBecauseOfRestrictedRelation
          ? targetContentTypeAllowedRelations[0]
          : currentNature;

        return currentModifiedData
          .update('target', () => value)
          .update('name', () => {
            if (didChangeNatureBecauseOfRestrictedRelation) {
              return pluralize(
                snakeCase(selectedContentTypeFriendlyName),
                shouldPluralizeName(targetContentTypeAllowedRelations[0])
              );
            }
            return pluralize(
              snakeCase(selectedContentTypeFriendlyName),
              shouldPluralizeName(finalNature)
            );
          })
          .update('targetAttribute', () => {
            const natureForTargetAttribute = didChangeNatureBecauseOfRestrictedRelation
              ? targetContentTypeAllowedRelations[0]
              : finalNature;

            if (['oneWay', 'manyWay'].includes(natureForTargetAttribute)) {
              return '-';
            }

            if (didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])) {
              return '-';
            }

            return pluralize(
              snakeCase(oneThatIsCreatingARelationWithAnother),
              shouldPluralizeTargetAttribute(natureForTargetAttribute)
            );
          });
      }

      return currentModifiedData.updateIn(keys, () => value);
    }

    case actions.ON_CHANGE_ALLOWED_TYPE: {
      const currentList = state.getIn(['modifiedData', 'allowedTypes']);

      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (action.value) {
            return fromJS(['images', 'videos', 'files']);
          }
          return null;
        });
      }

      const list = currentList || fromJS([]);

      if (list.includes(action.name)) {
        const filteredList = list.filter(v => v !== action.name);
        return filteredList.size === 0 ? state.updateIn(['modifiedData', 'allowedTypes'], () => null) : state.updateIn(['modifiedData', 'allowedTypes'], () => filteredList);
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], () => list.push(action.name));
    }

    case actions.RESET_PROPS:
      return initialState;

    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO:
      return initialState.update('modifiedData', () => fromJS({ type: 'component', repeatable: true, ...action.options }));

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
        .update('isCreatingComponentWhileAddingAField', () => state.getIn(['modifiedData', 'createComponent']));
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

      const dataToSet = getDataSetForAttributeType(attributeType, options, nameToSetForRelation, targetUid, step);

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

const getDataSetForAttributeType = (attributeType, options, nameToSetForRelation, targetUid, step) => {
  if (attributeType === 'component') {
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

export default reducer;
export { initialState };