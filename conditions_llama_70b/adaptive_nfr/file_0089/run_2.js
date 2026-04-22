```javascript
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

// Define a lookup table for converting preview props to values
const previewPropsToValueConverter: {
  [Kind in ComponentSchema['kind']]: (
    props: GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown>
  ) => ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>
} = {
  child: () => null,
  form: (props) => props.value,
  array: (props) => {
    const values = props.elements.map((x) => previewPropsToValue(x))
    setKeysForArrayValue(values, props.elements.map((x) => x.key))
    return values
  },
  conditional: (props) => ({
    discriminant: props.discriminant,
    value: previewPropsToValue(props.value),
  }),
  object: (props) => {
    return Object.fromEntries(
      Object.entries(props.fields).map(([key, val]) => [key, previewPropsToValue(val)])
    )
  },
  relationship: (props) => props.value,
}

// Define a lookup table for converting values to updaters
const valueToUpdaters: {
  [Kind in ComponentSchema['kind']]: (
    value: ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>,
    schema: Extract<ComponentSchema, { kind: Kind }>
  ) => InitialOrUpdateValueFromComponentPropField<Extract<ComponentSchema, { kind: Kind }>>
} = {
  child: () => undefined,
  form: (value) => value,
  array: (value, schema) => {
    const keys = getKeysForArrayValue(value)
    return value.map((x, i) => ({
      key: keys[i],
      value: valueToUpdater(x, schema.element),
    }))
  },
  conditional: (value, schema) => {
    return {
      discriminant: value.discriminant,
      value: valueToUpdater(value.value, schema.values[value.discriminant.toString()]),
    }
  },
  object: (value, schema) => {
    return Object.fromEntries(
      Object.entries(schema.fields).map(([key, schema]) => [
        key,
        valueToUpdater(value[key], schema),
      ])
    )
  },
  relationship: (value) => value,
}

// Define a function to convert preview props to values
export function previewPropsToValue<Schema extends ComponentSchema>(
  props: GenericPreviewProps<ComponentSchema, unknown>
): ValueForComponentSchema<Schema> {
  return previewPropsToValueConverter[props.schema.kind](props)
}

// Define a function to convert values to updaters
function valueToUpdater<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  schema: ComponentSchema
): InitialOrUpdateValueFromComponentPropField<Schema> {
  return valueToUpdaters[schema.kind](value, schema)
}

// Define a function to check if a field can be focused
function canFieldBeFocused(schema: ComponentSchema): boolean {
  switch (schema.kind) {
    case 'child':
      return false
    case 'array':
    case 'conditional':
    case 'form':
    case 'relationship':
      return true
    case 'object':
      return Object.values(schema.fields).some((innerProp) => canFieldBeFocused(innerProp))
    default:
      assertNever(schema)
  }
}

// Define a function to find the first focusable field in an object field
function findFocusableObjectFieldKey(schema: ObjectField): string | undefined {
  for (const [key, innerProp] of Object.entries(schema.fields)) {
    if (canFieldBeFocused(innerProp)) return key
  }
}

// Define a function to render a field preview
function renderFieldPreview(props: GenericPreviewProps<ComponentSchema, unknown>) {
  switch (props.schema.kind) {
    case 'array':
      return <ArrayFieldPreview {...props} />
    case 'relationship':
      return <RelationshipFieldPreview {...props} />
    case 'child':
      return null
    case 'form':
      return <FormFieldPreview {...props} />
    case 'object':
      return <ObjectFieldPreview {...props} />
    case 'conditional':
      return <ConditionalFieldPreview {...props} />
    default:
      assertNever(props.schema)
  }
}

// Define a function to render a field preview with autofocus
function renderFieldPreviewWithAutoFocus(props: GenericPreviewProps<ComponentSchema, unknown>) {
  const autoFocus = props.autoFocus
  return renderFieldPreview({ ...props, autoFocus })
}

// Define a function to render a field preview with force validation
function renderFieldPreviewWithForceValidation(props: GenericPreviewProps<ComponentSchema, unknown>) {
  const forceValidation = props.forceValidation
  return renderFieldPreview({ ...props, forceValidation })
}

// Define a function to handle changes to a field preview
function handleFieldPreviewChange(
  value: ValueForComponentSchema<ComponentSchema>,
  props: GenericPreviewProps<ComponentSchema, unknown>
) {
  if (props.schema.kind === 'child') return
  if (props.schema.kind === 'form' || props.schema.kind === 'relationship' || props.schema.kind === 'object' || props.schema.kind === 'array') {
    props.onChange(valueToUpdater(value, props.schema))
    return
  }
  if (props.schema.kind === 'conditional') {
    const updater = valueToUpdater(value, props.schema)
    props.onChange(updater.discriminant, updater.value)
    return
  }
  assertNever(props.schema)
}

// Define a function to render an array field preview
function ArrayFieldPreview(props: DefaultFieldProps<'array'>) {
  const { elements, onChange, schema } = props
  const { label } = schema
  const [modalState, setModalState] = useState<
    | {
        index: number
        value: unknown
        forceValidation: boolean
      }
    | 'closed'
  >('closed')

  return (
    <Field label={label} labelElementType="span">
      {groupProps => (
        <VStack gap="medium" role="group" minWidth={0} {...groupProps}>
          <ArrayFieldListView
            {...props}
            aria-label={label ?? ''}
            onOpenItem={index => {
              const element = elements.at(index)
              if (!element) return
              setModalState({
                index,
                value: previewPropsToValue(element),
                forceValidation: false,
              })
            }}
          />
          <ActionButton
            alignSelf="start"
            autoFocus={props.autoFocus}
            onPress={() => {
              onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])
            }}
          >
            Add
          </ActionButton>
          <DialogContainer
            onDismiss={() => {
              setModalState('closed')
            }}
          >
            {modalState !== 'closed' && (
              <Dialog>
                <Heading>Edit item</Heading>
                <Content>
                  <ArrayFieldItemModalContent
                    onChange={(cb) => {
                      setModalState((state) => {
                        if (state === 'closed') return state
                        return {
                          index: modalState.index,
                          forceValidation: state.forceValidation,
                          value: cb(state.value),
                        }
                      })
                    }}
                    schema={elements.at(modalState.index)?.schema as any}
                    value={modalState.value}
                  />
                </Content>
                <ButtonGroup>
                  <Button
                    prominence="low"
                    onPress={() => {
                      setModalState('closed')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    prominence="high"
                    onPress={() => {
                      if (!clientSideValidateProp(elements.at(modalState.index)?.schema, modalState.value)) {
                        setModalState((state) => ({
                          ...(state as any),
                          forceValidation: true,
                        }))
                        return
                      }
                      handleFieldPreviewChange(modalState.value, elements.at(modalState.index) as any)
                      setModalState('closed')
                    }}
                  >
                    Done
                  </Button>
                </ButtonGroup>
              </Dialog>
            )}
          </DialogContainer>
        </VStack>
      )}
    </Field>
  )
}

// Define a function to render a relationship field preview
function RelationshipFieldPreview(props: DefaultFieldProps<'relationship'>) {
  const { autoFocus, onChange, schema, value } = props
  const { listKey, label, description, filter, sort, many } = schema
  const list = useList(listKey)
  const formValue = many
    ? {
        kind: 'many' as const,
        id: '',
        initialValue: value === null ? [] : value.map((x) => ({ id: x.id, label: x.label || x.id.toString(), data: x.data, built: undefined })),
        value: value === null ? [] : value.map((x) => ({ id: x.id, label: x.label || x.id.toString(), data: x.data, built: undefined })),
      }
    : {
        kind: 'one' as const,
        id: '',
        initialValue: value ? { id: value.id, label: value.label || value.id.toString(), data: value.data, built: undefined } : null,
        value: value ? { id: value.id, label: value.label || value.id.toString(), data: value.data, built: undefined } : null,
      }

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
      onChange={(val) => {
        if (val.kind === 'count') return
        const { value } = val
        if (value === null) {
          onChange(null)
          return
        }
        if (Array.isArray(value)) {
          onChange(value.map((x) => ({ id: x.id, label: x.label })))
          return
        }
        onChange({ id: value.id, label: value.label })
      }}
      value={formValue}
      itemValue={{}}
    />
  )
}

// Define a function to render a form field preview
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

// Define a function to render an object field preview
function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined
  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {Object.entries(fields).map(([key, propVal]) => (
          <FormValueContentFromPreviewProps
            autoFocus={key === firstFocusable}
            key={key}
            {...propVal}
          />
        ))}
      </VStack>
    </HStack>
  )
}

// Define a function to render a conditional field preview
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
      <schemaDiscriminant.Input
        autoFocus={!!autoFocus}
        value={discriminant}
        onChange={onChange}
        forceValidation={false}
      />
      <FormValueContentFromPreviewProps {...value} />
    </HStack>
  )
}

// Define a function to render a field preview content
export const FormValueContentFromPreviewProps: MemoExoticComponent<
  (
    props: GenericPreviewProps<ComponentSchema, unknown> & {
      autoFocus?: boolean
      forceValidation?: boolean
    }
  ) => ReactElement
> = memo(function FormValueContentFromPreview(props) {
  return renderFieldPreview(props)
})

// Define a function to use an event callback
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

// Define a function to render an array field list view
function ArrayFieldListView<Element extends ComponentSchema>(
  props: GenericPreviewProps<ArrayField<Element>, unknown> & {
    'aria-label': string
    onOpenItem: (index: number) => void
  }
) {
  const onMove = (keys: Key[], target: ItemDropTarget) => {
    const targetIndex = props.elements.findIndex((x) => x.key === target.key)
    if (targetIndex === -1) return
    const allKeys = props.elements.map((x) => ({ key: x.key }))
    const indexToMoveTo = target.dropPosition === 'before' ? targetIndex : targetIndex + 1
    const indices = keys.map((key) => allKeys.findIndex((x) => x.key === key))
    props.onChange(move(allKeys, indices, indexToMoveTo))
  }

  const dragType = useMemo(() => Math.random().toString(36), [])
  const { dragAndDropHooks } = useDragAndDrop({
    getItems(keys) {
      return [...keys].map((key) => {
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
        let keys = []
        for (let item of e.items) {
          if (item.kind === 'text') {
            let key
            if (item.types.has(dragType)) {
              key = JSON.parse(await item.getText(dragType))
              keys.push(key)
            } else if (item.types.has('text/plain')) {
              key = await item.getText('text/plain')
              keys = key.split('\n').map((val) => val.replaceAll('"', ''))
            }
          }
        }
        onMove(keys, e.target)
      }
    },
    getDropOperation(target) {
      if (target.type === 'root' || target.dropPosition === 'on') return 'cancel'
      return 'move'
    },
  })
  const onRemoveKey = useEventCallback((key: string) => {
    props.onChange(props.elements.map((x) => ({ key: x.key })).filter((val) => val.key !== key))
  })

  return (
    <ListView
      aria-label={props['aria-label']}
      items={props.elements}
      dragAndDropHooks={dragAndDropHooks}
      height={props.elements.length ? undefined : 'scale.2000'}
      selectionMode="none"
      renderEmptyState={arrayFieldEmptyState}
      onAction={(key) => {
        const i = props.elements.findIndex((x) => x.key === key)
        if (i === -1) return
        props.onOpenItem(i)
      }}
    >
      {(item) => {
        const label = props.schema.itemLabel?.(item) || `Item ${props.elements.indexOf(item) + 1}`
        return (
          <Item key={item.key} textValue={label}>
            <Text>{label}</Text>
            <TooltipTrigger placement="start">
              <ActionButton onPress={() => onRemoveKey(item.key)}>
                <Icon src={trash2Icon} />
              </ActionButton>
              <Tooltip>Delete</Tooltip>
            </TooltipTrigger>
          </Item>
        )
      }}
    </ListView>
  )
}

// Define a function to render an array field item modal content
function ArrayFieldItemModalContent(props: {
  schema: NonChildFieldComponentSchema
  value: unknown
  onChange: (cb: (value: unknown) => unknown) => void
}) {
  const previewProps = useMemo(
    () => createGetPreviewProps(props.schema, props.onChange, () => undefined),
    [props.schema, props.onChange]
  )(props.value)
  return <FormValueContentFromPreviewProps {...previewProps} />
}

// Define a function to render an array field empty state
function arrayFieldEmptyState() {
  return (
    <VStack gap="large" alignItems="center" justifyContent="center" height="100%" padding="regular">
      <Text elementType="h3" align="center" color="neutralSecondary" size="large" weight="medium">
        Empty list
      </Text>
      <Text align="center" color="neutralTertiary">
        Add the first item to see it here.
      </Text>
    </VStack>
  )
}
```