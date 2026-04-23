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

function isCountKind(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isManyKind(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKind(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isReadOnly(onChange: FieldProps['onChange']): boolean {
  return onChange === undefined
}

function isTableDisplay(field: FieldProps['field']): boolean {
  return field.display === 'table'
}

function isCountDisplay(field: FieldProps['field']): boolean {
  return field.display === 'count'
}

function isSelectDisplay(field: FieldProps['field']): boolean {
  return field.display === 'select'
}

function isTableDisplayMode(config: FieldControllerConfig<any>): boolean {
  return config.fieldMeta.displayMode === 'table'
}

function isCountDisplayMode(config: FieldControllerConfig<any>): boolean {
  return config.fieldMeta.displayMode === 'count'
}

function isSelectDisplayMode(config: FieldControllerConfig<any>): boolean {
  return config.fieldMeta.displayMode === 'select'
}

function hasRefFieldKey(field: FieldProps['field']): boolean {
  return !!field.refFieldKey
}

function hasRefListKey(field: FieldProps['field']): boolean {
  return !!field.refListKey
}

function hasRefLabelField(field: FieldProps['field']): boolean {
  return !!field.refLabelField
}

function hasRefSearchFields(field: FieldProps['field']): boolean {
  return !!field.refSearchFields
}

function hasSelectFilter(field: FieldProps['field']): boolean {
  return !!field.selectFilter
}

function hasSelectSort(field: FieldProps['field']): boolean {
  return !!field.selectSort
}

function hasSort(config: FieldControllerConfig<any>): boolean {
  return !!config.fieldMeta.sort
}

function hasColumns(config: FieldControllerConfig<any>): boolean {
  return !!config.fieldMeta.columns
}

function hasInitialSort(config: FieldControllerConfig<any>): boolean {
  return !!config.fieldMeta.initialSort
}

function hasFilter(config: FieldControllerConfig<any>): boolean {
  return !!config.fieldMeta.filter
}

function hasMany(config: FieldControllerConfig<any>): boolean {
  return config.fieldMeta.many
}

function hasHideCreate(config: FieldControllerConfig<any>): boolean {
  return config.fieldMeta.hideCreate
}

function hasRefFieldKeyConfig(config: FieldControllerConfig<any>): boolean {
  return !!config.refFieldKey
}

function hasRefListKeyConfig(config: FieldControllerConfig<any>): boolean {
  return !!config.refListKey
}

function hasRefLabelFieldConfig(config: FieldControllerConfig<any>): boolean {
  return !!config.refLabelField
}

function hasRefSearchFieldsConfig(config: FieldControllerConfig<any>): boolean {
  return !!config.refSearchFields
}

function hasDescription(config: FieldControllerConfig<any>): boolean {
  return !!config.description
}

function hasLabel(config: FieldControllerConfig<any>): boolean {
  return !!config.label
}

function hasListKey(config: FieldControllerConfig<any>): boolean {
  return !!config.listKey
}

function hasFieldKey(config: FieldControllerConfig<any>): boolean {
  return !!config.fieldKey
}

function hasValue(value: RelationshipValue): boolean {
  return value.value !== null && value.value !== undefined
}

function hasInitialValue(value: RelationshipValue): boolean {
  return value.initialValue !== null && value.initialValue !== undefined
}

function hasBuiltItem(value: RelationshipValue): boolean {
  return value.value?.some(item => item.built) ?? false
}

function hasChangedId(value: RelationshipValue, initialValue: RelationshipValue['value']): boolean {
  return value?.id !== initialValue?.id
}

function hasDisconnect(value: RelationshipValue, initialValue: RelationshipValue['value']): boolean {
  if (!value.initialValue || !value.value) return false
  const newAllIds = new Set(value.value.map(x => x.id))
  return value.initialValue.some(x => !newAllIds.has(x.id))
}

function hasConnect(value: RelationshipValue, initialValue: RelationshipValue['value']): boolean {
  if (!value.initialValue || !value.value) return false
  const initialIds = new Set(value.initialValue.map(x => x.id))
  return value.value.some(x => !x.built && !initialIds.has(x.id))
}

function hasCreate(value: RelationshipValue): boolean {
  return value.value?.some(item => item.built) ?? false
}

function hasEmptyType(type: string): boolean {
  return type === 'empty' || type === 'not_empty'
}

function hasIsType(type: string): boolean {
  return type === 'is' || type === 'not_is'
}

function hasSomeType(type: string): boolean {
  return type === 'some' || type === 'not_some'
}

function hasManyType(type: string): boolean {
  return type === 'some' || type === 'not_some'
}

function hasOneType(type: string): boolean {
  return type === 'is' || type === 'not_is'
}

function hasCountOrTableDisplayMode(config: FieldControllerConfig<any>): boolean {
  return isCountDisplayMode(config) || isTableDisplayMode(config)
}

function hasSelectDisplayModeOrCount(config: FieldControllerConfig<any>): boolean {
  return isSelectDisplayMode(config) || isCountDisplayMode(config)
}

function hasSelectDisplayModeOrTable(config: FieldControllerConfig<any>): boolean {
  return isSelectDisplayMode(config) || isTableDisplayMode(config)
}

function hasSelectDisplayMode(config: FieldControllerConfig<any>): boolean {
  return isSelectDisplayMode(config)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyKind(value: RelationshipValue): boolean {
  return isManyKind(value)
}

function hasOneKind(value: RelationshipValue): boolean {
  return isOneKind(value)
}

function hasCountKind(value: RelationshipValue): boolean {
  return isCountKind(value)
}

function hasManyOrCountKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isCountKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind(value)
}

function hasManyOrOneKind(value: RelationshipValue): boolean {
  return isManyKind(value) || isOneKind