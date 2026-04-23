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

/**
 * Returns the opposite relation nature.
 * @param {string} originalNature
 * @returns {string}
 */
const getOppositeNature = originalNature => {
  if (originalNature === 'manyToOne') return 'oneToMany';
  if (originalNature === 'oneToMany') return 'manyToOne';
  return originalNature;
};

/**
 * Adds a component and its nested components to the modified data.
 * @param {Immutable.Map} state
 * @param {string} componentToAddUid
 * @param {Immutable.Map} objToUpdate
 * @returns {Immutable.Map}
 */
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

/* ---------- Helper predicates for EDIT_ATTRIBUTE ---------- */

/**
 * Determines if the attribute being edited is a relation.
 * @param {object} initialAttribute
 * @returns {boolean}
 */
const isRelationAttribute = initialAttribute => has(initialAttribute, 'nature');

/**
 * Checks whether the target of the relation changed.
 * @param {object} initialAttribute
 * @param {object} rest
 * @returns {boolean}
 */
const didChangeTargetRelation = (initialAttribute, rest) => initialAttribute.target !== rest.target;

/**
 * Checks whether the relation now points to the same content type.
 * @param {string} target
 * @param {string} currentUid
 * @returns {boolean}
 */
const isInternalRelation = (target, currentUid) => target === currentUid;

/**
 * Determines if the nature of the relation changed.
 * @param {object} initialAttribute
 * @param {object} rest
 * @returns {boolean}
 */
const didChangeRelationNature = (initialAttribute, rest) => initialAttribute.nature !== rest.nature;

/* ---------- Attribute processing for EDIT_ATTRIBUTE ---------- */

/**
 * Builds the opposite attribute definition based on the new attribute.
 * @param {object} rest
 * @param {string} name
 * @returns {object}
 */
