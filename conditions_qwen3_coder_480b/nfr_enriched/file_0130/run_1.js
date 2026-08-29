import { fromJS, OrderedMap } from 'immutable';
import { get, has } from 'lodash';
import makeUnique from '../../utils/makeUnique';
import retrieveComponentsFromSchema from './utils/retrieveComponentsFromSchema';
import * as actions from './constants';

const initialState = fromJS({
  components: {},
  contentTypes: {},
  initialComponents: {},
  initialContentTypes: {},
  initialData: {},
  modifiedData: {},
  reservedNames: {},
  isLoading: true,
  isLoadingForDataToBeSet: true,
});

const ONE_SIDE_RELATIONS = ['oneWay', 'manyWay'];

const getOppositeNature = originalNature => {
  if (originalNature === 'manyToOne') {
    return 'oneToMany';
  }

  if (originalNature === 'oneToMany') {
    return 'manyToOne';
  }

  return originalNature;
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const hasComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentToAddUid]) !== undefined;

  // created components are already in the modifiedData.components
  // We don't add them because all modifications will be lost
  if (isTemporaryComponent || hasComponentAlreadyBeenAdded) {
    return newObj;
  }

  // Add the added components to the modifiedData.compontnes
  newObj = newObj.set(componentToAddUid, componentToAdd);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  // We need to add the nested components to the modifiedData.components as well
  nestedComponents.forEach(componentUid => {
    const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
    const hasNestedComponentAlreadyBeenAdded =
      state.getIn(['modifiedData', 'components', componentUid]) !== undefined;

    // Same logic here otherwise we will lose the modifications added to the components
    if (!isTemporary && !hasNestedComponentAlreadyBeenAdded) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
};

/**
 * Handles adding a new attribute to the schema
 */
const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  let newState = state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', 'components'], existingCompos => {
      if (action.shouldAddComponentToData) {
        return addComponentsToState(state, rest.component, existingCompos);
      }

      return existingCompos;
    });

  return updateOppositeRelationAttribute(newState, pathToDataToEdit, rest, name);
};

/**
 * Updates the opposite relation attribute when needed
 */
const updateOppositeRelationAttribute = (state, pathToDataToEdit, attributeData, attributeName) => {
  const type = get(attributeData, 'type', 'relation');
  const target = get(attributeData, 'target', null);
  const nature = get(attributeData, 'nature', null);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  // When the user is creating a relation with the same content type we need to create another attribute
  // that is the opposite of the created one
  if (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  ) {
    const oppositeAttribute = {
      nature: getOppositeNature(nature),
      target,
      unique: attributeData.unique,
      // Leave this if we allow the required on the relation
      // required: attributeData.required,
      dominant: nature === 'manyToMany' ? !attributeData.dominant : null,
      targetAttribute: attributeName,
      columnName: attributeData.targetColumnName,
      targetColumnName: attributeData.columnName,
    };

    return state.updateIn(
      ['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'],
      attributes => {
        return attributes.update(attributeData.targetAttribute, () => {
          return fromJS(oppositeAttribute);
        });
      }
    );
  }

  return state;
};

/**
 * Handles editing an existing attribute
 */
const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const initialAttributeName = get(initialAttribute, ['name'], '');
  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
    const processedAttributes = processAttributeEdits(obj, state, pathToDataToEdit, action);
    let updatedObj = OrderedMap(processedAttributes);

    // Remove the opposite attribute if needed
    const oppositeAttributeNameToRemove = getOppositeAttributeNameToRemove(action);
    if (oppositeAttributeNameToRemove !== null) {
      updatedObj = updatedObj.remove(oppositeAttributeNameToRemove);
    }

    return obj.set('attributes', updatedObj);
  });
};

/**
 * Processes attribute edits and returns updated attributes map
 */
const processAttributeEdits = (obj, state, pathToDataToEdit, action) => {
  const { attributeToSet: { name, ...rest }, initialAttribute } = action;
  const initialAttributeName = get(initialAttribute, ['name'], '');
  
  let oppositeAttributeToCreate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;

  return obj
    .get('attributes')
    .keySeq()
    .reduce((acc, current) => {
      const isEditingCurrentAttribute = current === initialAttributeName;

      if (isEditingCurrentAttribute) {
        return handleCurrentAttributeEdit(acc, state, pathToDataToEdit, action, name, rest);
      } else {
        const oppositeAttributeNameToUpdate = get(initialAttribute, ['targetAttribute'], null);
        if (current === oppositeAttributeNameToUpdate) {
          const { oppositeAttributeToCreate: newOppositeAttr } = getOppositeAttributeCreationData(action, name, rest);
          acc[oppositeAttributeNameToUpdate] = fromJS(newOppositeAttr);
        } else {
          acc[current] = obj.getIn(['attributes', current]);
        }
      }

      return acc;
    }, {});
};

