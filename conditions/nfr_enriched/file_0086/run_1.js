import { useListFormatter } from '@react-aria/i18n'
import { Fragment, useState } from 'react'

import { DialogContainer } from '@keystar/ui/dialog'
import { HStack, VStack } from '@keystar/ui/layout'
import { TextLink } from '@keystar/ui/link'
import { Item, TagGroup } from '@keystar/ui/tag'
import { TextField } from '@keystar/ui/text-field'
import { Numeral, Text } from '@keystar/ui/typography'

import { BuildItemDialog } from '../../../../admin-ui/components'
import { useList } from '../../../../admin-ui/context'
import type {
  CellComponent,
  FieldControllerConfig,
  FieldProps,
  ListSortDescriptor,
} from '../../../../types'

import { ActionButton } from '@keystar/ui/button'
import { Icon } from '@keystar/ui/icon'
import { arrowUpRightIcon } from '@keystar/ui/icon/icons/arrowUpRightIcon'
import { ComboboxMany } from './ComboboxMany'
import { ComboboxSingle } from './ComboboxSingle'
import {
  buildQueryForRelationshipFieldWithForeignField,
  ContextualActions,
} from './ContextualActions'
import { RelationshipTable } from './RelationshipTable'
import type { RelationshipController, RelationshipValue } from './types'

export { ComboboxMany, ComboboxSingle }

// Renders count display with optional link to foreign list
function renderCountDisplay(
  field: any,
  value: any,
  foreignList: any
) {
  const textField = (
    <TextField
      autoFocus={field.autoFocus}
      label={field.label}
      description={field.description}
      isReadOnly
      value={value.count.toString()}
      width="alias.singleLineWidth"
    />
  )
  if (!field.refFieldKey) return textField
  return (
    <HStack gap="small" alignItems="end">
      {textField}
      <ActionButton
        href={`/${foreignList.path}?${buildQueryForRelationshipFieldWithForeignField(foreignList, field.refFieldKey, value.id)}`}
      >
        <Icon src={arrowUpRightIcon} />
      </ActionButton>
    </HStack>
  )
}

// Renders the appropriate combobox based on relationship kind
function renderCombobox(
  field: any,
  value: any,
  foreignList: any,
  props: any
) {
  const commonProps = {
    autoFocus: props.autoFocus,
    label: field.label,
    description: field.description,
    forceValidation: props.forceValidation,
    isReadOnly: props.isReadOnly,
    isRequired: props.isRequired,
    list: foreignList,
    labelField: field.refLabelField,
    searchFields: field.refSearchFields,
    filter: field.selectFilter,
    sort: field.selectSort,
  }

  if (value.kind === 'many') {
    return (
      <ComboboxMany
        {...commonProps}
        state={{
          kind: 'many',
          value: value.value,
          onChange(newItems) {
            props.onChange?.({ ...value, value: newItems })
          },
        }}
      />
    )
  }

  return (
    <ComboboxSingle
      {...commonProps}
      state={{
        kind: 'one',
        value: value.value,
        onChange(newItem) {
          props.onChange?.({ ...value, value: newItem })
        },
      }}
    />
  )
}

