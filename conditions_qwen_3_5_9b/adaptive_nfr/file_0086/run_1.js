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

function isTableDisplay(field: FieldProps<any>): boolean {
  return field.display === 'table'
}

function isReadOnly(onChange?: (value: any) => void): boolean {
  return onChange === undefined
}

function isManyKind(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKind(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountOrTableDisplay(displayMode: string): boolean {
  return displayMode === 'count' || displayMode === 'table'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountOrTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'count' || displayMode === 'table'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'
}

function isCountKindValue(value: RelationshipValue): boolean {
  return value.kind === 'count'
}

function isTableDisplayMode(displayMode: string): boolean {
  return displayMode === 'table'
}

function isCountDisplayMode(displayMode: string): boolean {
  return displayMode === 'count'
}

function isSelectDisplayMode(displayMode: string): boolean {
  return displayMode === 'select'
}

function isManyMode(many: boolean): boolean {
  return many
}

function isHideCreate(hideCreate: boolean): boolean {
  return hideCreate
}

function isNullOrEmpty(value: any): boolean {
  return value == null
}

function isNullOrUndefined(value: any): boolean {
  return value == null
}

function isNotNull(value: any): boolean {
  return value != null
}

function isNotEmptyArray(array: any[]): boolean {
  return array.length > 0
}

function isNotEmptyString(value: string): boolean {
  return value.length > 0
}

function isManyKindState(state: { kind: string }): boolean {
  return state.kind === 'many'
}

function isOneKindState(state: { kind: string }): boolean {
  return state.kind === 'one'
}

function isManyKindValue(value: RelationshipValue): boolean {
  return value.kind === 'many'
}

function isOneKindValue(value: RelationshipValue): boolean {
  return value.kind === 'one'