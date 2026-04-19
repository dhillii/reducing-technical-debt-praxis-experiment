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

/**
 * Converts preview props to their corresponding value representation.
 * Uses strategy pattern to dispatch based on field kind.
 */
const previewPropsToValueConverter: {
  [Kind in ComponentSchema['kind']]: (
    props: GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown>
  ) => ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>
} = {
  child: () => null,
  form: props => props.value,
  array: props => {
    const values = props.elements.map(x => previewPropsToValue(x))
    setKeysForArrayValue(
      values,
      props.elements.map(x => x.key)
    )
    return values
  },
  conditional: props => ({
    discriminant: props.discriminant,
    value: previewPropsToValue(props.value),
  }),
  object: props =>
    Object.fromEntries(
      Object.entries(props.fields).map(([key, val]) => [key, previewPropsToValue(val)])
    ),
  relationship: props => props.value,
}

/**
 * Converts values back to updaters for onChange callbacks.
 * Uses strategy pattern to dispatch based on field kind.
 */
const valueToUpdaters: {
  [Kind in ComponentSchema['kind']]: (
    value: ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>,
    schema: Extract<ComponentSchema, { kind: Kind }>
  ) => InitialOrUpdateValueFromComponentPropField<Extract<ComponentSchema, { kind: Kind }>>
} = {
  child: () => undefined,
  form: value => value,
  array: (value, schema) => {
    const keys = getKeysForArrayValue(value)
    return value.map((x, i) => ({
      key: keys[i],
      value: valueToUpdater(x, schema.element),
    }))
  },
  conditional: (value, schema) => ({
    discriminant: value.discriminant,
    value: valueToUpdater(value.value, schema.values[value.discriminant.toString()]),
  }),
  object: (value, schema) =>
    Object.fromEntries(
      Object.entries(schema.fields).map(([key, schema]) => [
        key,
        valueToUpdater(value[key], schema),
      ])
    ),
  relationship: value => value,
}

/**
 * Dispatches preview props to value conversion based on schema kind.
 */
export function previewPropsToValue<Schema extends ComponentSchema>(
  props: GenericPreviewProps<ComponentSchema, unknown>
): ValueForComponentSchema<Schema> {
  return (previewPropsToValueConverter[props.schema.kind] as any)(props)
}

/**
 * Dispatches value to updater conversion based on schema kind.
 */
function valueToUpdater<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  schema: ComponentSchema
): InitialOrUpdateValueFromComponentPropField<Schema> {
  return (valueToUpdaters[schema.kind] as any)(value, schema)
}

/**
 * Type guard to check if props schema matches a specific kind.
 */
function isKind<Kind extends ComponentSchema['kind']>(
  props: GenericPreviewProps<ComponentSchema, unknown>,
  kind: Kind
): props is GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown> {
  return props.schema.kind === kind
}

/**
 * Determines if a field can receive focus based on its schema kind.
 */
function canFieldBeFocused(schema: ComponentSchema): boolean {
  switch (schema.kind) {
    case 'child':
      return false
    case 'array':
    case 'conditional':
    case 'form':
    case 'relationship':
      return true
    case 'object': {
      for (const innerProp of Object.values(schema.fields)) {
        if (canFieldBeFocused(innerProp)) return true
      }
      return false
    }
    default:
      return false
  }
}

/**
 * Finds the first focusable field key within an object schema.
 */
function findFocusableObjectFieldKey(schema: ObjectField): string | undefined {
  for (const [key, innerProp] of Object.entries(schema.fields)) {
    if (canFieldBeFocused(innerProp)) return key
  }
}

/**
 * Determines if preview props represent a non-child field.
 */
function isNonChildFieldPreviewProps(
  props: GenericPreviewProps<ComponentSchema, unknown>
): props is GenericPreviewProps<NonChildFieldComponentSchema, unknown> {
  return props.schema.kind !== 'child'
}

/**
 * Handles onChange for preview props based on field kind.
 */
