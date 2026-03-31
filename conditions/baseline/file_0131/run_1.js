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
  const type = get(rest, 'type', 'relation');
  const target = get(rest, 'target', null);
  const nature = get(rest, 'nature', null);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () =>
      fromJS(rest)
    )
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
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
  const newSchema = createNewSchema(
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

const RelationAttributeEditor = {
  isEditingRelation: (attribute) => has(attribute, 'nature'),
  didChangeTarget: (initial, current) => initial.target !== current.target,
  didChangeNature: (initial, current) => initial.nature !== current.nature,
  hadInternalRelation: (attribute, currentUid) => attribute.target === currentUid,
  didCreateInternalRelation: (target, currentUid) => target === currentUid,
};

const determineOppositeAttributeActions = (
  initialAttribute,
  rest,
  currentUid,
  isEditingRelation
) => {
  const {
    isEditingRelation: isRelation,
    didChangeTarget,
    didChangeNature,
    hadInternalRelation,
    didCreateInternalRelation,
  } = RelationAttributeEditor;

  if (!isRelation(initialAttribute)) {
    return {};
  }

  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const changeTarget = didChangeTarget(initialAttribute, rest);
  const createInternal = didCreateInternalRelation(rest.target, currentUid);
  const hadInternal = hadInternalRelation(initialAttribute, currentUid);
  const changeNature = didChangeNature(initialAttribute, rest);

  const shouldRemoveOpposite =
    changeTarget && !createInternal && hadInternal && isRelation(initialAttribute);
  const shouldRemoveOppositeNature =
    changeNature &&
    hadInternal &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isRelation(initialAttribute);
  const shouldUpdateOpposite =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternal &&
    createInternal &&
    isRelation(initialAttribute);
  const shouldCreateOppositeNature =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternal &&
    createInternal &&
    isRelation(initialAttribute);
  const shouldCreateOppositeTarget =
    changeTarget && createInternal && !ONE_SIDE_RELATIONS.includes(nature);

  return {
    shouldRemoveOpposite: shouldRemoveOpposite || shouldRemoveOppositeNature,
    shouldUpdateOpposite: shouldUpdateOpposite || shouldCreateOppositeNature || shouldCreateOppositeTarget,
    oppositeAttributeNameToRemove: shouldRemoveOpposite || shouldRemoveOppositeNature
      ? initialAttribute.targetAttribute
      : null,
    oppositeAttributeNameToUpdate: initialAttribute.targetAttribute,
    oppositeAttributeNameToCreate: rest.targetAttribute,
  };
};

const buildAttributesMap = (
  obj,
  initialAttributeName,
  name,
  rest,
  oppositeActions
) => {
  const { shouldUpdateOpposite, oppositeAttributeNameToCreate } = oppositeActions;

  return OrderedMap(
    obj
      .get('attributes')
      .keySeq()
      .reduce((acc, current) => {
        if (current === initialAttributeName) {
          acc[name] = fromJS(rest);

          if (shouldUpdateOpposite) {
            const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
            acc[oppositeAttributeNameToCreate] = fromJS(oppositeAttribute);
          }
        } else if (current === oppositeActions.oppositeAttributeNameToUpdate && shouldUpdateOpposite) {
          const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
          acc[oppositeAttributeNameToCreate] = fromJS(oppositeAttribute);
        } else {
          acc[current] = obj.getIn(['attributes', current]);
        }

        return acc;
      }, {})
  );
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    const initialAttributeName = get(initialAttribute, ['name'], '');
    const oppositeActions = determineOppositeAttributeActions(
      initialAttribute,
      rest,
      currentUid,
      RelationAttributeEditor.isEditingRelation(initialAttribute)
    );

    const newObj = buildAttributesMap(
      obj,
      initialAttributeName,
      name,
      rest,
      oppositeActions
    );

    let updatedObj = oppositeActions.shouldRemoveOpposite
      ? newObj.remove(oppositeActions.oppositeAttributeNameToRemove)
      : newObj;

    return obj.set('attributes', updatedObj);
  });
};

const handleRemoveField = (state, action) => {
  const { mainDataKey, attributeToRemoveName } = action;
  const pathToAttributes = ['modifiedData', mainDataKey, 'schema', 'attributes'];
  const pathToAttributeToRemove = [...pathToAttributes, attributeToRemoveName];

  const attributeToRemoveData = state.getIn(pathToAttributeToRemove);
  const isRemovingRelation = attributeToRemoveData.get('nature') !== undefined;
  const canHaveInternalRelation = mainDataKey === 'contentType';

  if (isRemovingRelation && canHaveInternalRelation) {
    const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
    const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
    const shouldRemoveOpposite = target === uid && !ONE_SIDE_RELATIONS.includes(nature);

    if (shouldRemoveOpposite) {
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
  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: handleAddCreatedComponentToDynamicZone,
  [actions.CANCEL_CHANGES]: (state) =>
    state
      .update('modifiedData', () => state.get('initialData'))
      .update('components', () => state.get('initialComponents')),
  [actions.CHANGE_DYNAMIC_ZONE_COMPONENTS]: handleChangeDynamicZoneComponents,
  [actions.CREATE_SCHEMA]: (state, action) => {
    const newSchema = createNewSchema(action.uid, action.data);
    return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
  },
  [actions.CREATE_COMPONENT_SCHEMA]: handleCreateComponentSchema,
  [actions.DELETE_NOT_SAVED_TYPE]: (state) =>
    state
      .update('contentTypes', () => state.get('initialContentTypes'))
      .update('components', () => state.get('initialComponents')),
  [actions.EDIT_ATTRIBUTE]: handleEditAttribute,
  [actions.GET_DATA_SUCCEEDED]: (state, action) =>
    state
      .update('components', () => fromJS(action.components))
      .update('initialComponents', () => fromJS(action.components))
      .update('initialContentTypes', () => fromJS(action.contentTypes))
      .update('contentTypes', () => fromJS(action.contentTypes))
      .update