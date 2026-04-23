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
 * Guard: value is a count kind.
 */
function isCountValue(value: any): value is { kind: 'count'; count: number; id: string } {
  return value.kind === 'count'
}

/**
 * Guard: field display is table.
 */
function isTableDisplay(field: any): boolean {
  return field.display === 'table'
}

/**
 * Guard: field display is count.
 */
function isCountDisplay(field: any): boolean {
  return field.display === 'count'
}

/**
 * Guard: field display is select.
 */
function isSelectDisplay(field: any): boolean {
  return field.display === 'select'
}

/**
 * Render a read‑only count field.
 */
function renderCountField(
  props: {
    autoFocus: boolean
    field: any
    description?: string
    foreignList: any
    isReadOnly: boolean
    value: { kind: 'count'; count: number; id: string }
  }
) {
  const { autoFocus, field, description, foreignList, isReadOnly, value } = props
  if (isTableDisplay(field)) {
    return <RelationshipTable field={field} value={value} />
  }

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

/**
 * Render the appropriate combobox based on relationship kind.
 */
function renderCombobox(
  params: {
    kind: 'many' | 'one'
    autoFocus: boolean
    label: string
    description?: string
    forceValidation: boolean
    isReadOnly: boolean
    isRequired: boolean
    list: any
    labelField?: string
    searchFields?: string[]
    filter?: any
    sort?: any
    stateValue: any
    onChange: (newValue: any) => void
  }
) {
  const {
    kind,
    autoFocus,
    label,
    description,
    forceValidation,
    isReadOnly,
    isRequired,
    list,
    labelField,
    searchFields,
    filter,
    sort,
    stateValue,
    onChange,
  } = params

  if (kind === 'many') {
    return (
      <ComboboxMany
        autoFocus={autoFocus}
        label={label}
        description={description}
        forceValidation={forceValidation}
        isReadOnly={isReadOnly}
        isRequired={isRequired}
        list={list}
        labelField={labelField}
        searchFields={searchFields}
        filter={filter}
        sort={sort}
        state={{
          kind: 'many',
          value: stateValue,
          onChange: onChange,
        }}
      />
    )
  }

  return (
    <ComboboxSingle
      autoFocus={autoFocus}
      label={label}
      description={description}
      forceValidation={forceValidation}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      list={list}
      labelField={labelField}
      searchFields={searchFields}
      filter={filter}
      sort={sort}
      state={{
        kind: 'one',
        value: stateValue,
        onChange: onChange,
      }}
    />
  )
}

/**
 * Render a tag group for many‑value relationships.
 */
function renderTagGroup(
  params: {
    value: any
    foreignList: any
    isReadOnly: boolean
    isRequired: boolean
    onChange?: (newValue: any) => void
  }
) {
  const { value, foreignList, isReadOnly, isRequired, onChange } = params

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
          : (keys: Set<string>) => {
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

/**
 * Handle creation of a temporary built item from the dialog.
 */
function handleDialogChange(
  params: {
    value: any
    onChange: (newValue: any) => void
    many: boolean
    counter: number
    setCounter: (n: number) => void
    setDialogOpen: (open: boolean) => void
    foreignList: any
  },
  builtItemData: any
) {
  const { value, onChange, many, counter, setCounter, setDialogOpen, foreignList } = params

  const id = `_____temporary_${counter}`
  const label =
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`

  setDialogOpen(false)
  setCounter(counter + 1)

  if (many) {
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
  } else {
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

/**
 * Render a single item for TagGroup.
 */
function renderItem(item: { id: string; href: string; label: string }) {
  if (item.href === '') return <Item>{item.label}</Item>
  return <Item href={item.href}>{item.label}</Item>
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (isCountValue(value)) {
    return renderCountField({
      autoFocus,
      field,
      description,
      foreignList,
      isReadOnly,
      value,
    })
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox({
            kind: value.kind === 'many' ? 'many' : 'one',
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
            stateValue: value.value,
            onChange: (newVal: any) => {
              onChange?.({ ...value, value: newVal })
            },
          })}
        </ContextualActions>

        {value.kind === 'many' && renderTagGroup({ value, foreignList, isReadOnly, isRequired, onChange })}
      </VStack>

      {!isReadOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                handleDialogChange(
                  {
                    value,
                    onChange: onChange!,
                    many: value.kind === 'many',
                    counter,
                    setCounter,
                    setDialogOpen,
                    foreignList,
                  },
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

// NOTE: fix for `TagGroup` perf issue, should typically be okay to just
// inline the render function
function renderItem(item: { id: string; href: string; label: string }) {
  if (item.href === '') return <Item>{item.label}</Item>
  return <Item href={item.href}>{item.label}</Item>
}

export const Cell: CellComponent<typeof controller> = ({ field, item }) => {
  const list = useList(field.refListKey)

  if (isCountDisplay(field) || isTableDisplay(field)) {
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

  const isSelect = isSelectDisplay({ display: displayMode })
  const isCount = isCountDisplay({ display: displayMode })
  const isTable = isTableDisplay({ display: displayMode })

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
    graphqlSelection: isCount || isTable ? `${fieldKey}Count` : `${fieldKey}${
      many && config.fieldMeta.sort
        ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
        : ''
    } {
          id
          label: ${refLabelField}
        }`,
    hideCreate: hideCreate || isTable,
    columns: isTable ? config.fieldMeta.columns : null,
    initialSort: isTable ? config.fieldMeta.initialSort : null,
    selectFilter: isSelect ? config.fieldMeta.filter : null,
    selectSort: isSelect ? config.fieldMeta.sort : null,
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
      if ('count' in value) return true
      if (opts.isRequired) {
        return value.kind === 'one' ? value.value !== null : value.value.length > 0
      }
      return true
    },
    deserialize(data) {
      if (isCount || isTable) {
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
    serialize(state) {
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
        if (Object.keys(output).length) {
          return { [config.fieldKey]: output }
        }
      } else {
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
              connect: {
                id: state.value.id,
              },
            },
          }
        }
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
              filter={isSelect ? config.fieldMeta.filter : null}
              sort={isSelect ? config.fieldMeta.sort : null}
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
                  props.onChange(newItem.map((x) => x.id.toString()))
                },
              }}
              filter={isSelect ? config.fieldMeta.filter : null}
              sort={isSelect ? config.fieldMeta.sort : null}
            />
            <TagGroup
              aria-label={`related ${foreignList.plural}`}
              items={value.map((item) => ({
                id: item.id.toString() ?? '',
                label: item.label ?? '',
                href: item.built ? '' : `/${foreignList.path}/${item.id}`,
              }))}
              maxRows={2}
              onRemove={(keys) => {
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
      },
      Label({ label, type, value }) {
        const listFormatter = useListFormatter({
          style: 'short',
          type: 'disjunction',
        })

        if (type === 'empty' || type === 'not_empty') return label.toLowerCase()
        if (type === 'is' || type === 'not_is') return `${label.toLowerCase()} ${value}`
        return `${label.toLowerCase()} (${listFormatter.format(value || [])})`
      },
      graphql({ type, value }) {
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