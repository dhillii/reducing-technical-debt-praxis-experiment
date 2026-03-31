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

const RELATION_NATURE_MAP = {
  manyToOne: 'oneToMany',
  oneToMany: 'manyToOne',
};

const getOppositeNature = (originalNature) => RELATION_NATURE_MAP[originalNature] || originalNature;

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

const getPathToDataToEdit = (forTarget, targetUid) =>
  ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];

const shouldCreateOppositeAttribute = (rest, currentUid) => {
  const { type, nature, target } = rest;
  return (
    type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    target === currentUid
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
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () =>
      fromJS(rest)
    )
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
      if (shouldCreateOppositeAttribute(rest, state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']))) {
        const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
        return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
      }
      return obj;
    })
    .updateIn(['modifiedData', 'components'], (existingCompos) =>
      action.shouldAddComponentToData
        ? addComponentsToState(state, rest.component, existingCompos)
        : existingCompos
    );
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
    .updateIn(['modifiedData', 'components'], (old) =>
      newComponents.reduce((acc, current) => addComponentsToState(state, current, acc), old)
    );
};

const createNewSchema = (uid, data, isComponent = false) => {
  const schema = {
    uid,
    isTemporary: true,
    schema: {
      ...data,
      attributes: {},
    },
  };

  if (isComponent) {
    schema.category = data.componentCategory;
  }

  return schema;
};

const handleCreateSchema = (state, action) => {
  const newSchema = createNewSchema(action.uid, action.data);
  return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
};

const handleCreateComponentSchema = (state, action) => {
  const newSchema = {
    ...createNewSchema(action.uid, action.data, true),
    category: action.componentCategory,
  };

  let newState = state.updateIn(['components', action.uid], () => fromJS(newSchema));

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components', action.uid], () =>
      fromJS(newSchema)
    );
  }

  return newState;
};

const buildRelationConditions = (initialAttribute, rest, currentUid, hadInternalRelation) => {
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const didChangeRelationNature = initialAttribute.nature !== nature;

  return {
    didChangeTargetRelation,
    didCreateInternalRelation,
    didChangeRelationNature,
    shouldRemoveOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation &&
      !didCreateInternalRelation &&
      hadInternalRelation &&
      !ONE_SIDE_RELATIONS.includes(nature),
    shouldRemoveOppositeAttributeBecauseOfNatureChange:
      didChangeRelationNature &&
      hadInternalRelation &&
      ONE_SIDE_RELATIONS.includes(nature),
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

const processAttributeInEditLoop = (
  acc,
  current,
  initialAttributeName,
  initialAttribute,
  rest,
  name,
  obj,
  state,
  pathToDataToEdit,
  conditions
) => {
  const isEditingCurrentAttribute = current === initialAttributeName;

  if (!isEditingCurrentAttribute) {
    acc[current] = obj.getIn(['attributes', current]);
    return { acc, oppositeAttributeNameToRemove: null, oppositeAttributeToCreate: null };
  }

  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeToCreate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;

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
    oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (
    shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
    oppositeAttributeToCreate = createOppositeAttribute(rest, name, rest.nature);

    acc[name] = fromJS(rest);

    if (
      shouldCreateOppositeAttributeBecauseOfNatureChange ||
      shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
      oppositeAttributeToCreate = null;
    }

    return {
      acc,
      oppositeAttributeNameToRemove,
      oppositeAttributeToCreate,
      oppositeAttributeNameToCreateBecauseOfNatureChange,
    };
  }

  acc[name] = fromJS(rest);
  return { acc, oppositeAttributeNameToRemove, oppositeAttributeToCreate };
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
    const isEditingRelation = has(initialAttribute, 'nature');
    const hadInternalRelation = initialAttribute.target === currentUid;

    const conditions = buildRelationConditions(
      initialAttribute,
      rest,
      currentUid,
      hadInternalRelation
    );

    let oppositeAttributeNameToRemove = null;
    let oppositeAttributeNameToUpdate = null;
    let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    let oppositeAttributeToCreate = null;

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          const result = processAttributeInEditLoop(
            acc,
            current,
            initialAttributeName,
            initialAttribute,
            rest,
            name,
            obj,
            state,
            pathToDataToEdit,
            conditions
          );

          if (current === initialAttributeName && isEditingRelation) {
            oppositeAttributeNameToRemove = result.oppositeAttributeNameToRemove;
            oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
            oppositeAttributeNameToCreateBecauseOfNatureChange =
              result.oppositeAttributeNameToCreateBecauseOfNatureChange;
            oppositeAttributeToCreate = result.oppositeAttributeToCreate;
          } else if (current === oppositeAttributeNameToUpdate && oppositeAttributeToCreate) {
            result.acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
              oppositeAttributeToCreate
            );
          }

          return result.acc;
        }, {})
    );

    const updatedObj =
      oppositeAttributeNameToRemove !== null ? newObj.remove(oppositeAttributeNameToRemove) : newObj;

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

  return state.removeIn(pathToAttributeToRemove).updateIn([...pathToAttributes], (attributes) =>
    attributes.keySeq().reduce((acc, current) => {
      if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
        return acc.removeIn([current, 'targetField']);
      }
      return acc;
    }, attributes)
  );
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