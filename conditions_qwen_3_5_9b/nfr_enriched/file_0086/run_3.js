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

function createManyState(
  value: RelationshipValue[],
  onChange: (newItems: RelationshipValue[]) => void,
  field: FieldProps['field']
): {
  kind: 'many'
  value: RelationshipValue[]
  onChange: (newItems: RelationshipValue[]) => void
} {
  return {
    kind: 'many',
    value,
    onChange(newItems) {
      onChange?.({ ...value, value: newItems })
    },
  }
}

function createOneState(
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
): {
  kind: 'one'
  value: RelationshipValue | null
  onChange: (newValue: RelationshipValue | null) => void
} {
  return {
    kind: 'one',
    value,
    onChange(newItem) {
      onChange?.({ ...value, value: newItem })
    },
  }
}

function createManyTagItems(value: RelationshipValue[], foreignList: ReturnType<typeof useList>) {
  return value.map(item => ({
    id: item.id.toString() ?? '',
    label: item.label ?? '',
    href: item.built ? '' : `/${foreignList.path}/${item.id}`,
  }))
}

function createManyTagRemoveHandler(
  isReadOnly: boolean,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void
) {
  return isReadOnly
    ? undefined
    : (keys: Set<string>) => {
        onChange?.({
          ...value,
          value: value.filter(item => !keys.has(item.id)),
        })
      }
}

function createManyTagEmptyState(foreignList: ReturnType<typeof useList>) {
  return () => (
    <Text color="neutralSecondary" size="small">
      No related {foreignList.plural.toLowerCase()}…
    </Text>
  )
}

function createManyTagRenderItem() {
  return (item: { id: string; href: string; label: string }) => {
    if (item.href === '') return <Item>{item.label}</Item>
    return <Item href={item.href}>{item.label}</Item>
  }
}

function createManyTagGroup(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagEmptyState(foreignList: ReturnType<typeof useList>) {
  return () => (
    <Text color="neutralSecondary" size="small">
      No related {foreignList.plural.toLowerCase()}…
    </Text>
  )
}

function createOneTagRemoveHandler(
  isReadOnly: boolean,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void
) {
  return isReadOnly
    ? undefined
    : (keys: Set<string>) => {
        onChange?.({
          ...value,
          value: value.filter(item => !keys.has(item.id)),
        })
      }
}

function createOneTagGroup(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value ? [value] : [], foreignList)}
      maxRows={2}
      onRemove={createOneTagRemoveHandler(isReadOnly, value ? [value] : [], onChange)}
      renderEmptyState={createOneTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createManyTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue[],
  onChange: (newValue: RelationshipValue[]) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup
      aria-label={`related ${foreignList.plural}`}
      isRequired={isRequired}
      items={createManyTagItems(value, foreignList)}
      maxRows={2}
      onRemove={createManyTagRemoveHandler(isReadOnly, value, onChange)}
      renderEmptyState={createManyTagEmptyState(foreignList)}
    >
      {createManyTagRenderItem()}
    </TagGroup>
  )
}

function createOneTagGroupWithState(
  isRequired: boolean,
  foreignList: ReturnType<typeof useList>,
  value: RelationshipValue | null,
  onChange: (newValue: RelationshipValue | null) => void,
  field: FieldProps['field']
) {
  return (
    <TagGroup