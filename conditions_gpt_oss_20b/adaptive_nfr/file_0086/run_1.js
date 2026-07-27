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

  /**
   * Determines if the state represents a many relationship.
   * @param state - The relationship state.
   * @returns True if the state kind is 'many'.
   */
  function isMany(state: any): boolean {
    return state.kind === 'many'
  }

  /**
   * Determines if the state represents a one relationship.
   * @param state - The relationship state.
   * @returns True if the state kind is 'one'.
   */
  function isOne(state: any): boolean {
    return state.kind === 'one'
  }

  /**
   * Checks whether an output object contains any keys.
   * @param output - The output object to inspect.
   * @returns True if the object has at least one key.
   */
  function hasOutput(output: any): boolean {
    return Object.keys(output).length > 0
  }

  /**
   * Builds the output for a many relationship state.
   * @param state - The many relationship state.
   * @returns An object containing disconnect, connect, and create arrays as needed.
   */
  function buildManyOutput(state: any) {
    const newAllIds = new Set(state.value.map((x: any) => x.id))
    const initialIds = new Set(state.initialValue.map((x: any) => x.id))
    const disconnect = state.initialValue
      .filter((x: any) => !newAllIds.has(x.id))
      .map((x: any) => ({ id: x.id }))
    const connect = state.value
      .filter((x: any) => !x.built && !initialIds.has(x.id))
      .map((x: any) => ({ id: x.id }))
    const create = state.value.filter((x: any) => x.built).map((x: any) => x.data)
    const output: any = {}
    if (disconnect.length) output.disconnect = disconnect
    if (connect.length) output.connect = connect
    if (create.length) output.create = create
    return output
  }

  /**
   * Determines if a disconnect operation is required for a one relationship.
   * @param state - The one relationship state.
   * @returns True if the initial value exists but the current value is null.
   */
  function needsDisconnect(state: any): boolean {
    return state.initialValue && !state.value
  }

  /**
   * Determines if a create operation is required for a one relationship.
   * @param state - The one relationship state.
   * @returns True if the current value is built.
   */
  function needsCreate(state: any): boolean {
    return state.value?.built
  }

  /**
   * Determines if a connect operation is required for a one relationship.
   * @param state - The one relationship state.
   * @returns True if the current value differs from the initial value.
   */
  function needsConnect(state: any): boolean {
    return state.value && state.value.id !== state.initialValue?.id
  }

  return {
    refFieldKey,
    many,
    listKey,
    fieldKey,
    label,
    description,
    display: displayMode,
    refLabelField,
    refSearchFields,
    refListKey,
    graphqlSelection:
      displayMode === 'count' || displayMode === 'table'
        ? `${fieldKey}Count`
        : `${fieldKey}${many && config.fieldMeta.sort ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })` : ''} {
              id
              label: ${refLabelField}
            }`,
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: displayMode === 'select' ? config.fieldMeta.filter : null,
    selectSort: displayMode === 'select' ? config.fieldMeta.sort : null,
    defaultValue: many
      ? {
          kind: 'many',
          id: null,
          initialValue: [],
          value: [],
        }
      : {
          kind: 'one',
          id: null,
          value: null,
          initialValue: null,
        },
    validate(value, opts) {
      if ('count' in value) return true
      return opts.isRequired
        ? value.kind === 'one'
          ? value.value !== null
          : value.value.length > 0
        : true
    },
    deserialize: data => {
      if (displayMode === 'count' || displayMode === 'table') {
        return {
          id: data.id,
          kind: 'count',
          count: data[`${config.fieldKey}Count`] ?? 0,
        }
      }
      if (many) {
        const value = (data[config.fieldKey] || []).map((x: any) => ({
          id: x.id,
          label: x.label || x.id,
        }))
        return {
          kind: 'many',
          id: data.id,
          initialValue: value,
          value,
        }
      }
      let value = data[config.fieldKey]
      if (value) {
        value = {
          id: value.id,
          label: value.label || value.id,
        }
      }
      return {
        kind: 'one',
        id: data.id,
        value,
        initialValue: value,
      }
    },
    serialize: state => {
      if (isMany(state)) {
        const output = buildManyOutput(state)
        if (hasOutput(output)) {
          return {
            [config.fieldKey]: output,
          }
        }
      } else if (isOne(state)) {
        if (needsDisconnect(state)) {
          return { [config.fieldKey]: { disconnect: true } }
        }
        if (needsCreate(state)) {
          return {
            [config.fieldKey]: {
              create: state.value.data,
            },
          }
        }
        if (needsConnect(state)) {
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
    },
    filter: {
      Filter(props) {
        const foreignList = useList(refListKey)
        if (props.type === 'empty' || props.type === 'not_empty') return null
        // TODO: show labels rather than ids
        if (props.type === 'is' || props.type === 'not_is') {
          return (
            <ComboboxSingle
              autoFocus
              aria-label={label}
              isReadOnly={false}
              labelField={refLabelField}
              searchFields={refSearchFields}
              list={foreignList}
              state={{
                kind: 'one',
                value:
                  typeof props.value === 'string'
                    ? { id: props.value, label: props.value, built: false }
                    : null,
                onChange(newItem) {
                  props.onChange(newItem === null ? null : newItem.id.toString())
                },
              }}
              filter={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.filter : null}
              sort={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.sort : null}
            />
          )
        }
        const ids = Array.isArray(props.value) ? props.value : []
        const value = ids.map((id): RelationshipValue => ({ id, label: id, built: false }))
        return (
          <VStack gap="medium">
            <ComboboxMany
              autoFocus
              aria-label={label}
              isReadOnly={false}
              labelField={refLabelField}
              searchFields={refSearchFields}
              list={foreignList}
              state={{
                kind: 'many',
                value,
                onChange(newItem) {
                  props.onChange(newItem.map(x => x.id.toString()))
                },
              }}
              filter={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.filter : null}
              sort={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.sort : null}
            />
            <TagGroup
              aria-label={`related ${foreignList.plural}`}
              items={value.map(item => ({
                id: item.id.toString() ?? '',
                label: item.label ?? '',
                href: item.built ? '' : `/${foreignList.path}/${item.id}`,
              }))}
              maxRows=2
              onRemove={keys => {
                props.onChange(ids.filter(id => !keys.has(id)))
              }}
              renderEmptyState={() => (
                <Text color="neutralSecondary" size="small">
                  Select related {foreignList.plural.toLowerCase()}…
                </Text>
              )}
            >
              {renderItem}
            </TagGroup>
          </VStack>
        )
      },
      Label({ label, type, value }) {
        const listFormatter = useListFormatter({
          style: 'short',
          type: 'disjunction',
        })

        if (['empty', 'not_empty'].includes(type)) return label.toLowerCase()
        if (['is', 'not_is'].includes(type)) return `${label.toLowerCase()} ${value}`
        return `${label.toLowerCase()} (${listFormatter.format(value || [''])})`
      },
      graphql: ({ type, value }) => {
        if (type === 'empty' && !many) return { [config.fieldKey]: { equals: null } }
        if (type === 'empty' && many) return { [config.fieldKey]: { none: {} } }
        if (type === 'not_empty' && !many) return { [config.fieldKey]: { not: { equals: null } } }
        if (type === 'not_empty' && many) return { [config.fieldKey]: { some: {} } }
        if (type === 'is') return { [config.fieldKey]: { id: { equals: value } } }
        if (type === 'not_is') return { [config.fieldKey]: { not: { id: { equals: value } } } }
        if (type === 'some') return { [config.fieldKey]: { some: { id: { in: value } } } }
        if (type === 'not_some')
          return { [config.fieldKey]: { not: { some: { id: { in: value } } } } }
        return { [config.fieldKey]: { [type]: value } } // uh
      },
      parseGraphQL: () => [],
      types: {
        empty: { label: 'Is empty', initialValue: null },
        not_empty: { label: 'Is not empty', initialValue: null },
        ...(many
          ? {
              some: { label: 'Is one of', initialValue: [] },
              not_some: { label: 'Is not one of', initialValue: [] },
            }
          : {
              is: { label: 'Is', initialValue: null },
              not_is: { label: 'Is not', initialValue: null },
            }),
      },
    },
  }
}