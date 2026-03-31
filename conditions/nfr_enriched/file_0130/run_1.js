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

const isComponentAlreadyAdded = (state, componentUid) => {
  return state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
};

const isComponentTemporary = (state, componentUid) => {
  return state.getIn(['components', componentUid, 'isTemporary']) || false;
};

const addNestedComponentsToState = (state, componentSchema, accumulator) => {
  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  return nestedComponents.reduce((acc, componentUid) => {
    if (!isComponentTemporary(state, componentUid) && !isComponentAlreadyAdded(state, componentUid)) {
      return acc.set(componentUid, state.getIn(['components', componentUid]));
    }
    return acc;
  }, accumulator);
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  
  if (isComponentTemporary(state, componentToAddUid) || isComponentAlreadyAdded(state, componentToAddUid)) {
    return objToUpdate;
  }

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

const shouldCreateOppositeAttributeForAddAttribute = (type, nature, target, currentUid) => {
  return (
    type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    target === currentUid
  );
};

const handleAddAttributeRelation = (state, rest, name, pathToDataToEdit, obj) => {
  if (!shouldCreateOppositeAttributeForAddAttribute(
    get(rest, 'type', 'relation'),
    get(rest, 'nature', null),
    get(rest, 'target', null),
    state.getIn(['modifiedData', ...pathToDataToEdit, 'uid'])
  )) {
    return obj;
  }

  const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
  return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
};

const createRelationConditions = (initialAttribute, rest, currentUid, isEditingRelation) => {
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
  initialAttributeName,
  initialAttribute,
  rest,
  name,
  currentUid,
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
        const isEditingCurrentAttribute = current === initialAttributeName;

        if (!isEditingCurrentAttribute) {
          if (current === oppositeAttributeNameToUpdate) {
            acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
              oppositeAttributeToCreate
            );
          } else {
            acc[current] = obj.getIn(['attributes', current]);
          }
          return acc;
        }

        const isEditingRelation = has(initialAttribute, 'nature');
        const conditions = createRelationConditions(
          initialAttribute,
          rest,
          currentUid,
          isEditingRelation
        );

        if (
          conditions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
          conditions.shouldRemoveOppositeAttributeBecauseOfNatureChange
        ) {
          oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
        }

        if (
          conditions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
          conditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
          conditions.shouldCreateOppositeAttributeBecauseOfTargetChange
        ) {
          oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
          oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
          oppositeAttributeToCreate = createOppositeAttribute(rest, name, rest.nature);

          acc[name] = fromJS(rest);

          if (
            conditions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
            conditions.shouldCreateOppositeAttributeBecauseOfTargetChange
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
        return acc;
      }, {})
  );

  const updatedObj = oppositeAttributeNameToRemove !== null
    ? newObj.remove(oppositeAttributeNameToRemove)
    : newObj;

  return { updatedObj, oppositeAttributeNameToRemove };
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
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      return handleAddAttributeRelation(state, rest, name, pathToDataToEdit, obj);
    })
    .updateIn(['modifiedData', 'components'], existingCompos => {
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

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
    const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
    const { updatedObj } = processEditAttributeLoop(
      obj,
      initialAttributeName,
      initialAttribute,
      rest,
      name,
      currentUid,
      state,
      pathToDataToEdit
    );

    return obj.set('attributes', updatedObj);
  });
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
    const shouldRemoveOppositeAttribute = target === uid && !ONE_SIDE_RELATIONS.includes(nature);

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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return handleAddAttribute(state, action);

    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE: {
      const { dynamicZoneTarget, componentsToAdd } = action;
      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        list => list.concat(componentsToAdd)
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
          list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
        )
        .updateIn(['modifiedData', 'components'], old => {
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
          .updateIn(['modifiedData', 'components