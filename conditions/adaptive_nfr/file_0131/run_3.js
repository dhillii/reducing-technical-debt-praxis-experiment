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

/** @param {string} previousType - The previous attribute type */
const isTemporalType = (previousType) => ['date', 'datetime', 'time'].includes(previousType);

/** @param {string} nature - The relation nature */
const isOneWayOrManyWay = (nature) => ['oneWay', 'manyWay'].includes(nature);

/** @param {Array} keys - The keys being updated */
const isUpdatingType = (keys) => keys.length === 1 && keys.includes('type');

/** @param {Array} keys - The keys being updated */
const isUpdatingNature = (keys) => keys.length === 1 && keys.includes('nature');

/** @param {Array} keys - The keys being updated */
const isUpdatingTarget = (keys) => keys.length === 1 && keys.includes('target');

/** @param {*} defaultValue - The default value to check */
const hasDefaultValue = (defaultValue) => Boolean(defaultValue);

const handleTypeChange = (obj, keys, value) => {
  const previousType = obj.getIn(['type']);
  if (!previousType || !isTemporalType(previousType)) {
    return obj.updateIn(keys, () => value);
  }
  return obj.updateIn(keys, () => value).remove('default');
};

const handleNatureChange = (obj, value, oneThatIsCreatingARelationWithAnother) => {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (isOneWayOrManyWay(value)) {
        return '-';
      }
      return pluralize(
        oldValue === '-' ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (isOneWayOrManyWay(value)) {
        return null;
      }
      return oldValue;
    });
};

const updateNatureForTarget = (currentNature, targetContentTypeAllowedRelations) => {
  if (targetContentTypeAllowedRelations === null) {
    return { nature: currentNature, changed: false };
  }
  if (!targetContentTypeAllowedRelations.includes(currentNature)) {
    return { nature: targetContentTypeAllowedRelations[0], changed: true };
  }
  return { nature: currentNature, changed: false };
};

const computeNameForTarget = (selectedContentTypeFriendlyName, didChange, targetContentTypeAllowedRelations, currentNature) => {
  if (didChange) {
    return pluralize(
      snakeCase(selectedContentTypeFriendlyName),
      shouldPluralizeName(targetContentTypeAllowedRelations[0])
    );
  }
  return pluralize(
    snakeCase(selectedContentTypeFriendlyName),
    shouldPluralizeName(currentNature)
  );
};

const computeTargetAttributeForTarget = (currentNature, didChange, targetContentTypeAllowedRelations, oneThatIsCreatingARelationWithAnother) => {
  if (isOneWayOrManyWay(currentNature)) {
    return '-';
  }
  if (didChange && isOneWayOrManyWay(targetContentTypeAllowedRelations[0])) {
    return '-';
  }
  return pluralize(
    snakeCase(oneThatIsCreatingARelationWithAnother),
    shouldPluralizeTargetAttribute(currentNature)
  );
};

const handleTargetChange = (obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations) => {
  const { nature: newNature, changed: didChange } = updateNatureForTarget(obj.get('nature'), targetContentTypeAllowedRelations);
  const currentNature = didChange ? newNature : obj.get('nature');

  return obj
    .update('target', () => value)
    .update('nature', () => newNature)
    .update('name', () => computeNameForTarget(selectedContentTypeFriendlyName, didChange, targetContentTypeAllowedRelations, currentNature))
    .update('targetAttribute', () => computeTargetAttributeForTarget(currentNature, didChange, targetContentTypeAllowedRelations, oneThatIsCreatingARelationWithAnother));
};

const handleOnChange = (state, action) => {
  return state.update('modifiedData', obj => {
    const {
      selectedContentTypeFriendlyName,
      keys,
      value,
      oneThatIsCreatingARelationWithAnother,
    } = action;

    if (isUpdatingType(keys) && hasDefaultValue(obj.getIn(['default']))) {
      return handleTypeChange(obj, keys, value);
    }

    if (isUpdatingNature(keys)) {
      return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
    }

    if (isUpdatingTarget(keys)) {
      const { targetContentTypeAllowedRelations } = action;
      return handleTargetChange(obj, value, selectedContentTypeFriendlyName, oneThatIsCreatingARelationWithAnother, targetContentTypeAllowedRelations);
    }

    return obj.updateIn(keys, () => value);
  });
};

const handleAllowedTypeChange = (state, action) => {
  if (action.name === 'all') {
    return state.updateIn(['modifiedData', 'allowedTypes'], () => {
      return action.value ? fromJS(['images', 'videos', 'files']) : null;
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
};

/** @param {string} attributeType - The attribute type */
const isComponentType = (attributeType) => attributeType === 'component';

/** @param {string} attributeType - The attribute type */
const isDynamicZoneType = (attributeType) => attributeType === 'dynamiczone';

/** @param {string} attributeType - The attribute type */
const isTextType = (attributeType) => attributeType === 'text';

/** @param {string} attributeType - The attribute type */
const isNumberOrDateType = (attributeType) => attributeType === 'number' || attributeType === 'date';

/** @param {string} attributeType - The attribute type */
const isMediaType = (attributeType) => attributeType === 'media';

/** @param {string} attributeType - The attribute type */
const isEnumerationType = (attributeType) => attributeType === 'enumeration';

/** @param {string} attributeType - The attribute type */
const isRelationType = (attributeType) => attributeType === 'relation';

const buildComponentData = (step, options) => {
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
};

const buildAttributeData = (attributeType, options, nameToSetForRelation, targetUid, step) => {
  if (isComponentType(attributeType)) {
    return buildComponentData(step, options);
  }

  if (isDynamicZoneType(attributeType)) {
    return {
      ...options,
      type: 'dynamiczone',
      components: [],
    };
  }

  if (isTextType(attributeType)) {
    return { ...options, type: 'string' };
  }

  if (isNumberOrDateType(attributeType)) {
    return options;
  }

  if (isMediaType(attributeType)) {
    return {
      allowedTypes: ['images', 'files', 'videos'],
      type: 'media',
      multiple: true,
      ...options,
    };
  }

  if (isEnumerationType(attributeType)) {
    return { ...options, type: 'enumeration', enum: [] };
  }

  if (isRelationType(attributeType)) {
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
    return state
      .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
      .update('initialData', () => fromJS(modifiedDataToSetForEditing));
  }

  const dataToSet = buildAttributeData(attributeType, options, nameToSetForRelation, targetUid, step);
  return state.update('modifiedData', () => fromJS(dataToSet));
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
    case actions.ON_CHANGE:
      return handleOnChange(state, action);
    case actions.ON_CHANGE_ALLOWED_TYPE:
      return handleAllowedTypeChange(state, action);
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
    case actions.SET_ATTRIBUTE_DATA_SCHEMA:
      return handleSetAttributeDataSchema(state, action);
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