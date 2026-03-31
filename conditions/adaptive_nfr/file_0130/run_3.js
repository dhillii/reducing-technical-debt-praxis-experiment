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

const isTemporaryComponent = (state, componentUid) => {
  return state.getIn(['components', componentUid, 'isTemporary']) || false;
};

const addNestedComponentsToState = (state, componentSchema, objToUpdate) => {
  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  return nestedComponents.reduce((acc, componentUid) => {
    if (!isTemporaryComponent(state, componentUid) && !isComponentAlreadyAdded(state, componentUid)) {
      return acc.set(componentUid, state.getIn(['components', componentUid]));
    }
    return acc;
  }, objToUpdate);
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  const componentToAdd = state.getIn(['components', componentToAddUid]);

  if (isTemporaryComponent(state, componentToAddUid) || isComponentAlreadyAdded(state, componentToAddUid)) {
    return objToUpdate;
  }

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

const shouldCreateOppositeAttribute = (rest, initialAttribute, currentUid) => {
  return (
    rest.type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(rest.nature) &&
    rest.target === currentUid
  );
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

      if (shouldCreateOppositeAttribute(rest, {}, currentUid)) {
        const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
        return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
      }

      return obj;
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
      return newComponents.reduce((acc, current) => addComponentsToState(state, current, acc), old);
    });
};

const createNewSchema = (action, isComponent = false) => {
  const baseSchema = {
    uid: action.uid,
    isTemporary: true,
    schema: {
      ...action.data,
      attributes: {},
    },
  };

  if (isComponent) {
    return {
      ...baseSchema,
      category: action.componentCategory,
    };
  }

  return baseSchema;
};

const handleCreateComponentSchema = (state, action) => {
  const newSchema = createNewSchema(action, true);

  let newState = state.updateIn(['components', action.uid], () => fromJS(newSchema));

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components', action.uid], () => fromJS(newSchema));
  }

  return newState;
};

const buildEditAttributeReducer = (state, action) => {
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
    const editContext = createEditContext(initialAttribute, rest, currentUid);

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          return processAttributeEdit(
            acc,
            current,
            initialAttributeName,
            name,
            rest,
            initialAttribute,
            editContext
          );
        }, {})
    );

    let updatedObj = newObj;
    if (editContext.oppositeAttributeNameToRemove !== null) {
      updatedObj = newObj.remove(editContext.oppositeAttributeNameToRemove);
    }

    return obj.set('attributes', updatedObj);
  });
};

const createEditContext = (initialAttribute, rest, currentUid) => {
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== rest.nature;
  const initialNature = initialAttribute.nature;
  const nature = rest.nature;

  return {
    isEditingRelation,
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    didChangeRelationNature,
    initialNature,
    nature,
    oppositeAttributeNameToRemove: null,
    oppositeAttributeNameToUpdate: null,
    oppositeAttributeNameToCreateBecauseOfNatureChange: null,
    oppositeAttributeToCreate: null,
  };
};

const processAttributeEdit = (
  acc,
  current,
  initialAttributeName,
  name,
  rest,
  initialAttribute,
  editContext
) => {
  if (current === initialAttributeName) {
    return handleEditingCurrentAttribute(
      acc,
      name,
      rest,
      initialAttribute,
      editContext
    );
  }

  if (current === editContext.oppositeAttributeNameToUpdate) {
    acc[editContext.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
      editContext.oppositeAttributeToCreate
    );
  } else {
    // Preserve existing attribute - need to access from original state
    acc[current] = acc[current] || fromJS(initialAttribute);
  }

  return acc;
};

const handleEditingCurrentAttribute = (acc, name, rest, initialAttribute, editContext) => {
  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    editContext.didChangeTargetRelation &&
    !editContext.didCreateInternalRelation &&
    editContext.hadInternalRelation &&
    editContext.isEditingRelation;

  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    editContext.didChangeRelationNature &&
    editContext.hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(editContext.nature) &&
    editContext.isEditingRelation;

  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    !ONE_SIDE_RELATIONS.includes(editContext.initialNature) &&
    !ONE_SIDE_RELATIONS.includes(editContext.nature) &&
    editContext.hadInternalRelation &&
    editContext.didCreateInternalRelation &&
    editContext.isEditingRelation;

  const shouldCreateOppositeAttributeBecauseOfNatureChange =
    ONE_SIDE_RELATIONS.includes(editContext.initialNature) &&
    !ONE_SIDE_RELATIONS.includes(editContext.nature) &&
    editContext.hadInternalRelation &&
    editContext.didCreateInternalRelation &&
    editContext.isEditingRelation;

  const shouldCreateOppositeAttributeBecauseOfTargetChange =
    editContext.didChangeTargetRelation &&
    editContext.didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(editContext.nature);

  if (
    shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    shouldRemoveOppositeAttributeBecauseOfNatureChange
  ) {
    editContext.oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (
    shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    editContext.oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
    editContext.oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
    editContext.oppositeAttributeToCreate = createOppositeAttribute(rest, name, rest.nature);

    acc[name] = fromJS(rest);

    if (
      shouldCreateOppositeAttributeBecauseOfNatureChange ||
      shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      acc[editContext.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        editContext.oppositeAttributeToCreate
      );
      editContext.oppositeAttributeToCreate = null;
      editContext.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    }

    return acc;
  }

  acc[name] = fromJS(rest);
  return acc;
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

    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE:
      return handleAddCreatedComponentToDynamicZone(state, action);