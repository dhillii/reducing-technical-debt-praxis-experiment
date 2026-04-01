```javascript
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

/**
 * Returns the opposite nature of a relation type
 * @param {string} originalNature - The original relation nature
 * @returns {string} The opposite nature
 */
const getOppositeNature = originalNature => {
  const oppositeMap = {
    manyToOne: 'oneToMany',
    oneToMany: 'manyToOne',
  };
  return oppositeMap[originalNature] || originalNature;
};

/**
 * Checks if a component should be added to state
 * @param {Object} state - Current state
 * @param {string} componentUid - Component UID
 * @returns {boolean} Whether component should be added
 */
const shouldAddComponentToState = (state, componentUid) => {
  const componentToAdd = state.getIn(['components', componentUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const hasComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
  return !isTemporaryComponent && !hasComponentAlreadyBeenAdded;
};

/**
 * Checks if a nested component should be added to state
 * @param {Object} state - Current state
 * @param {string} componentUid - Component UID
 * @returns {boolean} Whether nested component should be added
 */
const shouldAddNestedComponentToState = (state, componentUid) => {
  const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
  const hasNestedComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
  return !isTemporary && !hasNestedComponentAlreadyBeenAdded;
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;

  if (!shouldAddComponentToState(state, componentToAddUid)) {
    return newObj;
  }

  const componentToAdd = state.getIn(['components', componentToAddUid]);
  newObj = newObj.set(componentToAddUid, componentToAdd);

  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach(componentUid => {
    if (shouldAddNestedComponentToState(state, componentUid)) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
};

/**
 * Gets the path to data being edited based on target type
 * @param {string} forTarget - Target type (component, contentType, etc.)
 * @param {string} targetUid - Target UID
 * @returns {Array} Path array for immutable operations
 */
const getPathToDataToEdit = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];
};

/**
 * Determines if opposite attribute should be created for self-relation
 * @param {Object} rest - Attribute data
 * @param {string} currentUid - Current entity UID
 * @returns {boolean} Whether to create opposite attribute
 */
const shouldCreateOppositeAttributeForSelfRelation = (rest, currentUid) => {
  const { type, nature, target } = rest;
  return (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  );
};

/**
 * Creates opposite attribute for self-relation
 * @param {Object} rest - Attribute data
 * @param {string} name - Attribute name
 * @returns {Object} Opposite attribute object
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
 * Handles ADD_ATTRIBUTE action
 */
const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (shouldCreateOppositeAttributeForSelfRelation(rest, currentUid)) {
        const oppositeAttribute = createOppositeAttribute(rest, name);
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

/**
 * Handles ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE action
 */
const handleAddCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;

  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    list => {
      return list.concat(componentsToAdd);
    }
  );
};

/**
 * Handles CHANGE_DYNAMIC_ZONE_COMPONENTS action
 */
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

/**
 * Handles CREATE_SCHEMA action
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
 * Handles CREATE_COMPONENT_SCHEMA action
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

  let newState = state.updateIn(['components', action.uid], () => fromJS(newSchema));

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components', action.uid], () =>
      fromJS(newSchema)
    );
  }

  return newState;
};

/**
 * Determines if opposite attribute should be removed due to target change
 */
const shouldRemoveOppositeAttributeForTargetChange = (
  didChangeTargetRelation,
  didCreateInternalRelation,
  hadInternalRelation,
  isEditingRelation
) => {
  return (
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation
  );
};

/**
 * Determines if opposite attribute should be removed due to nature change
 */
const shouldRemoveOppositeAttributeForNatureChange = (
  didChangeRelationNature,
  hadInternalRelation,
  nature,
  isEditingRelation
) => {
  return (
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation
  );
};

/**
 * Determines if opposite attribute should be updated due to nature change
 */
const shouldUpdateOppositeAttributeForNatureChange = (
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

/**
 * Determines if opposite attribute should be created due to nature change
 */
const shouldCreateOppositeAttributeForNatureChange = (
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation
) => {
  return (
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation
  );
};

/**
 * Determines if opposite attribute should be created due to target change
 */
const shouldCreateOppositeAttributeForTargetChange = (
  didChangeTargetRelation,
  didCreateInternalRelation,
  nature
) => {
  return (
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature)
  );
};

/**
 * Handles EDIT_ATTRIBUTE action
 */
const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const initialAttributeName = get(initialAttribute, ['name'], '');
  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

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

            const shouldRemoveForTargetChange = shouldRemoveOppositeAttributeForTargetChange(
              didChangeTargetRelation,
              didCreateInternalRelation,
              hadInternalRelation,
              isEditingRelation
            );

            const shouldRemoveForNatureChange = shouldRemoveOppositeAttributeForNatureChange(
              didChangeRelationNature,
              hadInternalRelation,
              nature,
              isEditingRelation
            );

            const shouldUpdateForNatureChange = shouldUpdateOppositeAttributeForNatureChange(
              initialNature,
              nature,
              hadInternalRelation,
              didCreateInternalRelation,
              isEditingRelation
            );

            const shouldCreateForNatureChange = shouldCreateOppositeAttributeForNatureChange(
              initialNature,
              nature,
              hadInternalRelation,
              didCreateInternalRelation,
              isEditingRelation
            );

            const shouldCreateForTargetChange = shouldCreateOppositeAttributeForTargetChange(
              didChangeTargetRelation,
              didCreateInternalRelation,
              nature
            );

            if (shouldRemoveForTargetChange || shouldRemoveForNatureChange) {
              oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
            }

            if (
              shouldUpdateForNatureChange ||
              shouldCreateForNatureChange ||
              shouldCreateForTargetChange
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

              if (shouldCreateForNatureChange || shouldCreateForTargetChange) {
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

    const updatedObj =
      oppositeAttributeNameToRemove !== null ? newObj.remove(oppositeAttributeNameToRemove) : newObj;

    return obj.set('attributes', updatedObj);
  });
};

/**
 * Handles REMOVE_FIELD action
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

/**
 * Handles SET_MODIFIED_DATA action
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
 * Handles UPDATE_SCHEMA action
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

/**
 * Action handler dispatch map
 */
const actionHandlers = {
  [actions.ADD_ATTRIBUTE]: handleAddAttribute,
  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: handleAddCreatedComponentToDynamicZone,
  [actions.CANCEL_CHANGES]: (state) =>
    state
      .update('modifiedData', () => state.get('initialData'))
      .update('components', () => state.get('initialComponents')),
  [actions.CHANGE_DYNAMIC_ZONE_COMPONENTS]: handleChangeDynamicZoneComponents,
  [actions.CREATE_SCHEMA]: handleCreateSchema,
  [actions.CREATE_COMPONENT_SCHEMA]: handleCreateComponentSchema,
  [actions.DELETE_NOT_SAVED_TYPE]: (state) =>
    state
      .update('contentTypes', () => state.get('initialContentTypes'))
      .update('components', () => state.get('initialComponents')),
  [actions.EDIT_ATTRIBUTE]: handleEditAttribute,
  [actions.GET_DATA_SUCCEEDED]: (state, action) =>
    state
      .update('components', () => fromJS(action.components))
      .update('initialComponents', () => fromJS(action.components))
      .update('initialContentTypes', () => fromJS(action.contentTypes))
      .update('contentTypes', () => fromJS(action.contentTypes))
      .update('reservedNames', () => fromJS(action.reservedNames))
      .update('isLoading', () => false),
  [actions.RELOAD_PLUGIN]: () => initialState,
  [actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT]: (state, action) => {
    const { attributeToRemoveName, componentUid } = action;
    return state.removeIn([
      'modifiedData',
      'components',
      componentUid,
      'schema',
      'attributes',
      attributeToRemoveName,
    ]);
  },
  [actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE]: (state, action) =>
    state.removeIn([
      'modifiedData',
      'contentType',
      'schema',
      'attributes',
      action.dzName,
      'components',
      action.componentToRemoveIndex,
    ]),
  [actions.REMOVE_FIELD]: handleRemoveField,
  [actions.SET_MODIFIED_DATA]: handleSetModifiedData,
  [actions.UPDATE_SCHEMA]: handleUpdateSchema,
};

const reducer = (state = initialState, action) => {
  const handler = actionHandlers[action.type];
  return handler ? handler(state, action) : state;
};

export default reducer;
export { addComponentsToState, initialState };
```