/**
 * Handles the editing of the current attribute
 */
const handleCurrentAttributeEdit = (acc, state, pathToDataToEdit, action, name, rest) => {
  const { initialAttribute } = action;
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  
  const {
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
    oppositeAttributeToCreate,
    oppositeAttributeNameToCreateBecauseOfNatureChange
  } = getOppositeAttributeCreationData(action, name, rest);

  // First update the current attribute with the value
  acc[name] = fromJS(rest);

  // Then (if needed) create the opposite attribute
  if (
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
  }

  return acc;
};

/**
 * Determines if opposite attribute should be removed and returns its name
 */
const getOppositeAttributeNameToRemove = (action) => {
  const { initialAttribute, attributeToSet: { nature, target } } = action;
  const initialNature = initialAttribute.nature;
  const didChangeTargetRelation = initialAttribute.target !== target;
  const didCreateInternalRelation = target === get(initialAttribute, ['target'], null);
  const hadInternalRelation = initialAttribute.target === get(initialAttribute, ['target'], null);
  
  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    has(initialAttribute, 'nature');

  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    initialAttribute.nature !== nature &&
    hadInternalRelation &&
    ['oneWay', 'manyWay'].includes(nature) &&
    has(initialAttribute, 'nature');

  if (
    shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    shouldRemoveOppositeAttributeBecauseOfNatureChange
  ) {
    return initialAttribute.targetAttribute;
  }

  return null;
};

/**
 * Gets data needed for creating opposite attribute
 */
const getOppositeAttributeCreationData = (action, name, rest) => {
  const { initialAttribute, attributeToSet: { nature, target } } = action;
  const initialNature = initialAttribute.nature;
  const currentUid = get(initialAttribute, ['target'], null);
  
  const didChangeTargetRelation = initialAttribute.target !== target;
  const didCreateInternalRelation = target === currentUid;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;
  
  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    has(initialAttribute, 'nature');
    
  const shouldCreateOppositeAttributeBecauseOfNatureChange =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    has(initialAttribute, 'nature');
    
  const shouldCreateOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature);

  const oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
  const oppositeAttributeToCreate = {
    nature: getOppositeNature(nature),
    target: rest.target,
    unique: rest.unique,
    // Leave this if we allow the required on the relation
    // required: rest.required,
    dominant: nature === 'manyToMany' ? !rest.dominant : null,
    targetAttribute: name,
    columnName: rest.targetColumnName,
    targetColumnName: rest.columnName,
  };

  return {
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
    oppositeAttributeToCreate,
    oppositeAttributeNameToCreateBecauseOfNatureChange
  };
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE: {
      return handleAddAttribute(state, action);
    }
    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE: {
      const { dynamicZoneTarget, componentsToAdd } = action;

      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        list => {
          return list.concat(componentsToAdd);
        }
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
          list => {
            return fromJS(makeUnique([...list.toJS(), ...newComponents]));
          }
        )
        .updateIn(['modifiedData', 'components'], old => {
          const componentsSchema = newComponents.reduce((acc, current) => {
            return addComponentsToState(state, current, acc);
          }, old);

          return componentsSchema;
        });
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
      // Doing so will also reset the modified and the initial data
      return state
        .update('contentTypes', () => state.get('initialContentTypes'))
        .update('components', () => state.get('initialComponents'));
    }
    case actions.EDIT_ATTRIBUTE: {
      return handleEditAttribute(state, action);
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
      // Only content types can have relations with themselves since
      // components can only have oneWay or manyWay relations
      const canTheAttributeToRemoveHaveARelationWithItself = mainDataKey === 'contentType';

      if (isRemovingRelationAttribute && canTheAttributeToRemoveHaveARelationWithItself) {
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

      // Reset the state with the initial data
      // All created components and content types will be lost
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

        if (action.schemaType === 'component') {
          updatedObj = updatedObj
            .update('category', () => category)
            .updateIn(['schema', 'icon'], () => icon);
        }
        if (action.schemaType === 'contentType') {
          updatedObj = updatedObj.updateIn(['schema', 'kind'], () => kind);
        }

        return updatedObj;
      });

      if (schemaType === 'component') {
        newState = newState.updateIn(['components'], obj => {
          return obj.update(uid, () => newState.getIn(['modifiedData', 'component']));
        });
      }

      return newState;
    }
    default:
      return state;
  }
};

export default reducer;
export { addComponentsToState, initialState };