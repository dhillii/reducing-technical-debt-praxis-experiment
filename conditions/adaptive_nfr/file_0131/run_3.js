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

const getOppositeNature = (originalNature) => {
  const oppositeMap = {
    manyToOne: 'oneToMany',
    oneToMany: 'manyToOne',
  };
  return oppositeMap[originalNature] || originalNature;
};

const isComponentTemporaryOrAdded = (state, componentUid) => {
  const component = state.getIn(['components', componentUid]);
  return (
    component.get('isTemporary') ||
    state.getIn(['modifiedData', 'components', componentUid]) !== undefined
  );
};

const addNestedComponentsToState = (state, componentSchema, objToUpdate) => {
  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  return nestedComponents.reduce((acc, componentUid) => {
    const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
    const hasAlreadyBeenAdded =
      state.getIn(['modifiedData', 'components', componentUid]) !== undefined;

    if (!isTemporary && !hasAlreadyBeenAdded) {
      return acc.set(componentUid, state.getIn(['components', componentUid]));
    }
    return acc;
  }, objToUpdate);
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  if (isComponentTemporaryOrAdded(state, componentToAddUid)) {
    return objToUpdate;
  }

  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const componentSchema = componentToAdd.getIn(['schema', 'attributes']);

  let newObj = objToUpdate.set(componentToAddUid, componentToAdd);
  return addNestedComponentsToState(state, componentSchema, newObj);
};

const getPathToDataToEdit = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];
};

const createOppositeAttribute = (rest, name, nature) => ({
  nature: getOppositeNature(nature),
  target: rest.target,
  unique: rest.unique,
  dominant: nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

const shouldCreateOppositeAttributeOnAdd = (type, nature, target, currentUid) => {
  return (
    type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    target === currentUid
  );
};

const handleAddAttributeRelation = (state, obj, rest, pathToDataToEdit, name) => {
  const type = get(rest, 'type', 'relation');
  const target = get(rest, 'target', null);
  const nature = get(rest, 'nature', null);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  if (shouldCreateOppositeAttributeOnAdd(type, nature, target, currentUid)) {
    const oppositeAttribute = createOppositeAttribute(rest, name, nature);
    return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
  }

  return obj;
};

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
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
      return handleAddAttributeRelation(state, obj, rest, pathToDataToEdit, name);
    })
    .updateIn(['modifiedData', 'components'], (existingCompos) => {
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
    (list) => list.concat(componentsToAdd)
  );
};

const handleChangeDynamicZoneComponents = (state, action) => {
  const { dynamicZoneTarget, newComponents } = action;

  return state
    .updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      (list) => fromJS(makeUnique([...list.toJS(), ...newComponents]))
    )
    .updateIn(['modifiedData', 'components'], (old) => {
      return newComponents.reduce((acc, current) => {
        return addComponentsToState(state, current, acc);
      }, old);
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

  let newState = state.updateIn(['components', action.uid], () => fromJS(newSchema));

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components', action.uid], () =>
      fromJS(newSchema)
    );
  }

  return newState;
};

const buildEditAttributeRelationConditions = (
  initialAttribute,
  rest,
  hadInternalRelation,
  didCreateInternalRelation,
  didChangeTargetRelation,
  didChangeRelationNature,
  isEditingRelation
) => {
  const initialNature = initialAttribute.nature;
  const nature = rest.nature;

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation &&
      !didCreateInternalRelation &&
      hadInternalRelation &&
      isEditingRelation,
    shouldRemoveOppositeAttributeBecauseOfNatureChange:
      didChangeRelationNature &&
      hadInternalRelation &&
      ONE_SIDE_RELATIONS.includes(nature) &&
      isEditingRelation,
    shouldUpdateOppositeAttributeBecauseOfNatureChange:
      !ONE_SIDE_RELATIONS.includes(initialNature) &&
      !ONE_SIDE_RELATIONS.includes(nature) &&
      hadInternalRelation &&
      didCreateInternalRelation &&
      isEditingRelation,
    shouldCreateOppositeAttributeBecauseOfNatureChange:
      ONE_SIDE_RELATIONS.includes(initialNature) &&
      !ONE_SIDE_RELATIONS.includes(nature) &&
      hadInternalRelation &&
      didCreateInternalRelation &&
      isEditingRelation,
    shouldCreateOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation &&
      didCreateInternalRelation &&
      !ONE_SIDE_RELATIONS.includes(nature),
  };
};

const processEditAttributeIteration = (
  current,
  initialAttributeName,
  initialAttribute,
  rest,
  name,
  state,
  pathToDataToEdit,
  obj,
  oppositeState
) => {
  const isEditingCurrentAttribute = current === initialAttributeName;

  if (!isEditingCurrentAttribute) {
    if (current === oppositeState.oppositeAttributeNameToUpdate) {
      return {
        value: fromJS(oppositeState.oppositeAttributeToCreate),
        key: oppositeState.oppositeAttributeNameToCreateBecauseOfNatureChange,
      };
    }
    return {
      value: obj.getIn(['attributes', current]),
      key: current,
    };
  }

  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== rest.nature;

  const conditions = buildEditAttributeRelationConditions(
    initialAttribute,
    rest,
    hadInternalRelation,
    didCreateInternalRelation,
    didChangeTargetRelation,
    didChangeRelationNature,
    isEditingRelation
  );

  const newOppositeState = { ...oppositeState };

  if (
    conditions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    conditions.shouldRemoveOppositeAttributeBecauseOfNatureChange
  ) {
    newOppositeState.oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (
    conditions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    conditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
    conditions.shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    newOppositeState.oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
    newOppositeState.oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
    newOppositeState.oppositeAttributeToCreate = createOppositeAttribute(
      rest,
      name,
      rest.nature
    );

    const result = {
      value: fromJS(rest),
      key: name,
      oppositeState: newOppositeState,
    };

    if (
      conditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
      conditions.shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      result.oppositeValue = fromJS(newOppositeState.oppositeAttributeToCreate);
      result.oppositeKey = newOppositeState.oppositeAttributeNameToCreateBecauseOfNatureChange;
      newOppositeState.oppositeAttributeToCreate = null;
      newOppositeState.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    }

    return result;
  }

  return {
    value: fromJS(rest),
    key: name,
    oppositeState: newOppositeState,
  };
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const initialAttributeName = get(initialAttribute, ['name'], '');
  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    const oppositeState = {
      oppositeAttributeNameToRemove: null,
      oppositeAttributeNameToUpdate: null,
      oppositeAttributeNameToCreateBecauseOfNatureChange: null,
      oppositeAttributeToCreate: null,
    };

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          const result = processEditAttributeIteration(
            current,
            initialAttributeName,
            initialAttribute,
            rest,
            name,
            state,
            pathToDataToEdit,
            obj,
            oppositeState
          );

          if (result.oppositeState) {
            Object.assign(oppositeState, result.oppositeState);
          }

          acc[result.key] = result.value;

          if (result.oppositeKey) {
            acc[result.oppositeKey] = result.oppositeValue;
          }

          return acc;
        }, {})
    );

    let updatedObj = newObj;
    if (oppositeState.oppositeAttributeNameToRemove !== null) {
      updatedObj = newObj.remove(oppositeState.oppositeAttributeNameToRemove);
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

  return state.removeIn(pathToAttributeToRemove).updateIn([...pathToAttributes], (attributes) => {
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