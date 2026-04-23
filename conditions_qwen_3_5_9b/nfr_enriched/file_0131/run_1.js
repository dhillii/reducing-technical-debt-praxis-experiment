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

const updateComponentsList = (list, components, shouldAddComponents) => {
  if (shouldAddComponents) {
    return list.concat(components);
  }

  return list.filter(comp => components.indexOf(comp) === -1);
};

const updateComponentName = (obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother) => {
  const pluralizeName = shouldPluralizeName(value);
  const pluralizeTargetAttribute = shouldPluralizeTargetAttribute(value);

  return obj
    .update('name', oldValue => pluralize(snakeCase(oldValue), pluralizeName))
    .update('targetAttribute', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }

      const targetName = oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue;
      return pluralize(targetName, pluralizeTargetAttribute);
    })
    .update('targetColumnName', oldValue => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return null;
      }

      return oldValue;
    });
};

const updateComponentNature = (obj, value, targetContentTypeAllowedRelations, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother) => {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updateNature = (currentNature) => {
    if (targetContentTypeAllowedRelations === null) {
      return currentNature;
    }

    if (!targetContentTypeAllowedRelations.includes(currentNature)) {
      didChangeNatureBecauseOfRestrictedRelation = true;
      return targetContentTypeAllowedRelations[0];
    }

    return currentNature;
  };

  const updateTargetAttribute = () => {
    const nature = obj.get('nature');
    const restrictedNature = targetContentTypeAllowedRelations?.[0];

    if (['oneWay', 'manyWay'].includes(nature)) {
      return '-';
    }

    if (didChangeNatureBecauseOfRestrictedRelation && ['oneWay', 'manyWay'].includes(restrictedNature)) {
      return '-';
    }

    return pluralize(
      snakeCase(oneThatIsCreatingARelationWithAnother),
      shouldPluralizeTargetAttribute(nature)
    );
  };

  const updateName = () => {
    if (didChangeNatureBecauseOfRestrictedRelation) {
      return pluralize(
        snakeCase(selectedContentTypeFriendlyName),
        shouldPluralizeName(targetContentTypeAllowedRelations[0])
      );
    }

    return pluralize(
      snakeCase(selectedContentTypeFriendlyName),
      shouldPluralizeName(nature)
    );
  };

  return obj
    .update('target', () => value)
    .update('nature', updateNature)
    .update('name', updateName)
    .update('targetAttribute', updateTargetAttribute);
};

const updateComponentType = (obj, value, keys) => {
  const hasDefaultValue = Boolean(obj.getIn(['default']));

  if (hasDefaultValue && keys.length === 1 && keys.includes('type')) {
    const previousType = obj.getIn(['type']);

    if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
      return obj.updateIn(keys, () => value).remove('default');
    }
  }

  return obj.updateIn(keys, () => value);
};

const updateAllowedTypes = (currentList, name, value) => {
  let list = currentList || fromJS([]);

  if (list.includes(name)) {
    list = list.filter(v => v !== name);

    if (list.size === 0) {
      return null;
    }

    return list;
  }

  return list.push(name);
};

const buildComponentData = (options, type, step, nameToSetForRelation, targetUid, createComponent = false) => {
  if (type === 'component') {
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

  if (type === 'dynamiczone') {
    return {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
  }

  if (type === 'text') {
    return { ...options, type: 'string' };
  }

  if (type === 'number' || type === 'date') {
    return options;
  }

  if (type === 'media') {
    return {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  }

  if (type === 'enumeration') {
    return { ...options, type: 'enumeration', enum: [] };
  }

  if (type === 'relation') {
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

  return { ...options, type, default: null };
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        const updatedList = updateComponentsList(list, components, shouldAddComponents);
        return List(makeUnique(updatedList.toJS()));
      });
    }

    case actions.ON_CHANGE: {
      const {
        selectedContentTypeFriendlyName,
        keys,
        value,
        oneThatIsCreatingARelationWithAnother,
      } = action;

      if (keys.length === 1 && keys.includes('nature')) {
        return updateComponentName(state.get('modifiedData'), value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother);
      }

      if (keys.length === 1 && keys.includes('target')) {
        const { targetContentTypeAllowedRelations } = action;
        return updateComponentNature(
          state.get('modifiedData'),
          value,
          targetContentTypeAllowedRelations,
          selectedContentTypeFriendlyName,
          oneThatIsCreatingARelationWithAnother
        );
      }

      return updateComponentType(state.get('modifiedData'), value, keys);
    }

    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (action.name === 'all') {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          if (action.value) {
            return fromJS(['images', 'videos', 'files']);
          }

          return null;
        });
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => updateAllowedTypes(currentList, action.name, action.value));
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

      const dataToSet = buildComponentData(options, attributeType, step, nameToSetForRelation, targetUid);

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