export function previewPropsOnChange<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  props: GenericPreviewProps<ComponentSchema, unknown>
) {
  switch (props.schema.kind) {
    case 'child':
      return
    case 'form':
    case 'relationship':
    case 'object':
    case 'array':
      props.onChange(valueToUpdater(value, props.schema))
      return
    case 'conditional': {
      const updater = valueToUpdater(value, props.schema)
      props.onChange(updater.discriminant, updater.value)
      return
    }
    default:
      assertNever(props)
  }
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
            {(() => {
              if (modalState === 'closed') return null
              const element = elements.at(modalState.index)
              if (!element) return null
              const onModalChange = (cb: (value: unknown) => unknown) => {
                setModalState(state => {
                  if (state === 'closed') return state
                  return {
                    index: modalState.index,
                    forceValidation: state.forceValidation,
                    value: cb(state.value),
                  }
                })
              }

              return (
                <Dialog>
                  <Heading>Edit item</Heading>
                  <Content>
                    <ArrayFieldItemModalContent
                      onChange={onModalChange}
                      schema={element.schema as any /* TODO FIXME */}
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
                        if (!clientSideValidateProp(element.schema, modalState.value)) {
                          setModalState(state => ({
                            ...(state as any) /* TODO FIXME */,
                            forceValidation: true,
                          }))
                          return
                        }
                        previewPropsOnChange(modalState.value, element)
                        setModalState('closed')
                      }}
                    >
                      Done
                    </Button>
                  </ButtonGroup>
                </Dialog>
              )
            })()}
          </DialogContainer>
        </VStack>
      )}
    </Field>
  )
}

function RelationshipFieldPreview(props: DefaultFieldProps<'relationship'>) {
  const { autoFocus, onChange, schema, value } = props
  const { listKey, label, description, filter, sort, many } = schema
  const list = useList(listKey)

  const formValue = useMemo(() => {
    if (many) {
      if (value !== null && !('length' in value)) throw TypeError('bad value')
      const manyValue =
        value === null
          ? []
          : value.map(x => ({
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
          id: value.id,
          label: value.label || value.id.toString(),
          data: value.data,
          built: undefined,
        }
      : null
    return {
      kind: 'one' as const,
      id: '',
      initialValue: oneValue,
      value: oneValue,
    }
  }, [many, value])

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
      onChange={val => {
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
      }}
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

function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined
  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {[
          ...(function* () {
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
          })(),
        ]}
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

type NonChildFieldComponentSchema =
  | FormField<any, any>
  | ObjectField
  | ConditionalField<FormField<any, any>, { [key: string]: ComponentSchema }>
  | RelationshipField<boolean>
  | ArrayField<ComponentSchema>

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

function ArrayFieldListView<Element extends ComponentSchema>(
  props: GenericPreviewProps<ArrayField<Element>, unknown> & {
    'aria-label': string
    onOpenItem: (index: number) => void
  }
) {
  const onMove = (keys: Key[], target: ItemDropTarget) => {
    const targetIndex = props.elements.findIndex(x => x.key === target.key)
    if (targetIndex === -1) return
    const allKeys = props.elements.map(x => ({ key: x.key }))
    const indexToMoveTo = target.dropPosition === 'before' ? targetIndex : targetIndex + 1
    const indices = keys.map(key => allKeys.findIndex(x => x.key === key))
    props.onChange(move(allKeys, indices, indexToMoveTo))
  }

  const dragType = useMemo(() => Math.random().toString(36), [])
  const { dragAndDropHooks } = useDragAndDrop({
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
        let keys = []
        for (let item of e.items) {
          if (item.kind === 'text') {
            let key
            if (item.types.has(dragType)) {
              key = JSON.parse(await item.getText(dragType))
              keys.push(key)
            } else if (item.types.has('text/plain')) {
              key = await item.getText('text/plain')
              keys = key.split('\n').map(val => val.replaceAll('"', ''))
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
    props.onChange(props.elements.map(x => ({ key: x.key })).filter(val => val.key !== key))
  })

  return (
    <ListView
      aria-label={props['aria-label']}
      items={props.elements}
      dragAndDropHooks={dragAndDropHooks}
      height={props.elements.length ? undefined : 'scale.2000'}
      selectionMode="none"
      renderEmptyState={arrayFieldEmptyState}
      onAction={key => {
        const i = props.elements.findIndex(x => x.key === key)
        if (i === -1) return
        props.onOpenItem(i)
      }}
    >
      {item => {
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