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

const getOppositeNature = originalNature => {
  if (originalNature === 'manyToOne') {
    return 'oneToMany';
  }
  if (originalNature === 'oneToMany') {
    return 'manyToOne';
  }
  return originalNature;
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const hasComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentToAddUid]) !== undefined;

  if (isTemporaryComponent || hasComponentAlreadyBeenAdded) {
    return newObj;
  }

  newObj = newObj.set(componentToAddUid, componentToAdd);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach(componentUid => {
    const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
    const hasNestedComponentAlreadyBeenAdded =
      state.getIn(['modifiedData', 'components', componentUid]) !== undefined;

    if (!isTemporary && !hasNestedComponentAlreadyBeenAdded) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
};

/* ---------- Helper predicates ---------- */
const isRelation = type => type === 'relation';
const isOneOrManyWay = nature => ONE_SIDE_RELATIONS.includes(nature);
const isNotOneOrManyWay = nature => !ONE_SIDE_RELATIONS.includes(nature);

/* ---------- Action Handlers ---------- */
const addAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => fromJS(rest))
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (isRelation(type) && !isOneOrManyWay(nature) && target === currentUid) {
        const oppositeAttribute = {
          nature: getOppositeNature(nature),
          target,
          unique: rest.unique,
          dominant: nature === 'manyToMany' ? !rest.dominant : null,
          targetAttribute: name,
          columnName: rest.targetColumnName,
          targetColumnName: rest.columnName,
        };
        return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
      }

      return obj;
    })
    .updateIn(['modifiedData', 'components'], existingCompos => {
      if (action.shouldAddComponentToData) {
        return addComponentsToState(state, rest.component, existingCompos);
      }
      return existingCompos;
    });
};

const addCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;
  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    list => list.concat(componentsToAdd)
  );
};

const cancelChanges = state => {
  return state
    .update('modifiedData', () => state.get('initialData'))
    .update('components', () => state.get('initialComponents'));
};

const changeDynamicZoneComponents = (state, action) => {
  const { dynamicZoneTarget, newComponents } = action;

  const updatedState = state
    .updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
    )
    .updateIn(['modifiedData', 'components'], old => {
      return newComponents.reduce((acc, current) => addComponentsToState(state, current, acc), old);
    });

  return updatedState;
};

const createSchema = (state, action) => {
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

const createComponentSchema = (state, action) => {
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
};

const deleteNotSavedType = state => {
  return state
    .update('contentTypes', () => state.get('initialContentTypes'))
    .update('components', () => state.get('initialComponents'));
};

/* ---------- Edit Attribute Helpers ---------- */
const computeOppositeInfo = (params) => {
  const {
    initialAttribute,
    rest,
    name,
    currentUid,
    isEditingRelation,
    hadInternalRelation,
    didCreateInternalRelation,
    didChangeTargetRelation,
    didChangeRelationNature,
    nature,
    initialNature,
  } = params;

  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation && !didCreateInternalRelation && hadInternalRelation && isEditingRelation;

  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    didChangeRelationNature && hadInternalRelation && isOneOrManyWay(nature) && isEditingRelation;

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
    didChangeTargetRelation && didCreateInternalRelation && !ONE_SIDE_RELATIONS.includes(nature);

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange,
    shouldRemoveOppositeAttributeBecauseOfNatureChange,
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
  };
};

