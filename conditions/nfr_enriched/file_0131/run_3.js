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

const getOppositeNature = (originalNature) => {
  const oppositeMap = {
    manyToOne: 'oneToMany',
    oneToMany: 'manyToOne',
  };
  return oppositeMap[originalNature] || originalNature;
};

const isComponentAlreadyAdded = (state, componentUid) => {
  return state.getIn(['modifiedData', 'components', componentUid]) !== undefined;
};

const isTemporaryComponent = (state, componentUid) => {
  return state.getIn(['components', componentUid, 'isTemporary']) || false;
};

const shouldAddComponent = (state, componentUid) => {
  return !isTemporaryComponent(state, componentUid) && !isComponentAlreadyAdded(state, componentUid);
};

const addComponentsToState = (state, componentToAddUid, objToUpdate) => {
  let newObj = objToUpdate;
  const componentToAdd = state.getIn(['components', componentToAddUid]);

  if (!shouldAddComponent(state, componentToAddUid)) {
    return newObj;
  }

  newObj = newObj.set(componentToAddUid, componentToAdd);
  const componentToAddSchema = componentToAdd.getIn(['schema', 'attributes']);
  const nestedComponents = retrieveComponentsFromSchema(
    componentToAddSchema.toJS(),
    state.get('components').toJS()
  );

  nestedComponents.forEach((componentUid) => {
    if (shouldAddComponent(state, componentUid)) {
      newObj = newObj.set(componentUid, state.getIn(['components', componentUid]));
    }
  });

  return newObj;
};

const createOppositeAttribute = (rest, name, nature) => ({
  nature: getOppositeNature(nature),
  target: rest.target,
  unique: rest.unique,
  dominant: nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

const shouldCreateOppositeAttribute = (type, nature, target, currentUid) => {
  return (
    type === 'relation' &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    target === currentUid
  );
};

const handleAddAttributeRelation = (obj, rest, name, currentUid) => {
  if (!shouldCreateOppositeAttribute(rest.type, rest.nature, rest.target, currentUid)) {
    return obj;
  }

  const oppositeAttribute = createOppositeAttribute(rest, name, rest.nature);
  return obj.update(rest.targetAttribute, () => fromJS(oppositeAttribute));
};

const getPathToDataToEdit = (forTarget, targetUid) => {
  return ['component', 'contentType'].includes(forTarget) ? [forTarget] : [forTarget, targetUid];
};

const handleAddAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
  } = action;
  delete rest.createComponent;

  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  return state
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', name], () => {
      return fromJS(rest);
    })
    .updateIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes'], (obj) => {
      return handleAddAttributeRelation(obj, rest, name, currentUid);
    })
    .updateIn(['modifiedData', 'components'], (existingCompos) => {
      if (action.shouldAddComponentToData) {
        return addComponentsToState(state, rest.component, existingCompos);
      }
      return existingCompos;
    });
};

const handleAddCreatedComponentToDynamicZone = (state, action) => {
  const { dynamicZoneTarget, componentsToAdd } = action;

  return state.updateIn(
    ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
    (list) => list.concat(componentsToAdd)
  );
};

const handleChangeDynamicZoneComponents = (state, action) => {
  const { dynamicZoneTarget, newComponents } = action;

  return state
    .updateIn(
      ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
      (list) => fromJS(makeUnique([...list.toJS(), ...newComponents]))
    )
    .updateIn(['modifiedData', 'components'], (old) => {
      return newComponents.reduce((acc, current) => {
        return addComponentsToState(state, current, acc);
      }, old);
    });
};

const createNewSchema = (uid, data, isComponent = false, componentCategory = null) => {
  const schema = {
    uid,
    isTemporary: true,
    schema: {
      ...data,
      attributes: {},
    },
  };

  if (isComponent) {
    schema.category = componentCategory;
  }

  return schema;
};

const handleCreateSchema = (state, action) => {
  const newSchema = createNewSchema(action.uid, action.data);
  return state.updateIn(['contentTypes', action.uid], () => fromJS(newSchema));
};

const handleCreateComponentSchema = (state, action) => {
  const newSchema = createNewSchema(action.uid, action.data, true, action.componentCategory);

  let newState = state.updateIn(['components', action.uid], () => fromJS(newSchema));

  if (action.shouldAddComponentToData) {
    newState = newState.updateIn(['modifiedData', 'components', action.uid], () =>
      fromJS(newSchema)
    );
  }

  return newState;
};

const RelationConditions = {
  didChangeTargetRelation: (initialAttribute, rest) =>
    initialAttribute.target !== rest.target,
  didCreateInternalRelation: (rest, currentUid) => rest.target === currentUid,
  hadInternalRelation: (initialAttribute, currentUid) =>
    initialAttribute.target === currentUid,
  didChangeRelationNature: (initialAttribute, rest) =>
    initialAttribute.nature !== rest.nature,
  isEditingRelation: (initialAttribute) => has(initialAttribute, 'nature'),
};

const RelationRules = {
  shouldRemoveOppositeAttributeBecauseOfTargetChange: (conditions) =>
    conditions.didChangeTargetRelation &&
    !conditions.didCreateInternalRelation &&
    conditions.hadInternalRelation &&
    conditions.isEditingRelation,

  shouldRemoveOppositeAttributeBecauseOfNatureChange: (conditions, nature) =>
    conditions.didChangeRelationNature &&
    conditions.hadInternalRelation &&
    ONE_SIDE_RELATIONS.includes(nature) &&
    conditions.isEditingRelation,

  shouldUpdateOppositeAttributeBecauseOfNatureChange: (conditions, initialNature, nature) =>
    !ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    conditions.hadInternalRelation &&
    conditions.didCreateInternalRelation &&
    conditions.isEditingRelation,

  shouldCreateOppositeAttributeBecauseOfNatureChange: (conditions, initialNature, nature) =>
    ONE_SIDE_RELATIONS.includes(initialNature) &&
    !ONE_SIDE_RELATIONS.includes(nature) &&
    conditions.hadInternalRelation &&
    conditions.didCreateInternalRelation &&
    conditions.isEditingRelation,

  shouldCreateOppositeAttributeBecauseOfTargetChange: (conditions, nature) =>
    conditions.didChangeTargetRelation &&
    conditions.didCreateInternalRelation &&
    !ONE_SIDE_RELATIONS.includes(nature),
};

