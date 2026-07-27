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

  if (isTemporaryComponent || hasComponentAlreadyBeenAdded) {
    return newObj;
  }

  newObj = newObj.set(componentToAddUid, componentToAdd);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach(componentUid => {
    const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
    const hasNestedComponentAlreadyBeenAdded =
      state.getIn(['modifiedData', 'components', componentUid]) !== undefined;

    if (!isTemporary && !hasNestedComponentAlreadyBeenAdded) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
};

// Helper: Create opposite attribute for self-referencing relations
const createOppositeAttribute = (rest, name) => {
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

// Helper: Handle ADD_ATTRIBUTE opposite attribute logic
const handleAddAttributeOppositeRelation = (obj, rest, name, currentUid) => {
  const type = get(rest, 'type', 'relation');
  const target = get(rest, 'target', null);
  const nature = get(rest, 'nature', null);

  if (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  ) {
    const oppositeAttribute = createOppositeAttribute(rest, name);
    return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
  }

  return obj;
};

// Helper: Determine opposite attribute removal conditions
const shouldRemoveOppositeAttribute = (
  didChangeTargetRelation,
  didCreateInternalRelation,
  hadInternalRelation,
  isEditingRelation,
  didChangeRelationNature,
  nature
) => {
  const shouldRemoveByTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation;

  const shouldRemoveByNatureChange =
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation;

  return shouldRemoveByTargetChange || shouldRemoveByNatureChange;
};

// Helper: Determine opposite attribute update conditions
const shouldUpdateOppositeAttribute = (
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation
) => {
  return (
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation
  );
};

// Helper: Determine opposite attribute creation conditions
const shouldCreateOppositeAttribute = (
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation,
  didChangeTargetRelation
) => {
  const shouldCreateByNatureChange =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation;

  const shouldCreateByTargetChange =
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature);

  return shouldCreateByNatureChange || shouldCreateByTargetChange;
};

// Helper: Process attribute in EDIT_ATTRIBUTE case
const processEditAttributeItem = (
  current,
  initialAttributeName,
  obj,
  rest,
  name,
  initialAttribute,
  state,
  pathToDataToEdit,
  acc
) => {
  const isEditingCurrentAttribute = current === initialAttributeName;

  if (!isEditingCurrentAttribute) {
    return { acc, oppositeData: null };
  }

  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;

  const removeOpposite = shouldRemoveOppositeAttribute(
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    isEditingRelation,
    didChangeRelationNature,
    nature
  );

  const updateOpposite = shouldUpdateOppositeAttribute(
    initialNature,
    nature,
    hadInternalRelation,
    didCreateInternalRelation,
    isEditingRelation
  );

  const createOpposite = shouldCreateOppositeAttribute(
    initialNature,
    nature,
    hadInternalRelation,
    didCreateInternalRelation,
    isEditingRelation,
    didChangeTargetRelation
  );

  let oppositeData = null;

  if (removeOpposite) {
    oppositeData = { type: 'remove', name: initialAttribute.targetAttribute };
  } else if (updateOpposite || createOpposite) {
    const oppositeAttribute = {
      nature: getOppositeNature(rest.nature),
      target: rest.target,
      unique: rest.unique,
      dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
      targetAttribute: name,
      columnName: rest.targetColumnName,
      targetColumnName: rest.columnName,
    };

    oppositeData = {
      type: 'update',
      oldName: initialAttribute.targetAttribute,
      newName: rest.targetAttribute,
      attribute: oppositeAttribute,
      shouldCreateNew: createOpposite,
    };

    acc[name] = fromJS(rest);

    if (createOpposite) {
      acc[rest.targetAttribute] = fromJS(oppositeAttribute);
    }

    return { acc, oppositeData };
  }

  acc[name] = fromJS(rest);
  return { acc, oppositeData };
};

// Helper: Build attributes map for EDIT_ATTRIBUTE
const buildEditAttributeMap = (
  obj,
  initialAttributeName,
  rest,
  name,
  initialAttribute,
  state,
  pathToDataToEdit
) => {
  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeNameToUpdate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
  let oppositeAttributeToCreate = null;

  const newObj = OrderedMap(
    obj
      .get('attributes')
      .keySeq()
      .reduce((acc, current) => {
        const { acc: updatedAcc, oppositeData } = processEditAttributeItem(
          current,
          initialAttributeName,
          obj,
          rest,
          name,
          initialAttribute,
          state,
          pathToDataToEdit,
          acc
        );

        if (oppositeData) {
          if (oppositeData.type === 'remove') {
            oppositeAttributeNameToRemove = oppositeData.name;
          } else if (oppositeData.type === 'update') {
            oppositeAttributeNameToUpdate = oppositeData.oldName;
            oppositeAttributeNameToCreateBecauseOfNatureChange = oppositeData.newName;
            oppositeAttributeToCreate = oppositeData.attribute;
          }
        } else if (current !== initialAttributeName) {
          updatedAcc[current] = obj.getIn(['attributes', current]);
        }

        return updatedAcc;
      }, {})
  );

  let updatedObj = newObj;
  if (oppositeAttributeNameToRemove !== null) {
    updatedObj = newObj.remove(oppositeAttributeNameToRemove);
  }

  return {
    attributes: updatedObj,
    oppositeAttributeNameToUpdate,
    oppositeAttributeNameToCreateBecauseOfNatureChange,
    oppositeAttributeToCreate,
  };
};

// Helper: Handle REMOVE_FIELD opposite attribute logic
const handleRemoveFieldOppositeRelation = (state, mainDataKey, attributeToRemoveData) => {
  const isRemovingRelationAttribute = attributeToRemoveData.get('nature') !== undefined;
  const canTheAttributeToRemoveHaveARelationWithItself = mainDataKey === 'contentType';

  if (isRemovingRelationAttribute && canTheAttributeToRemoveHaveARelationWithItself) {
    const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
    const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
    const shouldRemoveOppositeAttribute =
      target === uid && !ONE_SIDE_RELATIONS.includes(nature);

    return { shouldRemove: shouldRemoveOppositeAttribute, targetAttribute };
  }

  return { shouldRemove: false, targetAttribute: null };
};

// Helper: Update attributes to remove targetField references
const updateAttributesRemoveTargetField = (attributes, attributeToRemoveName) => {
  return attributes.keySeq().reduce((acc, current) => {
    if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
      return acc.removeIn([current, 'targetField']);
    }

    return acc;
  }, attributes);
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
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
          return fromJS(rest);
        })
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
          const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
          return handleAddAttributeOppositeRelation(obj, rest, name, currentUid);
        })
        .updateIn(['modifiedData', 'components'], existingCompos => {
          if (action.shouldAddComponentToData) {
            return addComponentsToState(state, rest.component, existingCompos);
          }

          return existingCompos;
        });
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

      const initialAttributeName = get(initialAttribute, ['name'], '');

      return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
        const {
          attributes: updatedAttributes,
          oppositeAttributeNameToUpdate,
          oppositeAttributeNameToCreateBecauseOfNatureChange,
          oppositeAttributeToCreate,
        } = buildEditAttributeMap(
          obj,
          initialAttributeName,
          rest,
          name,
          initialAttribute,
          state,
          pathToDataToEdit
        );

        let finalAttributes = updatedAttributes;

        if (oppositeAttributeNameToUpdate && oppositeAttributeToCreate) {
          finalAttributes = updatedAttributes.set(
            oppositeAttributeNameToCreateBecauseOfNatureChange,
            fromJS(oppositeAttributeToCreate)
          );
        }

        return obj.set('attributes', finalAttributes);
      });
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

      const { shouldRemove, targetAttribute } = handleRemoveFieldOppositeRelation(
        state,
        mainDataKey,
        attributeToRemoveData
      );

      if (shouldRemove) {
        return state
          .removeIn(pathToAttributeToRemove)
          .removeIn([...pathToAttributes, targetAttribute]);
      }

      return state.removeIn(pathToAttributeToRemove).updateIn([...pathToAttributes], attributes => {
        return updateAttributesRemoveTargetField(attributes, attributeToRemoveName);
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