const buildAttributesMap = (obj, ctx) => {
  const {
    name,
    rest,
    initialAttribute,
    initialAttributeName,
    pathToDataToEdit,
    state,
  } = ctx;

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
          const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
          const isEditingRelation = has(initialAttribute, 'nature');
          const didChangeTargetRelation = initialAttribute.target !== rest.target;
          const didCreateInternalRelation = rest.target === currentUid;
          const nature = rest.nature;
          const initialNature = initialAttribute.nature;
          const hadInternalRelation = initialAttribute.target === currentUid;
          const didChangeRelationNature = initialAttribute.nature !== nature;

          const {
            shouldRemoveOppositeAttributeBecauseOfTargetChange,
            shouldRemoveOppositeAttributeBecauseOfNatureChange,
            shouldUpdateOppositeAttributeBecauseOfNatureChange,
            shouldCreateOppositeAttributeBecauseOfNatureChange,
            shouldCreateOppositeAttributeBecauseOfTargetChange,
          } = computeOppositeInfo({
            initialAttribute,
            rest,
            name,
            currentUid,
            isEditingRelation,
            hadInternalRelation,
            didCreateInternalRelation,
            didChangeTargetRelation,
            didChangeRelationNature,
            nature,
            initialNature,
          });

          if (shouldRemoveOppositeAttributeBecauseOfTargetChange || shouldRemoveOppositeAttributeBecauseOfNatureChange) {
            oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
          }

          if (
            shouldUpdateOppositeAttributeBecauseOfNatureChange ||
            shouldCreateOppositeAttributeBecauseOfNatureChange ||
            shouldCreateOppositeAttributeBecauseOfTargetChange
          ) {
            oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
            oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;

            oppositeAttributeToCreate = {
              nature: getOppositeNature(rest.nature),
              target: rest.target,
              unique: rest.unique,
              dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
              targetAttribute: name,
              columnName: rest.targetColumnName,
              targetColumnName: rest.columnName,
            };

            acc[name] = fromJS(rest);

            if (shouldCreateOppositeAttributeBecauseOfNatureChange || shouldCreateOppositeAttributeBecauseOfTargetChange) {
              acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
              oppositeAttributeToCreate = null;
              oppositeAttributeNameToCreateBecauseOfNatureChange = null;
            }

            return acc;
          }

          acc[name] = fromJS(rest);
        } else if (current === oppositeAttributeNameToUpdate) {
          acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
        } else {
          acc[current] = obj.getIn(['attributes', current]);
        }

        return acc;
      }, {})
  );

  return {
    newObj,
    oppositeAttributeNameToRemove,
  };
};

const editAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const initialAttributeName = get(initialAttribute, ['name'], '');
  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
    const { newObj, oppositeAttributeNameToRemove } = buildAttributesMap(obj, {
      name,
      rest,
      initialAttribute,
      initialAttributeName,
      pathToDataToEdit,
      state,
    });

    const finalAttributes = oppositeAttributeNameToRemove ? newObj.remove(oppositeAttributeNameToRemove) : newObj;
    return obj.set('attributes', finalAttributes);
  });
};

const getDataSucceeded = (state, action) => {
  return state
    .update('components', () => fromJS(action.components))
    .update('initialComponents', () => fromJS(action.components))
    .update('initialContentTypes', () => fromJS(action.contentTypes))
    .update('contentTypes', () => fromJS(action.contentTypes))
    .update('reservedNames', () => fromJS(action.reservedNames))
    .update('isLoading', () => false);
};

const reloadPlugin = () => initialState;

const removeFieldFromDisplayedComponent = (state, action) => {
  const { attributeToRemoveName, componentUid } = action;
  return state.removeIn([
    'modifiedData',
    'components',
    componentUid,
    'schema',
    'attributes',
    attributeToRemoveName,
  ]);
};

const removeComponentFromDynamicZone = (state, action) => {
  return state.removeIn([
    'modifiedData',
    'contentType',
    'schema',
    'attributes',
    action.dzName,
    'components',
    action.componentToRemoveIndex,
  ]);
};

const removeField = (state, action) => {
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

  return state
    .removeIn(pathToAttributeToRemove)
    .updateIn([...pathToAttributes], attributes => {
      return attributes.keySeq().reduce((acc, current) => {
        if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
          return acc.removeIn([current, 'targetField']);
        }
        return acc;
      }, attributes);
    });
};

const setModifiedData = (state, action) => {
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

const updateSchema = (state, action) => {
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

/* ---------- Handler Map ---------- */
const handlers = {
  [actions.ADD_ATTRIBUTE]: addAttribute,
  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: addCreatedComponentToDynamicZone,
  [actions.CANCEL_CHANGES]: cancelChanges,
  [actions.CHANGE_DYNAMIC_ZONE_COMPONENTS]: changeDynamicZoneComponents,
  [actions.CREATE_SCHEMA]: createSchema,
  [actions.CREATE_COMPONENT_SCHEMA]: createComponentSchema,
  [actions.DELETE_NOT_SAVED_TYPE]: deleteNotSavedType,
  [actions.EDIT_ATTRIBUTE]: editAttribute,
  [actions.GET_DATA_SUCCEEDED]: getDataSucceeded,
  [actions.RELOAD_PLUGIN]: reloadPlugin,
  [actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT]: removeFieldFromDisplayedComponent,
  [actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE]: removeComponentFromDynamicZone,
  [actions.REMOVE_FIELD]: removeField,
  [actions.SET_MODIFIED_DATA]: setModifiedData,
  [actions.UPDATE_SCHEMA]: updateSchema,
};

const reducer = (state = initialState, action) => {
  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
};

export default reducer;
export { addComponentsToState, initialState };