const extractOppositeAttribute = (rest, name) => {
  /**
   * Creates an opposite relation attribute for self-referencing relations.
   * Used in ADD_ATTRIBUTE and EDIT_ATTRIBUTE actions.
   */
  return {
    nature: getOppositeNature(rest.nature),
    target: rest.target,
    unique: rest.unique,
    dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
    targetAttribute: name,
    columnName: rest.targetColumnName,
    targetColumnName: rest.columnName,
  };
};

const shouldHandleSelfRelation = (type, nature, target, currentUid) => {
  /**
   * Determines whether a self-referencing relation requires an opposite attribute.
   */
  return (
    type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    target === currentUid
  );
};

const handleSelfRelationUpdate = (obj, rest, name) => {
  /**
   * Handles adding/updating the opposite attribute for self-referencing relations in ADD_ATTRIBUTE.
   */
  if (!shouldHandleSelfRelation(rest.type, rest.nature, rest.target, rest.target)) return obj;

  const oppositeAttribute = extractOppositeAttribute(rest, name);
  return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
};

const isAttributeEditingRelation = initialAttribute => has(initialAttribute, 'nature');

const determineOppositeAttributeAction = (
  initialAttribute,
  rest,
  currentUid,
  isEditingRelation
) => {
  /**
   * Determines which opposite attribute action to perform during attribute editing.
   * Returns an object containing action flags and metadata.
   */
  const initialAttributeName = get(initialAttribute, ['name'], '');
  const { nature: initialNature, target: initialTarget, targetAttribute } = initialAttribute;
  const { nature, target } = rest;
  const hadInternalRelation = initialTarget === currentUid;

  const didChangeTargetRelation = initialTarget !== target;
  const didCreateInternalRelation = target === currentUid;
  const didChangeRelationNature = initialNature !== nature;

  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation;
  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation;
  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation;
  const shouldCreateOppositeAttributeBecauseOfNatureChange =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation;
  const shouldCreateOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature);

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange,
    shouldRemoveOppositeAttributeBecauseOfNatureChange,
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
    targetAttribute,
    didChangeTargetRelation,
    didCreateInternalRelation,
    didChangeRelationNature,
    initialAttributeName,
    currentUid,
  };
};

