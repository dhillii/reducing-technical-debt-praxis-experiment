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

/**
 * Renders a relationship field when the value kind is "count".
 */
function CountField({
  field,
  value,
  foreignList,
  description,
  isReadOnly,
}: {
  field: any
  value: any
  foreignList: any
  description?: string
  isReadOnly: boolean
}) {
  if (field.display === 'table') {
    return <RelationshipTable field={field} value={value} />
  }

  const textField = (
    <TextField
      autoFocus={field.autoFocus}
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
        href={`/${foreignList.path}?${buildQueryForRelationshipFieldWithForeignField(
          foreignList,
          field.refFieldKey,
          value.id
        )}`}
      >
        <Icon src={arrowUpRightIcon} />
      </ActionButton>
    </HStack>
  )
}

/**
 * Renders a tag group for many‑value relationships.
 */
function RelatedTagGroup({
  foreignList,
  value,
  isReadOnly,
  onChange,
}: {
  foreignList: any
  value: any
  isReadOnly: boolean
  onChange: (newValue: any) => void
}) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={value.isRequired}
      items={value.value.map((item: any) => ({
        id: item.id.toString() ?? '',
        label: item.label ?? '',
        href: item.built ? '' : `/${foreignList.path}/${item.id}`,
      }))}
      maxRows={2}
      onRemove={
        isReadOnly
          ? undefined
          : (keys: Set<string>) => {
              onChange({
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

/**
 * Handles creation of a new related item via a dialog.
 */
function BuildItemDialogWrapper({
  foreignList,
  dialogIsOpen,
  setDialogOpen,
  counter,
  setCounter,
  value,
  onChange,
}: {
  foreignList: any
  dialogIsOpen: boolean
  setDialogOpen: (open: boolean) => void
  counter: number
  setCounter: (c: number) => void
  value: any
  onChange: (newValue: any) => void
}) {
  if (!dialogIsOpen) return null

  return (
    <BuildItemDialog
      listKey={foreignList.key}
      onChange={builtItemData => {
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
              { id, label, data: builtItemData, built: true },
            ],
          })
        } else {
          onChange({
            ...value,
            value: { id, label, data: builtItemData, built: true },
          })
        }
      }}
    />
  )
}

/**
 * Main field component.
 */
export function Field(props: FieldProps<typeof controller>) {
  const {
    autoFocus,
    field,
    forceValidation = false,
    onChange,
    value,
    isRequired,
  } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (value.kind === 'count') {
    return (
      <CountField
        field={{ ...field, autoFocus }}
        value={value}
        foreignList={foreignList}
        description={description}
        isReadOnly={isReadOnly}
      />
    )
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {value.kind === 'many' ? (
            <ComboboxMany
              autoFocus={autoFocus}
              label={field.label}
              description={description}
              forceValidation={forceValidation}
              isReadOnly={isReadOnly}
              isRequired={isRequired}
              list={foreignList}
              labelField={field.refLabelField}
              searchFields={field.refSearchFields}
              filter={field.selectFilter}
              sort={field.selectSort}
              state={{
                kind: 'many',
                value: value.value,
                onChange(newItems) {
                  onChange?.({ ...value, value: newItems })
                },
              }}
            />
          ) : (
            <ComboboxSingle
              autoFocus={autoFocus}
              label={field.label}
              description={description}
              forceValidation={forceValidation}
              isReadOnly={isReadOnly}
              isRequired={isRequired}
              list={foreignList}
              labelField={field.refLabelField}
              searchFields={field.refSearchFields}
              filter={field.selectFilter}
              sort={field.selectSort}
              state={{
                kind: 'one',
                value: value.value,
                onChange(newItem) {
                  onChange?.({ ...value, value: newItem })
                },
              }}
            />
          )}
        </ContextualActions>

        {value.kind === 'many' && (
          <RelatedTagGroup
            foreignList={foreignList}
            value={value}
            isReadOnly={isReadOnly}
            onChange={onChange!}
          />
        )}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          <BuildItemDialogWrapper
            foreignList={foreignList}
            dialogIsOpen={dialogIsOpen}
            setDialogOpen={setDialogOpen}
            counter={counter}
            setCounter={setCounter}
            value={value}
            onChange={onChange!}
          />
        </DialogContainer>
      )}
    </Fragment>
  )
}

