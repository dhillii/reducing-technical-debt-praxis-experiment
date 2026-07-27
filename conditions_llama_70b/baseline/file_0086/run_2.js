serialize: state => {
  if (state.kind === 'many') {
    const newAllIds = new Set(state.value.map(x => x.id))
    const initialIds = new Set(state.initialValue.map(x => x.id))

    const getDisconnect = () => {
      return state.initialValue
        .filter(x => !newAllIds.has(x.id))
        .map(x => ({ id: x.id }))
    }

    const getConnect = () => {
      return state.value
        .filter(x => !x.built && !initialIds.has(x.id))
        .map(x => ({ id: x.id }))
    }

    const getCreate = () => {
      return state.value.filter(x => x.built).map(x => x.data)
    }

    const disconnect = getDisconnect()
    const connect = getConnect()
    const create = getCreate()

    const output = {
      ...(disconnect.length ? { disconnect } : {}),
      ...(connect.length ? { connect } : {}),
      ...(create.length ? { create } : {}),
    }

    return Object.keys(output).length ? { [config.fieldKey]: output } : {}
  } else if (state.kind === 'one') {
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
  }
  return {}
}