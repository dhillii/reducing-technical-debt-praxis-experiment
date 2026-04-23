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
 * Guard: field is displayed as a table.
 */
function isTableDisplay(field: any): boolean {
  return field.display === 'table'
}

/**
 * Guard: field has a reference field key.
 */
function hasRefFieldKey(field: any): boolean {
  return Boolean(field.refFieldKey)
}

/**
 * Guard: value is a many kind.
 */
function isManyValue(value: any): value is { kind: 'many'; value: any[] } {
  return value.kind === 'many'
}

/**
 * Guard: value is a one kind.
 */
function isOneValue(value: any): value is { kind: 'one'; value: any } {
  return value.kind === 'one'
}

/**
 * Render the count view for a relationship field.
 */
function renderCountView(
  props: FieldProps<typeof controller>,
  foreignList: any,
  description: string | undefined,
  isReadOnly: boolean,
  dialogIsOpen: boolean,
  setDialogOpen: (open: boolean) => void,
  counter: number,
  setCounter: (c: number) => void
) {
  const { autoFocus, field, value, onChange } = props
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

  if (!hasRefFieldKey(field)) {
    return textField
  }

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
 * Handles the dialog change for creating a new related item.
 */
function handleDialogChange(
  value: any,
  onChange: (v: any) => void,
  foreignList: any,
  counter: number,
  setCounter: (c: number) => void,
  setDialogOpen: (open: boolean) => void,
  builtItemData: any
) {
  const id = `_____temporary_${counter}`
  const label =
    (builtItemData?.[foreignList.labelField] as string | null) ??
    `[Unnamed ${foreignList.singular} ${counter}]`
  setDialogOpen(false)
  setCounter(counter + 1)

  if (isManyValue(value)) {
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
  } else if (isOneValue(value)) {
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
 * Render the appropriate combobox based on value kind.
 */
function renderCombobox(
  props: FieldProps<typeof controller>,
  foreignList: any,
  description: string | undefined,
  isReadOnly: boolean
) {
  const { autoFocus, field, forceValidation, isRequired, value, onChange } = props

  if (isManyValue(value)) {
    return (
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
    )
  }

  return (
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
  )
}

/**
 * Main field component.
 */
export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation = false, onChange, value, isRequired } = props
  const foreignList = useList(field.refListKey)
  const [dialogIsOpen, setDialogOpen] = useState(false)
  const description = field.description || undefined
  const isReadOnly = onChange === undefined
  const [counter, setCounter] = useState(1)

  if (isCountValue(value)) {
    return renderCountView(props, foreignList, description, isReadOnly, dialogIsOpen, setDialogOpen, counter, setCounter)
  }

  return (
    <Fragment>
      <VStack gap="medium">
        <ContextualActions onAdd={() => setDialogOpen(true)} {...props}>
          {renderCombobox(props, foreignList, description, isReadOnly)}
        </ContextualActions>

        {isManyValue(value) && (
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
                handleDialogChange(value, onChange!, foreignList, counter, setCounter, setDialogOpen, builtItemData)
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

/**
 * Guard: field is displayed as count or table.
 */
function isCountOrTableDisplay(field: any): boolean {
  return field.display === 'count' || field.display === 'table'
}

/**
 * Guard: field display mode is select.
 */
function isSelectDisplayMode(config: any): boolean {
  return config.fieldMeta.displayMode === 'select'
}

/**
 * Guard: field display mode is count.
 */
function isCountDisplayMode(config: any): boolean {
  return config.fieldMeta.displayMode === 'count'
}

/**
 * Guard: field display mode is table.
 */
function isTableDisplayMode(config: any): boolean {
  return config.fieldMeta.displayMode === 'table'
}

/**
 * Compute GraphQL selection string.
 */
function computeGraphQLSelection(
  config: FieldControllerConfig<any>,
  many: boolean,
  fieldKey: string,
  refLabelField: string
): string {
  const { displayMode, sort } = config.fieldMeta
  if (isCountDisplayMode(config) || isTableDisplayMode(config)) {
    return `${fieldKey}Count`
  }
  const orderBy = many && sort ? `(orderBy: { ${sort.field}: ${sort.direction.toLowerCase()} })` : ''
  return `${fieldKey}${orderBy} {
    id
    label: ${refLabelField}
  }`
}

/**
 * Validate relationship value.
 */
function validateValue(value: any, opts: any, many: boolean): boolean {
  if ('count' in value) return true
  if (!opts.isRequired) return true
  if (isOneValue(value)) {
    return value.value !== null
  }
  return value.value.length > 0
}

/**
 * Deserialize data into relationship value.
 */
function deserializeData(
  data: any,
  config: FieldControllerConfig<any>,
  many: boolean,
  fieldKey: string
) {
  const { displayMode, refFieldKey } = config.fieldMeta
  if (isCountDisplayMode(config) || isTableDisplayMode(config)) {
    return {
      id: data.id,
      kind: 'count',
      count: data[`${config.fieldKey}Count`] ?? 0,
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
 * Serialize state into GraphQL payload.
 */
function serializeState(state: any, config: any) {
  const fieldKey = config.fieldKey
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
 * Build GraphQL filter object based on filter type.
 */
function buildGraphQLFilter(type: string, value: any, many: boolean, fieldKey: string) {
  const filterMap: Record<string, any> = {
    empty: many ? { [fieldKey]: { none: {} } } : { [fieldKey]: { equals: null } },
    not_empty: many ? { [fieldKey]: { some: {} } } : { [fieldKey]: { not: { equals: null } } },
    is: { [fieldKey]: { id: { equals: value } } },
    not_is: { [fieldKey]: { not: { id: { equals: value } } } },
    some: { [fieldKey]: { some: { id: { in: value } } } },
    not_some: { [fieldKey]: { not: { some: { id: { in: value } } } } },
  }
  return filterMap[type] ?? { [fieldKey]: { [type]: value } }
}

/**
 * Controller factory.
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

  const graphqlSelection = computeGraphQLSelection(config, many, fieldKey, refLabelField)

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
    columns: isTableDisplayMode(config) ? config.fieldMeta.columns : null,
    initialSort: isTableDisplayMode(config) ? config.fieldMeta.initialSort : null,
    selectFilter: isSelectDisplayMode(config) ? config.fieldMeta.filter : null,
    selectSort: isSelectDisplayMode(config) ? config.fieldMeta.sort : null,
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
      return validateValue(value, opts, many)
    },
    deserialize(data) {
      return deserializeData(data, config, many, fieldKey)
    },
    serialize(state) {
      return serializeState(state, config)
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
              filter={isSelectDisplayMode(config) ? config.fieldMeta.filter : null}
              sort={isSelectDisplayMode(config) ? config.fieldMeta.sort : null}
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
              filter={isSelectDisplayMode(config) ? config.fieldMeta.filter : null}
              sort={isSelectDisplayMode(config) ? config.fieldMeta.sort : null}
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
      graphql({ type, value }) {
        return buildGraphQLFilter(type, value, many, config.fieldKey)
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