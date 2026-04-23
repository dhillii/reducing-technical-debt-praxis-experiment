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

/** Check if value is in count display mode */
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
  field: any,
  value: any,
  autoFocus: boolean,
  description: string | undefined,
  foreignList: any
) {
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

/** Render the appropriate combobox based on relationship kind */
function renderCombobox(
  field: any,
  value: any,
  autoFocus: boolean,
  description: string | undefined,
  forceValidation: boolean,
  isReadOnly: boolean,
  isRequired: boolean,
  foreignList: any,
  onChange: any
) {
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
            onChange?.({ ...value, value: newItems })
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
          onChange?.({ ...value, value: newItem })
        },
      }}
    />
  )
}

/** Check if value is many relationship */
function isManyRelationship(value: any): boolean {
  return value.kind === 'many'
}

/** Handle built item dialog changes */
function handleBuiltItemChange(
  builtItemData: any,
  foreignList: any,
  counter: number,
  setCounter: (c: number) => void,
  setDialogOpen: (open: boolean) => void,
  value: any,
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

  if (isManyRelationship(value)) {
    onChange({
      ...value,
      value: [...value.value, newItem],
    })
  } else {
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

  if (isCountDisplay(value)) {
    if (shouldDisplayAsTable(field)) {
      return <RelationshipTable field={field} value={value} />
    }
    return renderCountDisplay(field, value, autoFocus, description, foreignList)
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(
            field,
            value,
            autoFocus,
            description,
            forceValidation,
            isReadOnly,
            isRequired,
            foreignList,
            onChange
          )}
        </ContextualActions>

        {isManyRelationship(value) && (
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
        )}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                handleBuiltItemChange(
                  builtItemData,
                  foreignList,
                  counter,
                  setCounter,
                  setDialogOpen,
                  value,
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

/** Check if display mode is select */
function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

/** Check if display mode is count or table */
function isCountOrTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'count' || displayMode === 'table'
}

/** Get filter and sort for select mode */
function getSelectFilterAndSort(config: any) {
  return {
    filter: isSelectDisplayMode(config.fieldMeta.displayMode) ? config.fieldMeta.filter : null,
    sort: isSelectDisplayMode(config.fieldMeta.displayMode) ? config.fieldMeta.sort : null,
  }
}

/** Build graphql selection string */
function buildGraphqlSelection(
  fieldKey: string,
  displayMode: string,
  many: boolean,
  refLabelField: string,
  config: any
): string {
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
  if ('count' in value) return true
  if (!isRequired) return true
  if (value.kind === 'one') return value.value !== null
  return value.value.length > 0
}

/** Deserialize relationship data */
function deserializeRelationshipData(
  data: any,
  displayMode: string,
  many: boolean,
  fieldKey: string
): any {
  if (isCountOrTableDisplayMode(displayMode)) {
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

/** Serialize many relationship state */
function serializeManyRelationship(state: any, fieldKey: string): any {
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

/** Serialize one relationship state */
function serializeOneRelationship(state: any, fieldKey: string): any {
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

/** Serialize relationship state */
function serializeRelationshipState(state: any, fieldKey: string): any {
  if (state.kind === 'many') {
    return serializeManyRelationship(state, fieldKey)
  }
  if (state.kind === 'one') {
    return serializeOneRelationship(state, fieldKey)
  }
  return {}
}

/** Build graphql filter for empty type */
function buildEmptyFilter(fieldKey: string, many: boolean): any {
  if (many) {
    return { [fieldKey]: { none: {} } }
  }
  return { [fieldKey]: { equals: null } }
}

/** Build graphql filter for not_empty type */
function buildNotEmptyFilter(fieldKey: string, many: boolean): any {
  if (many) {
    return { [fieldKey]: { some: {} } }
  }
  return { [fieldKey]: { not: { equals: null } } }
}

/** Build graphql filter based on type */
function buildGraphqlFilter(type: string, value: any, fieldKey: string, many: boolean): any {
  if (type === 'empty') return buildEmptyFilter(fieldKey, many)
  if (type === 'not_empty') return buildNotEmptyFilter(fieldKey, many)
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
  const { listKey, fieldKey: fieldKey, label, description } = config
  const { displayMode, hideCreate, many, refFieldKey, refLabelField, refListKey, refSearchFields } =
    config.fieldMeta

  const selectFilterAndSort = getSelectFilterAndSort(config)

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
    selectFilter: selectFilterAndSort.filter,
    selectSort: selectFilterAndSort.sort,
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
      return deserializeRelationshipData(data, displayMode, many, fieldKey)
    },
    serialize: state => {
      return serializeRelationshipState(state, fieldKey)
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
              filter={selectFilterAndSort.filter}
              sort={selectFilterAndSort.sort}
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
              filter={selectFilterAndSort.filter}
              sort={selectFilterAndSort.sort}
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
        return buildGraphqlFilter(type, value, fieldKey, many)
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