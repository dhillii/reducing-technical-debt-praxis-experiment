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

/* ---------- Converters ---------- */

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
    setKeysForArrayValue(values, props.elements.map(x => x.key))
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
      Object.entries(schema.fields).map(([key, fieldSchema]) => [
        key,
        valueToUpdater(value[key], fieldSchema),
      ])
    )
  },
  relationship(value) {
    return value
  },
}

/* ---------- Public Helpers ---------- */

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

/* ---------- Type Guards ---------- */

function isKind<Kind extends ComponentSchema['kind']>(
  props: GenericPreviewProps<ComponentSchema, unknown>,
  kind: Kind
): props is GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown> {
  return props.schema.kind === kind
}

/* ---------- Change Propagation ---------- */

export function previewPropsOnChange<Schema extends ComponentSchema>(
  value: ValueForComponentSchema<Schema>,
  props: GenericPreviewProps<ComponentSchema, unknown>
) {
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

/* ---------- Focus Helpers ---------- */

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
    if (canFieldBeFocused(innerProp)) return key
  }
}

/* ---------- Array Field ---------- */

function getArrayItemModalState(
  elements: readonly { key: string | undefined }[],
  index: number,
  value: unknown
) {
  return {
    index,
    value,
    forceValidation: false,
  } as const
}

/** @private */
function ArrayItemModal({
  element,
  modalState,
  setModalState,
  onChange,
}: {
  element: GenericPreviewProps<ComponentSchema, unknown>
  modalState: { index: number; value: unknown; forceValidation: boolean }
  setModalState: React.Dispatch<
    React.SetStateAction<
      | { index: number; value: unknown; forceValidation: boolean }
      | 'closed'
    >
  >
  onChange: (value: unknown) => void
}) {
  const onModalChange = (cb: (value: unknown) => unknown) => {
    setModalState(state => {
      if (state === 'closed') return state
      return {
        index: state.index,
        forceValidation: state.forceValidation,
        value: cb(state.value),
      }
    })
  }

  const handleDone = () => {
    if (!clientSideValidateProp(element.schema, modalState.value)) {
      setModalState(state => ({
        ...(state as any),
        forceValidation: true,
      }))
      return
    }
    previewPropsOnChange(modalState.value, element)
    setModalState('closed')
  }

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
        <Button prominence="low" onPress={() => setModalState('closed')}>
          Cancel
        </Button>
        <Button prominence="high" onPress={handleDone}>
          Done
        </Button>
      </ButtonGroup>
    </Dialog>
  )
}

function ArrayFieldPreview(props: DefaultFieldProps<'array'>) {
  const { elements, onChange, schema } = props
  const { label } = schema
  const [modalState, setModalState] = useState<
    | { index: number; value: unknown; forceValidation: boolean }
    | 'closed'
  >('closed')

  const openItem = (index: number) => {
    const element = elements.at(index)
    if (!element) return
    setModalState(getArrayItemModalState(elements, index, previewPropsToValue(element)))
  }

  const closeModal = () => setModalState('closed')

  const renderModal = () => {
    if (modalState === 'closed') return null
    const element = elements.at(modalState.index)
    if (!element) return null
    if (props.schema.element.kind === 'child') return null
    return (
      <DialogContainer onDismiss={closeModal}>
        <ArrayItemModal
          element={element}
          modalState={modalState}
          setModalState={setModalState}
          onChange={onChange}
        />
      </DialogContainer>
    )
  }

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
            onPress={() => {
              onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])
            }}
          >
            Add
          </ActionButton>
          {renderModal()}
        </VStack>
      )}
    </Field>
  )
}

/* ---------- Relationship Field ---------- */

function getRelationshipFormValue(
  schema: RelationshipField,
  value: any,
  many: boolean
) {
  if (many) {
    if (value !== null && !('length' in value)) throw TypeError('bad value')
    const manyValue =
      value === null
        ? []
        : value.map((x: any) => ({
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
}

function RelationshipFieldPreview(props: DefaultFieldProps<'relationship'>) {
  const { autoFocus, onChange, schema, value } = props
  const { listKey, label, description, filter, sort, many } = schema
  const list = useList(listKey)

  const formValue = useMemo(() => getRelationshipFormValue(schema, value, many), [
    schema,
    value,
    many,
  ])

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

/* ---------- Form & Conditional & Object ---------- */

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
        {Object.entries(fields).map(([key, propVal]) => {
          if (!isNonChildFieldPreviewProps(propVal)) return null
          return (
            <FormValueContentFromPreviewProps
              autoFocus={key === firstFocusable}
              key={key}
              {...propVal}
            />
          )
        })}
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

/* ---------- Type Utilities ---------- */

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

/* ---------- Renderer Map ---------- */

const fieldRenderers = {
  array: ArrayFieldPreview,
  relationship: RelationshipFieldPreview,
  child: () => null,
  form: FormFieldPreview,
  object: ObjectFieldPreview,
  conditional: ConditionalFieldPreview,
}

/* ---------- Main Export ---------- */

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

/* ---------- Hook Utilities ---------- */

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

/* ---------- Array List View ---------- */

function handleArrayDrop(
  propsElements: readonly { key: string }[],
  onChange: (value: any) => void,
  dragType: string,
  e: any
) {
  if (e.target.type !== 'root' && e.target.dropPosition !== 'on') {
    const keys: any[] = []
    for (const item of e.items) {
      if (item.kind === 'text') {
        if (item.types.has(dragType)) {
          const key = JSON.parse(item.getTextSync(dragType))
          keys.push(key)
        } else if (item.types.has('text/plain')) {
          const raw = item.getTextSync('text/plain')
          keys.push(...raw.split('\n').map(val => val.replaceAll('"', '')))
        }
      }
    }
    const targetIndex = propsElements.findIndex(x => x.key === e.target.key)
    if (targetIndex === -1) return
    const allKeys = propsElements.map(x => ({ key: x.key }))
    const indexToMoveTo = e.target.dropPosition === 'before' ? targetIndex : targetIndex + 1
    const indices = keys.map(key => allKeys.findIndex(x => x.key === key))
    onChange(move(allKeys, indices, indexToMoveTo))
  }
}

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
        const serialized = JSON.stringify(key)
        return {
          [dragType]: serialized,
          'text/plain': serialized,
        }
      })
    },
    getAllowedDropOperations() {
      return ['move', 'cancel']
    },
    async onDrop(e) {
      handleArrayDrop(props.elements, props.onChange, dragType, e)
    },
    getDropOperation(target) {
      return target.type === 'root' || target.dropPosition === 'on' ? 'cancel' : 'move'
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
        if (i !== -1) props.onOpenItem(i)
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

/* ---------- Modal Content ---------- */

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

/* ---------- Empty State ---------- */

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