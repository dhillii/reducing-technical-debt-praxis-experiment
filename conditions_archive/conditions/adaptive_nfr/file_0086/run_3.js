```typescript
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

/** Check if value represents a count display mode */
function isCountDisplay(value: any): boolean {
  return value.kind === 'count'
}

/** Check if field should display as table */
function shouldDisplayAsTable(field: any): boolean {
  return field.display === 'table'
}

/** Check if field has a reference field key */
function hasRefFieldKey(field: any): boolean {
  return !!field.refFieldKey
}

/** Render count display with optional action button */
function renderCountDisplay(
  props: FieldProps<typeof controller>,
  value: any,
  foreignList: any
) {
  const { autoFocus, field, description } = props
  const textField = (
    <TextField
      autoFocus={autoFocus}
      label={field.label}
      description={description}
      isReadOnly
      value={value.count.toString()}
      width="alias.singleLineWidth"
    />
  )

  if (!hasRefFieldKey(field)) {
    return textField
  }

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

/** Render combobox based on relationship kind */
function renderCombobox(
  props: FieldProps<typeof controller>,
  value: any,
  foreignList: any
) {
  const { autoFocus, field, forceValidation, isRequired } = props
  const isReadOnly = props.onChange === undefined
  const description = field.description || undefined

  const commonProps = {
    autoFocus,
    label: field.label,
    description,
    forceValidation,
    isReadOnly,
    isRequired,
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

/** Build tag items from relationship values */
function buildTagItems(value: any, foreignList: any) {
  return value.value.map((item: any) => ({
    id: item.id.toString() ?? '',
    label: item.label ?? '',
    href: item.built ? '' : `/${foreignList.path}/${item.id}`,
  }))
}

/** Handle tag removal for many relationships */
function createTagRemoveHandler(
  value: any,
  onChange: any,
  isReadOnly: boolean
) {
  if (isReadOnly) return undefined

  return (keys: any) => {
    onChange?.({
      ...value,
      value: value.value.filter((item: any) => !keys.has(item.id)),
    })
  }
}

/** Render tags for many relationships */
function renderManyTags(
  value: any,
  foreignList: any,
  isReadOnly: boolean,
  isRequired: boolean,
  onChange: any
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={buildTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createTagRemoveHandler(value, onChange, isReadOnly)}
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

/** Extract label from built item data */
function extractLabel(builtItemData: any, foreignList: any, counter: number): string {
  return (
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`
  )
}

/** Create new item object for built items */
function createNewItem(id: string, label: string, builtItemData: any) {
  return {
    id,
    label,
    data: builtItemData,
    built: true,
  }
}

/** Handle dialog item creation for many relationships */
function handleManyItemCreation(
  value: any,
  onChange: any,
  newItem: any
) {
  onChange({
    ...value,
    value: [...value.value, newItem],
  })
}

/** Handle dialog item creation for single relationships */
function handleSingleItemCreation(
  value: any,
  onChange: any,
  newItem: any
) {
  onChange({
    ...value,
    value: newItem,
  })
}

/** Handle build dialog item change */
function handleBuildDialogChange(
  value: any,
  onChange: any,
  foreignList: any,
  counter: number,
  setCounter: any,
  setDialogOpen: any,
  builtItemData: any
) {
  const id = `_____temporary_${counter}`
  const label = extractLabel(builtItemData, foreignList, counter)
  const newItem = createNewItem(id, label, builtItemData)

  setDialogOpen(false)
  setCounter(counter + 1)

  if (value.kind === 'many') {
    handleManyItemCreation(value, onChange, newItem)
  } else if (value.kind === 'one') {
    handleSingleItemCreation(value, onChange, newItem)
  }
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const [counter, setCounter] = useState(1)
  const isReadOnly = onChange === undefined

  if (isCountDisplay(value)) {
    if (shouldDisplayAsTable(field)) {
      return <RelationshipTable field={field} value={value} />
    }
    return renderCountDisplay(props, value, foreignList)
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(props, value, foreignList)}
        </ContextualActions>

        {value.kind === 'many' && renderManyTags(value, foreignList, isReadOnly, isRequired, onChange)}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                handleBuildDialogChange(
                  value,
                  onChange,
                  foreignList,
                  counter,
                  setCounter,
                  setDialogOpen,
                  builtItemData
                )
              }}
            />
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

/** Render tag item with optional link */
function renderItem(item: { id: string; href: string; label: string }) {
  if (item.href === '') return <Item>{item.label}</Item>
  return <Item href={item.href}>{item.label}</Item>
}

/** Check if display mode is count or table */
function isCountOrTableDisplay(displayMode: string): boolean {
  return displayMode === 'count' || displayMode === 'table'
}

/** Calculate display items and overflow count */
function calculateDisplayItems(items: any[]) {
  const displayItems = items.length < 3 ? items : items.slice(0, 2)
  const overflow = items.length < 3 ? 0 : items.length - 2
  return { displayItems, overflow }
}

export const Cell: CellComponent<typeof controller> = ({ field, item }) => {
  const list = useList(field.refListKey)

  if (isCountOrTableDisplay(field.display)) {
    const count = item[`${field.fieldKey}Count`] as number
    return count != null ? <Numeral value={count} abbreviate /> : null
  }

  const data = item[field.fieldKey]
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean)
  const { displayItems, overflow } = calculateDisplayItems(items)

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

