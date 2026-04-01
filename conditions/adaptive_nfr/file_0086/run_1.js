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

/** Handle build item dialog change */
function handleBuildItemDialogChange(
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
  setDialogOpen(false)
  setCounter(counter + 1)

  if (value.kind === 'many') {
    handleDialogChangeManyKind(value, onChange, id, label, builtItemData)
  } else if (value.kind === 'one') {
    handleDialogChangeOneKind(value, onChange, id, label, builtItemData)
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
                handleBuildItemDialogChange(
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

/** Get display items and overflow count */
function getDisplayItemsAndOverflow(items: any[]) {
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
  const { displayItems, overflow } = getDisplayItemsAndOverflow(items)

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

/** Check if filter type is empty or not_empty */
function isEmptyFilterType(type: string): boolean {
  return type === 'empty' || type === 'not_empty'
}

/** Check if filter type is is or not_is */
function isIsFilterType(type: string): boolean {
  return type === 'is' || type === 'not_is'
}

/** Convert filter value to relationship value */
function filterValueToRelationshipValue(value: string | null): RelationshipValue | null {
  if (typeof value === 'string') {
    return { id: value, label: value, built: false }
  }
  return null
}

/** Build filter tag items */
function buildFilterTagItems(value: any[], foreignList: any) {
  return value.map(id => ({
    id: id.toString() ?? '',
    label: id ?? '',
    href: `/${foreignList.path}/${id}`,
  }))
}

/** Render single filter combobox */
function renderSingleFilterCombobox(
  label: string,
  refLabelField: string,
  refSearchFields: string[],
  foreignList: any,
  filterValue: any,
  onChange: any,
  config: any
) {
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
        value: filterValueToRelationshipValue(filterValue),
        onChange(newItem) {
          onChange(newItem === null ? null : newItem.id.toString())
        },
      }}
      filter={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.filter : null}
      sort={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.sort : null}
    />
  )
}

/** Render many filter combobox and tags */
function renderManyFilterCombobox(
  label: string,
  refLabelField: string,
  refSearchFields: string[],
  foreignList: any,
  filterValue: any[],
  onChange: any,
  config: any
) {
  const ids = Array.isArray(filterValue) ? filterValue : []
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
            onChange(newItem.map(x => x.id.toString()))
          },
        }}
        filter={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.filter : null}
        sort={config.fieldMeta.displayMode === 'select' ? config.fieldMeta.sort : null}
      />
      <TagGroup
        aria-label={`related ${foreignList.plural}`}
        items={buildFilterTagItems(ids, foreignList)}
        maxRows={2}
        onRemove={keys => {
          onChange(ids.filter(id => !keys.has(id)))
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
}

/** Check if value is required and valid */
function isValidRequired(value: any, isRequired: boolean): boolean {
  if (!isRequired) return true
  if (value.kind === 'one') return value.value !== null
  return value.value.length > 0
}

/** Deserialize count display data */
function deserializeCountDisplay(data: any, config: any): any {
  return {
    id: data.id,
    kind: 'count',
    count: data[`${config.fieldKey}Count`] ?? 0,
  }
}

/** Deserialize many relationship data */
function deserializeMany(data: any, config: any): any {
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
function deserializeOne(data: any, config: any): any {
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

/** Build disconnect items for many relationship */
function buildDisconnectItems