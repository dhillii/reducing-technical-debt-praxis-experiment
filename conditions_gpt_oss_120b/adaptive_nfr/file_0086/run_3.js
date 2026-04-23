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
 * Guard predicate: value is of kind 'count'.
 */
function isCountKind(value: any): boolean {
  return value.kind === 'count'
}

/**
 * Guard predicate: value is of kind 'many'.
 */
function isManyKind(value: any): boolean {
  return value.kind === 'many'
}

/**
 * Guard predicate: value is of kind 'one'.
 */
function isOneKind(value: any): boolean {
  return value.kind === 'one'
}

/**
 * Guard predicate: field display mode is 'table'.
 */
function isTableDisplay(field: any): boolean {
  return field.display === 'table'
}

/**
 * Guard predicate: component is read‑only.
 */
function isReadOnly(onChange: any): boolean {
  return onChange === undefined
}

/**
 * Renders the UI for a count‑type relationship field.
 */
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
 * Renders the appropriate combobox based on relationship kind.
 */
function renderCombobox(
  kind: 'many' | 'one',
  shared: {
    autoFocus: boolean
    label: string
    description: string | undefined
    forceValidation: boolean
    isReadOnly: boolean
    isRequired: boolean
    list: any
    labelField: string | undefined
    searchFields: string[] | undefined
    filter: any
    sort: any
    state: any
  }
) {
  if (kind === 'many') {
    return (
      <ComboboxMany
        autoFocus={shared.autoFocus}
        label={shared.label}
        description={shared.description}
        forceValidation={shared.forceValidation}
        isReadOnly={shared.isReadOnly}
        isRequired={shared.isRequired}
        list={shared.list}
        labelField={shared.labelField}
        searchFields={shared.searchFields}
        filter={shared.filter}
        sort={shared.sort}
        state={shared.state}
      />
    )
  }
  return (
    <ComboboxSingle
      autoFocus={shared.autoFocus}
      label={shared.label}
      description={shared.description}
      forceValidation={shared.forceValidation}
      isReadOnly={shared.isReadOnly}
      isRequired={shared.isRequired}
      list={shared.list}
      labelField={shared.labelField}
      searchFields={shared.searchFields}
      filter={shared.filter}
      sort={shared.sort}
      state={shared.state}
    />
  )
}

/**
 * Renders the tag group for a many‑kind relationship.
 */
