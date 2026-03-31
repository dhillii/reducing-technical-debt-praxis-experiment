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

const addNestedComponentsToState = (state, componentSchema, newObj) => {
  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  return nestedComponents.reduce((acc, componentUid) => {
    const isTemporary = isTemporaryComponent(state, componentUid);
    const hasAlreadyBeenAdded = isComponentAlreadyAdded(state, componentUid);

    if (!isTemporary && !hasAlreadyBeenAdded) {
      return acc.set(componentUid, state.getIn(['components', componentUid]));
    }

    return acc;
  }, newObj);
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const isTemporary = componentToAdd.get('isTemporary');
  const hasAlreadyBeenAdded = isComponentAlreadyAdded(state, componentToAddUid);

  if (isTemporary || hasAlreadyBeenAdded) {
    return objToUpdate;
  }

  const newObj = objToUpdate.set(componentToAddUid, componentToAdd);
  const componentSchema = componentToAdd.getIn(['schema', 'attributes']);

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

const shouldCreateOppositeAttribute = (type, nature, target, currentUid) => {
  return (
    type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    target === currentUid
  );
};

const getPathToDataToEdit = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];
};

const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);
  const type = get(rest, 'type', 'relation');
  const target = get(rest, 'target', null);
  const nature = get(rest, 'nature', null);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  let newState = state.updateIn(
    ['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name],
    () => fromJS(rest)
  );

  if (shouldCreateOppositeAttribute(type, nature, target, currentUid)) {
    const oppositeAttribute = createOppositeAttribute(rest, name, nature);

    newState = newState.updateIn(
      ['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'],
      (obj) => obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute))
    );
  }

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components'], (existingCompos) =>
      addComponentsToState(state, rest.component, existingCompos)
    );
  }

  return newState;
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

const createSchemaObject = (uid, data, isComponent = false, componentCategory = null) => {
  const schema = {
    uid,
    isTemporary: true,
    schema: {
      ...data,
      attributes: {},
    },
  };

  if (isComponent) {
    schema.category = componentCategory;
  }

  return schema;
};

const handleCreateComponentSchema = (state, action) => {
  const newSchema = createSchemaObject(
    action.uid,
    action.data,
    true,
    action.componentCategory
  );

  let newState = state.updateIn(['components', action.uid], () => fromJS(newSchema));

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components', action.uid], () =>
      fromJS(newSchema)
    );
  }

  return newState;
};

const buildRelationConditions = (initialAttribute, rest, currentUid, isEditingRelation) => {
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

const processAttributeEdit = (
  acc,
  current,
  initialAttributeName,
  initialAttribute,
  rest,
  name,
  obj,
  conditions
) => {
  const isEditingCurrentAttribute = current === initialAttributeName;

  if (!isEditingCurrentAttribute) {
    if (current === conditions.oppositeAttributeNameToUpdate) {
      acc[conditions.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        conditions.oppositeAttributeToCreate
      );
    } else {
      acc[current] = obj.getIn(['attributes', current]);
    }
    return acc;
  }

  const {
    shouldRemoveOppositeAttributeBecauseOfTargetChange,
    shouldRemoveOppositeAttributeBecauseOfNatureChange,
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
  } = conditions;

  if (
    shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    shouldRemoveOppositeAttributeBecauseOfNatureChange
  ) {
    conditions.oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (
    shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    conditions.oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
    conditions.oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
    conditions.oppositeAttributeToCreate = createOppositeAttribute(
      rest,
      name,
      rest.nature
    );

    acc[name] = fromJS(rest);

    if (
      shouldCreateOppositeAttributeBecauseOfNatureChange ||
      shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      acc[conditions.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        conditions.oppositeAttributeToCreate
      );
      conditions.oppositeAttributeToCreate = null;
      conditions.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    }

    return acc;
  }

  acc[name] = fromJS(rest);
  return acc;
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);
  const initialAttributeName = get(initialAttribute, ['name'], '');
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');

  const conditions = buildRelationConditions(
    initialAttribute,
    rest,
    currentUid,
    isEditingRelation
  );

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          return processAttributeEdit(
            acc,
            current,
            initialAttributeName,
            initialAttribute,
            rest,
            name,
            obj,
            conditions
          );
        }, {})
    );

    const updatedObj =
      conditions.oppositeAttributeNameToRemove !== null
        ? newObj.remove(conditions.oppositeAttributeNameToRemove)
        : newObj;

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

const actionHandlers = {
  [actions.ADD_ATTRIBUTE]: handleAddAttribute,
  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: handleAddCreatedComponentToDynam