/** Check if display mode is select */
function isSelectDisplay(displayMode: string): boolean {
  return displayMode === 'select'
}

/** Get filter config based on display mode */
function getFilterConfig(displayMode: string, fieldMeta: any) {
  return isSelectDisplay(displayMode) ? fieldMeta.filter : null
}

/** Get sort config based on display mode */
function getSortConfig(displayMode: string, fieldMeta: any) {
  return isSelectDisplay(displayMode) ? fieldMeta.sort : null
}

/** Build GraphQL selection string */
function buildGraphQLSelection(
  fieldKey: string,
  displayMode: string,
  many: boolean,
  refLabelField: string,
  sort?: ListSortDescriptor<string> | null
): string {
  if (displayMode === 'count' || displayMode === 'table') {
    return `${fieldKey}Count`
  }

  const sortClause = many && sort ? `(orderBy: { ${sort.field}: ${sort.direction.toLowerCase()} })` : ''
  return `${fieldKey}${sortClause} {
    id
    label: ${refLabelField}
  }`
}

/** Check if value is required and empty */
function isRequiredButEmpty(value: any, isRequired: boolean): boolean {
  if (!isRequired) return false
  if (value.kind === 'one') return value.value === null
  return value.value.length === 0
}

/** Check if value is valid */
function isValidValue(value: any, isRequired: boolean): boolean {
  if ('count' in value) return true
  return !isRequiredButEmpty(value, isRequired)
}

/** Build new/connect/create sets for serialization */
function buildRelationshipChanges(state: any) {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))
  const disconnect = state.initialValue
    .filter((x: any) => !newAllIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
  const connect = state.value
    .filter((x: any) => !x.built && !initialIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
  const create = state.value.filter((x: any) => x.built).map((x: any) => x.data)

  return { disconnect, connect, create }
}

/** Build output object for many relationship serialization */
function buildManyOutput(disconnect: any[], connect: any[], create: any[]) {
  const output: any = {}
  if (disconnect.length) output.disconnect = disconnect
  if (connect.length) output.connect = connect
  if (create.length) output.create = create
  return output
}

/** Handle many relationship serialization */
function serializeMany(state: any, fieldKey: string) {
  const { disconnect, connect, create } = buildRelationshipChanges(state)
  const output = buildManyOutput(disconnect, connect, create)

  if (Object.keys(output).length) {
    return { [fieldKey]: output }
  }
  return {}
}

/** Handle single relationship serialization */
function serializeSingle(state: any, fieldKey: string) {
  if (state.initialValue && !state.value) {
    return { [fieldKey]: { disconnect: true } }
  }

  if (state.value?.built) {
    return { [fieldKey]: { create: state.value.data } }
  }

  if (state.value && state.value.id !== state.initialValue?.id) {
    return { [fieldKey]: { connect: { id: state.value.id } } }
  }

  return {}
}

/** Build GraphQL filter query */
function buildGraphQLFilter(type: string, value: any, fieldKey: string, many: boolean) {
  if (type === 'empty' && !many) return { [fieldKey]: { equals: null } }
  if (type === 'empty' && many) return { [fieldKey]: { none: {} } }
  if (type === 'not_empty' && !many) return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not_empty' && many) return { [fieldKey]: { some: {} } }
  if (type === 'is') return { [fieldKey]: { id: { equals: value } } }
  if (type === 'not_is') return { [fieldKey]: { not: { id: { equals: value } } } }
  if (type === 'some') return { [fieldKey]: { some: { id: { in: value } } } }
  if (type === 'not_some') return { [fieldKey]: { not: { some: { id: { in: value } } } } }
  return { [fieldKey]: { [type]: value } }
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
  const { listKey, fieldKey, label, description } = config
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
    graphqlSelection: buildGraphQLSelection(
      fieldKey,
      displayMode,
      many,
      refLabelField,
      displayMode === 'select' ? config.fieldMeta.sort : undefined
    ),
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: getFilterConfig(displayMode, config.fieldMeta),
    selectSort: getSortConfig(displayMode, config.fieldMeta),
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
      return isValidValue(value, opts.isRequired)
    },
    deserialize: data => {
      if (isCountOrTableDisplay(displayMode)) {
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
    },
    serialize: state => {
      if (state.kind === 'many') {
        return serializeMany(state, fieldKey)
      }

      if (state.kind === 'one') {
        return serializeSingle(state, fieldKey)
      }

      return {}
    },
    filter: {
      Filter(props) {
        const foreignList = useList(refListKey)

        if (props.type === 'empty' || props.type === 'not_empty') return null

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
              filter={getFilterConfig(displayMode, config.fieldMeta)}
              sort={getSortConfig(displayMode, config.fieldMeta)}
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
              filter={getFilterConfig(displayMode, config.fieldMeta)}
              sort={getSortConfig(displayMode, config.fieldMeta)}
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
      graphql: ({ type, value }) => {
        return buildGraphQLFilter(type, value, fieldKey, many)
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
```