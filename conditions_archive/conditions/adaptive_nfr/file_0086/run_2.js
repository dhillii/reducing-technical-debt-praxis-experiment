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
  if (isReadOnly) {
    return undefined
  }

  return (keys: any) => {
    onChange?.({
      ...value,
      value: value.value.filter((item: any) => !keys.has(item.id)),
    })
  }
}

/** Extract label from built item data */
function extractLabel(builtItemData: any, foreignList: any, counter: number): string {
  return (
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`
  )
}

/** Handle dialog change for many relationships */
function handleDialogChangeManyKind(
  value: any,
  onChange: any,
  id: string,
  label: string,
  builtItemData: any
) {
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
}

/** Handle dialog change for one relationships */
function handleDialogChangeOneKind(
  value: any,
  onChange: any,
  id: string,
  label: string,
  builtItemData: any
) {
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

/** Process dialog change based on relationship kind */
function processDialogChange(
  value: any,
  onChange: any,
  id: string,
  label: string,
  builtItemData: any
) {
  if (value.kind === 'many') {
    handleDialogChangeManyKind(value, onChange, id, label, builtItemData)
    return
  }

  if (value.kind === 'one') {
    handleDialogChangeOneKind(value, onChange, id, label, builtItemData)
  }
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

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

        {value.kind === 'many' && (
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
        )}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                const id = `_____temporary_${counter}`
                const label = extractLabel(builtItemData, foreignList, counter)
                setDialogOpen(false)
                setCounter(counter + 1)
                processDialogChange(value, onChange, id, label, builtItemData)
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
  if (item.href === '') {
    return <Item>{item.label}</Item>
  }
  return <Item href={item.href}>{item.label}</Item>
}

/** Calculate display items and overflow count */
function calculateDisplayItems(items: any[]) {
  const displayItems = items.length < 3 ? items : items.slice(0, 2)
  const overflow = items.length < 3 ? 0 : items.length - 2
  return { displayItems, overflow }
}

/** Check if should display count */
function shouldDisplayCount(field: any): boolean {
  return field.display === 'count' || field.display === 'table'
}

export const Cell: CellComponent<typeof controller> = ({ field, item }) => {
  const list = useList(field.refListKey)

  if (shouldDisplayCount(field)) {
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
function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

/** Check if display mode is count or table */
function isCountOrTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'count' || displayMode === 'table'
}

/** Get filter config based on display mode */
function getFilterConfig(displayMode: string, config: any) {
  return isSelectDisplayMode(displayMode) ? config.fieldMeta.filter : null
}

/** Get sort config based on display mode */
function getSortConfig(displayMode: string, config: any) {
  return isSelectDisplayMode(displayMode) ? config.fieldMeta.sort : null
}

/** Build GraphQL selection string */
function buildGraphQLSelection(
  fieldKey: string,
  displayMode: string,
  many: boolean,
  refLabelField: string,
  config: any
) {
  if (isCountOrTableDisplayMode(displayMode)) {
    return `${fieldKey}Count`
  }

  const sortClause =
    many && config.fieldMeta.sort
      ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
      : ''

  return `${fieldKey}${sortClause} {
    id
    label: ${refLabelField}
  }`
}

/** Validate relationship value */
function validateRelationshipValue(value: any, isRequired: boolean): boolean {
  if ('count' in value) {
    return true
  }

  if (!isRequired) {
    return true
  }

  if (value.kind === 'one') {
    return value.value !== null
  }

  return value.value.length > 0
}

/** Deserialize count/table display data */
function deserializeCountDisplay(data: any, config: any) {
  return {
    id: data.id,
    kind: 'count',
    count: data[`${config.fieldKey}Count`] ?? 0,
  }
}

/** Deserialize many relationship data */
function deserializeMany(data: any, config: any) {
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

/** Deserialize one relationship data */
function deserializeOne(data: any, config: any) {
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
}

/** Check if item is built */
function isBuiltItem(item: any): boolean {
  return item.built
}

/** Check if item is not built */
function isNotBuiltItem(item: any): boolean {
  return !item.built
}

/** Serialize many relationship state */
function serializeMany(state: any, config: any) {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))

  const disconnect = state.initialValue
    .filter((x: any) => !newAllIds.has(x.id))
    .map((x: any) => ({ id: x.id }))

  const connect = state.value
    .filter((x: any) => isNotBuiltItem(x) && !initialIds.has(x.id))
    .map((x: any) => ({ id: x.id }))

  const create = state.value.filter(isBuiltItem).map((x: any) => x.data)

  const output = {
    ...(disconnect.length ? { disconnect } : {}),
    ...(connect.length ? { connect } : {}),
    ...(create.length ? { create } : {}),
  }

  if (Object.keys(output).length) {
    return {
      [config.fieldKey]: output,
    }
  }

  return {}
}

/** Serialize one relationship state */
function serializeOne(state: any, config: any) {
  if (state.initialValue && !state.value) {
    return { [config.fieldKey]: { disconnect: true } }
  }

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

/** Build GraphQL filter for empty type */
function buildEmptyFilter(fieldKey: string, many: boolean) {
  if (many) {
    return { [fieldKey]: { none: {} } }
  }
  return { [fieldKey]: { equals: null } }
}

/** Build GraphQL filter for not_empty type */
function buildNotEmptyFilter(fieldKey: string, many: boolean) {
  if (many) {
    return { [fieldKey]: { some: {} } }
  }
  return { [fieldKey]: { not: { equals: null } } }
}

/** Build GraphQL filter for is type */
function buildIsFilter(fieldKey: string, value: any) {
  return { [fieldKey]: { id: { equals: value } } }
}

/** Build GraphQL filter for not_is type */
function buildNotIsFilter(fieldKey: string, value: any) {
  return { [fieldKey]: { not: { id: { equals: value } } } }
}

/** Build GraphQL filter for some type */
function buildSomeFilter(fieldKey: string, value: any) {
  return { [fieldKey]: { some: { id: { in: value } } } }
}

/** Build GraphQL filter for not_some type */
function buildNotSomeFilter(fieldKey: string, value: any) {
  return { [fieldKey]: { not: { some: { id: { in: value } } } } }
}

/** Build GraphQL filter based on type */
function buildGraphQLFilter(type: string, value: any, fieldKey: string, many: boolean) {
  if (type === 'empty') {
    return buildEmptyFilter(fieldKey, many)
  }
  if (type === 'not_empty') {
    return buildNotEmptyFilter(fieldKey, many)
  }
  if (type === 'is') {
    return buildIsFilter(fieldKey, value)
  }
  if (type === 'not_is') {
    return buildNotIsFilter(fieldKey, value)
  }
  if (type === 'some') {
    return buildSomeFilter(fieldKey, value)
  }
  if (type === 'not_some') {
    return buildNotSomeFilter(fieldKey, value)
  }
  return { [fieldKey]: { [type]: value } }
}

/** Check if filter type is empty or not_empty */
function isEmptyFilterType(type: string): boolean {
  return ['empty', 'not_empty'].includes(type)
}

/** Check if filter type is is or not_is */
function isIsFilterType(type: string): boolean {
  return ['is', 'not_is'].includes(type)
}

/** Format filter label */
function formatFilterLabel(label: string, type: string, value: any, listFormatter: any) {
  if (isEmptyFilterType(type)) {
    return label.toLowerCase()
  }
  if (isIsFilterType(type)) {
    return `${label.toLowerCase()} ${value}`
  }
  return `${label.toLowerCase()} (${listFormatter.format(value || [''])})`
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
    graphqlSelection: buildGraphQLSelection(fieldKey, displayMode, many, refLabelField, config),
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: getFilterConfig(displayMode, config),
    selectSort: getSortConfig(displayMode, config),
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
      return validateRelationshipValue(value, opts.isRequired)
    },
    deserialize: data => {
      if (isCountOrTableDisplayMode(displayMode)) {
        return deserializeCountDisplay(data, config)
      }
      if (many) {
        return deserializeMany(data, config)
      }
      return deserializeOne(data, config)
    },
    serialize: state => {
      if (state.kind === 'many') {
        return serializeMany(state, config)
      }
      if (state.kind === 'one') {
        return serializeOne(state, config)
      }
      return {}
    },
    filter: {
      Filter(props) {
        const foreignList = useList(refListKey)

        if (props.type === 'empty' || props.type === 'not_empty') {
          return null
        }

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
              filter={getFilterConfig(config.fieldMeta.displayMode, config)}
              sort={getSortConfig(config.fieldMeta.displayMode, config)}
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
              filter={getFilterConfig(config.fieldMeta.displayMode, config)}
              sort={getSortConfig(config.fieldMeta.displayMode, config)}
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

        return formatFilterLabel(label, type, value, listFormatter)
      },
      graphql: ({ type, value }) => {
        return buildGraphQLFilter(type, value, config.fieldKey, many)
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