const processAttributeEdit = (
  obj,
  rest,
  initialAttribute,
  name,
  pathToDataToEdit,
  state
) => {
  /**
   * Processes the attribute edit operation and handles opposite attribute adjustments.
   */
  const isEditingRelation = isAttributeEditingRelation(initialAttribute);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const oppositeActions = determineOppositeAttributeAction(
    initialAttribute,
    rest,
    currentUid,
    isEditingRelation
  );

  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeNameToUpdate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
  let oppositeAttributeToCreate = null;

  // Skip processing if no relation editing involved
  if (!isEditingRelation) {
    return obj.set('attributes', obj.get('attributes').set(name, fromJS(rest)));
  }

  const updatedAttributes = obj
    .get('attributes')
    .keySeq()
    .reduce((acc, current) => {
      if (current === initialAttribute.name) {
        // Update current attribute
        acc[name] = fromJS(rest);

        // Process opposite attribute cases
        if (
          oppositeActions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
          oppositeActions.shouldRemoveOppositeAttributeBecauseOfNatureChange
        ) {
          oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
        }

        if (
          oppositeActions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
          oppositeActions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
          oppositeActions.shouldCreateOppositeAttributeBecauseOfTargetChange
        ) {
          oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
          oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;

          oppositeAttributeToCreate = extractOppositeAttribute(rest, name);

          // Create opposite attribute if needed
          if (
            oppositeActions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
            oppositeActions.shouldCreateOppositeAttributeBecauseOfTargetChange
          ) {
            acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
              oppositeAttributeToCreate
            );

            oppositeAttributeToCreate = null;
            oppositeAttributeNameToCreateBecauseOfNatureChange = null;
          }
        }
      } else if (current === oppositeAttributeNameToUpdate) {
        if (oppositeAttributeToCreate) {
          acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
        }
      } else {
        acc[current] = obj.getIn(['attributes', current]);
      }

      return acc;
    }, {});

  let updatedObj = OrderedMap(updatedAttributes);

  // Remove opposite attribute if required
  if (oppositeAttributeNameToRemove) {
    updatedObj = updatedObj.remove(oppositeAttributeNameToRemove);
  }

  return obj.set('attributes', updatedObj);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE: {
      const {
        attributeToSet: { name, ...rest },
        forTarget,
        targetUid,
      } = action;
      delete rest.createComponent;

      const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
        ? [forTarget]
        : [forTarget, targetUid];

      return state
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () =>
          fromJS(rest)
        )
        .updateIn(
          ['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'],
          obj => handleSelfRelationUpdate(obj, rest, name)
        )
        .updateIn(['modifiedData', 'components'], existingCompos => {
          return action.shouldAddComponentToData
            ? addComponentsToState(state, rest.component, existingCompos)
            : existingCompos;
        });
    }
    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE: {
      const { dynamicZoneTarget, componentsToAdd } = action;

      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        list => list.concat(componentsToAdd)
      );
    }
    case actions.CANCEL_CHANGES: {
      return state
        .update('modifiedData', () => state.get('initialData'))
        .update('components', () => state.get('initialComponents'));
    }
    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS: {
      const { dynamicZoneTarget, newComponents } = action;

      return state
        .updateIn(
          ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
          list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
        )
        .updateIn(['modifiedData', 'components'], old =>
          newComponents.reduce((acc, current) => addComponentsToState(state, current, acc), old)
        );
    }

    case actions.CREATE_SCHEMA: {
      const newSchema = {
        uid: action.uid,
        isTemporary: true,
        schema: {
          ...action.data,
          attributes: {},
        },
      };

      return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
    }
    case actions.CREATE_COMPONENT_SCHEMA: {
      const newSchema = {
        uid: action.uid,
        isTemporary: true,
        category: action.componentCategory,
        schema: {
          ...action.data,
          attributes: {},
        },
      };

      if (action.shouldAddComponentToData) {
        return state
          .updateIn(['components', action.uid], () => fromJS(newSchema))
          .updateIn(['modifiedData', 'components', action.uid], () => fromJS(newSchema));
      }

      return state.updateIn(['components', action.uid], () => fromJS(newSchema));
    }
    case actions.DELETE_NOT_SAVED_TYPE: {
      return state
        .update('contentTypes', () => state.get('initialContentTypes'))
        .update('components', () => state.get('initialComponents'));
    }
    case actions.EDIT_ATTRIBUTE: {
      const {
        attributeToSet: { name, ...rest },
        forTarget,
        targetUid,
        initialAttribute,
      } = action;

      const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
        ? [forTarget]
        : [forTarget, targetUid];

      return state.updateIn(
        ['modifiedData', ...pathToDataToEdit, 'schema'],
        obj => processAttributeEdit(obj, rest, initialAttribute, name, pathToDataToEdit, state)
      );
    }

    case actions.GET_DATA_SUCCEEDED: {
      return state
        .update('components', () => fromJS(action.components))
        .update('initialComponents', () => fromJS(action.components))
        .update('initialContentTypes', () => fromJS(action.contentTypes))
        .update('contentTypes', () => fromJS(action.contentTypes))
        .update('reservedNames', () => fromJS(action.reservedNames))
        .update('isLoading', () => false);
    }
    case actions.RELOAD_PLUGIN:
      return initialState;
    case actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT: {
      const { attributeToRemoveName, componentUid } = action;

      return state.removeIn([
        'modifiedData',
        'components',
        componentUid,
        'schema',
        'attributes',
        attributeToRemoveName,
      ]);
    }
    case actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE:
      return state.removeIn([
        'modifiedData',
        'contentType',
        'schema',
        'attributes',
        action.dzName,
        'components',
        action.componentToRemoveIndex,
      ]);
    case actions.REMOVE_FIELD: {
      const { mainDataKey, attributeToRemoveName } = action;
      const pathToAttributes = ['modifiedData', mainDataKey, 'schema', 'attributes'];
      const pathToAttributeToRemove = [...pathToAttributes, attributeToRemoveName];

      const attributeToRemoveData = state.getIn(pathToAttributeToRemove);
      const isRemovingRelationAttribute = attributeToRemoveData.get('nature') !== undefined;
      const canTheAttributeToRemoveHaveARelationWithItself = mainDataKey === 'contentType';

      if (
        isRemovingRelationAttribute &&
        canTheAttributeToRemoveHaveARelationWithItself
      ) {
        const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
        const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
        const shouldRemoveOppositeAttribute =
          target === uid && !ONE_SIDE_RELATIONS.includes(nature);

        if (shouldRemoveOppositeAttribute) {
          return state
            .removeIn(pathToAttributeToRemove)
            .removeIn([...pathToAttributes, targetAttribute]);
        }
      }

      return state.removeIn(pathToAttributeToRemove).updateIn([...pathToAttributes], attributes => {
        return attributes.keySeq().reduce((acc, current) => {
          if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
            return acc.removeIn([current, 'targetField']);
          }

          return acc;
        }, attributes);
      });
    }
    case actions.SET_MODIFIED_DATA: {
      let newState = state
        .update('isLoadingForDataToBeSet', () => false)
        .update('initialData', () => fromJS(action.schemaToSet))
        .update('modifiedData', () => fromJS(action.schemaToSet));

      if (!action.hasJustCreatedSchema) {
        newState = newState
          .update('components', () => state.get('initialComponents'))
          .update('contentTypes', () => state.get('initialContentTypes'));
      }

      return newState;
    }
    case actions.UPDATE_SCHEMA: {
      const {
        data: { name, collectionName, category, icon, kind },
        schemaType,
        uid,
      } = action;

      let newState = state.updateIn(['modifiedData', schemaType], obj => {
        let updatedObj = obj
          .updateIn(['schema', 'name'], () => name)
          .updateIn(['schema', 'collectionName'], () => collectionName);

        if (schemaType === 'component') {
          updatedObj = updatedObj
            .update('category', () => category)
            .updateIn(['schema', 'icon'], () => icon);
        }
        if (schemaType === 'contentType') {
          updatedObj = updatedObj.updateIn(['schema', 'kind'], () => kind);
        }

        return updatedObj;
      });

      if (schemaType === 'component') {
        newState = newState.updateIn(['components'], obj =>
          obj.update(uid, () => newState.getIn(['modifiedData', 'component']))
        );
      }

      return newState;
    }
    default:
      return state;
  }
};

export default reducer;
export { addComponentsToState, initialState };