// Handles item creation via dialog
function handleBuiltItem(
  builtItemData: any,
  foreignList: any,
  value: any,
  counter: number,
  setCounter: (c: number) => void,
  setDialogOpen: (open: boolean) => void,
  onChange: any
) {
  const id = `_____temporary_${counter}`
  const label =
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`
  setDialogOpen(false)
  setCounter(counter + 1)

  if (value.kind === 'many') {
    onChange({
      ...value,
      value: [
        ...value.value,
        {
          id,
          label,
          data: builtItemData,
          built: true,
        },
      ],
    })
  } else if (value.kind === 'one') {
    onChange({
      ...value,
      value: {
        id,
        label,
        data: builtItemData,
        built: true,
      },
    })
  }
}

// Renders tag group for many relationships
function renderTagGroup(
  value: any,
  foreignList: any,
  isRequired: boolean,
  isReadOnly: boolean,
  onChange: any
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={value.value.map(item => ({
        id: item.id.toString() ?? '',
        label: item.label ?? '',
        href: item.built ? '' : `/${foreignList.path}/${item.id}`,
      }))}
      maxRows={2}
      onRemove={
        isReadOnly
          ? undefined
          : keys => {
              onChange?.({
                ...value,
                value: value.value.filter(item => !keys.has(item.id)),
              })
            }
      }
      renderEmptyState={() => (
        <Text color="neutralSecondary" size="small">
          No related {foreignList.plural.toLowerCase()}…
        </Text>
      )}
    >
      {renderItem}
    </TagGroup>
  )
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (value.kind === 'count') {
    if (field.display === 'table') {
      return <RelationshipTable field={field} value={value} />
    }
    return renderCountDisplay(field, value, foreignList)
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(field, value, foreignList, {
            autoFocus,
            forceValidation,
            isReadOnly,
            isRequired,
            onChange,
          })}
        </ContextualActions>

        {value.kind === 'many' && renderTagGroup(value, foreignList, isRequired, isReadOnly, onChange)}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                handleBuiltItem(
                  builtItemData,
                  foreignList,
                  value,
                  counter,
                  setCounter,
                  setDialogOpen,
                  onChange
                )
              }}
            />
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

// NOTE: fix for `TagGroup` perf issue, should typically be okay to just
// inline the render function
function renderItem(item: { id: string; href: string; label: string }) {
  if (item.href === '') return <Item>{item.label}</Item>
  return <Item href={item.href}>{item.label}</Item>
}

export const Cell: CellComponent<typeof controller> = ({ field, item }) => {
  const list = useList(field.refListKey)

  if (field.display === 'count' || field.display === 'table') {
    const count = item[`${field.fieldKey}Count`] as number
    return count != null ? <Numeral value={count} abbreviate /> : null
  }

  const data = item[field.fieldKey]
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean)
  const displayItems = items.length < 3 ? items : items.slice(0, 2)
  const overflow = items.length < 3 ? 0 : items.length - 2

  return (
    <Text>
      {displayItems.map((item, index) => (
        <Fragment key={item.id}>
          {index ? ', ' : ''}
          <TextLink href={`/${list.path}/${item.id}`}>{item.label || item.id}</TextLink>
        </Fragment>
      ))}
      {overflow ? `, and ${overflow} more` : null}
    </Text>
  )
}

// Builds graphql selection string for relationship field
function buildGraphqlSelection(
  fieldKey: string,
  displayMode: string,
  many: boolean,
  refLabelField: string,
  config: any
) {
  if (displayMode === 'count' || displayMode === 'table') {
    return `${fieldKey}Count`
  }
  const orderByClause = many && config.fieldMeta.sort
    ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
    : ''
  return `${fieldKey}${orderByClause} {
    id
    label: ${refLabelField}
  }`
}

// Creates default value based on relationship kind
function createDefaultValue(many: boolean) {
  if (many) {
    return {
      kind: 'many',
      id: null,
      initialValue: [],
      value: [],
    }
  }
  return {
    kind: 'one',
    id: null,
    value: null,
    initialValue: null,
  }
}

// Validates relationship value
function validateRelationshipValue(value: any, opts: any) {
  if ('count' in value) return true
  return opts.isRequired
    ? value.kind === 'one'
      ? value.value !== null
      : value.value.length > 0
    : true
}

// Deserializes data into relationship value
function deserializeRelationshipData(
  data: any,
  displayMode: string,
  many: boolean,
  fieldKey: string
) {
  if (displayMode === 'count' || displayMode === 'table') {
    return {
      id: data.id,
      kind: 'count',
      count: data[`${fieldKey}Count`] ?? 0,
    }
  }
  if (many) {
    const value = (data[fieldKey] || []).map((x: any) => ({
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
  let value = data[fieldKey]
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
}

// Serializes many relationship state
function serializeMany(state: any, fieldKey: string) {
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

// Serializes one relationship state
function serializeOne(state: any, fieldKey: string) {
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

// Serializes relationship state
function serializeRelationshipState(state: any, fieldKey: string) {
  if (state.kind === 'many') {
    return serializeMany(state, fieldKey)
  } else if (state.kind === 'one') {
    return serializeOne(state, fieldKey)
  }
  return {}
}

// Builds graphql filter for empty/not_empty types
function buildEmptyFilter(type: string, fieldKey: string, many: boolean) {
  if (type === 'empty' && !many) return { [fieldKey]: { equals: null } }
  if (type === 'empty' && many) return { [fieldKey]: { none: {} } }
  if (type === 'not_empty' && !many) return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not_empty' && many) return { [fieldKey]: { some: {} } }
  return null
}

// Builds graphql filter for is/not_is types
function buildIsFilter(type: string, fieldKey: string, value: any) {
  if (type === 'is') return { [fieldKey]: { id: { equals: value } } }
  if (type === 'not_is') return { [fieldKey]: { not: { id: { equals: value } } } }
  return null
}

// Builds graphql filter for some/not_some types
function buildSomeFilter(type: string, fieldKey: string, value: any) {
  if (type === 'some') return { [fieldKey]: { some: { id: { in: value } } } }
  if (type === 'not_some') return { [fieldKey]: { not: { some: { id: { in: value } } } } }
  return null
}

// Converts filter to graphql query
function filterToGraphql(type: string, value: any, fieldKey: string, many: boolean) {
  const emptyFilter = buildEmptyFilter(type, fieldKey, many)
  if (emptyFilter) return emptyFilter

  const isFilter = buildIsFilter(type, fieldKey, value)
  if (isFilter) return isFilter

  const someFilter = buildSomeFilter(type, fieldKey, value)
  if (someFilter) return someFilter

  return { [fieldKey]: { [type]: value } }
}

// Creates filter types based on relationship kind
function createFilterTypes(many: boolean) {
  return {
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
  }
}

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
    graphqlSelection: buildGraphqlSelection(fieldKey, displayMode, many, refLabelField, config),
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: displayMode === 'select' ? config.fieldMeta.filter : null,
    selectSort: displayMode === 'select' ? config.fieldMeta.sort : null,
    defaultValue: createDefaultValue(many),
    validate: (value, opts) => validateRelationshipValue(value, opts),
    deserialize: data => deserializeRelationshipData(data, displayMode, many, fieldKey),
    serialize: state => serializeRelationshipState(state, fieldKey),
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
              maxRows={2}
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
      graphql: ({ type, value }) => filterToGraphql(type, value, fieldKey, many),
      parseGraphQL: () => [],
      types: createFilterTypes(many),
    },
  }
}