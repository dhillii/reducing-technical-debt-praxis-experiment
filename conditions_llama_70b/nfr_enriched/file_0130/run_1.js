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
  if (originalNature === 'manyToOne') {
    return 'oneToMany';
  }

  if (originalNature === 'oneToMany') {
    return 'manyToOne';
  }

  return originalNature;
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  // Check if the component is temporary or has already been added
  if (isComponentAlreadyAdded(state, componentToAddUid)) {
    return objToUpdate;
  }

  // Add the component to the modified data
  const componentToAdd = state.getIn(['components', componentToAddUid]);
  objToUpdate = objToUpdate.set(componentToAddUid, componentToAdd);

  // Add nested components to the modified data
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAdd.getIn(['schema', 'attributes']).toJS(),
    state.get('components').toJS()
  );
  nestedComponents.forEach((componentUid) => {
    if (!isComponentAlreadyAdded(state, componentUid)) {
      objToUpdate = objToUpdate.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return objToUpdate;
};

const isComponentAlreadyAdded = (state, componentUid) => {
  const component = state.getIn(['components', componentUid]);
  return component.get('isTemporary') || state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
};

const updateAttribute = (state, action) => {
  const { attributeToSet, forTarget, targetUid } = action;
  const pathToDataToEdit = ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', attributeToSet.name], () => {
    return fromJS(attributeToSet);
  });
};

const updateOppositeAttribute = (state, action, oppositeAttributeName) => {
  const { attributeToSet } = action;
  const oppositeAttribute = {
    nature: getOppositeNature(attributeToSet.nature),
    target: attributeToSet.target,
    unique: attributeToSet.unique,
    dominant: attributeToSet.nature === 'manyToMany' ? !attributeToSet.dominant : null,
    targetAttribute: attributeToSet.name,
    columnName: attributeToSet.targetColumnName,
    targetColumnName: attributeToSet.columnName,
  };

  return state.updateIn(['modifiedData', 'contentType', 'schema', 'attributes', oppositeAttributeName], () => {
    return fromJS(oppositeAttribute);
  });
};

