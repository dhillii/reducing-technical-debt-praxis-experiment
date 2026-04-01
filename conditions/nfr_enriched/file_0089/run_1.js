```typescript
import { useList } from '@keystone-6/core/admin-ui/context'
import { GroupIndicatorLine } from '@keystone-6/core/admin-ui/utils'
import { Field as RelationshipFieldView } from '@keystone-6/core/fields/types/relationship/views'

import { ActionButton, Button, ButtonGroup } from '@keystar/ui/button'
import { Dialog, DialogContainer } from '@keystar/ui/dialog'
import { type ItemDropTarget, move, useDragAndDrop } from '@keystar/ui/drag-and-drop'
import { Field } from '@keystar/ui/field'
import { Icon } from '@keystar/ui/icon'
import { trash2Icon } from '@keystar/ui/icon/icons/trash2Icon'
import { HStack, VStack } from '@keystar/ui/layout'
import { Item, ListView } from '@keystar/ui/list-view'
import { Tooltip, TooltipTrigger } from '@keystar/ui/tooltip'
import { Heading, Text } from '@keystar/ui/typography'

import {
  type Key,
  type MemoExoticComponent,
  type ReactElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  ArrayField,
  ComponentSchema,
  ConditionalField,
  FormField,
  GenericPreviewProps,
  InitialOrUpdateValueFromComponentPropField,
  ObjectField,
  RelationshipField,
  ValueForComponentSchema,
} from './api'
import { getKeysForArrayValue, setKeysForArrayValue } from './preview-props'

import { Content } from '@keystar/ui/slots'
import { createGetPreviewProps } from './preview-props'
import { assertNever, clientSideValidateProp } from './utils'

type DefaultFieldProps<Key> = GenericPreviewProps<
  Extract<ComponentSchema, { kind: Key }>,
  unknown
> & {
  autoFocus?: boolean
  forceValidation?: boolean
}

const previewPropsToValueConverter: {
  [Kind in ComponentSchema['kind']]: (
    props: GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown>
  ) => ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>
} = {
  child() {
    return null
  },
  form(props) {
    return props.value
  },
  array(props) {
    const values = props.elements.map(x => previewPropsToValue(x))
    setKeysForArrayValue(
      values,
      props.elements.map(x => x.key)
    )
    return values
  },
  conditional(props) {
    return {
      discriminant: props.discriminant,
      value: previewPropsToValue(props.value),
    }
  },
  object(props) {
    return Object.fromEntries(
      Object.entries(props.fields).map(([key, val]) => [key, previewPropsToValue(val)])
    )
  },
  relationship(props) {
    return props.value
  },
}

const valueToUpdaters: {
  [Kind in ComponentSchema['kind']]: (
    value: ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>,
    schema: Extract<ComponentSchema, { kind: Kind }>
  ) => InitialOrUpdateValueFromComponentPropField<Extract<ComponentSchema, { kind: Kind }>>
} = {
  child() {
    return undefined
  },
  form(value) {
    return value
  },
  array(value, schema) {
    const keys = getKeysForArrayValue(value)
    return value.map((x, i) => ({
      key: keys[i],
      value: valueToUpdater(x, schema.element),
    }))
  },
  conditional(value, schema) {
    return {
      discriminant: value.discriminant,
      value: valueToUpdater(value.value, schema.values[value.discriminant.toString()]),
    }
  },
  object(value, schema) {
    return Object.fromEntries(
      Object.entries(schema.fields).map(([key, schema]) => [
        key,
        valueToUpdater(value[key], schema),
      ])
    )
  },
  relationship(value) {
    return value
  },
}

export function previewPropsToValue<Schema extends ComponentSchema>(
  props: GenericPreviewProps<ComponentSchema, unknown>
): ValueForComponentSchema<Schema> {
  return (previewPropsToValueConverter[props.schema.kind] as any)(props)
}

function valueToUpdater<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  schema: ComponentSchema
): InitialOrUpdateValueFromComponentPropField<Schema> {
  return (valueToUpdaters[schema.kind] as any)(value, schema)
}

// this exists because for props.schema.kind === 'form', ts doesn't narrow props, only props.schema
function isKind<Kind extends ComponentSchema['kind']>(
  props: GenericPreviewProps<ComponentSchema, unknown>,
  kind: Kind
): props is GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown> {
  return props.schema.kind === kind
}

export function previewPropsOnChange<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  props: GenericPreviewProps<ComponentSchema, unknown>
) {
  // child fields can't be updated through preview props, so we don't do anything here
  if (isKind(props, 'child')) return
  if (
    isKind(props, 'form') ||
    isKind(props, 'relationship') ||
    isKind(props, 'object') ||
    isKind(props, 'array')
  ) {
    props.onChange(valueToUpdater(value, props.schema))
    return
  }
  if (isKind(props, 'conditional')) {
    const updater = valueToUpdater(value, props.schema)
    props.onChange(updater.discriminant, updater.value)
    return
  }
  assertNever(props)
}

// Helper: Build form value for relationship field
function buildRelationshipFormValue(
  value: unknown,
  many: boolean
): {
  kind: 'many' | 'one'
  id: string
  initialValue: any
  value: any
} {
  if (many) {
    if (value !== null && !('length' in value)) throw TypeError('bad value')
    const manyValue =
      value === null
        ? []
        : (value as any[]).map(x => ({
            id: x.id,
            label: x.label || x.id.toString(),
            data: x.data,
            built: undefined,
          }))
    return {
      kind: 'many' as const,
      id: '',
      initialValue: manyValue,
      value: manyValue,
    }
  }

  if (value !== null && 'length' in value) throw TypeError('bad value')
  const oneValue = value
    ? {
        id: (value as any).id,
        label: (value as any).label || (value as any).id.toString(),
        data: (value as any).data,
        built: undefined,
      }
    : null
  return {
    kind: 'one' as const,
    id: '',
    initialValue: oneValue,
    value: oneValue,
  }
}

// Helper: Handle relationship field value change
function handleRelationshipChange(val: any, onChange: (value: any) => void): void {
  if (val.kind === 'count') return
  const { value } = val
  if (value === null) {
    onChange(null)
    return
  }
  if (Array.isArray(value)) {
    onChange(value.map(x => ({ id: x.id, label: x.label })))
    return
  }
  onChange({ id: value.id, label: value.label })
}

function RelationshipFieldPreview(props: DefaultFieldProps<'relationship'>) {
  const { autoFocus, onChange, schema, value } = props
  const { listKey, label, description, filter, sort, many } = schema
  const list = useList(listKey)
  const formValue = buildRelationshipFormValue(value, many)

  return (
    <RelationshipFieldView
      autoFocus={autoFocus}
      isRequired={false}
      field={{
        label,
        description: description ?? '',
        display: 'select',
        listKey: '?',
        fieldKey: '?',
        defaultValue: null as any,
        deserialize: null as any,
        serialize: null as any,
        graphqlSelection: null as any,
        refListKey: list.key,
        many,
        hideCreate: true,
        refLabelField: list.labelField,
        refSearchFields: list.initialSearchFields,
        columns: list.initialColumns,
        initialSort: null,
        selectFilter: filter || null,
        selectSort: sort ?? list.initialSort,
      }}
      onChange={val => handleRelationshipChange(val, onChange)}
      value={formValue}
      itemValue={{}}
    />
  )
}

function FormFieldPreview({
  schema,
  autoFocus,
  forceValidation,
  onChange,
  value,
}: DefaultFieldProps<'form'>) {
  return (
    <schema.Input
      autoFocus={!!autoFocus}
      value={value}
      onChange={onChange}
      forceValidation={!!forceValidation}
    />
  )
}

function canFieldBeFocused(schema: ComponentSchema): boolean {
  if (schema.kind === 'child') return false
  if (schema.kind === 'array') return true
  if (schema.kind === 'conditional') return true
  if (schema.kind === 'form') return true
  if (schema.kind === 'relationship') return true
  if (schema.kind === 'object') {
    for (const innerProp of Object.values(schema.fields)) {
      if (canFieldBeFocused(innerProp)) return true
    }
    return false
  }
  assertNever(schema)
}

function findFocusableObjectFieldKey(schema: ObjectField): string | undefined {
  for (const [key, innerProp] of Object.entries(schema.fields)) {
    const childFocusable = canFieldBeFocused(innerProp)
    if (childFocusable) return key
  }
}

// Helper: Generate object field items
function* generateObjectFieldItems(
  fields: Record<string, GenericPreviewProps<ComponentSchema, unknown>>,
  firstFocusable: string | undefined
) {
  for (const [key, propVal] of Object.entries(fields)) {
    if (!isNonChildFieldPreviewProps(propVal)) continue
    yield (
      <FormValueContentFromPreviewProps
        autoFocus={key === firstFocusable}
        key={key}
        {...propVal}
      />
    )
  }
}

function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined
  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {[...generateObjectFieldItems(fields, firstFocusable)]}
      </VStack>
    </HStack>
  )
}

function ConditionalFieldPreview({
  schema,
  autoFocus,
  discriminant,
  onChange,
  value,
}: DefaultFieldProps<'conditional'>) {
  const schemaDiscriminant = schema.discriminant as FormField<string | boolean, unknown>
  return (
    <HStack gap="xlarge">
      {useMemo(
        () => (
          <schemaDiscriminant.Input
            autoFocus={!!autoFocus}
            value={discriminant}
            onChange={onChange}
            forceValidation={false}
          />
        ),
        [autoFocus, schemaDiscriminant, discriminant, onChange]
      )}
      {isNonChildFieldPreviewProps(value) && <FormValueContentFromPreviewProps {...value} />}
    </HStack>
  )
}

export type NonChildFieldComponentSchema =
  | FormField<any, any>
  | ObjectField
  | ConditionalField<FormField<any, any>, { [key: string]: ComponentSchema }>
  | RelationshipField<boolean>
  | ArrayField<ComponentSchema>

function isNonChildFieldPreviewProps(
  props: GenericPreviewProps<ComponentSchema, unknown>
): props is GenericPreviewProps<NonChildFieldComponentSchema, unknown> {
  return props.schema.kind !== 'child'
}

const fieldRenderers = {
  array: ArrayFieldPreview,
  relationship: RelationshipFieldPreview,
  child: () => null,
  form: FormFieldPreview,
  object: ObjectFieldPreview,
  conditional: ConditionalFieldPreview,
}

export const FormValueContentFromPreviewProps: MemoExoticComponent<
  (
    props: GenericPreviewProps<ComponentSchema, unknown> & {
      autoFocus?: boolean
      forceValidation?: boolean
    }
  ) => ReactElement
> = memo(function FormValueContentFromPreview(props) {
  const Comp = fieldRenderers[props.schema.kind]
  return <Comp {...(props as any)} />
})

function useEventCallback<Func extends (...args: any) => any>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

// Helper: Extract keys from drag items
function extractKeysFromDragItems(items: any[], dragType: string): Key[] {
  const keys: Key[] = []
  for (let item of items) {
    if (item.kind === 'text') {
      let key
      if (item.types.has(dragType)) {
        key = JSON.parse(item.getText(dragType))
        keys.push(key)
      } else if (item.types.has('text/plain')) {
        key = item.getText('text/plain')
        keys.push(...(key as string).split('\n').map(val => val.replaceAll('"', '')))
      }
    }
  }
  return keys
}

// Helper: Create drag and drop hooks configuration
function createArrayDragAndDropHooks(
  dragType: string,
  onMove: (keys: Key[], target: ItemDropTarget) => void
) {
  return useDragAndDrop({
    getItems(keys) {
      return [...keys].map(key => {
        key = JSON.stringify(key)
        return {
          [dragType]: key,
          'text/plain': key,
        }
      })
    },
    getAllowedDropOperations() {
      return ['move', 'cancel']
    },
    async onDrop(e) {
      if (e.target.type !== 'root' && e.target.dropPosition !== 'on') {
        const keys = await extractKeysFromDragItems(e.items, dragType)
        onMove(keys, e.target)
      }
    },
    getDropOperation(target) {
      if (target.type === 'root' || target.dropPosition === 'on') return 'cancel'
      return 'move'
    },
  })
}

// Helper: Render array field list item
function renderArrayFieldItem(
  item: any,
  elements: any[],
  schema: ArrayField<ComponentSchema>,
  onRemoveKey: (key: string) => void
) {
  const label = schema.itemLabel?.(item) || `Item ${elements.indexOf(item) + 1}`
  return (
    <Item key={item.key} textValue={label}>
      <Text>{label}</Text>