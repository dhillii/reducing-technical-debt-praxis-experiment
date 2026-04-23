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
    return
  }

  if (value.kind === 'one') {
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

        {value.kind === 'many' && (
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

/** Check if display mode is count or table */
function isCountOrTableDisplay(displayMode: string): boolean {
  return displayMode === 'count' || displayMode === 'table'
}

/** Check if display mode is select */
function isSelectDisplay(displayMode: string): boolean {
  return displayMode === 'select'
}

/** Build graphql selection string */
function buildGraphqlSelection(
  fieldKey: string,
  displayMode: string,
  refLabelField: string,
  many: boolean,
  sort: any
): string {
  if (isCountOrTableDisplay(displayMode)) {
    return `${fieldKey}Count`
  }

  const sortClause =
    many && sort ? `(orderBy: { ${sort.field}: ${sort.direction.toLowerCase()} })` : ''
  return `${fieldKey}${sortClause} {
    id
    label: ${refLabelField}
  }`
}

/** Get filter config based on display mode */
function getFilterConfig(displayMode: string, config: any): any {
  if (!isSelectDisplay(displayMode)) {
    return { filter: null, sort: null }
  }
  return { filter: config.fieldMeta.filter, sort: config.fieldMeta.sort }
}

/** Validate relationship value */
function validateRelationshipValue(value: any, isRequired: boolean): boolean {
  if ('count' in value) return true
  if (!isRequired) return true
  if (value.kind === 'one') return value.value !== null
  return value.value.length > 0
}

/** Deserialize count/table display data */
function deserializeCountDisplay(data: any, fieldKey: string, id: any): any {
  return {
    id,
    kind: 'count',
    count: data[`${fieldKey}Count`] ?? 0,
  }
}

/** Deserialize many relationship data */
function deserializeManyRelationship(data: any, fieldKey: string, id: any): any {
  const value = (data[fieldKey] || []).map((x: any) => ({
    id: x.id,
    label: x.label || x.id,
  }))
  return {
    kind: 'many',
    id,
    initialValue: value,
    value,
  }
}

/** Deserialize single relationship data */
function deserializeSingleRelationship(data: any, fieldKey: string, id: any): any {
  let value = data[fieldKey]
  if (value) {
    value = {
      id: value.id,
      label: value.label || value.id,
    }
  }
  return {
    kind: 'one',
    id,
    value,
    initialValue: value,
  }
}

/** Build disconnect operations for many relationship */
function buildDisconnectOps(state: any): any[] {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  return state.initialValue
    .filter((x: any) => !newAllIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
}

/** Build connect operations for many relationship */
function buildConnectOps(state: any): any[] {
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))
  return state.value
    .filter((x: any) => !x.built && !initialIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
}

/** Build create operations for many relationship */
function buildCreateOps(state: any): any[] {
  return state.value.filter((x: any) => x.built).map((x: any) => x.data)
}

/** Serialize many relationship state */
function serializeMany(state: any, fieldKey: string): any {
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

/** Serialize single relationship state */
function serializeOne(state: any, fieldKey: string): any {
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

  const filterConfig = getFilterConfig(displayMode, config)

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
    graphqlSelection: buildGraphqlSelection(fieldKey, displayMode, refLabelField, many, config.fieldMeta.sort),
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: filterConfig.filter,
    selectSort: filterConfig.sort,
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
      if (isCountOrTableDisplay(displayMode)) {
        return deserializeCountDisplay(data, fieldKey, data.id)
      }
      if (many) {
        return deserializeManyRelationship(data, fieldKey, data.id)
      }
      return deserializeSingleRelationship(data, fieldKey, data.id)
    },
    serialize: state => {
      if (state.kind === 'many') {
        return serializeMany(state, fieldKey)
      }
      if (state.kind === 'one') {
        return serializeOne(state, fieldKey)
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
              filter={filterConfig.filter}
              sort={filterConfig.sort}
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
              filter={filterConfig.filter}
              sort={filterConfig.sort}
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
        if (type === 'empty' && !many) return { [fieldKey]: { equals: null } }
        if (type === 'empty' && many) return { [fieldKey]: { none: {} } }
        if (type === 'not_empty' && !many) return { [fieldKey]: { not: { equals: null } } }
        if (type === 'not_empty' && many) return { [fieldKey]: { some: {} } }
        if (type === 'is') return { [fieldKey]: { id: { equals: value } } }
        if (type === 'not_is') return { [fieldKey]: { not: { id: { equals: value } } } }
        if (type === 'some') return { [fieldKey]: { some: { id: { in: value } } } }
        if (type === 'not_some')
          return { [fieldKey]: { not: { some: { id: { in: value } } } } }
        return { [fieldKey]: { [type]: value } }
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