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
  return value?.kind === 'count'
}

/**
 * Guard: field display is table.
 */
function isTableDisplay(field: any): boolean {
  return field?.display === 'table'
}

/**
 * Guard: field has a reference field key.
 */
function hasRefFieldKey(field: any): boolean {
  return Boolean(field?.refFieldKey)
}

/**
 * Render the UI for a count value.
 */
function renderCountField(
  props: {
    autoFocus: boolean
    field: any
    description?: string
    isReadOnly: boolean
    foreignList: any
    value: { kind: 'count'; count: number; id: string }
  }
) {
  const { autoFocus, field, description, isReadOnly, foreignList, value } = props

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
 * Render the tag group for many relationships.
 */
function renderTagGroupMany(
  foreignList: any,
  value: any,
  isReadOnly: boolean,
  onChange: (v: any) => void,
  isRequired: boolean
) {
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
 * Render the dialog for creating a new related item.
 */
function renderBuildDialog(
  foreignList: any,
  dialogIsOpen: boolean,
  setDialogOpen: (open: boolean) => void,
  counter: number,
  setCounter: (c: number) => void,
  value: any,
  onChange: (v: any) => void,
  isReadOnly: boolean
) {
  if (isReadOnly) return null

  return (
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
    return renderCountField({
      autoFocus,
      field,
      description,
      isReadOnly,
      foreignList,
      value,
    })
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

        {value.kind === 'many' && renderTagGroupMany(foreignList, value, isReadOnly, onChange, isRequired)}
      </VStack>

      {renderBuildDialog(
        foreignList,
        dialogIsOpen,
        setDialogOpen,
        counter,
        setCounter,
        value,
        onChange ?? (() => {}),
        isReadOnly
      )}
    </Fragment>
  )
}

/**
 * Render function for TagGroup items.
 */
function renderItem(item: { id: string; href: string; label: string }) {
  return item.href === '' ? <Item>{item.label}</Item> : <Item href={item.href}>{item.label}</Item>
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
 * Helper: determine GraphQL selection string.
 */
function getGraphQLSelection(
  config: FieldControllerConfig<any>,
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
 * Helper: default value based on multiplicity.
 */
function getDefaultValue(many: boolean) {
  return many
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
}

/**
 * Helper: validate relationship value.
 */
function validateValue(value: any, opts: any, many: boolean): boolean {
  if ('count' in value) return true
  if (!opts.isRequired) return true
  return many ? value.value.length > 0 : value.value !== null
}

/**
 * Helper: deserialize data from the server.
 */
function deserializeData(
  data: any,
  config: FieldControllerConfig<any>,
  many: boolean,
  displayMode: string
) {
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

/**
 * Helper: serialize state for mutation.
 */
function serializeState(state: any, config: FieldControllerConfig<any>, many: boolean) {
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
}

/**
 * Helper: generate GraphQL filter object.
 */
function graphqlFilterObject(
  type: string,
  value: any,
  many: boolean,
  config: FieldControllerConfig<any>
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
 * Controller definition for relationship fields.
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
    validate(value, opts) {
      return validateValue(value, opts, many)
    },
    deserialize(data) {
      return deserializeData(data, config, many, displayMode)
    },
    serialize(state) {
      return serializeState(state, config, many)
    },
    filter: {
      Filter(props) {
        const foreignList = useList(refListKey)

        if (props.type === 'empty' || props.type === 'not_empty') {
          return null
        }

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
              filter={displayMode === 'select' ? config.fieldMeta.filter : null}
              sort={displayMode === 'select' ? config.fieldMeta.sort : null}
            />
          )
        }

        const ids = Array.isArray(props.value) ? props.value : []
        const value = ids.map((id): RelationshipValue => ({
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
                  props.onChange(newItem.map((x) => x.id.toString()))
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
        return graphqlFilterObject(type, value, many, config)
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