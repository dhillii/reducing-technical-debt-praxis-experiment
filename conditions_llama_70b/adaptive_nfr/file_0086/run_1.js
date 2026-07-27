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
      if (isManyState(state)) {
        return serializeManyState(state, config)
      } else if (isOneState(state)) {
        return serializeOneState(state, config)
      }
      return {}
    },
  }
}

function isManyState(state: any): boolean {
  return state.kind === 'many'
}

function isOneState(state: any): boolean {
  return state.kind === 'one'
}

function serializeManyState(state: any, config: any): any {
  const newAllIds = getNewAllIds(state.value)
  const initialIds = getInitialIds(state.initialValue)
  const disconnect = getDisconnect(state.initialValue, newAllIds)
  const connect = getConnect(state.value, initialIds)
  const create = getCreate(state.value)

  const output = {
    ...(disconnect.length ? { disconnect } : {}),
    ...(connect.length ? { connect } : {}),
    ...(create.length ? { create } : {}),
  }

  return Object.keys(output).length ? { [config.fieldKey]: output } : {}
}

function getNewAllIds(value: any[]): Set<string> {
  return new Set(value.map(x => x.id))
}

function getInitialIds(initialValue: any[]): Set<string> {
  return new Set(initialValue.map(x => x.id))
}

function getDisconnect(initialValue: any[], newAllIds: Set<string>): any[] {
  return initialValue.filter(x => !newAllIds.has(x.id)).map(x => ({ id: x.id }))
}

function getConnect(value: any[], initialIds: Set<string>): any[] {
  return value.filter(x => !x.built && !initialIds.has(x.id)).map(x => ({ id: x.id }))
}

function getCreate(value: any[]): any[] {
  return value.filter(x => x.built).map(x => x.data)
}

function serializeOneState(state: any, config: any): any {
  if (state.initialValue && !state.value) return { [config.fieldKey]: { disconnect: true } }
  if (state.value?.built) {
    return {
      [config.fieldKey]: {
        create: state.value.data,
      },
    }
  }
  if (state.value && state.value.id !== state.initialValue?.id) {
    return {
      [config.fieldKey]: {
        connect: {
          id: state.value.id,
        },
      },
    }
  }
  return {}
}