const evaluateRelationConditions = (initialAttribute, rest, currentUid) => {
  return {
    didChangeTargetRelation: RelationConditions.didChangeTargetRelation(initialAttribute, rest),
    didCreateInternalRelation: RelationConditions.didCreateInternalRelation(rest, currentUid),
    hadInternalRelation: RelationConditions.hadInternalRelation(initialAttribute, currentUid),
    didChangeRelationNature: RelationConditions.didChangeRelationNature(initialAttribute, rest),
    isEditingRelation: RelationConditions.isEditingRelation(initialAttribute),
  };
};

const evaluateRelationRules = (conditions, initialAttribute, rest) => {
  const initialNature = initialAttribute.nature;
  const nature = rest.nature;

  return {
    shouldRemoveOppositeAttributeBecauseOfTargetChange:
      RelationRules.shouldRemoveOppositeAttributeBecauseOfTargetChange(conditions),
    shouldRemoveOppositeAttributeBecauseOfNatureChange:
      RelationRules.shouldRemoveOppositeAttributeBecauseOfNatureChange(conditions, nature),
    shouldUpdateOppositeAttributeBecauseOfNatureChange:
      RelationRules.shouldUpdateOppositeAttributeBecauseOfNatureChange(
        conditions,
        initialNature,
        nature
      ),
    shouldCreateOppositeAttributeBecauseOfNatureChange:
      RelationRules.shouldCreateOppositeAttributeBecauseOfNatureChange(
        conditions,
        initialNature,
        nature
      ),
    shouldCreateOppositeAttributeBecauseOfTargetChange:
      RelationRules.shouldCreateOppositeAttributeBecauseOfTargetChange(conditions, nature),
  };
};

const processAttributeInEditLoop = (
  acc,
  current,
  initialAttributeName,
  name,
  rest,
  initialAttribute,
  state,
  pathToDataToEdit,
  rules,
  oppositeAttributeState
) => {
  const isEditingCurrentAttribute = current === initialAttributeName;

  if (!isEditingCurrentAttribute) {
    if (current === oppositeAttributeState.oppositeAttributeNameToUpdate) {
      acc[oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        oppositeAttributeState.oppositeAttributeToCreate
      );
    } else {
      acc[current] = state.getIn(['modifiedData', ...pathToDataToEdit, 'schema', 'attributes', current]);
    }
    return acc;
  }

  const {
    shouldRemoveOppositeAttributeBecauseOfTargetChange,
    shouldRemoveOppositeAttributeBecauseOfNatureChange,
    shouldUpdateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfNatureChange,
    shouldCreateOppositeAttributeBecauseOfTargetChange,
  } = rules;

  if (
    shouldRemoveOppositeAttributeBecauseOfTargetChange ||
    shouldRemoveOppositeAttributeBecauseOfNatureChange
  ) {
    oppositeAttributeState.oppositeAttributeNameToRemove = initialAttribute.targetAttribute;
  }

  if (
    shouldUpdateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfNatureChange ||
    shouldCreateOppositeAttributeBecauseOfTargetChange
  ) {
    oppositeAttributeState.oppositeAttributeNameToUpdate = initialAttribute.targetAttribute;
    oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange =
      rest.targetAttribute;
    oppositeAttributeState.oppositeAttributeToCreate = createOppositeAttribute(
      rest,
      name,
      rest.nature
    );

    acc[name] = fromJS(rest);

    if (
      shouldCreateOppositeAttributeBecauseOfNatureChange ||
      shouldCreateOppositeAttributeBecauseOfTargetChange
    ) {
      acc[oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
        oppositeAttributeState.oppositeAttributeToCreate
      );
      oppositeAttributeState.oppositeAttributeToCreate = null;
      oppositeAttributeState.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    }

    return acc;
  }

  acc[name] = fromJS(rest);
  return acc;
};

const handleEditAttribute = (state, action) => {
  const {
    attributeToSet: { name, ...rest },
    forTarget,
    targetUid,
    initialAttribute,
  } = action;

  const initialAttributeName = get(initialAttribute, ['name'], '');
  const pathToDataToEdit = getPathToDataToEdit(forTarget, targetUid);
  const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);

  return state.updateIn(['modifiedData', ...pathToDataToEdit, 'schema'], (obj) => {
    const oppositeAttributeState = {
      oppositeAttributeNameToRemove: null,
      oppositeAttributeNameToUpdate: null,
      oppositeAttributeNameToCreateBecauseOfNatureChange: null,
      oppositeAttributeToCreate: null,
    };

    const conditions = evaluateRelationConditions(initialAttribute, rest, currentUid);
    const rules = evaluateRelationRules(conditions, initialAttribute, rest);

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => {
          return processAttributeInEditLoop(
            acc,
            current,
            initialAttributeName,
            name,
            rest,
            initialAttribute,
            state,
            pathToDataToEdit,
            rules,
            oppositeAttributeState
          );
        }, {})
    );

    let updatedObj =
      oppositeAttributeState.oppositeAttributeNameToRemove !== null
        ? newObj.remove(oppositeAttributeState.oppositeAttributeNameToRemove)
        : newObj;

    return obj.set('attributes', updatedObj);
  });
};

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