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
    isReadOnly: props.onChange === undefined,
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

// Handles tag removal for many relationships
function handleTagRemove(
  isReadOnly: boolean,
  value: any,
  onChange: any
) {
  if (isReadOnly) return undefined
  return (keys: any) => {
    onChange?.({
      ...value,
      value: value.value.filter((item: any) => !keys.has(item.id)),
    })
  }
}

// Renders tag group for many relationships
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
      items={value.value.map((item: any) => ({
        id: item.id.toString() ?? '',
        label: item.label ?? '',
        href: item.built ? '' : `/${foreignList.path}/${item.id}`,
      }))}
      maxRows={2}
      onRemove={handleTagRemove(isReadOnly, value, onChange)}
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

// Handles built item data and updates state
function handleBuiltItem(
  builtItemData: any,
  foreignList: any,
  value: any,
  onChange: any,
  counter: number,
  setCounter: any,
  setDialogOpen: any
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
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (value.kind === 'count') {
    if (field.display === 'table') {
      return <RelationshipTable field={field} value={value} />
    }
    return renderCountDisplay({ ...field, autoFocus }, value, foreignList)
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(field, value, foreignList, props)}
        </ContextualActions>

        {value.kind === 'many' && renderTagGroup(value, foreignList, isReadOnly, isRequired, onChange)}
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
                  onChange,
                  counter,
                  setCounter,
                  setDialogOpen
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

// Validates relationship value based on requirements
function validateRelationshipValue(
  value: any,
  isRequired: boolean
): boolean {
  if ('count' in value) return true
  if (!isRequired) return true
  return value.kind === 'one' ? value.value !== null : value.value.length > 0
}

// Deserializes data into relationship value
function deserializeRelationshipData(
  data: any,
  displayMode: string,
  many: boolean,
  fieldKey: string,
  countFieldKey: string
): any {
  if (displayMode === 'count' || displayMode === 'table') {
    return {
      id: data.id,
      kind: 'count',
      count: data[countFieldKey] ?? 0,
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
function serializeManyRelationship(
  state: any,
  fieldKey: string
): Record<string, any> {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))
  const disconnect = state.initialValue
    .filter((x: any) => !newAllIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
  const connect = state.value
    .filter((x: any) => !x.built && !initialIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
  const create = state.value.filter((x: any) => x.built).map((x: any) => x.data)
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
function serializeOneRelationship(
  state: any,
  fieldKey: string
): Record<string, any> {
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
          id: state.value.id,
        },
      },
    }
  }
  return {}
}

// Builds graphql filter for empty/not_empty conditions
function buildEmptyFilter(
  type: string,
  fieldKey: string,
  many: boolean
): Record<string, any> {
  if (type === 'empty' && !many) return { [fieldKey]: { equals: null } }
  if (type === 'empty' && many) return { [fieldKey]: { none: {} } }
  if (type === 'not_empty' && !many) return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not_empty' && many) return { [fieldKey]: { some: {} } }
  return {}
}

// Builds graphql filter for comparison conditions
function buildComparisonFilter(
  type: string,
  value: any,
  fieldKey: string
): Record<string, any> {
  if (type === 'is') return { [fieldKey]: { id: { equals: value } } }
  if (type === 'not_is') return { [fieldKey]: { not: { id: { equals: value } } } }
  if (type === 'some') return { [fieldKey]: { some: { id: { in: value } } } }
  if (type === 'not_some') return { [fieldKey]: { not: { some: { id: { in: value } } } } }
  return { [fieldKey]: { [type]: value } }
}

// Renders filter UI for single relationship
function renderSingleFilter(
  props: any,
  label: string,
  refLabelField: string,
  refSearchFields: string[],
  foreignList: any,
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

// Renders filter UI for many relationships
function renderManyFilter(
  props: any,
  label: string,
  refLabelField: string,
  refSearchFields: string[],
  foreignList: any,
  config: any
) {
  const ids = Array.isArray(props.value) ? props.value : []
  const value = ids.map((id): RelationshipValue => ({ id, label: id, built: false }))

  return (
    <VStack gap="medium">
      <ComboboxMany
        autoFocus
        aria-label={label}