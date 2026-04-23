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

/* ---------- Helper predicates ---------- */

/** @returns true when the field value is a count kind */
function isCountValue(value: any): boolean {
  return value.kind === 'count'
}

/** @returns true when the field should be rendered as a table */
function isTableDisplay(field: any): boolean {
  return field.display === 'table'
}

/** @returns true when the field should be rendered as a count */
function isCountDisplay(field: any): boolean {
  return field.display === 'count'
}

/** @returns true when the relationship is many */
function isMany(value: any): boolean {
  return value.kind === 'many'
}

/** @returns true when the relationship is one */
function isOne(value: any): boolean {
  return value.kind === 'one'
}

/** Guard for read‑only state */
function isReadOnly(onChange: any): boolean {
  return onChange === undefined
}

/* ---------- Render helpers ---------- */

function renderCountField(
  props: {
    autoFocus: boolean
    field: any
    description: string | undefined
    value: any
    foreignList: any
  }
) {
  const { autoFocus, field, description, value, foreignList } = props
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

/* ---------- Main field component ---------- */

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
  const readOnly = isReadOnly(onChange)
  const [counter, setCounter] = useState(1)

  if (isCountValue(value)) {
    if (isTableDisplay(field)) {
      return <RelationshipTable field={field} value={value} />
    }
    return renderCountField({ autoFocus, field, description, value, foreignList })
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {isMany(value) ? (
            <ComboboxMany
              autoFocus={autoFocus}
              label={field.label}
              description={description}
              forceValidation={forceValidation}
              isReadOnly={readOnly}
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
              isReadOnly={readOnly}
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

        {isMany(value) && (
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
              readOnly
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

      {!readOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                const id = `_____temporary_${counter}`
                const label =
                  (builtItemData?.[foreignList.labelField] as string | null) ??
                  `[Unnamed ${foreignList.singular} ${counter}]`
                setDialogOpen(false)
                setCounter(counter + 1)

                if (isMany(value)) {
                  onChange({
                    ...value,
                    value: [
                      ...value.value,
                      { id, label, data: builtItemData, built: true },
                    ],
                  })
                } else if (isOne(value)) {
                  onChange({
                    ...value,
                    value: { id, label, data: builtItemData, built: true },
                  })
                }
              }}
            />
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

/* ---------- TagGroup render helper ---------- */

function renderItem(item: { id: string; href: string; label: string }) {
  return item.href === '' ? <Item>{item.label}</Item> : <Item href={item.href}>{item.label}</Item>
}

/* ---------- Cell component ---------- */

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
      {displayItems.map((itm, index) => (
        <Fragment key={itm.id}>
          {index ? ', ' : ''}
          <TextLink href={`/${list.path}/${itm.id}`}>{itm.label || itm.id}</TextLink>
        </Fragment>
      ))}
      {overflow ? `, and ${overflow} more` : null}
    </Text>
  )
}

/* ---------- Controller factory ---------- */

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
    graphqlSelection: getGraphQLSelection(config, many, displayMode),
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: displayMode === 'select' ? config.fieldMeta.filter : null,
    selectSort: displayMode === 'select' ? config.fieldMeta.sort : null,
    defaultValue: getDefaultValue(many),
    validate: (value, opts) => validateValue(value, opts, many),
    deserialize: data => deserializeData(data, config, displayMode, many),
    serialize: state => serializeState(state, config),
    filter: {
      Filter: props => filterComponent(props, config, many, refListKey, label, refLabelField, refSearchFields),
      Label: ({ label, type, value }) => filterLabel(label, type, value),
      graphql: ({ type, value }) => graphqlFilter({ type, value }, config, many),
      parseGraphQL: () => [],
      types: getFilterTypes(many),
    },
  }
}

/* ---------- Helper implementations ---------- */

/**
 * Build the GraphQL selection string based on display mode.
 */
function getGraphQLSelection(
  config: any,
  many: boolean,
  displayMode: string
): string {
  const { fieldKey } = config
  if (displayMode === 'count' || displayMode === 'table') {
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
 * Return the appropriate default value for many / one relationships.
 */
function getDefaultValue(many: boolean) {
  return many
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
      }
}

/**
 * Validate a relationship value.
 */
function validateValue(value: any, opts: any, many: boolean): boolean {
  if ('count' in value) return true
  if (!opts.isRequired) return true
  return many ? value.value.length > 0 : value.value !== null
}

/**
 * Deserialize raw data into a relationship value.
 */
function deserializeData(
  data: any,
  config: any,
  displayMode: string,
  many: boolean
) {
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
}

/**
 * Serialize the UI state back to a GraphQL payload.
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

    const output = {
      ...(disconnect.length ? { disconnect } : {}),
      ...(connect.length ? { connect } : {}),
      ...(create.length ? { create } : {}),
    }

    return Object.keys(output).length ? { [config.fieldKey]: output } : {}
  }

  // one‑item handling
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
        connect: { id: state.value.id },
      },
    }
  }
  return {}
}

/**
 * Render the filter UI component.
 */
function filterComponent(
  props: any,
  config: any,
  many: boolean,
  refListKey: string,
  label: string,
  refLabelField: string,
  refSearchFields: string[]
) {
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
  const value = ids.map((id: string): RelationshipValue => ({
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
}

/**
 * Render a human‑readable label for a filter.
 */
function filterLabel(label: string, type: string, value: any) {
  const listFormatter = useListFormatter({
    style: 'short',
    type: 'disjunction',
  })

  if (['empty', 'not_empty'].includes(type)) return label.toLowerCase()
  if (['is', 'not_is'].includes(type)) return `${label.toLowerCase()} ${value}`
  return `${label.toLowerCase()} (${listFormatter.format(value || [''])})`
}

/**
 * Build the GraphQL filter object.
 */
function graphqlFilter(
  { type, value }: { type: string; value: any },
  config: any,
  many: boolean
) {
  const key = config.fieldKey
  if (type === 'empty' && !many) return { [key]: { equals: null } }
  if (type === 'empty' && many) return { [key]: { none: {} } }
  if (type === 'not_empty' && !many) return { [key]: { not: { equals: null } } }
  if (type === 'not_empty' && many) return { [key]: { some: {} } }
  if (type === 'is') return { [key]: { id: { equals: value } } }
  if (type === 'not_is') return { [key]: { not: { id: { equals: value } } } }
  if (type === 'some') return { [key]: { some: { id: { in: value } } } }
  if (type === 'not_some')
    return { [key]: { not: { some: { id: { in: value } } } } }
  return { [key]: { [type]: value } }
}

/**
 * Generate filter type definitions.
 */
function getFilterTypes(many: boolean) {
  const base = {
    empty: { label: 'Is empty', initialValue: null },
    not_empty: { label: 'Is not empty', initialValue: null },
  }
  return many
    ? {
        ...base,
        some: { label: 'Is one of', initialValue: [] },
        not_some: { label: 'Is not one of', initialValue: [] },
      }
    : {
        ...base,
        is: { label: 'Is', initialValue: null },
        not_is: { label: 'Is not', initialValue: null },
      }
}