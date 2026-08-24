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

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (value.kind === 'count') {
    return renderCountDisplay({ field, value, foreignList })
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox({ field, foreignList, value, autoFocus, forceValidation, isReadOnly, isRequired, onChange })}
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
            onRemove={isReadOnly ? undefined : keys => onRemoveItem({ value, onChange, keys })}
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
                addBuiltItem({ value, onChange, builtItemData, counter, setCounter, setDialogOpen })
              }}
            />
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

function renderCountDisplay({ field, value, foreignList }: {
  field: any;
  value: any;
  foreignList: any;
}) {
  if (field.display === 'table') {
    return <RelationshipTable field={field} value={value} />
  }
  const textField = (
    <TextField
      autoFocus={false}
      label={field.label}
      description={field.description || undefined}
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

function renderCombobox({ field, foreignList, value, autoFocus, forceValidation, isReadOnly, isRequired, onChange }) {
  const commonProps = {
    autoFocus,
    label: field.label,
    description: field.description,
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

function onRemoveItem({ value, onChange, keys }: { value: any; onChange: any; keys: Set<any> }) {
  onChange?.({
    ...value,
    value: value.value.filter(item => !keys.has(item.id)),
  })
}

function addBuiltItem({ value, onChange, builtItemData, counter, setCounter, setDialogOpen }: {
  value: any;
  onChange: any;
  builtItemData: any;
  counter: number;
  setCounter: (n: number) => void;
  setDialogOpen: (v: boolean) => void;
}) {
  const foreignList = useList(builtItemData.__listKey)
  const id = `_____temporary_${counter}`
  const label = (builtItemData?.[foreignList.labelField] as string | null) ?? `[Unnamed ${foreignList.singular} ${counter}]`
  setDialogOpen(false)
  setCounter(prev => prev + 1)

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
  const {
    displayMode,
    hideCreate,
    many,
    refFieldKey,
    refLabelField,
    refListKey,
    refSearchFields,
  } = config.fieldMeta

  const graphqlSelection = buildGraphqlSelection(config, fieldKey, many, refLabelField)

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
    graphqlSelection,
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: displayMode === 'select' ? config.fieldMeta.filter : null,
    selectSort: displayMode === 'select' ? config.fieldMeta.sort : null,
    defaultValue: many
      ? defaultManyValue
      : defaultOneValue,
    validate: buildValidateFunction(many),
    deserialize: data => deserializeValue(config, displayMode, many, data),
    serialize: state => serializeValue(config, state),
    filter: {
      Filter(props) {
        const foreignList = useList(refListKey)
        if (props.type === 'empty' || props.type === 'not_empty') return null
        if (props.type === 'is' || props.type === 'not_is') {
          return renderFilterIs({
            label,
            refLabelField,
            refSearchFields,
            foreignList,
            value: props.value,
            onChange: props.onChange,
            filter: config.fieldMeta.displayMode === 'select' ? config.fieldMeta.filter : null,
            sort: config.fieldMeta.displayMode === 'select' ? config.fieldMeta.sort : null,
          })
        }
        return renderFilterMany({
          label,
          refLabelField,
          refSearchFields,
          foreignList,
          type: props.type,
          value: props.value,
          onChange: props.onChange,
          filter: config.fieldMeta.displayMode === 'select' ? config.fieldMeta.filter : null,
          sort: config.fieldMeta.displayMode === 'select' ? config.fieldMeta.sort : null,
        })
      },
      Label({ label: labelProp, type, value }) {
        return renderFilterLabel({ label: labelProp, type, value })
      },
      graphql: ({ type, value }) => {
        return buildGraphqlFilter({ type, value, many, fieldKey })
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

const defaultManyValue = {
  kind: 'many' as const,
  id: null,
  initialValue: [],
  value: [],
}

const defaultOneValue = {
  kind: 'one' as const,
  id: null,
  value: null,
  initialValue: null,
}

function buildValidateFunction(many: boolean) {
  return function validate(value: any, opts: { isRequired: boolean }) {
    if ('count' in value) return true
    if (!opts.isRequired) return true
    if (value.kind === 'one') return value.value !== null
    return value.value.length > 0
  }
}

function deserializeValue(config: any, displayMode: string, many: boolean, data: any) {
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
    return { kind: 'many' as const, id: data.id, initialValue: value, value }
  }
  let value = data[config.fieldKey]
  if (value) {
    value = { id: value.id, label: value.label || value.id }
  }
  return {
    kind: 'one' as const,
    id: data.id,
    value,
    initialValue: value,
  }
}

function serializeValue(config: any, state: any) {
  if (state.kind === 'many') {
    return serializeManyState(config, state)
  }
  if (state.kind === 'one') {
    return serializeOneState(config, state)
  }
  return {}
}

function serializeManyState(config: any, state: any) {
  const newAllIds = new Set(state.value.map((x: any) => x.id))
  const initialIds = new Set(state.initialValue.map((x: any) => x.id))
  const disconnect = state.initialValue.filter((x: any) => !newAllIds.has(x.id)).map((x: any) => ({ id: x.id }))
  const connect = state.value.filter((x: any) => !x.built && !initialIds.has(x.id)).map((x: any) => ({ id: x.id }))
  const create = state.value.filter((x: any) => x.built).map((x: any) => x.data)
  const output: any = {}
  if (disconnect.length) output.disconnect = disconnect
  if (connect.length) output.connect = connect
  if (create.length) output.create = create

  return Object.keys(output).length ? { [config.fieldKey]: output } : {}
}

function serializeOneState(config: any, state: any) {
  if (state.initialValue && !state.value) return { [config.fieldKey]: { disconnect: true } }
  if (state.value?.built) {
    return { [config.fieldKey]: { create: state.value.data } }
  }
  if (state.value && state.value.id !== state.initialValue?.id) {
    return { [config.fieldKey]: { connect: { id: state.value.id } } }
  }
  return {}
}

function buildGraphqlSelection(config: any, fieldKey: string, many: boolean, refLabelField: string) {
  const { displayMode } = config.fieldMeta
  if (displayMode === 'count' || displayMode === 'table') {
    return `${fieldKey}Count`
  }
  const orderBy = many && config.fieldMeta.sort
    ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
    : ''
  return `${fieldKey}${orderBy} {
    id
    label: ${refLabelField}
  }`
}

function renderFilterIs({ label, refLabelField, refSearchFields, foreignList, value, onChange, filter, sort }: any) {
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
        value: typeof value === 'string' ? { id: value, label: value, built: false } : null,
        onChange(newItem) {
          onChange(newItem === null ? null : newItem.id.toString())
        },
      }}
      filter={filter}
      sort={sort}
    />
  )
}

function renderFilterMany({ label, refLabelField, refSearchFields, foreignList, type, value, onChange, filter, sort }: any) {
  const ids = Array.isArray(value) ? value : []
  const displayItems = ids.map((id: string) => ({ id, label: id, built: false }))
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
          value: displayItems,
          onChange(newItems) {
            onChange(newItems.map((x: any) => x.id.toString()))
          },
        }}
        filter={filter}
        sort={sort}
      />
      <TagGroup
        aria-label={`related ${foreignList.plural}`}
        items={displayItems.map(item => ({
          id: item.id.toString() ?? '',
          label: item.label ?? '',
          href: item.built ? '' : `/${foreignList.path}/${item.id}`,
        }))}
        maxRows={2}
        onRemove={keys => {
          onChange(ids.filter((id: string) => !keys.has(id)))
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

function renderFilterLabel({ label, type, value }: any) {
  const listFormatter = useListFormatter({ style: 'short', type: 'disjunction' })

  if (['empty', 'not_empty'].includes(type)) return label.toLowerCase()
  if (['is', 'not_is'].includes(type)) return `${label.toLowerCase()} ${value}`
  return `${label.toLowerCase()} (${listFormatter.format(value || [''])})`
}

function buildGraphqlFilter({ type, value, many, fieldKey }: any) {
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