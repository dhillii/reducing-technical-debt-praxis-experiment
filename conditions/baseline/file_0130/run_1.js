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

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  if (!shouldAddComponentToState(state, componentToAddUid)) {
    return objToUpdate;
  }

  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const componentSchema = componentToAdd.getIn(['schema', 'attributes']);
  let newObj = objToUpdate.set(componentToAddUid, componentToAdd);

  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach((componentUid) => {
    if (shouldAddComponentToState(state, componentUid)) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
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

const shouldCreateOppositeRelation = (type, nature, target, currentUid) => {
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
  delete rest.createComponent;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (shouldCreateOppositeRelation(type, nature, target, currentUid)) {
        const oppositeAttribute = createOppositeAttribute(rest, name, nature);
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
      return newComponents.reduce((acc, current) => {
        return addComponentsToState(state, current, acc);
      }, old);
    });
};

const createSchemaObject = (uid, data, isComponent = false, category = null) => {
  const schema = {
    uid,
    isTemporary: true,
    schema: {
      ...data,
      attributes: {},
    },
  };

  if (isComponent) {
    schema.category = category;
  }

  return schema;
};

const handleCreateSchema = (state, action) => {
  const newSchema = createSchemaObject(action.uid, action.data);
  return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
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
    newState = newState.updateIn(
      ['modifiedData', 'components', action.uid],
      () => fromJS(newSchema)
    );
  }

  return newState;
};

const buildRelationConditions = (initialAttribute, rest, currentUid) => {
  const initialNature = initialAttribute.nature;
  const nature = rest.nature;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const didChangeRelationNature = initialNature !== nature;

  return {
    initialNature,
    nature,
    hadInternalRelation,
    didChangeTargetRelation,
    didCreateInternalRelation,
    didChangeRelationNature,
  };
};

const determineOppositeAttributeActions = (conditions, isEditingRelation) => {
  const {
    initialNature,
    nature,
    hadInternalRelation,
    didChangeTargetRelation,
    didCreateInternalRelation,
    didChangeRelationNature,
  } = conditions;

  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation;

  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation;

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
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature);

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange,
    shouldRemoveOppositeAttributeBecauseOfNatureChange,
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
  };
};

const processAttributeInEditLoop = (
  acc,
  current,
  initialAttributeName,
  name,
  rest,
  obj,
  state,
  pathToDataToEdit,
  initialAttribute,
  oppositeAttributeState
) => {
  const isEditingCurrentAttribute = current === initialAttributeName;

  if (!isEditingCurrentAttribute) {
    if (current === oppositeAttributeState.oppositeAttributeNameToUpdate) {
      acc[oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        oppositeAttributeState.oppositeAttributeToCreate
      );
    } else {
      acc[current] = obj.getIn(['attributes', current]);
    }
    return acc;
  }

  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');

  if (!isEditingRelation) {
    acc[name] = fromJS(rest);
    return acc;
  }

  const conditions = buildRelationConditions(initialAttribute, rest, currentUid);
  const actions = determineOppositeAttributeActions(conditions, true);

  if (
    actions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    actions.shouldRemoveOppositeAttributeBecauseOfNatureChange
  ) {
    oppositeAttributeState.oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (
    actions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    actions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
    actions.shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    oppositeAttributeState.oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
    oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange =
      rest.targetAttribute;
    oppositeAttributeState.oppositeAttributeToCreate = createOppositeAttribute(
      rest,
      name,
      rest.nature
    );

    acc[name] = fromJS(rest);

    if (
      actions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
      actions.shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      acc[oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        oppositeAttributeState.oppositeAttributeToCreate
      );
      oppositeAttributeState.oppositeAttributeToCreate = null;
      oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
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

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    const oppositeAttributeState = {
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
          return processAttributeInEditLoop(
            acc,
            current,
            initialAttributeName,
            name,
            rest,
            obj,
            state,
            pathToDataToEdit,
            initialAttribute,
            oppositeAttributeState
          );
        }, {})
    );

    let updatedObj = oppositeAttributeState.oppositeAttributeNameToRemove !== null
      ? newObj.remove(oppositeAttributeState.oppositeAttributeNameToRemove)
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

    if