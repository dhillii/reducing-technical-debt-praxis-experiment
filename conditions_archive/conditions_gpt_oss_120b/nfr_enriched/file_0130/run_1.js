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
  if (originalNature === 'manyToOne') return 'oneToMany';
  if (originalNature === 'oneToMany') return 'manyToOne';
  return originalNature;
};

/**
 * Adds a component and its nested components to the modified data map.
 */
const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const alreadyAdded =
    state.getIn(['modifiedData', 'components', componentToAddUid]) !== undefined;

  if (isTemporaryComponent || alreadyAdded) return newObj;

  newObj = newObj.set(componentToAddUid, componentToAdd);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach(uid => {
    const isTemp = state.getIn(['components', uid, 'isTemporary']) || false;
    const alreadyNestedAdded =
      state.getIn(['modifiedData', 'components', uid]) !== undefined;
    if (!isTemp && !alreadyNestedAdded) {
      newObj = newObj.set(uid, state.getIn(['components', uid]));
    }
  });

  return newObj;
};

/* -------------------------------------------------------------------------- */
/* Helper functions for ADD_ATTRIBUTE                                         */
/* -------------------------------------------------------------------------- */

const buildOppositeAttribute = (rest, name) => ({
  nature: getOppositeNature(rest.nature),
  target: rest.target,
  unique: rest.unique,
  dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const path = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  return state
    .updateIn(['modifiedData', ...path, 'schema', 'attributes', name], () => fromJS(rest))
    .updateIn(['modifiedData', ...path, 'schema', 'attributes'], attrs => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...path, 'uid']);

      if (type === 'relation' && nature !== 'oneWay' && nature !== 'manyWay' && target === currentUid) {
        const opposite = buildOppositeAttribute(rest, name);
        return attrs.update(rest.targetAttribute, () => fromJS(opposite));
      }
      return attrs;
    })
    .updateIn(['modifiedData', 'components'], comps => {
      if (action.shouldAddComponentToData) {
        return addComponentsToState(state, rest.component, comps);
      }
      return comps;
    });
};

/* -------------------------------------------------------------------------- */
/* Helper functions for EDIT_ATTRIBUTE                                        */
/* -------------------------------------------------------------------------- */

const computeEditFlags = ({
  initialAttribute,
  rest,
  currentUid,
  isEditingRelation,
}) => {
  const didChangeTarget = initialAttribute.target !== rest.target;
  const didCreateInternal = rest.target === currentUid;
  const hadInternal = initialAttribute.target === currentUid;
  const didChangeNature = initialAttribute.nature !== rest.nature;

  const removeBecauseOfTarget =
    didChangeTarget && !didCreateInternal && hadInternal && isEditingRelation;
  const removeBecauseOfNature =
    didChangeNature && hadInternal && ONE_SIDE_RELATIONS.includes(rest.nature) && isEditingRelation;

  const updateOpposite =
    !ONE_SIDE_RELATIONS.includes(initialAttribute.nature) &&
    !ONE_SIDE_RELATIONS.includes(rest.nature) &&
    hadInternal &&
    didCreateInternal &&
    isEditingRelation;

  const createOppositeFromNature =
    ONE_SIDE_RELATIONS.includes(initialAttribute.nature) &&
    !ONE_SIDE_RELATIONS.includes(rest.nature) &&
    hadInternal &&
    didCreateInternal &&
    isEditingRelation;

  const createOppositeFromTarget =
    didChangeTarget && didCreateInternal && !ONE_SIDE_RELATIONS.includes(rest.nature);

  return {
    removeOpposite: removeBecauseOfTarget || removeBecauseOfNature,
    updateOpposite,
    createOppositeFromNature,
    createOppositeFromTarget,
    oppositeNameToRemove: initialAttribute.targetAttribute,
    oppositeNameToUpdate: initialAttribute.targetAttribute,
    oppositeNameToCreate: rest.targetAttribute,
  };
};

