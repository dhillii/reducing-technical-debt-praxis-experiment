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

/* ---------- Predicate Helpers ---------- */

/** Returns true when the field should be rendered as a count or table. */
function isCountOrTableDisplay(field: any): boolean {
  return field.display === 'count' || field.display === 'table'
}

/** Returns true when the field is read‑only (no onChange). */
function isReadOnlyField(onChange: any): boolean {
  return onChange === undefined
}

/** Returns true when the filter type is empty or not empty. */
function isEmptyOrNotEmpty(type: string): boolean {
  return type === 'empty' || type === 'not_empty'
}

/** Returns true when the filter type is equality based. */
function isEqualityFilter(type: string): boolean {
  return type === 'is' || type === 'not_is'
}

/** Returns true when the filter type is a collection filter. */
function isCollectionFilter(type: string): boolean {
  return type === 'some' || type === 'not_some'
}

/** Returns true when the display mode is "select". */
function isSelectMode(displayMode: string): boolean {
  return displayMode === 'select'
}

/* ---------- Render Helpers ---------- */

function renderCountField(
  props: FieldProps<typeof controller>,
  foreignList: any,
  description: string | undefined,
  isReadOnly: boolean,
  counter: number,
  setDialogOpen: (open: boolean) => void,
  setCounter: (c: number) => void
) {
  const { autoFocus, field, value, onChange } = props
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

/** Renders the dialog used for creating a new related item. */
function renderBuildDialog(
  dialogIsOpen: boolean,
  foreignList: any,
  counter: number,
  setDialogOpen: (open: boolean) => void,
  setCounter: (c: number) => void,
  value: any,
  onChange: any
) {
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

/* ---------- Main Field Component ---------- */

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
  const isReadOnly = isReadOnlyField(onChange)
  const [counter, setCounter] = useState(1)

  if (value.kind === 'count') {
    if (field.display === 'table') {
      return <RelationshipTable field={field} value={value} />
    }
    return renderCountField(
      props,
      foreignList,
      description,
      isReadOnly,
      counter,
      setDialogOpen,
      setCounter
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
          {renderBuildDialog(
            dialogIsOpen,
            foreignList,
            counter,
            setDialogOpen,
            setCounter,
            value,
            onChange
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

/* ---------- TagGroup Item Renderer ---------- */

function renderItem(item: { id: string; href: string; label: string }) {
  return item.href === '' ? <Item>{item.label}</Item> : <Item href={item.href}>{item.label}</Item>
}

/* ---------- Cell Component ---------- */

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

/* ---------- Controller Builder ---------- */

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
    graphqlSelection: buildGraphQLSelection(config, many, displayMode, fieldKey),
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: isSelectMode(displayMode) ? config.fieldMeta.filter : null,
    selectSort: isSelectMode(displayMode) ? config.fieldMeta.sort : null,
    defaultValue: many
      ? { kind: 'many', id: null, initialValue: [], value: [] }
      : { kind: 'one', id: null, value: null, initialValue: null },
    validate(value, opts) {
      if ('count' in value) return true
      if (!opts.isRequired) return true
      return value.kind === 'one' ? value.value !== null : value.value.length > 0
    },
    deserialize: data => deserializeData(data, config, many, displayMode),
    serialize: state => serializeState(state, config),
    filter: buildFilterConfig(refListKey, label, many, config),
  }
}

/* ---------- Helper Functions for Controller ---------- */

/**
 * Constructs the GraphQL selection string based on display mode.
 */
function buildGraphQLSelection(
  config: any,
  many: boolean,
  displayMode: string,
  fieldKey: string
): string {
  if (isCountOrTableDisplay({ display: displayMode })) {
    return `${fieldKey}Count`
  }
  const sortPart =
    many && config.fieldMeta.sort
      ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
      : ''
  return `${fieldKey}${sortPart} {
    id
    label: ${config.fieldMeta.refLabelField}
  }`
}

/**
 * Deserializes raw GraphQL data into the field's internal state.
 */
function deserializeData(
  data: any,
  config: any,
  many: boolean,
  displayMode: string
) {
  if (isCountOrTableDisplay({ display: displayMode })) {
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
}

/**
 * Serializes the field state back to a GraphQL payload.
 */
function serializeState(state: any, config: any) {
  if (state.kind === 'many') {
    const newAllIds = new Set(state.value.map((x: any) => x.id))
    const initialIds = new Set(state.initialValue.map((x: any) => x.id))

    const disconnect = state.initialValue
      .filter((x: any) => !newAllIds.has(x.id))
      .map((x: any) => ({ id: x.id }))

    const connect = state.value
      .filter((x: any) => !x.built && !initialIds.has(x.id))
      .map((x: any) => ({ id: x.id }))

    const create = state.value.filter((x: any) => x.built).map((x: any) => x.data)

    const output: any = {
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
}

/**
 * Builds the filter configuration object.
 */
function buildFilterConfig(
  refListKey: string,
  label: string,
  many: boolean,
  config: any
) {
  return {
    Filter(props: any) {
      const foreignList = useList(refListKey)

      if (isEmptyOrNotEmpty(props.type)) return null

      if (isEqualityFilter(props.type)) {
        return (
          <ComboboxSingle
            autoFocus
            aria-label={label}
            isReadOnly={false}
            labelField={config.fieldMeta.refLabelField}
            searchFields={config.fieldMeta.refSearchFields}
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
            filter={isSelectMode(config.fieldMeta.displayMode) ? config.fieldMeta.filter : null}
            sort={isSelectMode(config.fieldMeta.displayMode) ? config.fieldMeta.sort : null}
          />
        )
      }

      const ids = Array.isArray(props.value) ? props.value : []
      const value = ids.map((id: string) => ({
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
            labelField={config.fieldMeta.refLabelField}
            searchFields={config.fieldMeta.refSearchFields}
            list={foreignList}
            state={{
              kind: 'many',
              value,
              onChange(newItem) {
                props.onChange(newItem.map((x: any) => x.id.toString()))
              },
            }}
            filter={isSelectMode(config.fieldMeta.displayMode) ? config.fieldMeta.filter : null}
            sort={isSelectMode(config.fieldMeta.displayMode) ? config.fieldMeta.sort : null}
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

    Label({ label: lbl, type, value }: any) {
      const listFormatter = useListFormatter({
        style: 'short',
        type: 'disjunction',
      })

      if (isEmptyOrNotEmpty(type)) return lbl.toLowerCase()
      if (isEqualityFilter(type)) return `${lbl.toLowerCase()} ${value}`
      return `${lbl.toLowerCase()} (${listFormatter.format(value || [])})`
    },

    graphql({ type, value }: any) {
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
  }
}