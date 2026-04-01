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
  const oppositeMap = {
    manyToOne: 'oneToMany',
    oneToMany: 'manyToOne',
  };
  return oppositeMap[originalNature] || originalNature;
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

const createOppositeAttribute = (rest, name, nature) => ({
  nature: getOppositeNature(nature),
  target: rest.target,
  unique: rest.unique,
  dominant: nature === 'manyToMany' ? !rest.dominant : null,
  targetAttribute: name,
  columnName: rest.targetColumnName,
  targetColumnName: rest.columnName,
});

const shouldCreateOppositeRelation = (type, nature, target, currentUid) => {
  return (
    type === 'relation' &&
    nature !== 'oneWay' &&
    nature !== 'manyWay' &&
    target === currentUid
  );
};

const handleAddAttributeCase = (state, action) => {
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

      if (shouldCreateOppositeRelation(type, nature, target, currentUid)) {
        const oppositeAttribute = createOppositeAttribute(rest, name, nature);
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
};

const buildEditAttributeReducer = (state, action) => {
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
    const currentUid = state.getIn(['modifiedData', ...pathToDataToEdit, 'uid']);
    const attributeProcessor = new EditAttributeProcessor(
      initialAttribute,
      rest,
      name,
      currentUid,
      obj
    );

    const newObj = OrderedMap(
      obj
        .get('attributes')
        .keySeq()
        .reduce((acc, current) => attributeProcessor.process(acc, current), {})
    );

    let updatedObj = attributeProcessor.oppositeAttributeNameToRemove !== null
      ? newObj.remove(attributeProcessor.oppositeAttributeNameToRemove)
      : newObj;

    return obj.set('attributes', updatedObj);
  });
};

class EditAttributeProcessor {
  constructor(initialAttribute, rest, name, currentUid, obj) {
    this.initialAttribute = initialAttribute;
    this.rest = rest;
    this.name = name;
    this.currentUid = currentUid;
    this.obj = obj;
    this.oppositeAttributeNameToRemove = null;
    this.oppositeAttributeNameToUpdate = null;
    this.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
    this.oppositeAttributeToCreate = null;
  }

  process(acc, current) {
    const isEditingCurrentAttribute = current === this.initialAttribute.name;

    if (!isEditingCurrentAttribute) {
      if (current === this.oppositeAttributeNameToUpdate) {
        acc[this.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
          this.oppositeAttributeToCreate
        );
      } else {
        acc[current] = this.obj.getIn(['attributes', current]);
      }
      return acc;
    }

    return this.processEditingAttribute(acc);
  }

  processEditingAttribute(acc) {
    const isEditingRelation = has(this.initialAttribute, 'nature');
    if (!isEditingRelation) {
      acc[this.name] = fromJS(this.rest);
      return acc;
    }

    const conditions = this.evaluateConditions();
    this.setOppositeAttributeActions(conditions);

    if (conditions.shouldRemoveOpposite) {
      this.oppositeAttributeNameToRemove = this.initialAttribute.targetAttribute;
      acc[this.name] = fromJS(this.rest);
      return acc;
    }

    if (conditions.shouldUpdateOrCreateOpposite) {
      this.setupOppositeAttributeCreation();
      acc[this.name] = fromJS(this.rest);

      if (conditions.shouldCreateOpposite) {
        acc[this.oppositeAttributeNameToCreateBecauseOfNatureChange] = fromJS(
          this.oppositeAttributeToCreate
        );
        this.oppositeAttributeToCreate = null;
        this.oppositeAttributeNameToCreateBecauseOfNatureChange = null;
      }

      return acc;
    }

    acc[this.name] = fromJS(this.rest);
    return acc;
  }

  evaluateConditions() {
    const didChangeTargetRelation = this.initialAttribute.target !== this.rest.target;
    const didCreateInternalRelation = this.rest.target === this.currentUid;
    const nature = this.rest.nature;
    const initialNature = this.initialAttribute.nature;
    const hadInternalRelation = this.initialAttribute.target === this.currentUid;
    const didChangeRelationNature = initialNature !== nature;

    return {
      didChangeTargetRelation,
      didCreateInternalRelation,
      hadInternalRelation,
      didChangeRelationNature,
      nature,
      initialNature,
      shouldRemoveOpposite:
        (didChangeTargetRelation && !didCreateInternalRelation && hadInternalRelation) ||
        (didChangeRelationNature && hadInternalRelation && ONE_SIDE_RELATIONS.includes(nature)),
      shouldUpdateOrCreateOpposite:
        (!ONE_SIDE_RELATIONS.includes(initialNature) &&
          !ONE_SIDE_RELATIONS.includes(nature) &&
          hadInternalRelation &&
          didCreateInternalRelation) ||
        (ONE_SIDE_RELATIONS.includes(initialNature) &&
          !ONE_SIDE_RELATIONS.includes(nature) &&
          hadInternalRelation &&
          didCreateInternalRelation) ||
        (didChangeTargetRelation && didCreateInternalRelation && !ONE_SIDE_RELATIONS.includes(nature)),
      shouldCreateOpposite:
        (ONE_SIDE_RELATIONS.includes(initialNature) &&
          !ONE_SIDE_RELATIONS.includes(nature) &&
          hadInternalRelation &&
          didCreateInternalRelation) ||
        (didChangeTargetRelation && didCreateInternalRelation && !ONE_SIDE_RELATIONS.includes(nature)),
    };
  }

  setOppositeAttributeActions(conditions) {
    if (conditions.shouldUpdateOrCreateOpposite) {
      this.oppositeAttributeNameToUpdate = this.initialAttribute.targetAttribute;
      this.oppositeAttributeNameToCreateBecauseOfNatureChange = this.rest.targetAttribute;
    }
  }

  setupOppositeAttributeCreation() {
    this.oppositeAttributeToCreate = {
      nature: getOppositeNature(this.rest.nature),
      target: this.rest.target,
      unique: this.rest.unique,
      dominant: this.rest.nature === 'manyToMany' ? !this.rest.dominant : null,
      targetAttribute: this.name,
      columnName: this.rest.targetColumnName,
      targetColumnName: this.rest.columnName,
    };
  }
}

const handleRemoveFieldCase = (state, action) => {
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

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case actions.ADD_ATTRIBUTE:
      return handleAddAttributeCase(state, action);

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

    case actions.CHANGE_DYNAMIC_ZONE_COMPONENTS: {
      const { dynamicZoneTarget, newComponents } = action;
      return state
        .updateIn(
          ['modifiedData', 'contentType', 'schema', 'attributes', dynamicZoneTarget, 'components'],
          list => fromJS(makeUnique([...list.toJS(), ...newComponents]))
        )
        .updateIn(['modifiedData', 'components'], old => {
          return newComponents.reduce((acc, current) => {
            return addComponentsToState(state, current, acc);
          }, old);
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

    case actions.DELETE_NOT_SAVED_TYPE:
      return state
        .update('contentTypes', () => state.get('initialContentTypes'))
        .update('components', () => state.get('initialComponents'));

    case actions.EDIT_ATTRIBUTE:
      return buildEditAttributeReducer(state, action);

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