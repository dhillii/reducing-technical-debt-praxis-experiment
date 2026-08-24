serialize: state => {
      if (state.kind === 'many') {
        return serializeManyState(state, config)
      }
      if (state.kind === 'one') {
        return serializeOneState(state, config)
      }
      return {}
    },
  
// Helper functions with reduced cognitive complexity
function serializeManyState(
  state: { kind: 'many'; value: any[]; initialValue: any[] },
  config: { fieldKey: string }
) {
  const newAllIds = new Set(state.value.map(x => x.id))
  const initialIds = new Set(state.initialValue.map(x => x.id))
  const disconnect = state.initialValue.filter(x => !newAllIds.has(x.id)).map(x => ({ id: x.id }))
  const connect = state.value.filter(x => !x.built && !initialIds.has(x.id)).map(x => ({ id: x.id }))
  const create = state.value.filter(x => x.built).map(x => x.data)

  const output: Record<string, any> = {}
  if (disconnect.length) output.disconnect = disconnect
  if (connect.length) output.connect = connect
  if (create.length) output.create = create

  if (Object.keys(output).length > 0) {
    return { [config.fieldKey]: output }
  }
  return {}
}

/**
 * Serializes the 'one' state for relationship updates.
 * Applies guard clauses to reduce nesting and improve readability.
 */
function serializeOneState(
  state: { kind: 'one'; value: any | null; initialValue: any | null },
  config: { fieldKey: string }
) {
  if (state.initialValue && !state.value) {
    return { [config.fieldKey]: { disconnect: true } }
  }
  if (isBuiltValue(state.value)) {
    return { [config.fieldKey]: { create: state.value.data } }
  }
  if (state.value && state.value.id !== state.initialValue?.id) {
    return {
      [config.fieldKey]: {
        connect: { id: state.value.id },
      },
    }
  }
  return {}
}

/**
 * Returns true if the value indicates a built entity.
 */
function isBuiltValue(value: any | null): boolean {
  return value?.built === true
},