const buildOppositeForEdit = (rest, name) => ({
  nature: getOppositeNature(rest.nature),
  target: rest.target,
  unique: rest.unique,
  dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

const rebuildAttributes = ({
  obj,
  name,
  rest,
  flags,
}) => {
  const newAttrs = {};
  const oppositeAttr = buildOppositeForEdit(rest, name);

  obj
    .get('attributes')
    .keySeq()
    .forEach(current => {
      if (current === flags.oppositeNameToUpdate) {
        newAttrs[flags.oppositeNameToCreate] = fromJS(oppositeAttr);
        return;
      }

      if (current === name) {
        newAttrs[name] = fromJS(rest);
        if (flags.createOppositeFromNature || flags.createOppositeFromTarget) {
          newAttrs[flags.oppositeNameToCreate] = fromJS(oppositeAttr);
        }
        return;
      }

      newAttrs[current] = obj.getIn(['attributes', current]);
    });

  return OrderedMap(newAttrs);
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const initialName = get(initialAttribute, ['name'], '');
  const path = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  return state.updateIn(['modifiedData', ...path, 'schema'], schemaObj => {
    const currentUid = state.getIn(['modifiedData', ...path, 'uid']);
    const isRelation = has(initialAttribute, 'nature');
    const flags = computeEditFlags({
      initialAttribute,
      rest,
      currentUid,
      isEditingRelation: isRelation,
    });

    const updatedAttributes = rebuildAttributes({
      obj: schemaObj,
      name,
      rest,
      flags,
    });

    let finalAttrs = updatedAttributes;
    if (flags.removeOpposite) {
      finalAttrs = finalAttrs.remove(flags.oppositeNameToRemove);
    }

    return schemaObj.set('attributes', finalAttrs);
  });
};

/* -------------------------------------------------------------------------- */
/* Helper functions for CHANGE_DYNAMIC_ZONE_COMPONENTS                        */
/* -------------------------------------------------------------------------- */

const handleChangeDynamicZoneComponents = (state, action) => {
  const { dynamicZoneTarget, newComponents } = action;

  const updatedState = state
    .updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
    )
    .updateIn(['modifiedData', 'components'], old => {
      return newComponents.reduce((acc, uid) => addComponentsToState(state, uid, acc), old);
    });

  return updatedState;
};

/* -------------------------------------------------------------------------- */
/* Main reducer                                                               */
/* -------------------------------------------------------------------------- */

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

    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS:
      return handleChangeDynamicZoneComponents(state, action);

    case actions.CREATE_SCHEMA: {
      const newSchema = {
        uid: action.uid,
        isTemporary: true,
        schema: { ...action.data, attributes: {} },
      };
      return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
    }

    case actions.CREATE_COMPONENT_SCHEMA: {
      const newSchema = {
        uid: action.uid,
        isTemporary: true,
        category: action.componentCategory,
        schema: { ...action.data, attributes: {} },
      };
      if (action.shouldAddComponentToData) {
        return state
          .updateIn(['components', action.uid], () => fromJS(newSchema))
          .updateIn(['modifiedData', 'components', action.uid], () => fromJS(newSchema));
      }
      return state.updateIn(['components', action.uid], () => fromJS(newSchema));
    }

    case actions.DELETE_NOT_SAVED_TYPE:
      return state
        .update('contentTypes', () => state.get('initialContentTypes'))
        .update('components', () => state.get('initialComponents'));

    case actions.EDIT_ATTRIBUTE:
      return handleEditAttribute(state, action);

    case actions.GET_DATA_SUCCEEDED:
      return state
        .update('components', () => fromJS(action.components))
        .update('initialComponents', () => fromJS(action.components))
        .update('initialContentTypes', () => fromJS(action.contentTypes))
        .update('contentTypes', () => fromJS(action.contentTypes))
        .update('reservedNames', () => fromJS(action.reservedNames))
        .update('isLoading', () => false);

    case actions.RELOAD_PLUGIN:
      return initialState;

    case actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT: {
      const { attributeToRemoveName, componentUid } = action;
      return state.removeIn([
        'modifiedData',
        'components',
        componentUid,
        'schema',
        'attributes',
        attributeToRemoveName,
      ]);
    }

    case actions.REMOVE_COMPONENT_FROM_DYNAMIC_ZONE:
      return state.removeIn([
        'modifiedData',
        'contentType',
        'schema',
        'attributes',
        action.dzName,
        'components',
        action.componentToRemoveIndex,
      ]);

    case actions.REMOVE_FIELD: {
      const { mainDataKey, attributeToRemoveName } = action;
      const attrsPath = ['modifiedData', mainDataKey, 'schema', 'attributes'];
      const attrPath = [...attrsPath, attributeToRemoveName];
      const attrData = state.getIn(attrPath);
      const isRelation = attrData.get('nature') !== undefined;
      const canSelfRelate = mainDataKey === 'contentType';

      if (isRelation && canSelfRelate) {
        const { target, nature, targetAttribute } = attrData.toJS();
        const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
        const shouldRemoveOpposite = target === uid && !ONE_SIDE_RELATIONS.includes(nature);
        if (shouldRemoveOpposite) {
          return state
            .removeIn(attrPath)
            .removeIn([...attrsPath, targetAttribute]);
        }
      }

      return state
        .removeIn(attrPath)
        .updateIn(attrsPath, attrs =>
          attrs.keySeq().reduce((acc, cur) => {
            if (acc.getIn([cur, 'targetField']) === attributeToRemoveName) {
              return acc.removeIn([cur, 'targetField']);
            }
            return acc;
          }, attrs)
        );
    }

    case actions.SET_MODIFIED_DATA: {
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
    }

    case actions.UPDATE_SCHEMA: {
      const {
        data: { name, collectionName, category, icon, kind },
        schemaType,
        uid,
      } = action;

      let newState = state.updateIn(['modifiedData', schemaType], obj => {
        let upd = obj
          .updateIn(['schema', 'name'], () => name)
          .updateIn(['schema', 'collectionName'], () => collectionName);

        if (schemaType === 'component') {
          upd = upd.update('category', () => category).updateIn(['schema', 'icon'], () => icon);
        }
        if (schemaType === 'contentType') {
          upd = upd.updateIn(['schema', 'kind'], () => kind);
        }
        return upd;
      });

      if (schemaType === 'component') {
        newState = newState.updateIn(['components'], comps =>
          comps.update(uid, () => newState.getIn(['modifiedData', 'component']))
        );
      }
      return newState;
    }

    default:
      return state;
  }
};

export default reducer;
export { addComponentsToState, initialState };