const removeOppositeAttribute = (state, oppositeAttributeName) => {
  return state.removeIn(['modifiedData', 'contentType', 'schema', 'attributes', oppositeAttributeName]);
};

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return updateAttribute(state, action)
        .updateIn(['modifiedData', 'components'], (existingCompos) => {
          if (action.shouldAddComponentToData) {
            return addComponentsToState(state, action.attributeToSet.component, existingCompos);
          }
          return existingCompos;
        });

    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE:
      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', action.dynamicZoneTarget, 'components'],
        (list) => {
          return list.concat(action.componentsToAdd);
        }
      );

    case actions.CANCEL_CHANGES:
      return state.update('modifiedData', () => state.get('initialData')).update('components', () => state.get('initialComponents'));

    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS:
      return state
        .updateIn(
          ['modifiedData', 'contentType', 'schema', 'attributes', action.dynamicZoneTarget, 'components'],
          (list) => {
            return fromJS(makeUnique([...list.toJS(), ...action.newComponents]));
          }
        )
        .updateIn(['modifiedData', 'components'], (old) => {
          const componentsSchema = action.newComponents.reduce((acc, current) => {
            return addComponentsToState(state, current, acc);
          }, old);
          return componentsSchema;
        });

    case actions.CREATE_SCHEMA:
      return state.updateIn(['contentTypes', action.uid], () => fromJS({ uid: action.uid, isTemporary: true, schema: { ...action.data, attributes: {} } }));

    case actions.CREATE_COMPONENT_SCHEMA:
      return state.updateIn(['components', action.uid], () => fromJS({ uid: action.uid, isTemporary: true, category: action.componentCategory, schema: { ...action.data, attributes: {} } }))
        .updateIn(['modifiedData', 'components', action.uid], () => fromJS({ uid: action.uid, isTemporary: true, category: action.componentCategory, schema: { ...action.data, attributes: {} } }));

    case actions.DELETE_NOT_SAVED_TYPE:
      return state.update('contentTypes', () => state.get('initialContentTypes')).update('components', () => state.get('initialComponents'));

    case actions.EDIT_ATTRIBUTE:
      return state.updateIn(['modifiedData', 'contentType', 'schema'], (obj) => {
        const { attributeToSet, initialAttribute } = action;
        const oppositeAttributeNameToRemove = getOppositeAttributeNameToRemove(state, action);
        const oppositeAttributeNameToUpdate = getOppositeAttributeNameToUpdate(state, action);

        const newObj = OrderedMap(
          obj
            .get('attributes')
            .keySeq()
            .reduce((acc, current) => {
              if (current === initialAttribute.name) {
                acc[attributeToSet.name] = fromJS(attributeToSet);
              } else if (current === oppositeAttributeNameToUpdate) {
                acc[oppositeAttributeNameToUpdate] = fromJS(getOppositeAttribute(state, action));
              } else {
                acc[current] = obj.getIn(['attributes', current]);
              }
              return acc;
            }, {})
        );

        if (oppositeAttributeNameToRemove) {
          return newObj.remove(oppositeAttributeNameToRemove);
        }
        return newObj;
      });

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
      return state
        .update('isLoadingForDataToBeSet', () => false)
        .update('initialData', () => fromJS(action.schemaToSet))
        .update('modifiedData', () => fromJS(action.schemaToSet));

    case actions.UPDATE_SCHEMA:
      return state.updateIn(['modifiedData', action.schemaType], (obj) => {
        let updatedObj = obj.updateIn(['schema', 'name'], () => action.data.name);
        if (action.schemaType === 'component') {
          updatedObj = updatedObj.update('category', () => action.data.category);
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

const getOppositeAttributeNameToRemove = (state, action) => {
  const { attributeToSet, initialAttribute, forTarget, targetUid } = action;
  const currentUid = state.getIn(['modifiedData', forTarget, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== attributeToSet.target;
  const didCreateInternalRelation = attributeToSet.target === currentUid;
  const nature = attributeToSet.nature;
  const initialNature = initialAttribute.nature;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;
  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation && !didCreateInternalRelation && hadInternalRelation && isEditingRelation;
  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    didChangeRelationNature && hadInternalRelation && ['oneWay', 'manyWay'].includes(nature) && isEditingRelation;

  if (shouldRemoveOppositeAttributeBecauseOfTargetChange || shouldRemoveOppositeAttributeBecauseOfNatureChange) {
    return initialAttribute.targetAttribute;
  }
  return null;
};

const getOppositeAttributeNameToUpdate = (state, action) => {
  const { attributeToSet, initialAttribute, forTarget, targetUid } = action;
  const currentUid = state.getIn(['modifiedData', forTarget, 'uid']);
  const isEditingRelation = has(initialAttribute, 'nature');
  const didChangeTargetRelation = initialAttribute.target !== attributeToSet.target;
  const didCreateInternalRelation = attributeToSet.target === currentUid;
  const nature = attributeToSet.nature;
  const initialNature = initialAttribute.nature;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;
  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation;

  if (shouldUpdateOppositeAttributeBecauseOfNatureChange) {
    return initialAttribute.targetAttribute;
  }
  return null;
};

const getOppositeAttribute = (state, action) => {
  const { attributeToSet } = action;
  return {
    nature: getOppositeNature(attributeToSet.nature),
    target: attributeToSet.target,
    unique: attributeToSet.unique,
    dominant: attributeToSet.nature === 'manyToMany' ? !attributeToSet.dominant : null,
    targetAttribute: attributeToSet.name,
    columnName: attributeToSet.targetColumnName,
    targetColumnName: attributeToSet.columnName,
  };
};

export default reducer;
export { addComponentsToState, initialState };