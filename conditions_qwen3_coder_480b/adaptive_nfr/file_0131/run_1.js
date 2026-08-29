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

const isDateType = (type) => ['date', 'datetime', 'time'].includes(type);

const shouldRemoveDefaultKey = (obj, keys, hasDefaultValue) => {
  return hasDefaultValue && keys.length === 1 && keys.includes('type');
};

const isNatureKeyUpdate = (keys) => keys.length === 1 && keys.includes('nature');

const isTargetKeyUpdate = (keys) => keys.length === 1 && keys.includes('target');

const isUpdatingAllAllowedTypes = (name) => name === 'all';

const isRemovingLastAllowedType = (list) => list.size === 0;

const isComponentType = (attributeType) => attributeType === 'component';

const isDynamicZoneType = (attributeType) => attributeType === 'dynamiczone';

const isTextType = (attributeType) => attributeType === 'text';

const isNumberOrDateType = (attributeType) => attributeType === 'number' || attributeType === 'date';

const isMediaType = (attributeType) => attributeType === 'media';

const isEnumerationType = (attributeType) => attributeType === 'enumeration';

const isRelationType = (attributeType) => attributeType === 'relation';

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        let updatedList = list;

        if (shouldAddComponents) {
          updatedList = list.concat(components);
        } else {
          updatedList = list.filter(comp => {
            return components.indexOf(comp) === -1;
          });
        }

        return List(makeUnique(updatedList.toJS()));
      });
    }
    case actions.ON_CHANGE:
      return state.update('modifiedData', obj => {
        const {
          selectedContentTypeFriendlyName,
          keys,
          value,
          oneThatIsCreatingARelationWithAnother,
        } = action;
        const hasDefaultValue = Boolean(obj.getIn(['default']));

        if (shouldRemoveDefaultKey(obj, keys, hasDefaultValue)) {
          const previousType = obj.getIn(['type']);

          if (isDateType(previousType)) {
            return obj.updateIn(keys, () => value).remove('default');
          }
        }

        if (isNatureKeyUpdate(keys)) {
          return obj
            .update('nature', () => value)
            .update('dominant', () => {
              if (value === 'manyToMany') {
                return true;
              }

              return null;
            })
            .update('name', oldValue => {
              return pluralize(snakeCase(oldValue), shouldPluralizeName(value));
            })
            .update('targetAttribute', oldValue => {
              if (['oneWay', 'manyWay'].includes(value)) {
                return '-';
              }

              return pluralize(
                oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
                shouldPluralizeTargetAttribute(value)
              );
            })
            .update('targetColumnName', oldValue => {
              if (['oneWay', 'manyWay'].includes(value)) {
                return null;
              }

              return oldValue;
            });
        }

        if (isTargetKeyUpdate(keys)) {
          const { targetContentTypeAllowedRelations } = action;
          let didChangeNatureBecauseOfRestrictedRelation = false;

          return obj
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
              if (['oneWay', 'manyWay'].includes(obj.get('nature'))) {
                return '-';
              }

              if (
                didChangeNatureBecauseOfRestrictedRelation &&
                ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
              ) {
                return '-';
              }

              return pluralize(
                snakeCase(oneThatIsCreatingARelationWithAnother),
                shouldPluralizeTargetAttribute(obj.get('nature'))
              );
            });
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (isUpdatingAllAllowedTypes(action.name)) {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (action.value) {
            return fromJS(['images', 'videos', 'files']);
          }

          return null;
        });
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
        let list = currentList || fromJS([]);

        if (list.includes(action.name)) {
          list = list.filter(v => v !== action.name);

          if (isRemovingLastAllowedType(list)) {
            return null;
          }

          return list;
        }

        return list.push(action.name);
      });
    }
    case actions.RESET_PROPS:
      return initialState;
    case actions.RESET_PROPS_AND_SET_FORM_FOR_ADDING_AN_EXISTING_COMPO: {
      // This is run when the user doesn't want to create a new component
      return initialState.update('modifiedData', () =>
        fromJS({ type: 'component', repeatable: true, ...action.options })
      );
    }
    case actions.RESET_PROPS_AND_SAVE_CURRENT_DATA: {
      // This is run when the user has created a new component
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

      if (isComponentType(attributeType)) {
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
      } else if (isDynamicZoneType(attributeType)) {
        dataToSet = {
          ...options,
          type: 'dynamiczone',
          components: [],
        };
      } else if (isTextType(attributeType)) {
        dataToSet = { ...options, type: 'string' };
      } else if (isNumberOrDateType(attributeType)) {
        dataToSet = options;
      } else if (isMediaType(attributeType)) {
        dataToSet = {
          allowedTypes: ['images', 'files', 'videos'],
          type: 'media',
          multiple: true,
          ...options,
        };
      } else if (isEnumerationType(attributeType)) {
        dataToSet = { ...options, type: 'enumeration', enum: [] };
      } else if (isRelationType(attributeType)) {
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