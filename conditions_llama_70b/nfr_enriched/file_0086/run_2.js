// ...

export function controller(
  config: FieldControllerConfig<
    {
      refFieldKey?: string
      refListKey: string
      many: boolean
      hideCreate: boolean
      refLabelField: string
      refSearchFields: string[]
    } & (
      | {
          displayMode: 'select'
          filter: Record<string, any> | null
          sort: ListSortDescriptor<string> | null
        }
      | { displayMode: 'count' }
      | {
          displayMode: 'table'
          refFieldKey: string
          initialSort: ListSortDescriptor<string> | null
          columns: string[] | null
        }
    )
  >
): RelationshipController {
  const { listKey, fieldKey: fieldKey, label, description } = config
  const { displayMode, hideCreate, many, refFieldKey, refLabelField, refListKey, refSearchFields } =
    config.fieldMeta

  return {
    // ...
    serialize: state => {
      if (state.kind === 'many') {
        return serializeManyRelationship(state, config.fieldKey)
      } else if (state.kind === 'one') {
        return serializeOneRelationship(state, config.fieldKey)
      }
      return {}
    },
    // ...
  }
}

/**
 * Serialize a many relationship.
 * 
 * @param state The state of the relationship.
 * @param fieldKey The key of the field.
 * @returns The serialized relationship.
 */
function serializeManyRelationship(state: any, fieldKey: string) {
  const newAllIds = new Set(state.value.map(x => x.id))
  const initialIds = new Set(state.initialValue.map(x => x.id))
  const disconnect = state.initialValue
    .filter(x => !newAllIds.has(x.id))
    .map(x => ({ id: x.id }))
  const connect = state.value
    .filter(x => !x.built && !initialIds.has(x.id))
    .map(x => ({ id: x.id }))
  const create = state.value.filter(x => x.built).map(x => x.data)
  const output = {
    ...(disconnect.length ? { disconnect } : {}),
    ...(connect.length ? { connect } : {}),
    ...(create.length ? { create } : {}),
  }

  if (Object.keys(output).length) {
    return {
      [fieldKey]: output,
    }
  }
  return {}
}

/**
 * Serialize a one relationship.
 * 
 * @param state The state of the relationship.
 * @param fieldKey The key of the field.
 * @returns The serialized relationship.
 */
function serializeOneRelationship(state: any, fieldKey: string) {
  if (state.initialValue && !state.value) return { [fieldKey]: { disconnect: true } }
  if (state.value?.built) {
    return {
      [fieldKey]: {
        create: state.value.data,
      },
    }
  }
  if (state.value && state.value.id !== state.initialValue?.id) {
    return {
      [fieldKey]: {
        connect: {
          id: state.value.id,
        },
      },
    }
  }
  return {}
}