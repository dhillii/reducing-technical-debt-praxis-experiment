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

/** Check if value is a count display type */
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

/** Render tag group for many relationships */
function renderTagGroup(
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

/** Handle built item dialog submission */
function handleBuiltItemSubmit(
  builtItemData: any,
  value: any,
  foreignList: any,
  counter: number,
  setCounter: any,
  setDialogOpen: any,
  onChange: any
) {
  const id = `_____temporary_${counter}`
  const label =
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`
  setDialogOpen(false)
  setCounter(counter + 1)

  const newItem = {
    id,
    label,
    data: builtItemData,
    built: true,
  }

  if (value.kind === 'many') {
    onChange({
      ...value,
      value: [...value.value, newItem],
    })
  } else if (value.kind === 'one') {
    onChange({
      ...value,
      value: newItem,
    })
  }
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
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

        {value.kind === 'many' && renderTagGroup(value, foreignList, isReadOnly, isRequired, onChange)}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                handleBuiltItemSubmit(
                  builtItemData,
                  value,
                  foreignList,
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

/** Render tag item with optional link */
function renderItem(item: { id: string; href: string; label: string }) {
  if (item.href === '') return <Item>{item.label}</Item>
  return <Item href={item.href}>{item.label}</Item>
}

/** Calculate display items and overflow count */
function calculateDisplayItems(items: any[]) {
  const displayItems = items.length < 3 ? items : items.slice(0, 2)
  const overflow = items.length < 3 ? 0 : items.length - 2
  return { displayItems, overflow }
}

export const Cell: CellComponent<typeof controller> = ({ field, item }) => {
  const list = useList(field.refListKey)

  if (field.display === 'count' || field.display === 'table') {
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

/** Build GraphQL selection string */
function buildGraphQLSelection(
  fieldKey: string,
  displayMode: string,
  refLabelField: string,
  many: boolean,
  sort?: ListSortDescriptor<string> | null
): string {
  if (isCountOrTableDisplayMode(displayMode)) {
    return `${fieldKey}Count`
  }

  const sortClause =
    many && sort ? `(orderBy: { ${sort.field}: ${sort.direction.toLowerCase()} })` : ''

  return `${fieldKey}${sortClause} {
    id
    label: ${refLabelField}
  }`
}

/** Build filter GraphQL query for empty type */
function buildEmptyFilterQuery(fieldKey: string, many: boolean): Record<string, any> {
  if (!many) {
    return { [fieldKey]: { equals: null } }
  }
  return { [fieldKey]: { none: {} } }
}

/** Build filter GraphQL query for not_empty type */
function buildNotEmptyFilterQuery(fieldKey: string, many: boolean): Record<string, any> {
  if (!many) {
    return { [fieldKey]: { not: { equals: null } } }
  }
  return { [fieldKey]: { some: {} } }
}

/** Build filter GraphQL query based on type */
function buildFilterGraphQL(
  type: string,
  value: any,
  fieldKey: string,
  many: boolean
): Record<string, any> {
  if (type === 'empty') {
    return buildEmptyFilterQuery(fieldKey, many)
  }
  if (type === 'not_empty') {
    return buildNotEmptyFilterQuery(fieldKey, many)
  }
  if (type === 'is') {
    return { [fieldKey]: { id: { equals: value } } }
  }
  if (type === 'not_is') {
    return { [fieldKey]: { not: { id: { equals: value } } } }
  }
  if (type === 'some') {
    return { [fieldKey]: { some: { id: { in: value } } } }
  }
  if (type === 'not_some') {
    return { [fieldKey]: { not: { some: { id: { in: value } } } } }
  }
  return { [fieldKey]: { [type]: value } }
}

/** Check if value is required and valid */
function isValidRequired(value: any, isRequired: boolean): boolean {
  if (!isRequired) return true
  if (value.kind === 'one') return value.value !== null
  return value.value.length > 0
}

/** Deserialize count display data */
function deserializeCountDisplay(data: any, fieldKey: string): any {
  return {
    id: data.id,
    kind: 'count',
    count: data[`${fieldKey}Count`] ?? 0,
  }
}

/** Deserialize many relationship data */
function deserializeManyRelationship(data: any, fieldKey: string): any {
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

/** Deserialize one relationship data */
function deserializeOneRelationship(data: any, fieldKey: string): any {
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

/** Build disconnect operations for many relationships */
function buildDisconnectOps(state: any): any[] {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  return state.initialValue
    .filter((x: any) => !newAllIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
}

/** Build connect operations for many relationships */
function buildConnectOps(state: any): any[] {
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))
  return state.value
    .filter((x: any) => !x.built && !initialIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
}

/** Build create operations for many relationships */
function buildCreateOps(state: any): any[] {
  return state.value.filter((x: any) => x.built).map((x: any) => x.data)
}

/** Serialize many relationship state */
function serializeMany(state: any, fieldKey: string): Record<string, any> {
  const disconnect = buildDisconnectOps(state)
  const connect = buildConnectOps(state)
  const create = buildCreateOps(state)

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

/** Serialize one relationship state */
function serializeOne(state: any, fieldKey: string): Record<string, any> {
  if (state.initialValue && !state.value) {
    return { [fieldKey]: { disconnect: true } }
  }
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