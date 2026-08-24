const newAllIds = new Set(state.value.map(x => x.id))
        const initialIds = new Set(state.initialValue.map(x => x.id))
        const disconnect = state.initialValue
          .filter(x => !newAllIds.has(x.id))
          .map(x => ({ id: x.id }))
        const connect = state.value
          .filter(x => !x.built && !initialIds.has(x.id))
          .map(x => ({ id: x.id }))
        const create = state.value.filter(x => x.built).map(x => x.data)
        const output = []
        if (disconnect.length) output.push({ disconnect })
        if (connect.length) output.push({ connect })
        if (create.length) output.push({ create })
        if (!output.length) return {}
        const combined = output.reduce((acc, item) => Object.assign(acc, item), {})
        return {
          [config.fieldKey]: combined,
        }