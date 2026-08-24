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

/**
 * Creates an opposite attribute object based on the provided attribute details.
 * @param {Object} rest - The attribute configuration object.
 * @param {string} name - The target attribute name.
 * @returns {Object} - The constructed opposite attribute.
 */
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

/**
 * Determines if a relation attribute should be considered internal to the content type.
 * @param {string} target - The target UID of the relation.
 * @param {string} currentUid - The UID of the current content type.
 * @returns {boolean}
 */
const isInternalRelation = (target, currentUid) => target === currentUid;

/**
 * Checks if a relation is considered one-sided (i.e., no opposite required).
 * @param {string} nature - The relation nature.
 * @returns {boolean}
 */
const isOneSidedRelation = nature => ONE_SIDE_RELATIONS.includes(nature);

/**
 * Extracts logic for handling relation attribute changes in EDIT_ATTRIBUTE action.
 * @param {OrderedMap} acc - Accumulator for attribute updates.
 * @param {Map} obj - Original attributes set.
 * @param {Object} rest - Updated attribute data.
 * @param {string} name - Name of the current attribute being edited.
 * @param {Object} initialAttribute - Original attribute data.
 * @param {string} currentUid - UID of the content type or component.
 * @returns {OrderedMap} - Updated accumulator.
 */
const handleRelationAttributeEdit = (acc, obj, rest, name, initialAttribute, currentUid) => {
  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const target = rest.target;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeTargetRelation = initialAttribute.target !== target;
  const didCreateInternalRelation = target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;

  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeNameToUpdate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
  let oppositeAttributeToCreate = null;

  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isOneSidedRelation(initialNature);

  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    didChangeRelationNature &&
    hadInternalRelation &&
    isOneSidedRelation(nature);

  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    !isOneSidedRelation(initialNature) &&
    !isOneSidedRelation(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation;

  const shouldCreateOppositeAttributeBecauseOfNatureChange =
    isOneSidedRelation(initialNature) &&
    !isOneSidedRelation(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation;

  const shouldCreateOppositeAttributeBecauseOfTargetChange =
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !isOneSidedRelation(nature);

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

    oppositeAttributeToCreate = createOppositeAttribute(rest, name);

    acc[name] = fromJS(rest);

    if (
      shouldCreateOppositeAttributeBecauseOfNatureChange ||
      shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(oppositeAttributeToCreate);
      oppositeAttributeToCreate = null;
      oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    }

    return { acc, oppositeAttributeNameToRemove, oppositeAttributeNameToUpdate, oppositeAttributeToCreate };
  }

  acc[name] = fromJS(rest);

  return { acc, oppositeAttributeNameToRemove, oppositeAttributeNameToUpdate, oppositeAttributeToCreate };
};

/**
 * Processes attribute updates under EDIT_ATTRIBUTE for relation attributes.
 * @param {OrderedMap} attributes - Immutable map of attribute definitions.
 * @param {string} initialAttributeName - Name of the initial attribute being edited.
 * @param {Map} obj - Original attribute set.
 * @param {Object} rest - Updated attribute payload.
 * @param {string} name - Currently edited attribute name.
 * @param {Object} initialAttribute - Original attribute definition.
 * @param {string} currentUid - UID of the content type or component.
 * @returns {OrderedMap} - Updated attributes map.
 */
const updateAttributeForRelationEdit = (attributes, initialAttributeName, obj, rest, name, initialAttribute, currentUid) => {
  return OrderedMap(
    attributes
      .keySeq()
      .reduce((acc, current) => {
        const isEditingCurrentAttribute = current === initialAttributeName;

        if (isEditingCurrentAttribute) {
          const { acc: newAcc, oppositeAttributeNameToRemove, oppositeAttributeNameToUpdate, oppositeAttributeToCreate } =
            handleRelationAttributeEdit(
              acc,
              obj,
              rest,
              name,
              initialAttribute,
              currentUid
            );

          acc = newAcc;
          acc._oppositeAttributeNameToRemove = oppositeAttributeNameToRemove;
          acc._oppositeAttributeNameToUpdate = oppositeAttributeNameToUpdate;
          acc._oppositeAttributeToCreate = oppositeAttributeToCreate;
        } else if (current === acc._oppositeAttributeNameToUpdate) {
          acc[acc._oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
            acc._oppositeAttributeToCreate
          );
        } else {
          acc[current] = obj.getIn(['attributes', current]);
        }

        return acc;
      }, {})
  );
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

      const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
        ? [forTarget]
        : [forTarget, targetUid];

      return state
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () =>
          fromJS(rest)
        )
        .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
          const type = get(rest, 'type', 'relation');
          const target = get(rest, 'target', null);
          const nature = get(rest, 'nature', null);
          const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

          if (type === 'relation' && !isOneSidedRelation(nature) && isInternalRelation(target, currentUid)) {
            const oppositeAttribute = createOppositeAttribute(rest, name);

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
        .updateIn(['modifiedData', 'components'], old => {
          const componentsSchema = newComponents.reduce(
            (acc, current) => addComponentsToState(state, current, acc),
            old
          );

          return componentsSchema;
        });
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
      let newState = state;

      const initialAttributeName = get(initialAttribute, ['name'], '');
      const pathToDataToEdit = ['component', 'contentType'].includes(forTarget)
        ? [forTarget]
        : [forTarget, targetUid];

      return newState.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], obj => {
        const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
        const updatedAttributes = updateAttributeForRelationEdit(
          obj.get('attributes'),
          initialAttributeName,
          obj,
          rest,
          name,
          initialAttribute,
          currentUid
        );

        const oppositeAttributeToRemove =
          updatedAttributes._oppositeAttributeNameToRemove || null;

        let updatedObj;

        if (oppositeAttributeToRemove) {
          updatedObj = updatedAttributes.remove(oppositeAttributeToRemove);
        } else {
          updatedObj = updatedAttributes;
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

      if (isRemovingRelationAttribute && canTheAttributeToRemoveHaveARelationWithItself) {
        const { target, nature, targetAttribute } = attributeToRemoveData.toJS();
        const uid = state.getIn(['modifiedData', 'contentType', 'uid']);
        const shouldRemoveOppositeAttribute =
          target === uid && !isOneSidedRelation(nature);

        if (shouldRemoveOppositeAttribute) {
          return state
            .removeIn(pathToAttributeToRemove)
            .removeIn([...pathToAttributes, targetAttribute]);
        }
      }

      return state.removeIn(pathToAttributeToRemove).updateIn([...pathToAttributes], attributes => {
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
    }
    default:
      return state;
  }
};

export default reducer;
export { addComponentsToState, initialState };