const buildOppositeAttribute = (rest, name) => ({
  nature: getOppositeNature(rest.nature),
  target: rest.target,
  unique: rest.unique,
  dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

/**
 * Processes attributes when editing a relation attribute.
 * @param {Immutable.Map} obj
 * @param {object} params
 * @returns {Immutable.Map}
 */
const processEditedAttributes = (obj, params) => {
  const {
    initialAttribute,
    rest,
    name,
    pathToDataToEdit,
    state,
  } = params;

  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
  const initialAttributeName = get(initialAttribute, ['name'], '');
  const isEditingRelation = isRelationAttribute(initialAttribute);
  const internalRelationBefore = isInternalRelation(initialAttribute.target, currentUid);
  const internalRelationAfter = isInternalRelation(rest.target, currentUid);
  const natureChanged = didChangeRelationNature(initialAttribute, rest);
  const targetChanged = didChangeTargetRelation(initialAttribute, rest);
  const initialNature = initialAttribute.nature;
  const newNature = rest.nature;

  const shouldRemoveOppositeDueToTarget =
    targetChanged && !internalRelationAfter && internalRelationBefore && isEditingRelation;
  const shouldRemoveOppositeDueToNature =
    natureChanged && internalRelationBefore && ONE_SIDE_RELATIONS.includes(newNature) && isEditingRelation;
  const shouldUpdateOpposite =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(newNature) &&
    internalRelationBefore &&
    internalRelationAfter &&
    isEditingRelation;
  const shouldCreateOppositeFromNature =
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(newNature) &&
    internalRelationBefore &&
    internalRelationAfter &&
    isEditingRelation;
  const shouldCreateOppositeFromTarget =
    targetChanged && internalRelationAfter && !ONE_SIDE_RELATIONS.includes(newNature);

  let oppositeNameToRemove = null;
  let oppositeNameToUpdate = null;
  let oppositeNameToCreate = null;
  let oppositeAttribute = null;

  if (shouldRemoveOppositeDueToTarget || shouldRemoveOppositeDueToNature) {
    oppositeNameToRemove = initialAttribute.targetAttribute;
  }

  if (shouldUpdateOpposite || shouldCreateOppositeFromNature || shouldCreateOppositeFromTarget) {
    oppositeNameToUpdate = initialAttribute.targetAttribute;
    oppositeNameToCreate = rest.targetAttribute;
    oppositeAttribute = buildOppositeAttribute(rest, name);
  }

  const newAttributes = OrderedMap(
    obj
      .get('attributes')
      .keySeq()
      .reduce((acc, current) => {
        const isCurrent = current === initialAttributeName;

        if (isCurrent) {
          acc[name] = fromJS(rest);

          if (oppositeAttribute && (shouldCreateOppositeFromNature || shouldCreateOppositeFromTarget)) {
            acc[oppositeNameToCreate] = fromJS(oppositeAttribute);
            oppositeAttribute = null;
            oppositeNameToCreate = null;
          }
          return acc;
        }

        if (current === oppositeNameToUpdate) {
          if (oppositeAttribute) {
            acc[oppositeNameToCreate] = fromJS(oppositeAttribute);
          }
          return acc;
        }

        acc[current] = obj.getIn(['attributes', current]);
        return acc;
      }, {})
  );

  if (oppositeNameToRemove) {
    return newAttributes.remove(oppositeNameToRemove);
  }
  return newAttributes;
};

/* ---------- Action handlers ---------- */

const handlers = {
  [actions.ADD_ATTRIBUTE]: (state, action) => {
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

        if (type === 'relation' && nature !== 'oneWay' && nature !== 'manyWay' && target === currentUid) {
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
  },

  [actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE]: (state, action) => {
    const { dynamicZoneTarget, componentsToAdd } = action;
    return state.updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      list => list.concat(componentsToAdd)
    );
  },

  [actions.CANCEL_CHANGES]: state => {
    return state
      .update('modifiedData', () => state.get('initialData'))
      .update('components', () => state.get('initialComponents'));
  },

  [actions.CHANGE_DYNAMIC_ZONE_COMPONENTS]: (state, action) => {
    const { dynamicZoneTarget, newComponents } = action;
    return state
      .updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
      )
      .updateIn(['modifiedData', 'components'], old => {
        return newComponents.reduce((acc, current) => addComponentsToState(state, current, acc), old);
      });
  },

  [actions.CREATE_SCHEMA]: (state, action) => {
    const newSchema = {
      uid: action.uid,
      isTemporary: true,
      schema: {
        ...action.data,
        attributes: {},
      },
    };
    return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
  },

  [actions.CREATE_COMPONENT_SCHEMA]: (state, action) => {
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
  },

  [actions.DELETE_NOT_SAVED_TYPE]: state => {
    return state
      .update('contentTypes', () => state.get('initialContentTypes'))
      .update('components', () => state.get('initialComponents'));
  },

  [actions.EDIT_ATTRIBUTE]: (state, action) => {
    const {
      attributeToSet: { name, ...rest },
      forTarget,
      targetUid,
      initialAttribute,
    } = action;

    const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
      ? [forTarget]
      : [forTarget, targetUid];

    return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
      const newAttributes = processEditedAttributes(obj, {
        initialAttribute,
        rest,
        name,
        pathToDataToEdit,
        state,
      });
      return obj.set('attributes', newAttributes);
    });
  },

  [actions.GET_DATA_SUCCEEDED]: (state, action) => {
    return state
      .update('components', () => fromJS(action.components))
      .update('initialComponents', () => fromJS(action.components))
      .update('initialContentTypes', () => fromJS(action.contentTypes))
      .update('contentTypes', () => fromJS(action.contentTypes))
      .update('reservedNames', () => fromJS(action.reservedNames))
      .update('isLoading', () => false);
  },

  [actions.RELOAD_PLUGIN]: () => initialState,

  [actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT]: (state, action) => {
    const { attributeToRemoveName, componentUid } = action;
    return state.removeIn([
      'modifiedData',
      'components',
      componentUid,
      'schema',
      'attributes',
      attributeToRemoveName,
    ]);
  },

  [actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE]: (state, action) => {
    return state.removeIn([
      'modifiedData',
      'contentType',
      'schema',
      'attributes',
      action.dzName,
      'components',
      action.componentToRemoveIndex,
    ]);
  },

  [actions.REMOVE_FIELD]: (state, action) => {
    const { mainDataKey, attributeToRemoveName } = action;
    const pathToAttributes = ['modifiedData', mainDataKey, 'schema', 'attributes'];
    const pathToAttributeToRemove = [...pathToAttributes, attributeToRemoveName];
    const attributeToRemoveData = state.getIn(pathToAttributeToRemove);
    const isRemovingRelationAttribute = attributeToRemoveData.get('nature') !== undefined;
    const canHaveSelfRelation = mainDataKey === 'contentType';

    if (isRemovingRelationAttribute && canHaveSelfRelation) {
      const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
      const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
      const shouldRemoveOpposite = target === uid && !ONE_SIDE_RELATIONS.includes(nature);
      if (shouldRemoveOpposite) {
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
  },

  [actions.SET_MODIFIED_DATA]: (state, action) => {
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
  },

  [actions.UPDATE_SCHEMA]: (state, action) => {
    const {
      data: { name, collectionName, category, icon, kind },
      schemaType,
      uid,
    } = action;

    let newState = state.updateIn(['modifiedData', schemaType], obj => {
      let updated = obj
        .updateIn(['schema', 'name'], () => name)
        .updateIn(['schema', 'collectionName'], () => collectionName);

      if (schemaType === 'component') {
        updated = updated.update('category', () => category).updateIn(['schema', 'icon'], () => icon);
      }
      if (schemaType === 'contentType') {
        updated = updated.updateIn(['schema', 'kind'], () => kind);
      }
      return updated;
    });

    if (schemaType === 'component') {
      newState = newState.updateIn(['components'], obj => obj.update(uid, () => newState.getIn(['modifiedData', 'component'])));
    }

    return newState;
  },
};

/**
 * Main reducer delegating to specific action handlers.
 * @param {Immutable.Map} state
 * @param {object} action
 * @returns {Immutable.Map}
 */
const reducer = (state = initialState, action) => {
  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
};

export default reducer;
export { addComponentsToState, initialState };