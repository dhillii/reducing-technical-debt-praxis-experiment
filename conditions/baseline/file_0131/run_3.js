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

const shouldAddComponent = (state, componentUid) => {
  const component = state.getIn(['components', componentUid]);
  const isTemporary = component.get('isTemporary');
  const alreadyAdded = state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
  return !isTemporary && !alreadyAdded;
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  if (!shouldAddComponent(state, componentToAddUid)) {
    return objToUpdate;
  }

  const componentToAdd = state.getIn(['components', componentToAddUid]);
  let newObj = objToUpdate.set(componentToAddUid, componentToAdd);

  const componentSchema = componentToAdd.getIn(['schema', 'attributes']);
  const nestedComponents = retrieveComponentsFromSchema(
    componentSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach((componentUid) => {
    if (shouldAddComponent(state, componentUid)) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
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

const shouldCreateOppositeAttribute = (type, nature, target, currentUid) => {
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
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (shouldCreateOppositeAttribute(type, nature, target, currentUid)) {
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

const buildAttributesMap = (obj, state, pathToDataToEdit, initialAttributeName, rest, name) => {
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

        const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
        const relationContext = analyzeRelationContext(
          rest,
          currentUid,
          state.getIn(['modifiedData', ...pathToDataToEdit])
        );

        const {
          shouldRemoveOpposite,
          shouldUpdateOpposite,
          shouldCreateOpposite,
          oppositeAttributeData,
        } = relationContext;

        if (shouldRemoveOpposite) {
          oppositeAttributeNameToRemove = rest.targetAttribute;
        }

        if (shouldUpdateOpposite || shouldCreateOpposite) {
          oppositeAttributeNameToUpdate = rest.targetAttribute;
          oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
          oppositeAttributeToCreate = oppositeAttributeData;

          acc[name] = fromJS(rest);

          if (shouldCreateOpposite) {
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

  const updatedObj =
    oppositeAttributeNameToRemove !== null ? newObj.remove(oppositeAttributeNameToRemove) : newObj;

  return obj.set('attributes', updatedObj);
};

const analyzeRelationContext = (rest, currentUid, schemaData) => {
  const initialAttribute = schemaData.getIn(['schema', 'attributes', rest.targetAttribute]);
  if (!initialAttribute) {
    return {
      shouldRemoveOpposite: false,
      shouldUpdateOpposite: false,
      shouldCreateOpposite: false,
      oppositeAttributeData: null,
    };
  }

  const initialAttrJS = initialAttribute.toJS();
  const didChangeTargetRelation = initialAttrJS.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const hadInternalRelation = initialAttrJS.target === currentUid;
  const didChangeRelationNature = initialAttrJS.nature !== rest.nature;

  const shouldRemoveOpposite =
    (didChangeTargetRelation && !didCreateInternalRelation && hadInternalRelation) ||
    (didChangeRelationNature &&
      hadInternalRelation &&
      ONE_SIDE_RELATIONS.includes(rest.nature));

  const shouldUpdateOpposite =
    !ONE_SIDE_RELATIONS.includes(initialAttrJS.nature) &&
    !ONE_SIDE_RELATIONS.includes(rest.nature) &&
    hadInternalRelation &&
    didCreateInternalRelation;

  const shouldCreateOpposite =
    (ONE_SIDE_RELATIONS.includes(initialAttrJS.nature) &&
      !ONE_SIDE_RELATIONS.includes(rest.nature) &&
      hadInternalRelation &&
      didCreateInternalRelation) ||
    (didChangeTargetRelation && didCreateInternalRelation && !ONE_SIDE_RELATIONS.includes(rest.nature));

  const oppositeAttributeData = shouldUpdateOpposite || shouldCreateOpposite
    ? createOppositeAttribute(rest, rest.targetAttribute, rest.nature)
    : null;

  return {
    shouldRemoveOpposite,
    shouldUpdateOpposite,
    shouldCreateOpposite,
    oppositeAttributeData,
  };
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    return buildAttributesMap(obj, state, pathToDataToEdit, name, rest, name);
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
  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: handleAddCreatedComponentToDynamicZone,
  [actions.CANCEL_CHANGES]: (state) =>
    state
      .update('modifiedData', () => state.get('initialData'))
      .update('components', () => state.get('initialComponents')),
  [actions.CHANGE_DYNAMIC_ZONE_COMPONENTS]: handleChangeDynamicZoneComponents,
  [actions.CREATE_SCHEMA]: handleCreateSchema,
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
      .update('reservedNames', () => fromJS(action.reservedNames))