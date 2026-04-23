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
    if (field.display === 'table') {
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
              }}
            />
          )}
        </DialogContainer>
      )}
    </Fragment>
  )
}

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

function buildGraphqlSelection(
  fieldKey: string,
  many: boolean,
  sort: ListSortDescriptor<string> | null,
  displayMode: string,
  refLabelField: string
) {
  if (displayMode === 'count' || displayMode === 'table') {
    return `${fieldKey}Count`
  }
  const orderBy =
    many && sort
      ? `(orderBy: { ${sort.field}: ${sort.direction.toLowerCase()} })`
      : ''
  return `${fieldKey}${orderBy} { id label: ${refLabelField} }`
}

function buildDefaultValue(many: boolean) {
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

function validateValue(value: any, opts: { isRequired: boolean }) {
  if ('count' in value) return true
  if (!opts.isRequired) return true
  return value.kind === 'one'
    ? value.value !== null
    : value.value.length > 0
}

function serializeState(state: any, fieldKey: string) {
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
    const output: any = {}
    if (disconnect.length) output.disconnect = disconnect
    if (connect.length) output.connect = connect
    if (create.length) output.create = create
    if (Object.keys(output).length) return { [fieldKey]: output }
  } else if (state.kind === 'one') {
    if (state.initialValue && !state.value) return { [fieldKey]: { disconnect: true } }
    if (state.value?.built) {
      return { [fieldKey]: { create: state.value.data } }
    }
    if (state.value && state.value.id !== state.initialValue?.id) {
      return { [fieldKey]: { connect: { id: state.value.id } } }
    }
  }
  return {}
}

function buildFilterGraphql(type: string, value: any, many: boolean, fieldKey: string) {
  const map: Record<string, any> = {
    empty: many ? { [fieldKey]: { none: {} } } : { [fieldKey]: { equals: null } },
    not_empty: many
      ? { [fieldKey]: { some: {} } }
      : { [fieldKey]: { not: { equals: null } } },
    is: { [fieldKey]: { id: { equals: value } } },
    not_is: { [fieldKey]: { not: { id: { equals: value } } } },
    some: { [fieldKey]: { some: { id: { in: value } } } },
    not_some: { [fieldKey]: { not: { some: { id: { in: value } } } } },
  }
  return map[type] ?? { [fieldKey]: { [type]: value } }
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
  const {
    displayMode,
    hideCreate,
    many,
    refFieldKey,
    refLabelField,
    refListKey,
    refSearchFields,
    filter,
    sort,
    initialSort,
    columns,
  } = config.fieldMeta

  const graphqlSelection = buildGraphqlSelection(
    fieldKey,
    many,
    sort,
    displayMode,
    refLabelField
  )

  const defaultValue = buildDefaultValue(many)

  const filterTypes = many
    ? {
        some: { label: 'Is one of', initialValue: [] },
        not_some: { label: 'Is not one of', initialValue: [] },
      }
    : {
        is: { label: 'Is', initialValue: null },
        not_is: { label: 'Is not', initialValue: null },
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
    hideCreate: hideCreate || displayMode === 'table',
    columns: displayMode === 'table' ? columns : null,
    initialSort: displayMode === 'table' ? initialSort : null,
    selectFilter: displayMode === 'select' ? filter : null,
    selectSort: displayMode === 'select' ? sort : null,
    defaultValue,
    validate: validateValue,
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
    serialize: serializeState,
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
              filter={displayMode === 'select' ? filter : null}
              sort={displayMode === 'select' ? sort : null}
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
              filter={displayMode === 'select' ? filter : null}
              sort={displayMode === 'select' ? sort : null}
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
      graphql: props => buildFilterGraphql(props.type, props.value, many, fieldKey),
      parseGraphQL: () => [],
      types: {
        empty: { label: 'Is empty', initialValue: null },
        not_empty: { label: 'Is not empty', initialValue: null },
        ...filterTypes,
      },
    },
  }
}