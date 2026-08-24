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

const getAttributePath = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];
};

const createOppositeAttribute = (rest, name) => {
  return {
    nature: getOppositeNature(rest.nature),
    target: rest.target,
    unique: rest.unique,
    dominant: rest.nature === 'manyToMany' ? !rest.dominant : null,
    targetAttribute: name,
    columnName: rest.targetColumnName,
    targetColumnName: rest.columnName,
  };
};

const updateOppositeAttribute = (obj, rest, name, currentUid) => {
  if (
    rest.type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(rest.nature) &&
    rest.target === currentUid
  ) {
    const oppositeAttribute = createOppositeAttribute(rest, name);
    return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
  }
  return obj;
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE: {
      const {
        attributeToSet: { name, ...rest },
        forTarget,
        targetUid,
      } = action;
      delete rest.createComponent;

      const pathToDataToEdit = getAttributePath(forTarget, targetUid);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      return state
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
          return fromJS(rest);
        })
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
          return updateOppositeAttribute(obj, rest, name, currentUid);
        })
        .updateIn(['modifiedData', 'components'], existingCompos => {
          return action.shouldAddComponentToData
            ? addComponentsToState(state, rest.component, existingCompos)
            : existingCompos;
        });
    }
    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE: {
      const { dynamicZoneTarget, componentsToAdd } = action;

      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        list => list.concat(componentsToAdd)
      );
    }
    case actions.CANCEL_CHANGES: {
      return state
        .update('modifiedData', () => state.get('initialData'))
        .update('components', () => state.get('initialComponents'));
    }
    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS: {
      const { dynamicZoneTarget, newComponents } = action;

      return state
        .updateIn(
          ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
          list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
        )
        .updateIn(['modifiedData', 'components'], old =>
          newComponents.reduce((acc, current) => addComponentsToState(state, current, acc), old)
        );
    }
    case actions.CREATE_SCHEMA: {
      const newSchema = {
        uid: action.uid,
        isTemporary: true,
        schema: {
          ...action.data,
          attributes: {},
        },
      };
      return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
    }
    case actions.CREATE_COMPONENT_SCHEMA: {
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
    }
    case actions.DELETE_NOT_SAVED_TYPE: {
      return state
        .update('contentTypes', () => state.get('initialContentTypes'))
        .update('components', () => state.get('initialComponents'));
    }
    case actions.EDIT_ATTRIBUTE: {
      const {
        attributeToSet: { name, ...rest },
        forTarget,
        targetUid,
        initialAttribute,
      } = action;
      const initialAttributeName = get(initialAttribute, ['name'], '');
      const pathToDataToEdit = getAttributePath(forTarget, targetUid);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
        let oppositeAttributeNameToRemove = null;
        let oppositeAttributeNameToUpdate = null;
        let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
        let oppositeAttributeToCreate = null;

        const iniNat = initialAttribute.nature;
        const nat = rest.nature;
        const hadInternalRelation = initialAttribute.target === currentUid;
        const didChangeTargetRelation = initialAttribute.target !== rest.target;
        const didCreateInternalRelation = rest.target === currentUid;
        const didChangeRelationNature = iniNat !== nat;
        const isEditingRelation = has(initialAttribute, 'nature');

        const shouldRemoveOppositeAttributeBecauseOfTargetChange =
          didChangeTargetRelation &&
          !didCreateInternalRelation &&
          hadInternalRelation &&
          isEditingRelation;
        const shouldRemoveOppositeAttributeBecauseOfNatureChange =
          didChangeRelationNature &&
          hadInternalRelation &&
          ONE_SIDE_RELATIONS.includes(nat) &&
          isEditingRelation;
        const shouldUpdateOppositeAttributeBecauseOfNatureChange =
          !ONE_SIDE_RELATIONS.includes(iniNat) &&
          !ONE_SIDE_RELATIONS.includes(nat) &&
          hadInternalRelation &&
          didCreateInternalRelation &&
          isEditingRelation;
        const shouldCreateOppositeAttributeBecauseOfNatureChange =
          ONE_SIDE_RELATIONS.includes(iniNat) &&
          !ONE_SIDE_RELATIONS.includes(nat) &&
          hadInternalRelation &&
          didCreateInternalRelation &&
          isEditingRelation;
        const shouldCreateOppositeAttributeBecauseOfTargetChange =
          didChangeTargetRelation &&
          didCreateInternalRelation &&
          !ONE_SIDE_RELATIONS.includes(nat);

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
          oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
          oppositeAttributeNameToCreateBecauseOfNatureChange = rest.targetAttribute;
          oppositeAttributeToCreate = createOppositeAttribute(rest, name);
        }

        const newObj = OrderedMap(
          obj
            .get('attributes')
            .keySeq()
            .reduce((acc, current) => {
              if (current === name) {
                acc[name] = fromJS(rest);
              } else if (current === oppositeAttributeNameToUpdate) {
                acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
                  oppositeAttributeToCreate
                );
                oppositeAttributeNameToCreateBecauseOfNatureChange = null;
                oppositeAttributeToCreate = null;
              } else if (current === oppositeAttributeNameToRemove) {
                return acc;
              } else {
                acc[current] = obj.getIn(['attributes', current]);
              }
              return acc;
            }, {})
        );

        let updatedObj = newObj;
        if (oppositeAttributeNameToRemove !== null) {
          updatedObj = newObj.remove(oppositeAttributeNameToRemove);
        }

        return obj.set('attributes', updatedObj);
      });
    }
    case actions.GET_DATA_SUCCEEDED: {
      return state
        .update('components', () => fromJS(action.components))
        .update('initialComponents', () => fromJS(action.components))
        .update('initialContentTypes', () => fromJS(action.contentTypes))
        .update('contentTypes', () => fromJS(action.contentTypes))
        .update('reservedNames', () => fromJS(action.reservedNames))
        .update('isLoading', () => false);
    }
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

      const isRemovingRelationAttribute = attributeToRemoveData.get('nature') !== undefined;
      const canTheAttributeToRemoveHaveARelationWithItself = mainDataKey === 'contentType';

      if (
        isRemovingRelationAttribute &&
        canTheAttributeToRemoveHaveARelationWithItself
      ) {
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

      return state.removeIn(pathToAttributeToRemove).updateIn(pathToAttributes, attributes => {
        return attributes.keySeq().reduce((acc, current) => {
          if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
            return acc.removeIn([current, 'targetField']);
          }
          return acc;
        }, attributes);
      });
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
        let updatedObj = obj
          .updateIn(['schema', 'name'], () => name)
          .updateIn(['schema', 'collectionName'], () => collectionName);

        if (schemaType === 'component') {
          updatedObj = updatedObj
            .update('category', () => category)
            .updateIn(['schema', 'icon'], () => icon);
        } else if (schemaType === 'contentType') {
          updatedObj = updatedObj.updateIn(['schema', 'kind'], () => kind);
        }

        return updatedObj;
      });

      if (schemaType === 'component') {
        newState = newState.updateIn(['components'], obj =>
          obj.update(uid, () => newState.getIn(['modifiedData', 'component']))
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