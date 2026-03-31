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

const shouldAddComponentToState = (state, componentUid) => {
  const component = state.getIn(['components', componentUid]);
  const isTemporary = component.get('isTemporary');
  const alreadyAdded = state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
  return !isTemporary && !alreadyAdded;
};

const addNestedComponentsToState = (state, componentSchema, accumulator) => {
  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  return nestedComponents.reduce((acc, componentUid) => {
    if (shouldAddComponentToState(state, componentUid)) {
      return acc.set(componentUid, state.getIn(['components', componentUid]));
    }
    return acc;
  }, accumulator);
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  if (!shouldAddComponentToState(state, componentToAddUid)) {
    return objToUpdate;
  }

  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const componentSchema = componentToAdd.getIn(['schema', 'attributes']);
  
  let newObj = objToUpdate.set(componentToAddUid, componentToAdd);
  return addNestedComponentsToState(state, componentSchema, newObj);
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

const getPathToDataToEdit = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];
};

const handleAddAttributeRelation = (obj, rest, currentUid) => {
  const { type, target, nature } = rest;
  
  if (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  ) {
    return obj.update(rest.targetAttribute, () => {
      return fromJS(createOppositeAttribute(rest, rest.targetAttribute, nature));
    });
  }

  return obj;
};

const buildRelationEditConditions = (initialAttribute, rest, currentUid, isEditingRelation) => {
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== rest.nature;
  const initialNature = initialAttribute.nature;
  const nature = rest.nature;

  return {
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    didChangeRelationNature,
    initialNature,
    nature,
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

const processEditAttributeLoop = (
  obj,
  initialAttribute,
  rest,
  name,
  currentUid,
  initialAttributeName
) => {
  const isEditingRelation = has(initialAttribute, 'nature');
  const conditions = buildRelationEditConditions(
    initialAttribute,
    rest,
    currentUid,
    isEditingRelation
  );

  const state = {
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
        const isEditingCurrentAttribute = current === initialAttributeName;

        if (isEditingCurrentAttribute) {
          if (
            conditions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
            conditions.shouldRemoveOppositeAttributeBecauseOfNatureChange
          ) {
            state.oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
          }

          if (
            conditions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
            conditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
            conditions.shouldCreateOppositeAttributeBecauseOfTargetChange
          ) {
            state.oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
            state.oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
            state.oppositeAttributeToCreate = createOppositeAttribute(rest, name, rest.nature);

            acc[name] = fromJS(rest);

            if (
              conditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
              conditions.shouldCreateOppositeAttributeBecauseOfTargetChange
            ) {
              acc[state.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
                state.oppositeAttributeToCreate
              );
              state.oppositeAttributeToCreate = null;
              state.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
            }

            return acc;
          }

          acc[name] = fromJS(rest);
        } else if (current === state.oppositeAttributeNameToUpdate) {
          acc[state.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
            state.oppositeAttributeToCreate
          );
        } else {
          acc[current] = obj.getIn(['attributes', current]);
        }

        return acc;
      }, {})
  );

  const updatedObj =
    state.oppositeAttributeNameToRemove !== null
      ? newObj.remove(state.oppositeAttributeNameToRemove)
      : newObj;

  return obj.set('attributes', updatedObj);
};

const handleRemoveFieldRelation = (state, mainDataKey, attributeToRemoveData) => {
  const isRemovingRelation = attributeToRemoveData.get('nature') !== undefined;
  const canHaveInternalRelation = mainDataKey === 'contentType';

  if (!isRemovingRelation || !canHaveInternalRelation) {
    return null;
  }

  const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
  const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
  const shouldRemoveOpposite = target === uid && !ONE_SIDE_RELATIONS.includes(nature);

  return shouldRemoveOpposite ? { targetAttribute } : null;
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
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
      return handleAddAttributeRelation(obj, rest, currentUid);
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

  const initialAttributeName = get(initialAttribute, ['name'], '');
  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
    return processEditAttributeLoop(
      obj,
      initialAttribute,
      rest,
      name,
      currentUid,
      initialAttributeName
    );
  });
};

const handleRemoveField = (state, action) => {
  const { mainDataKey, attributeToRemoveName } = action;
  const pathToAttributes = ['modifiedData', mainDataKey, 'schema', 'attributes'];
  const pathToAttributeToRemove = [...pathToAttributes, attributeToRemoveName];

  const attributeToRemoveData = state.getIn(pathToAttributeToRemove);
  const oppositeInfo = handleRemoveFieldRelation(state, mainDataKey, attributeToRemoveData);

  let newState = state.removeIn(pathToAttributeToRemove);

  if (oppositeInfo) {
    newState = newState.removeIn([...pathToAttributes, oppositeInfo.targetAttribute]);
  }

  return newState.updateIn([...pathToAttributes], (attributes) => {
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

    case actions.DELETE_NOT_SAVED_TYPE:
      return state
        .update('contentTypes', () => state.get('initialContentTypes'))
        .update('components', () => state.get('initialComponents'));

    case actions.EDIT_ATTRIBUTE:
      return handleEditAttribute(state, action);

    case actions.GET_DATA_SUCCEEDED:
      return state
        .update('components', () => fromJS(action.components))
        .update('initialComponents', () => fromJS(action.components))
        .update('initialContentTypes', () => fromJS(action.contentTypes))
        .update('contentTypes', () => fromJS(action.contentTypes))
        .update('reservedNames', () => fromJS(action.