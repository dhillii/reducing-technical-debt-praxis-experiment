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

function renderCountDisplay(field: any, value: any, foreignList: any, autoFocus: boolean, description: string | undefined) {
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

function renderTableDisplay(field: any, value: any) {
  return <RelationshipTable field={field} value={value} />
}

function isCountDisplay(value: any): boolean {
  return value.kind === 'count'
}

function isTableDisplay(field: any): boolean {
  return field.display === 'table'
}

function renderManyCombobox(props: any, field: any, value: any, foreignList: any) {
  return (
    <ComboboxMany
      autoFocus={props.autoFocus}
      label={field.label}
      description={props.description}
      forceValidation={props.forceValidation}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      list={foreignList}
      labelField={field.refLabelField}
      searchFields={field.refSearchFields}
      filter={field.selectFilter}
      sort={field.selectSort}
      state={{
        kind: 'many',
        value: value.value,
        onChange(newItems: any) {
          props.onChange?.({ ...value, value: newItems })
        },
      }}
    />
  )
}

function renderSingleCombobox(props: any, field: any, value: any, foreignList: any) {
  return (
    <ComboboxSingle
      autoFocus={props.autoFocus}
      label={field.label}
      description={props.description}
      forceValidation={props.forceValidation}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      list={foreignList}
      labelField={field.refLabelField}
      searchFields={field.refSearchFields}
      filter={field.selectFilter}
      sort={field.selectSort}
      state={{
        kind: 'one',
        value: value.value,
        onChange(newItem: any) {
          props.onChange?.({ ...value, value: newItem })
        },
      }}
    />
  )
}

function renderCombobox(props: any, field: any, value: any, foreignList: any) {
  if (value.kind === 'many') {
    return renderManyCombobox(props, field, value, foreignList)
  }
  return renderSingleCombobox(props, field, value, foreignList)
}

function renderTagGroup(value: any, foreignList: any, isReadOnly: boolean, isRequired: boolean, onChange: any) {
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
      onRemove={
        isReadOnly
          ? undefined
          : (keys: any) => {
              onChange?.({
                ...value,
                value: value.value.filter((item: any) => !keys.has(item.id)),
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

function handleBuiltItemChange(builtItemData: any, value: any, foreignList: any, counter: number, setCounter: any, onChange: any) {
  const id = `_____temporary_${counter}`
  const label =
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`
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

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (isCountDisplay(value)) {
    if (isTableDisplay(field)) {
      return renderTableDisplay(field, value)
    }
    return renderCountDisplay(field, value, foreignList, autoFocus, description)
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(
            { autoFocus, description, forceValidation, isReadOnly, isRequired, onChange },
            field,
            value,
            foreignList
          )}
        </ContextualActions>

        {value.kind === 'many' && renderTagGroup(value, foreignList, isReadOnly, isRequired, onChange)}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                setDialogOpen(false)
                handleBuiltItemChange(builtItemData, value, foreignList, counter, setCounter, onChange)
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

/** Checks if value is a count display type */
function isCountKind(value: any): boolean {
  return 'count' in value
}

/** Checks if value is required and valid */
function isValidRequired(value: any, isRequired: boolean): boolean {
  if (!isRequired) return true
  return value.kind === 'one' ? value.value !== null : value.value.length > 0
}

/** Builds disconnect operations for many relationships */
function buildDisconnect(state: any): any[] {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  return state.initialValue
    .filter((x: any) => !newAllIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
}

/** Builds connect operations for many relationships */
function buildConnect(state: any): any[] {
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))
  return state.value
    .filter((x: any) => !x.built && !initialIds.has(x.id))
    .map((x: any) => ({ id: x.id }))
}

/** Builds create operations for many relationships */
function buildCreate(state: any): any[] {
  return state.value.filter((x: any) => x.built).map((x: any) => x.data)
}

/** Builds output object for many relationship serialization */
function buildManyOutput(disconnect: any[], connect: any[], create: any[]): Record<string, any> {
  const output: Record<string, any> = {}
  if (disconnect.length) output.disconnect = disconnect
  if (connect.length) output.connect = connect
  if (create.length) output.create = create
  return output
}

/** Serializes many relationship state */
function serializeMany(state: any, fieldKey: string): Record<string, any> {
  const disconnect = buildDisconnect(state)
  const connect = buildConnect(state)
  const create = buildCreate(state)
  const output = buildManyOutput(disconnect, connect, create)

  if (Object.keys(output).length) {
    return { [fieldKey]: output }
  }
  return {}
}

/** Checks if one relationship should disconnect */
function shouldDisconnectOne(state: any): boolean {
  return state.initialValue && !state.value
}

/** Checks if one relationship is newly built */
function isBuiltOne(state: any): boolean {
  return state.value?.built === true
}

/** Checks if one relationship changed */
function hasChangedOne(state: any): boolean {
  return state.value && state.value.id !== state.initialValue?.id
}

/** Serializes one relationship state */
function serializeOne(state: any, fieldKey: string): Record<string, any> {
  if (shouldDisconnectOne(state)) {
    return { [fieldKey]: { disconnect: true } }
  }
  if (isBuiltOne(state)) {
    return { [fieldKey]: { create: state.value.data } }
  }
  if (hasChangedOne(state)) {
    return { [fieldKey]: { connect: { id: state.value.id } } }
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
      if (isCountKind(value)) return true
      return isValidRequired(value, opts.isRequired)
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
      if (state.kind === 'many') {
        return serializeMany(state, config.fieldKey)
      }
      if (state.kind === 'one') {
        return serializeOne(state, config.fieldKey)
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
        return { [config.fieldKey]: { [type]: value } }
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