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

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const hasComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentToAddUid]) !== undefined;

  if (isTemporaryComponent || hasComponentAlreadyBeenAdded) return newObj;

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

const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  const updatedState = state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () =>
      fromJS(rest)
    )
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

  return updatedState;
};

const handleEditAttribute = (state, action) => {
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
    let oppositeAttributeNameToRemove = null;
    let oppositeAttributeNameToUpdate = null;
    let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    let oppositeAttributeToCreate = null;

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          const isEditingCurrent = current === initialAttributeName;

          if (isEditingCurrent) {
            const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
            const isRelation = has(initialAttribute, 'nature');
            const didChangeTarget = initialAttribute.target !== rest.target;
            const createdInternal = rest.target === currentUid;
            const nature = rest.nature;
            const initialNature = initialAttribute.nature;
            const hadInternal = initialAttribute.target === currentUid;
            const didChangeNature = initialAttribute.nature !== nature;

            const shouldRemoveOppositeDueToTarget =
              didChangeTarget && !createdInternal && hadInternal && isRelation;
            const shouldRemoveOppositeDueToNature =
              didChangeNature && hadInternal && ONE_SIDE_RELATIONS.includes(nature) && isRelation;
            const shouldUpdateOppositeDueToNature =
              !ONE_SIDE_RELATIONS.includes(initialNature) &&
              !ONE_SIDE_RELATIONS.includes(nature) &&
              hadInternal &&
              createdInternal &&
              isRelation;
            const shouldCreateOppositeDueToNature =
              ONE_SIDE_RELATIONS.includes(initialNature) &&
              !ONE_SIDE_RELATIONS.includes(nature) &&
              hadInternal &&
              createdInternal &&
              isRelation;
            const shouldCreateOppositeDueToTarget =
              didChangeTarget && createdInternal && !ONE_SIDE_RELATIONS.includes(nature);

            if (shouldRemoveOppositeDueToTarget || shouldRemoveOppositeDueToNature) {
              oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
            }

            if (
              shouldUpdateOppositeDueToNature ||
              shouldCreateOppositeDueToNature ||
              shouldCreateOppositeDueToTarget
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

              if (shouldCreateOppositeDueToNature || shouldCreateOppositeDueToTarget) {
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

    const finalAttributes = oppositeAttributeNameToRemove
      ? newObj.remove(oppositeAttributeNameToRemove)
      : newObj;

    return obj.set('attributes', finalAttributes);
  });
};

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
      const pathToAttributes = ['modifiedData', mainDataKey, 'schema', 'attributes'];
      const pathToAttributeToRemove = [...pathToAttributes, attributeToRemoveName];
      const attributeToRemoveData = state.getIn(pathToAttributeToRemove);
      const isRelation = attributeToRemoveData.get('nature') !== undefined;
      const canSelfRelation = mainDataKey === 'contentType';

      if (isRelation && canSelfRelation) {
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
        .updateIn([...pathToAttributes], attributes =>
          attributes.keySeq().reduce((acc, cur) => {
            if (acc.getIn([cur, 'targetField']) === attributeToRemoveName) {
              return acc.removeIn([cur, 'targetField']);
            }
            return acc;
          }, attributes)
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
        let updated = obj
          .updateIn(['schema', 'name'], () => name)
          .updateIn(['schema', 'collectionName'], () => collectionName);

        if (schemaType === 'component') {
          updated = updated.update('category', () => category).updateIn(['schema', 'icon'], () => icon);
        } else if (schemaType === 'contentType') {
          updated = updated.updateIn(['schema', 'kind'], () => kind);
        }
        return updated;
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