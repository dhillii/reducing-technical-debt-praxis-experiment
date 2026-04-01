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

/**
 * Returns the opposite nature of a relation type
 * @param {string} originalNature - The original relation nature
 * @returns {string} The opposite nature
 */
const getOppositeNature = originalNature => {
  const oppositeMap = {
    manyToOne: 'oneToMany',
    oneToMany: 'manyToOne',
  };
  return oppositeMap[originalNature] || originalNature;
};

/**
 * Checks if a component should be added to state
 * @param {Object} state - Current state
 * @param {string} componentUid - Component UID
 * @returns {boolean} Whether component should be added
 */
const shouldAddComponentToState = (state, componentUid) => {
  const componentToAdd = state.getIn(['components', componentUid]);
  const isTemporaryComponent = componentToAdd.get('isTemporary');
  const hasComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
  return !isTemporaryComponent && !hasComponentAlreadyBeenAdded;
};

/**
 * Checks if a nested component should be added to state
 * @param {Object} state - Current state
 * @param {string} componentUid - Component UID
 * @returns {boolean} Whether nested component should be added
 */
const shouldAddNestedComponentToState = (state, componentUid) => {
  const isTemporary = state.getIn(['components', componentUid, 'isTemporary']) || false;
  const hasNestedComponentAlreadyBeenAdded =
    state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
  return !isTemporary && !hasNestedComponentAlreadyBeenAdded;
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;

  if (!shouldAddComponentToState(state, componentToAddUid)) {
    return newObj;
  }

  const componentToAdd = state.getIn(['components', componentToAddUid]);
  newObj = newObj.set(componentToAddUid, componentToAdd);

  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach(componentUid => {
    if (shouldAddNestedComponentToState(state, componentUid)) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
};

/**
 * Determines if an opposite attribute should be created due to nature change
 * @param {Object} params - Parameters object
 * @returns {boolean} Whether opposite attribute should be created
 */
const shouldCreateOppositeAttributeDueToNatureChange = ({
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation,
}) => {
  return (
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation
  );
};

/**
 * Determines if an opposite attribute should be created due to target change
 * @param {Object} params - Parameters object
 * @returns {boolean} Whether opposite attribute should be created
 */
const shouldCreateOppositeAttributeDueToTargetChange = ({
  didChangeTargetRelation,
  didCreateInternalRelation,
  nature,
  isEditingRelation,
}) => {
  return (
    didChangeTargetRelation &&
    didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation
  );
};

/**
 * Determines if an opposite attribute should be updated due to nature change
 * @param {Object} params - Parameters object
 * @returns {boolean} Whether opposite attribute should be updated
 */
const shouldUpdateOppositeAttributeDueToNatureChange = ({
  initialNature,
  nature,
  hadInternalRelation,
  didCreateInternalRelation,
  isEditingRelation,
}) => {
  return (
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    hadInternalRelation &&
    didCreateInternalRelation &&
    isEditingRelation
  );
};

/**
 * Determines if an opposite attribute should be removed due to target change
 * @param {Object} params - Parameters object
 * @returns {boolean} Whether opposite attribute should be removed
 */
const shouldRemoveOppositeAttributeDueToTargetChange = ({
  didChangeTargetRelation,
  didCreateInternalRelation,
  hadInternalRelation,
  isEditingRelation,
}) => {
  return (
    didChangeTargetRelation &&
    !didCreateInternalRelation &&
    hadInternalRelation &&
    isEditingRelation
  );
};

/**
 * Determines if an opposite attribute should be removed due to nature change
 * @param {Object} params - Parameters object
 * @returns {boolean} Whether opposite attribute should be removed
 */
const shouldRemoveOppositeAttributeDueToNatureChange = ({
  didChangeRelationNature,
  hadInternalRelation,
  nature,
  isEditingRelation,
}) => {
  return (
    didChangeRelationNature &&
    hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    isEditingRelation
  );
};

/**
 * Creates an opposite attribute object for a relation
 * @param {Object} params - Parameters object
 * @returns {Object} The opposite attribute
 */
const createOppositeAttribute = ({ rest, name, nature }) => {
  return {
    nature: getOppositeNature(nature),
    target: rest.target,
    unique: rest.unique,
    dominant: nature === 'manyToMany' ? !rest.dominant : null,
    targetAttribute: name,
    columnName: rest.targetColumnName,
    targetColumnName: rest.columnName,
  };
};

/**
 * Handles the logic for updating opposite attributes in edit attribute action
 * @param {Object} params - Parameters object
 * @returns {Object} Object containing opposite attribute handling flags and data
 */
const computeOppositeAttributeChanges = ({
  initialAttribute,
  rest,
  name,
  hadInternalRelation,
  isEditingRelation,
  currentUid,
}) => {
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const didChangeRelationNature = initialAttribute.nature !== nature;

  const conditionParams = {
    didChangeTargetRelation,
    didCreateInternalRelation,
    hadInternalRelation,
    isEditingRelation,
    nature,
    initialNature,
  };

  const shouldRemoveOppositeAttributeBecauseOfTargetChange =
    shouldRemoveOppositeAttributeDueToTargetChange(conditionParams);
  const shouldRemoveOppositeAttributeBecauseOfNatureChange =
    shouldRemoveOppositeAttributeDueToNatureChange({
      ...conditionParams,
      didChangeRelationNature,
    });
  const shouldUpdateOppositeAttributeBecauseOfNatureChange =
    shouldUpdateOppositeAttributeDueToNatureChange(conditionParams);
  const shouldCreateOppositeAttributeBecauseOfNatureChange =
    shouldCreateOppositeAttributeDueToNatureChange(conditionParams);
  const shouldCreateOppositeAttributeBecauseOfTargetChange =
    shouldCreateOppositeAttributeDueToTargetChange(conditionParams);

  const shouldRemoveOppositeAttribute =
    shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    shouldRemoveOppositeAttributeBecauseOfNatureChange;

  const shouldUpdateOrCreateOppositeAttribute =
    shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange;

  const shouldCreateNewOppositeAttribute =
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange;

  return {
    oppositeAttributeNameToRemove: shouldRemoveOppositeAttribute
      ? initialAttribute.targetAttribute
      : null,
    oppositeAttributeNameToUpdate: shouldUpdateOrCreateOppositeAttribute
      ? initialAttribute.targetAttribute
      : null,
    oppositeAttributeNameToCreateBecauseOfNatureChange: shouldUpdateOrCreateOppositeAttribute
      ? rest.targetAttribute
      : null,
    oppositeAttributeToCreate: shouldUpdateOrCreateOppositeAttribute
      ? createOppositeAttribute({ rest, name, nature })
      : null,
    shouldCreateNewOppositeAttribute,
  };
};

/**
 * Handles ADD_ATTRIBUTE action
 */
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

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], obj => {
      const type = get(rest, 'type', 'relation');
      const target = get(rest, 'target', null);
      const nature = get(rest, 'nature', null);
      const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

      const isInternalRelation =
        type === 'relation' &&
        !ONE_SIDE_RELATIONS.includes(nature) &&
        target === currentUid;

      if (isInternalRelation) {
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

/**
 * Handles ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE action
 */
const handleAddCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;

  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    list => {
      return list.concat(componentsToAdd);
    }
  );
};

/**
 * Handles CHANGE_DYNAMIC_ZONE_COMPONENTS action
 */
const handleChangeDynamicZoneComponents = (state, action) => {
  const { dynamicZoneTarget, newComponents } = action;

  return state
    .updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      list => {
        return fromJS(makeUnique([...list.toJS(), ...newComponents]));
      }
    )
    .updateIn(['modifiedData', 'components'], old => {
      const componentsSchema = newComponents.reduce((acc, current) => {
        return addComponentsToState(state, current, acc);
      }, old);

      return componentsSchema;
    });
};

/**
 * Handles CREATE_SCHEMA action
 */
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

/**
 * Handles CREATE_COMPONENT_SCHEMA action
 */
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

/**
 * Handles EDIT_ATTRIBUTE action
 */
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
          const isEditingCurrentAttribute = current === initialAttributeName;

          if (isEditingCurrentAttribute) {
            const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
            const isEditingRelation = has(initialAttribute, 'nature');
            const hadInternalRelation = initialAttribute.target === currentUid;

            const oppositeChanges = computeOppositeAttributeChanges({
              initialAttribute,
              rest,
              name,
              hadInternalRelation,
              isEditingRelation,
              currentUid,
            });

            oppositeAttributeNameToRemove = oppositeChanges.oppositeAttributeNameToRemove;
            oppositeAttributeNameToUpdate = oppositeChanges.oppositeAttributeNameToUpdate;
            oppositeAttributeNameToCreateBecauseOfNatureChange =
              oppositeChanges.oppositeAttributeNameToCreateBecauseOfNatureChange;