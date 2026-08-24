const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        if (shouldAddComponents) {
          return List(makeUnique(list.concat(components).toJS()));
        }

        return List(makeUnique(list.filter(comp => components.indexOf(comp) === -1).toJS()));
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

        if (shouldRemoveDefaultOnTypeChange(obj, keys)) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (isNatureChange(keys)) {
          return updateNatureChange(obj, value, oneThatIsCreatingARelationWithAnother);
        }

        if (isTargetChange(keys)) {
          return updateTargetChange(
            obj,
            value,
            action.targetContentTypeAllowedRelations,
            selectedContentTypeFriendlyName,
            oneThatIsCreatingARelationWithAnother
          );
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
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

      const dataToSet = getDataToSetForAttributeType(
        attributeType,
        options,
        nameToSetForRelation,
        targetUid,
        step
      );

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

/**
 * Returns true if the current change should remove the 'default' key.
 * @param {Immutable.Map} obj - The current modifiedData object.
 * @param {Array} keys - The keys being updated.
 * @returns {boolean}
 */
function shouldRemoveDefaultOnTypeChange(obj, keys) {
  const hasDefaultValue = Boolean(obj.getIn(['default']));
  return (
    hasDefaultValue &&
    keys.length === 1 &&
    keys.includes('type') &&
    ['date', 'datetime', 'time'].includes(obj.getIn(['type']))
  );
}

/**
 * Returns true if the change is for the 'nature' key.
 * @param {Array} keys - The keys being updated.
 * @returns {boolean}
 */
function isNatureChange(keys) {
  return keys.length === 1 && keys.includes('nature');
}

/**
 * Returns true if the change is for the 'target' key.
 * @param {Array} keys - The keys being updated.
 * @returns {boolean}
 */
function isTargetChange(keys) {
  return keys.length === 1 && keys.includes('target');
}

/**
 * Updates the object when the 'nature' key changes.
 * @param {Immutable.Map} obj - The current modifiedData object.
 * @param {string} value - The new nature value.
 * @param {string} oneThatIsCreatingARelationWithAnother - The related content type name.
 * @returns {Immutable.Map}
 */
function updateNatureChange(obj, value, oneThatIsCreatingARelationWithAnother) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => (value === 'manyToMany' ? true : null))
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
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

/**
 * Updates the object when the 'target' key changes.
 * @param {Immutable.Map} obj - The current modifiedData object.
 * @param {string} value - The new target value.
 * @param {Array|null} targetContentTypeAllowedRelations - Allowed relation types.
 * @param {string} selectedContentTypeFriendlyName - Friendly name of the content type.
 * @param {string} oneThatIsCreatingARelationWithAnother - The related content type name.
 * @returns {Immutable.Map}
 */
function updateTargetChange(
  obj,
  value,
  targetContentTypeAllowedRelations,
  selectedContentTypeFriendlyName,
  oneThatIsCreatingARelationWithAnother
) {
  let didChangeNatureBecauseOfRestrictedRelation = false;

  const updatedObj = obj
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
    });

  return updatedObj
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
      const currentNature = obj.get('nature');

      if (['oneWay', 'manyWay'].includes(currentNature)) {
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
        shouldPluralizeTargetAttribute(currentNature)
      );
    });
}

/**
 * Returns the data object to set based on the attribute type.
 * @param {string} attributeType - The type of attribute.
 * @param {Object} options - Additional options.
 * @param {string} nameToSetForRelation - Name for relation attributes.
 * @param {string} targetUid - UID for relation target.
 * @param {string} step - Step identifier for component creation.
 * @returns {Object}
 */
function getDataToSetForAttributeType(
  attributeType,
  options,
  nameToSetForRelation,
  targetUid,
  step
) {
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
}

export default reducer;
export { initialState };