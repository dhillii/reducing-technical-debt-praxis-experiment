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

const shouldCreateOppositeAttribute = (rest, currentUid) => {
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

      if (shouldCreateOppositeAttribute(rest, currentUid)) {
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

const createNewSchema = (uid, data, isComponent = false, componentCategory = null) => {
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
  const newSchema = createNewSchema(action.uid, action.data, true, action.componentCategory);

  if (action.shouldAddComponentToData) {
    return state
      .updateIn(['components', action.uid], () => fromJS(newSchema))
      .updateIn(['modifiedData', 'components', action.uid], () => fromJS(newSchema));
  }

  return state.updateIn(['components', action.uid], () => fromJS(newSchema));
};

const buildRelationEditContext = (state, action, pathToDataToEdit) => {
  const { attributeToSet: rest, initialAttribute } = action;
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== rest.nature;

  return {
    currentUid,
    isEditingRelation,
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    didChangeRelationNature,
    initialNature: initialAttribute.nature,
    newNature: rest.nature,
  };
};

const determineOppositeAttributeActions = (context) => {
  const {
    isEditingRelation,
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    didChangeRelationNature,
    initialNature,
    newNature,
  } = context;

  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation;

  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(newNature) &&
    isEditingRelation;

  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(newNature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation;

  const shouldCreateOppositeAttributeBecauseOfNatureChange =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(newNature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation;

  const shouldCreateOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(newNature);

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange,
    shouldRemoveOppositeAttributeBecauseOfNatureChange,
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
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
    const context = buildRelationEditContext(state, action, pathToDataToEdit);
    const actions = determineOppositeAttributeActions(context);

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
            if (
              actions.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
              actions.shouldRemoveOppositeAttributeBecauseOfNatureChange
            ) {
              oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
            }

            if (
              actions.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
              actions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
              actions.shouldCreateOppositeAttributeBecauseOfTargetChange
            ) {
              oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
              oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;

              oppositeAttributeToCreate = createOppositeAttribute(rest, name, rest.nature);

              acc[name] = fromJS(rest);

              if (
                actions.shouldCreateOppositeAttributeBecauseOfNatureChange ||
                actions.shouldCreateOppositeAttributeBecauseOfTargetChange
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

    case actions.CANCEL_CHANGES:
      return state
        .update('modifiedData', () => state.