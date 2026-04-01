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

// Helper: Determine if opposite attribute should be created for self-referential relations
const shouldCreateOppositeAttributeForSelfRelation = (type, nature, target, currentUid, rest) => {
  return (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  );
};

// Helper: Build opposite attribute for self-referential relations
const buildOppositeAttribute = (nature, target, rest, name) => {
  return {
    nature: getOppositeNature(nature),
    target,
    unique: rest.unique,
    dominant: nature === 'manyToMany' ? !rest.dominant : null,
    targetAttribute: name,
    columnName: rest.targetColumnName,
    targetColumnName: rest.columnName,
  };
};

// Helper: Handle ADD_ATTRIBUTE action
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

      if (shouldCreateOppositeAttributeForSelfRelation(type, nature, target, currentUid, rest)) {
        const oppositeAttribute = buildOppositeAttribute(nature, target, rest, name);
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

// Helper: Determine edit attribute conditions
const evaluateEditAttributeConditions = (
  initialAttribute,
  rest,
  currentUid,
  isEditingRelation
) => {
  const didChangeTargetRelation = initialAttribute.target !== rest.target;
  const didCreateInternalRelation = rest.target === currentUid;
  const nature = rest.nature;
  const initialNature = initialAttribute.nature;
  const hadInternalRelation = initialAttribute.target === currentUid;
  const didChangeRelationNature = initialAttribute.nature !== nature;

  return {
    didChangeTargetRelation,
    didCreateInternalRelation,
    nature,
    initialNature,
    hadInternalRelation,
    didChangeRelationNature,
    shouldRemoveOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation &&
      !didCreateInternalRelation &&
      hadInternalRelation &&
      isEditingRelation,
    shouldRemoveOppositeAttributeBecauseOfNatureChange:
      didChangeRelationNature &&
      hadInternalRelation &&
      ONE_SIDE_RELATIONS.includes(nature) &&
      isEditingRelation,
    shouldUpdateOppositeAttributeBecauseOfNatureChange:
      !ONE_SIDE_RELATIONS.includes(initialNature) &&
      !ONE_SIDE_RELATIONS.includes(nature) &&
      hadInternalRelation &&
      didCreateInternalRelation &&
      isEditingRelation,
    shouldCreateOppositeAttributeBecauseOfNatureChange:
      ONE_SIDE_RELATIONS.includes(initialNature) &&
      !ONE_SIDE_RELATIONS.includes(nature) &&
      hadInternalRelation &&
      didCreateInternalRelation &&
      isEditingRelation,
    shouldCreateOppositeAttributeBecauseOfTargetChange:
      didChangeTargetRelation &&
      didCreateInternalRelation &&
      !ONE_SIDE_RELATIONS.includes(nature),
  };
};

// Helper: Process attribute during edit
const processEditAttributeIteration = (
  current,
  initialAttributeName,
  initialAttribute,
  rest,
  name,
  state,
  pathToDataToEdit,
  obj,
  conditions
) => {
  const acc = {};
  let oppositeAttributeNameToRemove = null;
  let oppositeAttributeNameToUpdate = null;
  let oppositeAttributeNameToCreateBecauseOfNatureChange = null;
  let oppositeAttributeToCreate = null;

  if (current === initialAttributeName) {
    const isEditingRelation = has(initialAttribute, 'nature');
    const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
    const conds = evaluateEditAttributeConditions(
      initialAttribute,
      rest,
      currentUid,
      isEditingRelation
    );

    if (
      conds.shouldRemoveOppositeAttributeBecauseOfTargetChange ||
      conds.shouldRemoveOppositeAttributeBecauseOfNatureChange
    ) {
      oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
    }

    if (
      conds.shouldUpdateOppositeAttributeBecauseOfNatureChange ||
      conds.shouldCreateOppositeAttributeBecauseOfNatureChange ||
      conds.shouldCreateOppositeAttributeBecauseOfTargetChange
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
        conds.shouldCreateOppositeAttributeBecauseOfNatureChange ||
        conds.shouldCreateOppositeAttributeBecauseOfTargetChange
      ) {
        acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
          oppositeAttributeToCreate
        );
        oppositeAttributeToCreate = null;
        oppositeAttributeNameToCreateBecauseOfNatureChange = null;
      }

      return { acc, oppositeAttributeNameToRemove, oppositeAttributeNameToUpdate, oppositeAttributeToCreate, oppositeAttributeNameToCreateBecauseOfNatureChange };
    }

    acc[name] = fromJS(rest);
  } else if (current === oppositeAttributeNameToUpdate) {
    acc[oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
      oppositeAttributeToCreate
    );
  } else {
    acc[current] = obj.getIn(['attributes', current]);
  }

  return { acc, oppositeAttributeNameToRemove, oppositeAttributeNameToUpdate, oppositeAttributeToCreate, oppositeAttributeNameToCreateBecauseOfNatureChange };
};

// Helper: Handle EDIT_ATTRIBUTE action
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
          const result = processEditAttributeIteration(
            current,
            initialAttributeName,
            initialAttribute,
            rest,
            name,
            state,
            pathToDataToEdit,
            obj,
            {}
          );

          oppositeAttributeNameToRemove = result.oppositeAttributeNameToRemove;
          oppositeAttributeNameToUpdate = result.oppositeAttributeNameToUpdate;
          oppositeAttributeNameToCreateBecauseOfNatureChange = result.oppositeAttributeNameToCreateBecauseOfNatureChange;
          oppositeAttributeToCreate = result.oppositeAttributeToCreate;

          return { ...acc, ...result.acc };
        }, {})
    );

    let updatedObj = oppositeAttributeNameToRemove !== null
      ? newObj.remove(oppositeAttributeNameToRemove)
      : newObj;

    return obj.set('attributes', updatedObj);
  });
};

// Helper: Handle REMOVE_FIELD action
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

  return state.removeIn(pathToAttributeToRemove).updateIn([...pathToAttributes], attributes => {
    return attributes.keySeq().reduce((acc, current) => {
      if (acc.getIn([current, 'targetField']) === attributeToRemoveName) {
        return acc.removeIn([current, 'targetField']);
      }

      return acc;
    }, attributes);
  });
};

// Helper: Handle UPDATE_SCHEMA action
const handleUpdateSchema = (state, action) => {
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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return handleAddAttribute(state, action);

    case actions.ADD_CREATED_COMPONENT_TO_DYNAMIC_ZONE: {
      const { dynamicZoneTarget, componentsToAdd } = action;

      return state.updateIn(
        ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
        list => {
          return list.concat(componentsToAdd);
        }
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
          list => {
            return fromJS(makeUnique([...list.toJS(), ...newComponents]));
          }
        )
        .updateIn(['modifiedData', 'components'], old => {
          const componentsSchema = newComponents.reduce((acc, current) => {
            return addComponentsToState(state, current, acc);