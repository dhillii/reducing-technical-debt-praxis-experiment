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

const handleAddAttributeOppositeRelation = (obj, rest, name, currentUid) => {
  if (shouldCreateOppositeAttributeOnAdd(rest.type, rest.nature, rest.target, currentUid)) {
    const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
    return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
  }
  return obj;
};

const createRelationConditions = (initialAttribute, rest, currentUid, hadInternalRelation) => ({
  didChangeTargetRelation: initialAttribute.target !== rest.target,
  didCreateInternalRelation: rest.target === currentUid,
  didChangeRelationNature: initialAttribute.nature !== rest.nature,
  initialNature: initialAttribute.nature,
  nature: rest.nature,
  hadInternalRelation,
});

const evaluateRelationRemovalConditions = (conditions) => {
  const {
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    didChangeRelationNature,
    nature,
  } = conditions;

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation && !didCreateInternalRelation && hadInternalRelation,
    shouldRemoveOppositeAttributeBecauseOfNatureChange:
      didChangeRelationNature &&
      hadInternalRelation &&
      ONE_SIDE_RELATIONS.includes(nature),
  };
};

const evaluateRelationUpdateConditions = (conditions) => {
  const {
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    initialNature,
    nature,
  } = conditions;

  return {
    shouldUpdateOppositeAttributeBecauseOfNatureChange:
      !ONE_SIDE_RELATIONS.includes(initialNature) &&
      !ONE_SIDE_RELATIONS.includes(nature) &&
      hadInternalRelation &&
      didCreateInternalRelation,
    shouldCreateOppositeAttributeBecauseOfNatureChange:
      ONE_SIDE_RELATIONS.includes(initialNature) &&
      !ONE_SIDE_RELATIONS.includes(nature) &&
      hadInternalRelation &&
      didCreateInternalRelation,
    shouldCreateOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation &&
      didCreateInternalRelation &&
      !ONE_SIDE_RELATIONS.includes(nature),
  };
};

const processEditAttributeLoop = (
  obj,
  initialAttribute,
  rest,
  name,
  currentUid,
  isEditingRelation
) => {
  const hadInternalRelation = initialAttribute.target === currentUid;
  const conditions = createRelationConditions(
    initialAttribute,
    rest,
    currentUid,
    hadInternalRelation
  );

  const removalConditions = evaluateRelationRemovalConditions(conditions);
  const updateConditions = evaluateRelationUpdateConditions(conditions);

  return {
    oppositeAttributeNameToRemove: removalConditions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
      removalConditions.shouldRemoveOppositeAttributeBecauseOfNatureChange
      ? initialAttribute.targetAttribute
      : null,
    shouldUpdateOpposite:
      updateConditions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
      updateConditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
      updateConditions.shouldCreateOppositeAttributeBecauseOfTargetChange,
    shouldCreateNewOpposite:
      updateConditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
      updateConditions.shouldCreateOppositeAttributeBecauseOfTargetChange,
    oppositeAttributeNameToUpdate: initialAttribute.targetAttribute,
    oppositeAttributeNameToCreate: rest.targetAttribute,
    oppositeAttributeToCreate: createOppositeAttribute(rest, name, rest.nature),
  };
};

const buildEditAttributeAttributes = (
  obj,
  initialAttributeName,
  initialAttribute,
  rest,
  name,
  currentUid
) => {
  const isEditingRelation = has(initialAttribute, 'nature');
  const attributes = obj.get('attributes');

  return OrderedMap(
    attributes
      .keySeq()
      .reduce((acc, current) => {
        const isEditingCurrentAttribute = current === initialAttributeName;

        if (!isEditingCurrentAttribute) {
          acc[current] = attributes.getIn([current]);
          return acc;
        }

        const relationInfo = isEditingRelation
          ? processEditAttributeLoop(
              obj,
              initialAttribute,
              rest,
              name,
              currentUid,
              isEditingRelation
            )
          : null;

        acc[name] = fromJS(rest);

        if (relationInfo?.shouldCreateNewOpposite) {
          acc[relationInfo.oppositeAttributeNameToCreate] = fromJS(
            relationInfo.oppositeAttributeToCreate
          );
        }

        return acc;
      }, {})
  );
};

const handleEditAttributeSchema = (
  state,
  obj,
  initialAttribute,
  rest,
  name,
  pathToDataToEdit
) => {
  const initialAttributeName = get(initialAttribute, ['name'], '');
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');

  const relationInfo = isEditingRelation
    ? processEditAttributeLoop(
        obj,
        initialAttribute,
        rest,
        name,
        currentUid,
        isEditingRelation
      )
    : null;

  const newAttributes = buildEditAttributeAttributes(
    obj,
    initialAttributeName,
    initialAttribute,
    rest,
    name,
    currentUid
  );

  let updatedAttributes = newAttributes;
  if (relationInfo?.oppositeAttributeNameToRemove !== null) {
    updatedAttributes = newAttributes.remove(relationInfo.oppositeAttributeNameToRemove);
  }

  return obj.set('attributes', updatedAttributes);
};

const handleRemoveFieldRelation = (state, mainDataKey, attributeToRemoveData, pathToAttributes) => {
  const canHaveInternalRelation = mainDataKey === 'contentType';

  if (!canHaveInternalRelation) {
    return null;
  }

  const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
  const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
  const shouldRemoveOppositeAttribute =
    target === uid && !ONE_SIDE_RELATIONS.includes(nature);

  if (shouldRemoveOppositeAttribute) {
    return { targetAttribute, shouldRemove: true };
  }

  return null;
};

const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
      return handleAddAttributeOppositeRelation(obj, rest, name, currentUid);
    })
    .updateIn(['modifiedData', 'components'], (existingCompos) => {
      if (action.shouldAddComponentToData) {
        return addComponentsToState(state, rest.component, existingCompos);
      }
      return existingCompos;
    });
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    return handleEditAttributeSchema(state, obj, initialAttribute, rest, name, pathToDataToEdit);
  });
};

const handleRemoveField = (state, action) => {
  const { mainDataKey, attributeToRemoveName } = action;
  const pathToAttributes = ['modifiedData', mainDataKey, 'schema', 'attributes'];
  const pathToAttributeToRemove = [...pathToAttributes, attributeToRemoveName];

  const attributeToRemoveData = state.getIn(pathToAttributeToRemove);
  const isRemovingRelation = attributeToRemoveData.get('nature') !== undefined;

  if (isRemovingRelation) {
    const relationInfo = handleRemoveFieldRelation(
      state,
      mainDataKey,
      attributeToRemoveData,
      pathToAttributes
    );

    if (relationInfo?.shouldRemove) {
      return state
        .removeIn(pathToAttributeToRemove)
        .removeIn([...pathToAttributes, relationInfo.targetAttribute]);
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

const handleUpdateSchema = (state, action) => {
  const {
    data: { name, collectionName, category, icon, kind },
    schemaType,
    uid,
  } = action;

  let newState = state.updateIn(['modifiedData', schemaType], (obj) => {
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
    newState = newState.updateIn(['components'], (obj) => {
      return obj.update(uid, () => newState.getIn(['modifiedData', 'component']));
    });
  }

  return newState;
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return handleAddAttribute(state, action);

    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE: {
      const { dynamicZoneTarget, componentsToAdd } = action;
      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        (list) => list.concat(componentsToAdd)
      );
    }

    case actions.CANCEL_CHANGES:
      return state
        .update('modifiedData', () => state.get('initialData'))
        .update('components', () => state.get('initialComponents'));

    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS: {
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

    case