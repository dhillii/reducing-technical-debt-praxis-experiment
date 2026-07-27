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

/**
 * Handler for ADD_ATTRIBUTE action.
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

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => fromJS(rest))
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (type === 'relation' && nature !== 'oneWay' && nature !== 'manyWay' && target === currentUid) {
        const oppositeAttribute = {
          nature: getOppositeNature(nature),
          target,
          unique: rest.unique,
          dominant: nature === 'manyToMany' ? !rest.dominant : null,
          targetAttribute: name,
          columnName: rest.targetColumnName,
          targetColumnName: rest.columnName,
        };
        return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
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

/**
 * Handler for ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE action.
 */
const handleAddCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;
  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    list => list.concat(componentsToAdd)
  );
};

/**
 * Handler for CANCEL_CHANGES action.
 */
const handleCancelChanges = (state, action) => {
  return state
    .update('modifiedData', () => state.get('initialData'))
    .update('components', () => state.get('initialComponents'));
};

/**
 * Handler for CHANGE_DYNAMIC_ZONE_COMPONENTS action.
 */
const handleChangeDynamicZoneComponents = (state, action) => {
  const { dynamicZoneTarget, newComponents } = action;

  return state
    .updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
    )
    .updateIn(['modifiedData', 'components'], old => {
      const componentsSchema = newComponents.reduce((acc, current) => {
        return addComponentsToState(state, current, acc);
      }, old);
      return componentsSchema;
    });
};

/**
 * Handler for CREATE_SCHEMA action.
 */
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

/**
 * Handler for CREATE_COMPONENT_SCHEMA action.
 */
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

/**
 * Handler for DELETE_NOT_SAVED_TYPE action.
 */
const handleDeleteNotSavedType = (state, action) => {
  return state
    .update('contentTypes', () => state.get('initialContentTypes'))
    .update('components', () => state.get('initialComponents'));
};

/**
 * Handler for EDIT_ATTRIBUTE action.
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
              didChangeTargetRelation && !didCreateInternalRelation && hadInternalRelation && isEditingRelation;
            const shouldRemoveOppositeAttributeBecauseOfNatureChange =
              didChangeRelationNature && hadInternalRelation && ['oneWay', 'manyWay'].includes(nature) && isEditingRelation;
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
              didChangeTargetRelation && didCreateInternalRelation && !ONE_SIDE_RELATIONS.includes(nature);

            if (shouldRemoveOppositeAttributeBecauseOfTargetChange || shouldRemoveOppositeAttributeBecauseOfNatureChange) {
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

              if (shouldCreateOppositeAttributeBecauseOfNatureChange || shouldCreateOppositeAttributeBecauseOfTargetChange) {
                acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
                oppositeAttributeToCreate = null;
                oppositeAttributeNameToCreateBecauseOfNatureChange = null;
              }

              return acc;
            }

            acc[name] = fromJS(rest);
          } else if (current === oppositeAttributeNameToUpdate) {
            acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
          } else {
            acc[current] = obj.getIn(['attributes', current]);
          }

          return acc;
        }, {})
    );

    let updatedObj = oppositeAttributeNameToRemove !== null ? newObj.remove(oppositeAttributeNameToRemove) : newObj;
    return obj.set('attributes', updatedObj);
  });
};

/**
 * Handler for GET_DATA_SUCCEEDED action.
 */
const handleGetDataSucceeded = (state, action) => {
  return state
    .update('components', () => fromJS(action.components))
    .update('initialComponents', () => fromJS(action.components))
    .update('initialContentTypes', () => fromJS(action.contentTypes))
    .update('contentTypes', () => fromJS(action.contentTypes))
    .update('reservedNames', () => fromJS(action.reservedNames))
    .update('isLoading', () => false);
};

/**
 * Handler for RELOAD_PLUGIN action.
 */
const handleReloadPlugin = (state, action) => initialState;

/**
 * Handler for REMOVE_FIELD_FROM_DISPLAYED_COMPONENT action.
 */
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

/**
 * Handler for REMOVE_COMPONENT_FROM_DYNAMIC_ZONE action.
 */
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

/**
 * Handler for REMOVE_FIELD action.
 */
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
    const shouldRemoveOppositeAttribute = target === uid && !ONE_SIDE_RELATIONS.includes(nature);

    if (shouldRemoveOppositeAttribute) {
      return state
        .removeIn(pathToAttributeToRemove)
        .removeIn([...pathToAttributes, targetAttribute]);
    }
  }

  return state
    .removeIn(pathToAttributeToRemove)
    .updateIn([...pathToAttributes], attributes => {
      return attributes.keySeq().reduce((acc, current) => {
        if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
          return acc.removeIn([current, 'targetField']);
        }
        return acc;
      }, attributes);
    });
};

/**
 * Handler for SET_MODIFIED_DATA action.
 */
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

/**
 * Handler for UPDATE_SCHEMA action.
 */
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
    newState = newState.updateIn(['components'], obj => {
      return obj.update(uid, () => newState.getIn(['modifiedData', 'component']));
    });
  }

  return newState;
};

const handlers = {
  [actions.ADD_ATTRIBUTE]: handleAddAttribute,
  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: handleAddCreatedComponentToDynamicZone,
  [actions.CANCEL_CHANGES]: handleCancelChanges,
  [actions.CHANGE_DYNAMIC_ZONE_COMPONENTS]: handleChangeDynamicZoneComponents,
  [actions.CREATE_SCHEMA]: handleCreateSchema,
  [actions.CREATE_COMPONENT_SCHEMA]: handleCreateComponentSchema,
  [actions.DELETE_NOT_SAVED_TYPE]: handleDeleteNotSavedType,
  [actions.EDIT_ATTRIBUTE]: handleEditAttribute,
  [actions.GET_DATA_SUCCEEDED]: handleGetDataSucceeded,
  [actions.RELOAD_PLUGIN]: handleReloadPlugin,
  [actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT]: handleRemoveFieldFromDisplayedComponent,
  [actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE]: handleRemoveComponentFromDynamicZone,
  [actions.REMOVE_FIELD]: handleRemoveField,
  [actions.SET_MODIFIED_DATA]: handleSetModifiedData,
  [actions.UPDATE_SCHEMA]: handleUpdateSchema,
};

const reducer = (state = initialState, action) => {
  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
};

export default reducer;
export { addComponentsToState, initialState };