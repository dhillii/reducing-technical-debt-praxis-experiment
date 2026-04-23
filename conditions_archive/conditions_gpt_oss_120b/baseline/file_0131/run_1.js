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

const handleNatureChange = (obj, value, creator) =>
  obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', old => pluralize(snakeCase(old), shouldPluralizeName(value)))
    .update('targetAttribute', old => {
      if (['oneWay', 'manyWay'].includes(value)) {
        return '-';
      }
      const base = old === '-' ? snakeCase(creator) : old;
      return pluralize(base, shouldPluralizeTargetAttribute(value));
    })
    .update('targetColumnName', old => (['oneWay', 'manyWay'].includes(value) ? null : old));

const handleTargetChange = (obj, value, action) => {
  const {
    selectedContentTypeFriendlyName,
    oneThatIsCreatingARelationWithAnother,
    targetContentTypeAllowedRelations,
  } = action;

  let newNature = obj.get('nature');
  let didChangeNature = false;

  if (targetContentTypeAllowedRelations && !targetContentTypeAllowedRelations.includes(newNature)) {
    newNature = targetContentTypeAllowedRelations[0];
    didChangeNature = true;
  }

  const computeName = () => {
    const natureForName = didChangeNature ? targetContentTypeAllowedRelations[0] : obj.get('nature');
    const base = snakeCase(selectedContentTypeFriendlyName);
    return pluralize(base, shouldPluralizeName(natureForName));
  };

  const computeTargetAttribute = () => {
    if (['oneWay', 'manyWay'].includes(newNature)) {
      return '-';
    }
    if (
      didChangeNature &&
      ['oneWay', 'manyWay'].includes(targetContentTypeAllowedRelations[0])
    ) {
      return '-';
    }
    return pluralize(
      snakeCase(oneThatIsCreatingARelationWithAnother),
      shouldPluralizeTargetAttribute(newNature)
    );
  };

  return obj
    .update('target', () => value)
    .update('nature', () => newNature)
    .update('name', computeName)
    .update('targetAttribute', computeTargetAttribute);
};

const updateModifiedDataOnChange = (state, action) => {
  const {
    selectedContentTypeFriendlyName,
    keys,
    value,
    oneThatIsCreatingARelationWithAnother,
  } = action;

  return state.update('modifiedData', obj => {
    const hasDefault = Boolean(obj.getIn(['default']));

    if (hasDefault && keys.length === 1 && keys[0] === 'type') {
      const previousType = obj.getIn(['type']);
      if (previousType && ['date', 'datetime', 'time'].includes(previousType)) {
        return obj.updateIn(keys, () => value).remove('default');
      }
    }

    if (keys.length === 1 && keys[0] === 'nature') {
      return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (keys.length === 1 && keys[0] === 'target') {
      return handleTargetChange(obj, value, action);
    }

    return obj.updateIn(keys, () => value);
  });
};

const updateAllowedTypes = (state, action) => {
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
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;
      return state.updateIn(['modifiedData', name], list => {
        const updated = shouldAddComponents ? list.concat(components) : list.filter(c => !components.includes(c));
        return List(makeUnique(updated.toJS()));
      });
    }

    case actions.ON_CHANGE:
      return updateModifiedDataOnChange(state, action);

    case actions.ON_CHANGE_ALLOWED_TYPE:
      return updateAllowedTypes(state, action);

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
      if (attributeType === 'component') {
        dataToSet =
          step === '1'
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