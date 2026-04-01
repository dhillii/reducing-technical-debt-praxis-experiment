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
 * Determines the path to data being edited based on target type
 * @param {string} forTarget - The target type ('component', 'contentType', etc.)
 * @param {string} targetUid - The target UID
 * @returns {Array} The path array
 */
const getPathToDataToEdit = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];
};

/**
 * Creates an opposite attribute for bidirectional relations
 * @param {Object} rest - The attribute data
 * @param {string} name - The attribute name
 * @returns {Object} The opposite attribute
 */
const createOppositeAttribute = (rest, name) => ({
  nature: getOppositeNature(rest.nature),
  target: rest.target,
  unique: rest.unique,
  dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

/**
 * Checks if a relation should be created as opposite
 * @param {Object} conditions - Condition flags
 * @returns {boolean}
 */
const shouldCreateOppositeRelation = ({
  type,
  nature,
  target,
  currentUid,
}) => {
  return (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  );
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
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (shouldCreateOppositeRelation({ type, nature, target, currentUid })) {
        const oppositeAttribute = createOppositeAttribute(rest, name);
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
 * Handles ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE action
 */
const handleAddCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;

  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    list => list.concat(componentsToAdd)
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
      list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
    )
    .updateIn(['modifiedData', 'components'], old => {
      return newComponents.reduce((acc, current) => {
        return addComponentsToState(state, current, acc);
      }, old);
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

  if (action.shouldAddComponentToData) {
    return state
      .updateIn(['components', action.uid], () => fromJS(newSchema))
      .updateIn(['modifiedData', 'components', action.uid], () => fromJS(newSchema));
  }

  return state.updateIn(['components', action.uid], () => fromJS(newSchema));
};

/**
 * Checks if opposite attribute should be removed due to target change
 */
const shouldRemoveOppositeAttributeOnTargetChange = ({
  didChangeTargetRelation,
  didCreateInternalRelation,
  hadInternalRelation,
  isEditingRelation,
}) => {
  return (
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation
  );
};

/**
 * Checks if opposite attribute should be removed due to nature change
 */
const shouldRemoveOppositeAttributeOnNatureChange = ({
  didChangeRelationNature,
  hadInternalRelation,
  nature,
  isEditingRelation,
}) => {
  return (
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation
  );
};

/**
 * Checks if opposite attribute should be updated due to nature change
 */
const shouldUpdateOppositeAttributeOnNatureChange = ({
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation,
}) => {
  return (
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation
  );
};

/**
 * Checks if opposite attribute should be created due to nature change
 */
const shouldCreateOppositeAttributeOnNatureChange = ({
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation,
}) => {
  return (
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation
  );
};

/**
 * Checks if opposite attribute should be created due to target change
 */
const shouldCreateOppositeAttributeOnTargetChange = ({
  didChangeTargetRelation,
  didCreateInternalRelation,
  nature,
}) => {
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

            const conditionFlags = {
              didChangeTargetRelation,
              didCreateInternalRelation,
              hadInternalRelation,
              isEditingRelation,
              initialNature,
              nature,
            };

            const shouldRemoveOnTargetChange = shouldRemoveOppositeAttributeOnTargetChange(conditionFlags);
            const shouldRemoveOnNatureChange = shouldRemoveOppositeAttributeOnNatureChange(conditionFlags);
            const shouldUpdateOnNatureChange = shouldUpdateOppositeAttributeOnNatureChange(conditionFlags);
            const shouldCreateOnNatureChange = shouldCreateOppositeAttributeOnNatureChange(conditionFlags);
            const shouldCreateOnTargetChange = shouldCreateOppositeAttributeOnTargetChange(conditionFlags);

            if (shouldRemoveOnTargetChange || shouldRemoveOnNatureChange) {
              oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
            }

            if (shouldUpdateOnNatureChange || shouldCreateOnNatureChange || shouldCreateOnTargetChange) {
              oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
              oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
              oppositeAttributeToCreate = createOppositeAttribute(rest, name);

              acc[name] = fromJS(rest);

              if (shouldCreateOnNatureChange || shouldCreateOnTargetChange) {
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

    let updatedObj = oppositeAttributeNameToRemove !== null
      ? newObj.remove(oppositeAttributeNameToRemove)
      : newObj;

    return obj.set('attributes', updatedObj);
  });
};

/**
 * Handles GET_DATA_SUCCEEDED action
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
  [actions.GET_DATA_SUCCEEDED]: handleGetDataSucceeded,
  [actions.RELOAD_PLUGIN]: () => initialState,
  [actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT]: (state, action) =>
    state.removeIn([
      'modifiedData',
      'components',
      action.componentUid,
      'schema',
      'attributes',
      action.attributeToRemoveName,
    ]),
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