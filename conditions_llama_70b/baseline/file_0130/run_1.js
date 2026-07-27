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
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const hasComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentToAddUid]) !== undefined;

  if (isTemporaryComponent || hasComponentAlreadyBeenAdded) {
    return objToUpdate;
  }

  const newObj = objToUpdate.set(componentToAddUid, componentToAdd);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach(componentUid => {
    const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
    const hasNestedComponentAlreadyBeenAdded =
      state.getIn(['modifiedData', 'components', componentUid]) !== undefined;

    if (!isTemporary && !hasNestedComponentAlreadyBeenAdded) {
      objToUpdate = objToUpdate.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return objToUpdate;
};

const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;

  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      if (
        type === 'relation' &&
        nature !== 'oneWay' &&
        nature !== 'manyWay' &&
        target === currentUid
      ) {
        const oppositeAttribute = {
          nature: getOppositeNature(nature),
          target,
          unique: rest.unique,
          dominant: nature === 'manyToMany' ? !rest.dominant : null,
          targetAttribute: name,
          columnName: rest.targetColumnName,
          targetColumnName: rest.columnName,
        };

        return obj.update(rest.targetAttribute, () => {
          return fromJS(oppositeAttribute);
        });
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

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
    ? [forTarget]
    : [forTarget, targetUid];

  const initialAttributeName = get(initialAttribute, ['name'], '');
  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeNameToUpdate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
  let oppositeAttributeToCreate = null;

  const updatedAttributes = state
    .getIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'])
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
        const shouldRemoveOppositeAttributeBecauseOfTargetChange =
          didChangeTargetRelation &&
          !didCreateInternalRelation &&
          hadInternalRelation &&
          isEditingRelation;
        const shouldRemoveOppositeAttributeBecauseOfNatureChange =
          didChangeRelationNature &&
          hadInternalRelation &&
          ['oneWay', 'manyWay'].includes(nature) &&
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

          if (
            shouldCreateOppositeAttributeBecauseOfNatureChange ||
            shouldCreateOppositeAttributeBecauseOfTargetChange
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
        acc[current] = state.getIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', current]);
      }

      return acc;
    }, {});

  let updatedObj = OrderedMap(updatedAttributes);

  if (oppositeAttributeNameToRemove !== null) {
    updatedObj = updatedObj.remove(oppositeAttributeNameToRemove);
  }

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
    return obj.set('attributes', updatedObj);
  });
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return handleAddAttribute(state, action);
    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE:
      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', action.dynamicZoneTarget, 'components'],
        list => {
          return list.concat(action.componentsToAdd);
        }
      );
    case actions.CANCEL_CHANGES:
      return state
        .update('modifiedData', () => state.get('initialData'))
        .update('components', () => state.get('initialComponents'));
    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS:
      return state
        .updateIn(
          ['modifiedData', 'contentType', 'schema', 'attributes', action.dynamicZoneTarget, 'components'],
          list => {
            return fromJS(makeUnique([...list.toJS(), ...action.newComponents]));
          }
        )
        .updateIn(['modifiedData', 'components'], old => {
          const componentsSchema = action.newComponents.reduce((acc, current) => {
            return addComponentsToState(state, current, acc);
          }, old);

          return componentsSchema;
        });
    case actions.CREATE_SCHEMA:
      return state.updateIn(['contentTypes', action.uid], () => {
        const newSchema = {
          uid: action.uid,
          isTemporary: true,
          schema: {
            ...action.data,
            attributes: {},
          },
        };

        return fromJS(newSchema);
      });
    case actions.CREATE_COMPONENT_SCHEMA:
      return state.updateIn(['components', action.uid], () => {
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

        return fromJS(newSchema);
      });
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
    case actions.REMOVE_FIELD_FROM_DISPLAYED_COMPONENT:
      return state.removeIn([
        'modifiedData',
        'components',
        action.componentUid,
        'schema',
        'attributes',
        action.attributeToRemoveName,
      ]);
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
    case actions.REMOVE_FIELD:
      return state.removeIn([
        'modifiedData',
        action.mainDataKey,
        'schema',
        'attributes',
        action.attributeToRemoveName,
      ]);
    case actions.SET_MODIFIED_DATA:
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
    case actions.UPDATE_SCHEMA:
      return state.updateIn(['modifiedData', action.schemaType], obj => {
        let updatedObj = obj
          .updateIn(['schema', 'name'], () => action.data.name)
          .updateIn(['schema', 'collectionName'], () => action.data.collectionName);

        if (action.schemaType === 'component') {
          updatedObj = updatedObj
            .update('category', () => action.data.category)
            .updateIn(['schema', 'icon'], () => action.data.icon);
        }
        if (action.schemaType === 'contentType') {
          updatedObj = updatedObj.updateIn(['schema', 'kind'], () => action.data.kind);
        }

        return updatedObj;
      });
    default:
      return state;
  }
};

export default reducer;
export { addComponentsToState, initialState };