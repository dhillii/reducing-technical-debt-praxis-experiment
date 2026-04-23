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

/** Converter from preview props to raw value. */
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

/** Converter from raw value to updater payload. */
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

/** Type guard for a specific schema kind. */
function isKind<Kind extends ComponentSchema['kind']>(
  props: GenericPreviewProps<ComponentSchema, unknown>,
  kind: Kind
): props is GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown> {
  return props.schema.kind === kind
}

/** Dispatch change based on schema kind. */
export function previewPropsOnChange<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  props: GenericPreviewProps<ComponentSchema, unknown>
) {
  if (isKind(props, 'child')) return

  const updater = valueToUpdater(value, props.schema)

  if (isKind(props, 'conditional')) {
    props.onChange(updater.discriminant, updater.value)
    return
  }

  if (
    isKind(props, 'form') ||
    isKind(props, 'relationship') ||
    isKind(props, 'object') ||
    isKind(props, 'array')
  ) {
    props.onChange(updater)
    return
  }

  assertNever(props)
}

/** Modal content for editing an array item. */
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

/** Empty state for array field. */
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

/** Render a single array item. */
function renderArrayFieldItem(
  item: ComponentSchema,
  schema: ArrayField<ComponentSchema>,
  onRemoveKey: (key: string) => void
) {
  const label = schema.itemLabel?.(item) || `Item ${schema.elements.indexOf(item) + 1}`
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
}

/** List view for array field with drag‑and‑drop. */
function ArrayFieldListView<Element extends ComponentSchema>(
  props: GenericPreviewProps<ArrayField<Element>, unknown> & {
    'aria-label': string
    onOpenItem: (index: number) => void
  }
) {
  const dragType = useMemo(() => Math.random().toString(36), [])
  const { dragAndDropHooks } = useDragAndDrop({
    getItems(keys) {
      return [...keys].map(key => {
        const str = JSON.stringify(key)
        return {
          [dragType]: str,
          'text/plain': str,
        }
      })
    },
    getAllowedDropOperations() {
      return ['move', 'cancel']
    },
    async onDrop(e) {
      if (e.target.type !== 'root' && e.target.dropPosition !== 'on') {
        const keys: Key[] = []
        for (const item of e.items) {
          if (item.kind === 'text') {
            if (item.types.has(dragType)) {
              const key = JSON.parse(await item.getText(dragType))
              keys.push(key)
            } else if (item.types.has('text/plain')) {
              const raw = await item.getText('text/plain')
              keys.push(...raw.split('\n').map(v => v.replaceAll('"', '')))
            }
          }
        }
        const targetIndex = props.elements.findIndex(x => x.key === e.target.key)
        if (targetIndex === -1) return
        const allKeys = props.elements.map(x => ({ key: x.key }))
        const indexToMoveTo =
          e.target.dropPosition === 'before' ? targetIndex : targetIndex + 1
        const indices = keys.map(k => allKeys.findIndex(x => x.key === k))
        props.onChange(move(allKeys, indices, indexToMoveTo))
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
      {item => renderArrayFieldItem(item, props.schema, onRemoveKey)}
    </ListView>
  )
}

/** Array field preview component. */
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

  const openItem = useCallback(
    (index: number) => {
      const element = elements.at(index)
      if (!element) return
      setModalState({
        index,
        value: previewPropsToValue(element),
        forceValidation: false,
      })
    },
    [elements]
  )

  const addItem = useCallback(() => {
    onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])
  }, [elements, onChange])

  const closeModal = useCallback(() => {
    setModalState('closed')
  }, [])

  const onModalChange = useCallback(
    (cb: (value: unknown) => unknown) => {
      setModalState(state => {
        if (state === 'closed') return state
        return {
          index: state.index,
          forceValidation: state.forceValidation,
          value: cb(state.value),
        }
      })
    },
    []
  )

  const renderModal = useCallback(() => {
    if (schema.element.kind === 'child') return null
    if (modalState === 'closed') return null
    const element = elements.at(modalState.index)
    if (!element) return null
    return (
      <Dialog>
        <Heading>Edit item</Heading>
        <Content>
          <ArrayFieldItemModalContent
            onChange={onModalChange}
            schema={element.schema as any}
            value={modalState.value}
          />
        </Content>
        <ButtonGroup>
          <Button
            prominence="low"
            onPress={closeModal}
          >
            Cancel
          </Button>
          <Button
            prominence="high"
            onPress={() => {
              if (!clientSideValidateProp(element.schema, modalState.value)) {
                setModalState(state => ({
                  ...(state as any),
                  forceValidation: true,
                }))
                return
              }
              previewPropsOnChange(modalState.value, element)
              closeModal()
            }}
          >
            Done
          </Button>
        </ButtonGroup>
      </Dialog>
    )
  }, [schema.element.kind, modalState, elements, onModalChange, closeModal])

  return (
    <Field label={label} labelElementType="span">
      {groupProps => (
        <VStack gap="medium" role="group" minWidth={0} {...groupProps}>
          <ArrayFieldListView
            {...props}
            aria-label={label ?? ''}
            onOpenItem={openItem}
          />
          <ActionButton
            alignSelf="start"
            autoFocus={props.autoFocus}
            onPress={addItem}
          >
            Add
          </ActionButton>
          <DialogContainer onDismiss={closeModal}>
            {renderModal()}
          </DialogContainer>
        </VStack>
      )}
    </Field>
  )
}

/** Relationship field preview component. */
function RelationshipFieldPreview(props: DefaultFieldProps<'relationship'>) {
  const { autoFocus, onChange, schema, value } = props
  const { listKey, label, description, filter, sort, many } = schema
  const list = useList(listKey)

  const formValue = useMemo(() => {
    if (many) {
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

  const handleChange = useCallback(
    (val: any) => {
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
    },
    [onChange]
  )

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
      onChange={handleChange}
      value={formValue}
      itemValue={{}}
    />
  )
}

/** Form field preview component. */
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

/** Determine if a field can be focused. */
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

/** Find first focusable key in an object field. */
function findFocusableObjectFieldKey(schema: ObjectField): string | undefined {
  for (const [key, innerProp] of Object.entries(schema.fields)) {
    if (canFieldBeFocused(innerProp)) return key
  }
}

/** Object field preview component. */
function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined
  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {Object.entries(fields)
          .filter(([, propVal]) => !isNonChildFieldPreviewProps(propVal))
          .map(([key, propVal]) => (
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

/** Conditional field preview component. */
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

/** Type guard for non‑child preview props. */
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

/** Main component rendering a field preview. */
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

/** Hook to keep a stable callback reference. */
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