// NOTE: fix for `TagGroup` perf issue, should typically be okay to just
// inline the render function
function renderItem(item: { id: string; href: string; label: string }) {
  return item.href === '' ? <Item>{item.label}</Item> : <Item href={item.href}>{item.label}</Item>
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
      {displayItems.map((itm, idx) => (
        <Fragment key={itm.id}>
          {idx ? ', ' : ''}
          <TextLink href={`/${list.path}/${itm.id}`}>{itm.label || itm.id}</TextLink>
        </Fragment>
      ))}
      {overflow ? `, and ${overflow} more` : null}
    </Text>
  )
}

/**
 * Controller factory for relationship fields.
 */
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

  const graphqlSelection =
    displayMode === 'count' || displayMode === 'table'
      ? `${fieldKey}Count`
      : `${fieldKey}${
          many && config.fieldMeta.sort
            ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
            : ''
        } {
          id
          label: ${refLabelField}
        }`

  const controllerObj: RelationshipController = {
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
      ? { kind: 'many', id: null, initialValue: [], value: [] }
      : { kind: 'one', id: null, value: null, initialValue: null },
    validate(value, opts) {
      if ('count' in value) return true
      return opts.isRequired
        ? value.kind === 'one'
          ? value.value !== null
          : value.value.length > 0
        : true
    },
    deserialize(data) {
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
        return { kind: 'many', id: data.id, initialValue: value, value }
      }
      let value = data[config.fieldKey]
      if (value) {
        value = { id: value.id, label: value.label || value.id }
      }
      return { kind: 'one', id: data.id, value, initialValue: value }
    },
    serialize(state) {
      if (state.kind === 'many') {
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
        return Object.keys(output).length ? { [config.fieldKey]: output } : {}
      }

      if (state.kind === 'one') {
        if (state.initialValue && !state.value) {
          return { [config.fieldKey]: { disconnect: true } }
        }
        if (state.value?.built) {
          return { [config.fieldKey]: { create: state.value.data } }
        }
        if (state.value && state.value.id !== state.initialValue?.id) {
          return {
            [config.fieldKey]: { connect: { id: state.value.id } },
          }
        }
      }
      return {}
    },
    filter: {
      Filter: FilterComponent,
      Label: LabelComponent,
      graphql: graphqlFilter,
      parseGraphQL: () => [],
      types: filterTypes(many),
    },
  }

  return controllerObj
}

/**
 * UI for filtering relationship fields.
 */
function FilterComponent(props: any) {
  const foreignList = useList(props.refListKey)
  const { refLabelField, refSearchFields, fieldMeta, label } = props

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
        filter={fieldMeta.displayMode === 'select' ? fieldMeta.filter : null}
        sort={fieldMeta.displayMode === 'select' ? fieldMeta.sort : null}
      />
    )
  }

  const ids = Array.isArray(props.value) ? props.value : []
  const value = ids.map((id) => ({
    id,
    label: id,
    built: false,
  }))

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
            props.onChange(newItem.map((x: any) => x.id.toString()))
          },
        }}
        filter={fieldMeta.displayMode === 'select' ? fieldMeta.filter : null}
        sort={fieldMeta.displayMode === 'select' ? fieldMeta.sort : null}
      />
      <TagGroup
        aria-label={`related ${foreignList.plural}`}
        items={value.map((item) => ({
          id: item.id.toString() ?? '',
          label: item.label ?? '',
          href: item.built ? '' : `/${foreignList.path}/${item.id}`,
        }))}
        maxRows={2}
        onRemove={(keys: Set<string>) => {
          props.onChange(ids.filter((id) => !keys.has(id)))
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

/**
 * Generates a human‑readable label for a filter.
 */
function LabelComponent({ label, type, value }: any) {
  const listFormatter = useListFormatter({
    style: 'short',
    type: 'disjunction',
  })

  if (['empty', 'not_empty'].includes(type)) return label.toLowerCase()
  if (['is', 'not_is'].includes(type)) return `${label.toLowerCase()} ${value}`
  return `${label.toLowerCase()} (${listFormatter.format(value || [''])})`
}

/**
 * Translates filter definitions to GraphQL.
 */
function graphqlFilter({ type, value }: any) {
  const fieldKey = this.fieldKey
  const many = this.many

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
}

/**
 * Returns filter type definitions based on relationship cardinality.
 */
function filterTypes(many: boolean) {
  const base = {
    empty: { label: 'Is empty', initialValue: null },
    not_empty: { label: 'Is not empty', initialValue: null },
  }
  if (many) {
    return {
      ...base,
      some: { label: 'Is one of', initialValue: [] },
      not_some: { label: 'Is not one of', initialValue: [] },
    }
  }
  return {
    ...base,
    is: { label: 'Is', initialValue: null },
    not_is: { label: 'Is not', initialValue: null },
  }
}