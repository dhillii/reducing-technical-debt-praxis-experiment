serialize: state => {
  if (state.kind === 'many') {
    const newAllIds = new Set(state.value.map(x => x.id))
    const initialIds = new Set(state.initialValue.map(x => x.id))
    const changes = getChanges(state, newAllIds, initialIds)
    return changes.length ? { [config.fieldKey]: changes } : {}
  } else if (state.kind === 'one') {
    return getOneChange(state, config.fieldKey)
  }
  return {}
}

const getChanges = (state, newAllIds, initialIds) => {
  const disconnect = state.initialValue
    .filter(x => !newAllIds.has(x.id))
    .map(x => ({ id: x.id }))
  const connect = state.value
    .filter(x => !x.built && !initialIds.has(x.id))
    .map(x => ({ id: x.id }))
  const create = state.value.filter(x => x.built).map(x => x.data)
  const changes = {
    ...(disconnect.length ? { disconnect } : {}),
    ...(connect.length ? { connect } : {}),
    ...(create.length ? { create } : {}),
  }
  return Object.keys(changes).length ? changes : []
}

const getOneChange = (state, fieldKey) => {
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