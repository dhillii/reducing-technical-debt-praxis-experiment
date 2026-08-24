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
 * Creates the opposite attribute object for a relation when editing an attribute.
 */
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

/**
 * Determines whether the opposite attribute should be removed based on target or nature change.
 */
const shouldRemoveOppositeAttribute = (
  didChangeTargetRelation,
  didCreateInternalRelation,
  hadInternalRelation,
  didChangeRelationNature,
  nature
) => {
  const shouldRemoveBecauseOfTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation;

  const shouldRemoveBecauseOfNatureChange =
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature);

  return shouldRemoveBecauseOfTargetChange || shouldRemoveBecauseOfNatureChange;
};

/**
 * Determines whether the opposite attribute should be updated or created based on nature change.
 */
const shouldUpdateOrCreateOppositeAttribute = (
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  didChangeTargetRelation
) => {
  const shouldUpdateBecauseOfNatureChange =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation;

  const shouldCreateBecauseOfNatureChange =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation;

  const shouldCreateBecauseOfTargetChange =
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature);

  return (
    shouldUpdateBecauseOfNatureChange ||
    shouldCreateBecauseOfNatureChange ||
    shouldCreateBecauseOfTargetChange
  );
};

/**
 * Handles the logic for updating attributes when editing an existing attribute.
 */
const handleEditAttributeLogic = (
  state,
  pathToDataToEdit,
  initialAttributeName,
  rest,
  initialAttribute,
  obj
) => {
  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeNameToUpdate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
  let oppositeAttributeToCreate = null;

  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;

  const shouldRemoveOpposite = shouldRemoveOppositeAttribute(
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    didChangeRelationNature,
    nature
  );

  const shouldUpdateOrCreateOpposite = shouldUpdateOrCreateOppositeAttribute(
    initialNature,
    nature,
    hadInternalRelation,
    didCreateInternalRelation,
    didChangeTargetRelation
  );

  if (shouldRemoveOpposite) {
    oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (shouldUpdateOrCreateOpposite) {
    oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
    oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;

    oppositeAttributeToCreate = createOppositeAttribute(rest, name);

    return {
      shouldRemoveOpposite,
      shouldUpdateOrCreateOpposite,
      oppositeAttributeNameToRemove,
      oppositeAttributeNameToUpdate,
      oppositeAttributeNameToCreateBecauseOfNatureChange,
      oppositeAttributeToCreate,
    };
  }

  return {
    shouldRemoveOpposite: false,
    shouldUpdateOrCreateOpposite: false,
  };
};

/**
 * Processes attribute updates in the loop, handling opposite attribute creation/update.
 */
const processAttributeLoop = (
  current,
  isEditingCurrentAttribute,
  acc,
  rest,
  name,
  oppositeAttributeNameToUpdate,
  oppositeAttributeNameToCreateBecauseOfNatureChange,
  oppositeAttributeToCreate
) => {
  if (isEditingCurrentAttribute) {
    acc[name] = fromJS(rest);

    if (oppositeAttributeNameToCreateBecauseOfNatureChange) {
      acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
    }

    return acc;
  }

  if (current === oppositeAttributeNameToUpdate) {
    acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
  } else {
    acc[current] = obj.getIn(['attributes', current]);
  }

  return acc;
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
          const type = get(rest, 'type', 'relation');
          const target = get(rest, 'target', null);
          const nature = get(rest, 'nature', null);
          const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

          // When the user in creating a relation with the same content type we need to create another attribute
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
              unique: rest.unique,
              dominant: nature === 'manyToMany' ? !rest.dominant : null,
              targetAttribute: name,
              columnName: rest.targetColumnName,
              targetColumnName: rest.columnName,
            };

            return obj.update(rest.targetAttribute, () => {
              return fromJS(oppositeAttribute);
            });
          }

          return obj;
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
      // Doing so will also reset the modified and the initial data
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
      let newState = state;

      const initialAttributeName = get(initialAttribute, ['name'], '');
      const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
        ? [forTarget]
        : [forTarget, targetUid];

      return newState.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
        const { shouldRemoveOpposite, oppositeAttributeNameToRemove } = handleEditAttributeLogic(
          state,
          pathToDataToEdit,
          initialAttributeName,
          rest,
          initialAttribute,
          obj
        );

        const newObj = OrderedMap(
          obj
            .get('attributes')
            .keySeq()
            .reduce((acc, current) => {
              const isEditingCurrentAttribute = current === initialAttributeName;

              processAttributeLoop(
                current,
                isEditingCurrentAttribute,
                acc,
                rest,
                name,
                oppositeAttributeNameToUpdate,
                oppositeAttributeNameToCreateBecauseOfNatureChange,
                oppositeAttributeToCreate
              );

              return acc;
            }, {})
        );

        let updatedObj;

        if (shouldRemoveOpposite && oppositeAttributeNameToRemove !== null) {
          updatedObj = newObj.remove(oppositeAttributeNameToRemove);
        } else {
          updatedObj = newObj;
        }

        return obj.set('attributes', updatedObj);
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

      const isRemovingRelationAttribute = attributeToRemoveData.get('nature') !== undefined;
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