function renderTagGroup(
  props: {
    foreignList: any
    value: any
    isReadOnly: boolean
    onChange: (value: any) => void
    isRequired: boolean
  }
) {
  const { foreignList, value, isReadOnly, onChange, isRequired } = props
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
 * Handles dialog submission for creating a new related item.
 */
function handleDialogChange(
  params: {
    kind: 'many' | 'one'
    value: any
    builtItemData: any
    foreignList: any
    counter: number
    setCounter: (n: number) => void
    onChange: (v: any) => void
    setDialogOpen: (open: boolean) => void
  }
) {
  const {
    kind,
    value,
    builtItemData,
    foreignList,
    counter,
    setCounter,
    onChange,
    setDialogOpen,
  } = params

  const id = `_____temporary_${counter}`
  const label =
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`

  setDialogOpen(false)
  setCounter(counter + 1)

  if (kind === 'many') {
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
 * Renders a single tag item.
 */
function renderItem(item: { id: string; href: string; label: string }) {
  if (item.href === '') return <Item>{item.label}</Item>
  return <Item href={item.href}>{item.label}</Item>
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
  const readOnly = isReadOnly(onChange)
  const [counter, setCounter] = useState(1)

  if (isCountKind(value)) {
    return renderCountField({
      autoFocus,
      field,
      description,
      value,
      foreignList,
    })
  }

  const sharedComboboxProps = {
    autoFocus,
    label: field.label,
    description,
    forceValidation,
    isReadOnly: readOnly,
    isRequired,
    list: foreignList,
    labelField: field.refLabelField,
    searchFields: field.refSearchFields,
    filter: field.selectFilter,
    sort: field.selectSort,
    state: {
      kind: isManyKind(value) ? 'many' : 'one',
      value: value.value,
      onChange: (newVal: any) => {
        onChange?.({ ...value, value: newVal })
      },
    },
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(isManyKind(value) ? 'many' : 'one', sharedComboboxProps)}
        </ContextualActions>

        {isManyKind(value) && renderTagGroup({ foreignList, value, isReadOnly: readOnly, onChange, isRequired })}
      </VStack>

      {!readOnly && (
        <DialogContainer onDismiss={() => setDialogOpen(false)}>
          {dialogIsOpen && (
            <BuildItemDialog
              listKey={foreignList.key}
              onChange={builtItemData => {
                handleDialogChange({
                  kind: isManyKind(value) ? 'many' : 'one',
                  value,
                  builtItemData,
                  foreignList,
                  counter,
                  setCounter,
                  onChange,
                  setDialogOpen,
                })
              }}
            />
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

/**
 * Predicate: filter type is empty.
 */
function isEmptyType(type: string): boolean {
  return type === 'empty'
}

/**
 * Predicate: filter type is not empty.
 */
function isNotEmptyType(type: string): boolean {
  return type === 'not_empty'
}

/**
 * Predicate: filter type is equality based.
 */
function isEqualityType(type: string): boolean {
  return type === 'is' || type === 'not_is'
}

/**
 * Predicate: filter type is collection based.
 */
function isCollectionType(type: string): boolean {
  return type === 'some' || type === 'not_some'
}

/**
 * Cell component for relationship fields.
 */
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

  const graphqlSelection = (() => {
    if (displayMode === 'count' || displayMode === 'table') {
      return `${fieldKey}Count`
    }
    const sortPart =
      many && config.fieldMeta.sort
        ? `(orderBy: { ${config.fieldMeta.sort.field}: ${config.fieldMeta.sort.direction.toLowerCase()} })`
        : ''
    return `${fieldKey}${sortPart} {
      id
      label: ${refLabelField}
    }`
  })()

  const hideCreateFlag = hideCreate || displayMode === 'table'

  const defaultValue = many
    ? {
        kind: 'many' as const,
        id: null,
        initialValue: [] as any[],
        value: [] as any[],
      }
    : {
        kind: 'one' as const,
        id: null,
        value: null,
        initialValue: null,
      }

  const validate = (value: any, opts: any) => {
    if ('count' in value) return true
    if (!opts.isRequired) return true
    return value.kind === 'one' ? value.value !== null : value.value.length > 0
  }

  const deserialize = (data: any) => {
    if (displayMode === 'count' || displayMode === 'table') {
      return {
        id: data.id,
        kind: 'count' as const,
        count: data[`${config.fieldKey}Count`] ?? 0,
      }
    }
    if (many) {
      const value = (data[config.fieldKey] || []).map((x: any) => ({
        id: x.id,
        label: x.label || x.id,
      }))
      return {
        kind: 'many' as const,
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
      kind: 'one' as const,
      id: data.id,
      value,
      initialValue: value,
    }
  }

  const serializeMany = (state: any) => {
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

  const serializeOne = (state: any) => {
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
    return {}
  }

  const serialize = (state: any) => {
    if (state.kind === 'many') {
      return serializeMany(state)
    }
    if (state.kind === 'one') {
      return serializeOne(state)
    }
    return {}
  }

  const filterComponent = (props: any) => {
    const foreignList = useList(refListKey)
    if (isEmptyType(props.type) || isNotEmptyType(props.type)) return null

    if (isEqualityType(props.type)) {
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
            onChange: (newItem: any) => {
              props.onChange(newItem === null ? null : newItem.id.toString())
            },
          }}
          filter={displayMode === 'select' ? config.fieldMeta.filter : null}
          sort={displayMode === 'select' ? config.fieldMeta.sort : null}
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
            onChange: (newItem: any) => {
              props.onChange(newItem.map((x: any) => x.id.toString()))
            },
          }}
          filter={displayMode === 'select' ? config.fieldMeta.filter : null}
          sort={displayMode === 'select' ? config.fieldMeta.sort : null}
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

  const filterLabel = ({ label, type, value }: any) => {
    const listFormatter = useListFormatter({
      style: 'short',
      type: 'disjunction',
    })

    if (isEmptyType(type) || isNotEmptyType(type)) return label.toLowerCase()
    if (isEqualityType(type)) return `${label.toLowerCase()} ${value}`
    return `${label.toLowerCase()} (${listFormatter.format(value || [])})`
  }

  const filterGraphQL = ({ type, value }: any) => {
    switch (type) {
      case 'empty':
        return many
          ? { [config.fieldKey]: { none: {} } }
          : { [config.fieldKey]: { equals: null } }
      case 'not_empty':
        return many
          ? { [config.fieldKey]: { some: {} } }
          : { [config.fieldKey]: { not: { equals: null } } }
      case 'is':
        return { [config.fieldKey]: { id: { equals: value } } }
      case 'not_is':
        return { [config.fieldKey]: { not: { id: { equals: value } } } }
      case 'some':
        return { [config.fieldKey]: { some: { id: { in: value } } } }
      case 'not_some':
        return { [config.fieldKey]: { not: { some: { id: { in: value } } } } }
      default:
        return { [config.fieldKey]: { [type]: value } }
    }
  }

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
    hideCreate: hideCreateFlag,
    columns: displayMode === 'table' ? config.fieldMeta.columns : null,
    initialSort: displayMode === 'table' ? config.fieldMeta.initialSort : null,
    selectFilter: displayMode === 'select' ? config.fieldMeta.filter : null,
    selectSort: displayMode === 'select' ? config.fieldMeta.sort : null,
    defaultValue,
    validate,
    deserialize,
    serialize,
    filter: {
      Filter: filterComponent,
      Label: filterLabel,
      graphql: filterGraphQL,
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