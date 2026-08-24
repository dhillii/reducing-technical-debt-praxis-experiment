isAddingComponents = (shouldAddComponents) => shouldAddComponents;
filterOutComponents = (comp, components) => components.indexOf(comp) === -1;
shouldRemoveDefault = (hasDefaultValue, keys, previousType) => hasDefaultValue && keys.length === 1 && keys.includes('type') && previousType && ['date', 'datetime', 'time'].includes(previousType);
isNatureChange = (keys) => keys.length === 1 && keys.includes('nature');
isTargetChange = (keys) => keys.length === 1 && keys.includes('target');
shouldUpdateNatureForRestrictedRelation = (targetContentTypeAllowedRelations, currentNature) => targetContentTypeAllowedRelations !== null && !targetContentTypeAllowedRelations.includes(currentNature);
isAllowedTypesAll = (name) => name === 'all';
shouldResetAllowedTypes = (list, actionName) => list.includes(actionName);
shouldReturnNullWhenEmpty = (list) => list.size === 0;
isEditOperation = (isEditing) => isEditing;
shouldSetComponentTypeStep1 = (attributeType, step) => attributeType === 'component' && step === '1';
shouldSetComponentTypeOthers = (attributeType) => attributeType === 'component' && step !== '1';
shouldSetDynamicZoneType = (attributeType) => attributeType === 'dynamiczone';
shouldSetTextType = (attributeType) => attributeType === 'text';
shouldSetNumberDateType = (attributeType) => ['number', 'date'].includes(attributeType);
shouldSetMediaType = (attributeType) => attributeType === 'media';
shouldSetEnumerationType = (attributeType) => attributeType === 'enumeration';
shouldSetRelationType = (attributeType) => attributeType === 'relation';
setDomainValue = (value) => value === 'manyToMany';
shouldReturnDash = (nature, isDashCondition) => nature && ['oneWay', 'manyWay'].includes(nature);
isDashValue = (value) => value === '-';

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_COMPONENTS_TO_DYNAMIC_ZONE: {
      const { name, components, shouldAddComponents } = action;

      return state.updateIn(['modifiedData', name], list => {
        let updatedList = list;

        if (isAddingComponents(shouldAddComponents)) {
          updatedList = list.concat(components);
        } else {
          updatedList = list.filter(comp => filterOutComponents(comp, components));
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
        const previousType = obj.getIn(['type']);

        if (shouldRemoveDefault(hasDefaultValue, keys, previousType)) {
          return obj.updateIn(keys, () => value).remove('default');
        }

        if (isNatureChange(keys)) {
          return handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother, selectedContentTypeFriendlyName);
        }

        if (isTargetChange(keys)) {
          const { targetContentTypeAllowedRelations } = action;
          return handleTargetChange(obj, value, oneThatIsCreatingARelationWithAnother, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations);
        }

        return obj.updateIn(keys, () => value);
      });
    case actions.ON_CHANGE_ALLOWED_TYPE: {
      if (isAllowedTypesAll(action.name)) {
        return state.updateIn(['modifiedData', 'allowedTypes'], () => {
          return action.value ? fromJS(['images', 'videos', 'files']) : null;
        });
      }

      return state.updateIn(['modifiedData', 'allowedTypes'], currentList => {
        let list = currentList || fromJS([]);

        if (shouldResetAllowedTypes(list, action.name)) {
          list = list.filter(v => v !== action.name);

          if (shouldReturnNullWhenEmpty(list)) {
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

      if (isEditOperation(isEditing)) {
        return state
          .update('modifiedData', () => fromJS(modifiedDataToSetForEditing))
          .update('initialData', () => fromJS(modifiedDataToSetForEditing));
      }

      let dataToSet;

      if (shouldSetComponentTypeStep1(attributeType, step)) {
        dataToSet = {
          type: 'component',
          createComponent: true,
          componentToCreate: { type: 'component' },
        };
      } else if (shouldSetComponentTypeOthers(attributeType)) {
        dataToSet = {
          ...options,
          type: 'component',
          repeatable: true,
        };
      } else if (shouldSetDynamicZoneType(attributeType)) {
        dataToSet = {
          ...options,
          type: 'dynamiczone',
          components: [],
        };
      } else if (shouldSetTextType(attributeType)) {
        dataToSet = { ...options, type: 'string' };
      } else if (shouldSetNumberDateType(attributeType)) {
        dataToSet = options;
      } else if (shouldSetMediaType(attributeType)) {
        dataToSet = {
          allowedTypes: ['images', 'files', 'videos'],
          type: 'media',
          multiple: true,
          ...options,
        };
      } else if (shouldSetEnumerationType(attributeType)) {
        dataToSet = { ...options, type: 'enumeration', enum: [] };
      } else if (shouldSetRelationType(attributeType)) {
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

function handleNatureChange(obj, value, oneThatIsCreatingARelationWithAnother, selectedContentTypeFriendlyName) {
  return obj
    .update('nature', () => value)
    .update('dominant', () => setDomainValue(value) ? true : null)
    .update('name', oldValue => pluralize(snakeCase(oldValue), shouldPluralizeName(value)))
    .update('targetAttribute', oldValue => {
      if (shouldReturnDash(obj.get('nature'), isDashValue(value))) {
        return '-';
      }

      return pluralize(
        isDashValue(oldValue) ? snakeCase(oneThatIsCreatingARelationWithAnother) : oldValue,
        shouldPluralizeTargetAttribute(value)
      );
    })
    .update('targetColumnName', oldValue => {
      if (shouldReturnDash(obj.get('nature'), isDashValue(value))) {
        return null;
      }

      return oldValue;
    });
}

function handleTargetChange(obj, value, oneThatIsCreatingARelationWithAnother, selectedContentTypeFriendlyName, targetContentTypeAllowedRelations) {
  let didChangeNatureBecauseOfRestrictedRelation = false;
  const currentNature = obj.get('nature');

  const newNature = shouldUpdateNatureForRestrictedRelation(targetContentTypeAllowedRelations, currentNature)
    ? (didChangeNatureBecauseOfRestrictedRelation = true, targetContentTypeAllowedRelations[0])
    : currentNature;

  const updatedObj = obj
    .update('target', () => value)
    .update('nature', () => newNature)
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
    });

  return updatedObj
    .update('targetAttribute', () => {
      if (shouldReturnDash(obj.get('nature'), isDashValue(value))) {
        return '-';
      }

      if (didChangeNatureBecauseOfRestrictedRelation &&
          shouldReturnDash(targetContentTypeAllowedRelations[0], isDashValue(''))) {
        return '-';
      }

      return pluralize(
        snakeCase(oneThatIsCreatingARelationWithAnother),
        shouldPluralizeTargetAttribute(obj.get('nature'))
      );
    });
}

export default reducer;
export { initialState };