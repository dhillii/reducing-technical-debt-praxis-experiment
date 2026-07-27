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

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

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
};

const handleAddCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;

  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    list => {
      return list.concat(componentsToAdd);
    }
  );
};

const handleCancelChanges = state => {
  return state
    .update('modifiedData', () => state.get('initialData'))
    .update('components', () => state.get('initialComponents'));
};

const handleChangeDynamicZoneComponents = (state, action) => {
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
};

const handleCreateSchema = (state, action) => {
  const newSchema = {
    uid: action.uid,
    isTemporary: true,
    schema: {
      ...action.data,
      attributes: {},
    },
  };

  return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
};

const handleCreateComponentSchema = (state, action) => {
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
};

const handleDeleteNotSavedType = state => {
  return state
    .update('contentTypes', () => state.get('initialContentTypes'))
    .update('components', () => state.get('initialComponents'));
};

const handleEditAttribute = (state, action) => {
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
    let oppositeAttributeNameToRemove = null;
    let oppositeAttributeNameToUpdate = null;
    let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    let oppositeAttributeToCreate = null;

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          const isEditingCurrentAttribute = current === initialAttributeName;

          if (isEditingCurrentAttribute) {
            const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
            const isEditingRelation = has(initialAttribute, 'nature');
            const didChangeTargetRelation = initialAttribute.target !== rest.target;
            const didCreateInternalRelation = rest.target === currentUid;
            const nature = rest.nature;
            const initialNature = initialAttribute.nature;
            const hadInternalRelation = initialAttribute.target === currentUid;
            const didChangeRelationNature = initialAttribute.nature !== nature;
            const shouldRemoveOppositeAttributeBecauseOfTargetChange =
              didChangeTargetRelation &&
              !didCreateInternalRelation &&
              hadInternalRelation &&
              isEditingRelation;
            const shouldRemoveOppositeAttributeBecauseOfNatureChange =
              didChangeRelationNature &&
              hadInternalRelation &&
              ['oneWay', 'manyWay'].includes(nature) &&
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

            if (
              shouldRemoveOppositeAttributeBecauseOfTargetChange ||
              shouldRemoveOppositeAttributeBecauseOfNatureChange
            ) {
              oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
            }

            if (
              shouldUpdateOppositeAttributeBecauseOfNatureChange ||
              shouldCreateOppositeAttributeBecauseOfNatureChange ||
              shouldCreateOppositeAttributeBecauseOfTargetChange
            ) {
              oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
              oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;

              oppositeAttributeToCreate = {
                nature: getOppositeNature(rest.nature),
                target: rest.target,
                unique: rest.unique,
                dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
                targetAttribute: name,
                columnName: rest.targetColumnName,
                targetColumnName: rest.columnName,
              };

              acc[name] = fromJS(rest);

              if (
                shouldCreateOppositeAttributeBecauseOfNatureChange ||
                shouldCreateOppositeAttributeBecauseOfTargetChange
              ) {
                acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
                  oppositeAttributeToCreate
                );

                oppositeAttributeToCreate = null;
                oppositeAttributeNameToCreateBecauseOfNatureChange = null;
              }

              return acc;
            }

            acc[name] = fromJS(rest);
          } else if (current === oppositeAttributeNameToUpdate) {
            acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
              oppositeAttributeToCreate
            );
          } else {
            acc[current] = obj.getIn(['attributes', current]);
          }

          return acc;
        }, {})
    );

    let updatedObj;

    if (oppositeAttributeNameToRemove !== null) {
      updatedObj = newObj.remove(oppositeAttributeNameToRemove);
    } else {
      updatedObj = newObj;
    }

    return obj.set('attributes', updatedObj);
  });
};

const handleGetDataSucceeded = (state, action) => {
  return state
    .update('components', () => fromJS(action.components))
    .update('initialComponents', () => fromJS(action.components))
    .update('initialContentTypes', () => fromJS(action.contentTypes))
    .update('contentTypes', () => fromJS(action.contentTypes))
    .update('reservedNames', () => fromJS(action.reservedNames))
    .update('isLoading', () => false);
};

const handleReloadPlugin = () => {
  return initialState;
};

const handleRemoveFieldFromDisplayedComponent = (state, action) => {
  const { attributeToRemoveName, componentUid } = action;

  return state.removeIn([
    'modifiedData',
    'components',
    componentUid,
    'schema',
    'attributes',
    attributeToRemoveName,
  ]);
};

const handleRemoveComponentFromDynamicZone = (state, action) => {
  return state.removeIn([
    'modifiedData',
    'contentType',
    'schema',
    'attributes',
    action.dzName,
    'components',
    action.componentToRemoveIndex,
  ]);
};

const handleRemoveField = (state, action) => {
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
};

const handleSetModifiedData = (state, action) => {
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
};

const handleUpdateSchema = (state, action) => {
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
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return handleAddAttribute(state, action);
    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE:
      return handleAddCreatedComponentToDynamicZone(state, action);
    case actions.CANCEL_CHANGES:
      return handleCancelChanges(state);
    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS:
      return handleChangeDynamicZoneComponents(state, action);
    case actions.CREATE_SCHEMA:
      return handleCreateSchema(state, action);
    case actions.CREATE_COMPONENT_SCHEMA:
      return handleCreateComponentSchema(state, action);
    case actions.DELETE_NOT_SAVED_TYPE:
      return handleDeleteNotSavedType(state);
    case actions.EDIT_ATTRIBUTE:
      return handleEditAttribute(state, action);
    case actions.GET_DATA_SUCCEEDED:
      return handleGetDataSucceeded(state, action);
    case actions.RELOAD_PLUGIN:
      return handleReloadPlugin();
    case actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT:
      return handleRemoveFieldFromDisplayedComponent(state, action);
    case actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE:
      return handleRemoveComponentFromDynamicZone(state, action);
    case actions.REMOVE_FIELD:
      return handleRemoveField(state, action);
    case actions.SET_MODIFIED_DATA:
      return handleSetModifiedData(state, action);
    case actions.UPDATE_SCHEMA:
      return handleUpdateSchema(state, action);
    default:
      return state;
  }
};

export default reducer;
export { addComponentsToState, initialState };