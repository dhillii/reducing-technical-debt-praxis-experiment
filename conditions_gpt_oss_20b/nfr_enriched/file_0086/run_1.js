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
 * Helper to build the GraphQL selection string for a relationship field.
 */
function buildGraphqlSelection(
  config: FieldControllerConfig<any>,
  fieldMeta: any,
  many: boolean
): string {
  const { fieldKey } = config
  const { refLabelField, sort } = fieldMeta
  if (fieldMeta.displayMode === 'count' || fieldMeta.displayMode === 'table') {
    return `${fieldKey}Count`
  }
  const orderBy =
    many && sort
      ? `(orderBy: { ${sort.field}: ${sort.direction.toLowerCase()} })`
      : ''
  return `${fieldKey}${orderBy} { id label: ${refLabelField} }`
}

/**
 * Helper to determine if the create action should be hidden.
 */
function buildHideCreate(
  config: FieldControllerConfig<any>,
  fieldMeta: any,
  many: boolean
): boolean {
  return config.hideCreate || fieldMeta.displayMode === 'table'
}

/**
 * Helper to compute the columns for table display.
 */
function buildColumns(fieldMeta: any): string[] | null {
  return fieldMeta.displayMode === 'table' ? fieldMeta.columns : null
}

/**
 * Helper to compute the initial sort for table display.
 */
function buildInitialSort(fieldMeta: any): ListSortDescriptor<string> | null {
  return fieldMeta.displayMode === 'table' ? fieldMeta.initialSort : null
}

/**
 * Helper to compute the filter for select display.
 */
function buildSelectFilter(fieldMeta: any): Record<string, any> | null {
  return fieldMeta.displayMode === 'select' ? fieldMeta.filter : null
}

/**
 * Helper to compute the sort for select display.
 */
function buildSelectSort(fieldMeta: any): ListSortDescriptor<string> | null {
  return fieldMeta.displayMode === 'select' ? fieldMeta.sort : null
}

/**
 * Helper to compute the default value for the controller.
 */
function buildDefaultValue(many: boolean): any {
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
 * Validation logic for relationship values.
 */
function validateValue(
  value: any,
  opts: { isRequired: boolean },
  many: boolean
): boolean {
  if ('count' in value) return true
  if (!opts.isRequired) return true
  return many ? value.value.length > 0 : value.value !== null
}

/**
 * Deserialization logic for relationship fields.
 */
function deserializeData(
  data: any,
  config: FieldControllerConfig<any>,
  many: boolean,
  fieldMeta: any
): any {
  const { fieldKey } = config
  if (fieldMeta.displayMode === 'count' || fieldMeta.displayMode === 'table') {
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

/**
 * Serialization logic for relationship fields.
 */
function serializeState(
  state: any,
  config: FieldControllerConfig<any>
): any {
  const { fieldKey } = config
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
    if (Object.keys(output).length) {
      return { [fieldKey]: output }
    }
  } else if (state.kind === 'one') {
    if (state.initialValue && !state.value) {
      return { [fieldKey]: { disconnect: true } }
    }
    if (state.value?.built) {
      return { [fieldKey]: { create: state.value.data } }
    }
    if (state.value && state.value.id !== state.initialValue?.id) {
      return { [fieldKey]: { connect: { id: state.value.id } } }
    }
  }
  return {}
}

/**
 * Builds the filter object for the controller.
 */
function buildFilterObject(
  config: FieldControllerConfig<any>,
  fieldMeta: any,
  refListKey: string,
  refLabelField: string,
  refSearchFields: string[],
  many: boolean,
  fieldKey: string,
  label: string
) {
  const foreignList = useList(refListKey)
  return {
    Filter(props: any) {
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
            filter={fieldMeta.displayMode === 'select' ? fieldMeta.filter : null}
            sort={fieldMeta.displayMode === 'select' ? fieldMeta.sort : null}
          />
          <TagGroup
            aria-label={`related ${foreignList.plural}`}
            items={value.map((item: any) => ({
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
    Label({ label, type, value }: any) {
      const listFormatter = useListFormatter({
        style: 'short',
        type: 'disjunction',
      })
      if (['empty', 'not_empty'].includes(type)) return label.toLowerCase()
      if (['is', 'not_is'].includes(type)) return `${label.toLowerCase()} ${value}`
      return `${label.toLowerCase()} (${listFormatter.format(value || [''])})`
    },
    graphql({ type, value }: any) {
      if (type === 'empty' && !many) return { [fieldKey]: { equals: null } }
      if (type === 'empty' && many) return { [fieldKey]: { none: {} } }
      if (type === 'not_empty' && !many) return { [fieldKey]: { not: { equals: null } } }
      if (type === 'not_empty' && many) return { [fieldKey]: { some: {} } }
      if (type === 'is') return { [fieldKey]: { id: { equals: value } } }
      if (type === 'not_is')
        return { [fieldKey]: { not: { id: { equals: value } } } }
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
  }
}

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
  const { listKey, fieldKey: fieldKey, label, description } = config
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
    graphqlSelection: buildGraphqlSelection(config, config.fieldMeta, many),
    hideCreate: buildHideCreate(config, config.fieldMeta, many),
    columns: buildColumns(config.fieldMeta),
    initialSort: buildInitialSort(config.fieldMeta),
    selectFilter: buildSelectFilter(config.fieldMeta),
    selectSort: buildSelectSort(config.fieldMeta),
    defaultValue: buildDefaultValue(many),
    validate: (value, opts) => validateValue(value, opts, many),
    deserialize: data => deserializeData(data, config, many, config.fieldMeta),
    serialize: state => serializeState(state, config),
    filter: buildFilterObject(
      config,
      config.fieldMeta,
      refListKey,
      refLabelField,
      refSearchFields,
      many,
      fieldKey,
      label
    ),
  }
}