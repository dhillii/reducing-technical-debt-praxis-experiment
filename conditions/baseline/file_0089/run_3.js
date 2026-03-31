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

type PreviewPropsToValueConverter = {
  [Kind in ComponentSchema['kind']]: (
    props: GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown>
  ) => ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>
}

type ValueToUpdater = {
  [Kind in ComponentSchema['kind']]: (
    value: ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>>,
    schema: Extract<ComponentSchema, { kind: Kind }>
  ) => InitialOrUpdateValueFromComponentPropField<Extract<ComponentSchema, { kind: Kind }>>
}

const previewPropsToValueConverter: PreviewPropsToValueConverter = {
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

const valueToUpdaters: ValueToUpdater = {
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
  if (isKind(props, 'child')) return
  if (isKind(props, 'form') || isKind(props, 'relationship') || isKind(props, 'object') || isKind(props, 'array')) {
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

type ModalState = { index: number; value: unknown; forceValidation: boolean } | 'closed'

function ArrayFieldPreview(props: DefaultFieldProps<'array'>) {
  const { elements, onChange, schema } = props
  const { label } = schema
  const [modalState, setModalState] = useState<ModalState>('closed')

  const handleAddItem = useCallback(() => {
    onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])
  }, [elements, onChange])

  const handleOpenItem = useCallback((index: number) => {
    const element = elements.at(index)
    if (!element) return
    setModalState({
      index,
      value: previewPropsToValue(element),
      forceValidation: false,
    })
  }, [elements])

  const handleModalChange = useCallback((cb: (value: unknown) => unknown) => {
    setModalState(state => {
      if (state === 'closed') return state
      return {
        index: state.index,
        forceValidation: state.forceValidation,
        value: cb(state.value),
      }
    })
  }, [])

  const handleModalSave = useCallback(() => {
    if (modalState === 'closed') return
    const element = elements.at(modalState.index)
    if (!element) return

    if (!clientSideValidateProp(element.schema, modalState.value)) {
      setModalState(state => ({
        ...(state as any),
        forceValidation: true,
      }))
      return
    }
    previewPropsOnChange(modalState.value, element)
    setModalState('closed')
  }, [modalState, elements])

  const isChildElement = props.schema.element.kind === 'child'
  const shouldShowModal = modalState !== 'closed' && !isChildElement

  return (
    <Field label={label} labelElementType="span">
      {groupProps => (
        <VStack gap="medium" role="group" minWidth={0} {...groupProps}>
          <ArrayFieldListView
            {...props}
            aria-label={label ?? ''}
            onOpenItem={handleOpenItem}
          />
          <ActionButton alignSelf="start" autoFocus={props.autoFocus} onPress={handleAddItem}>
            Add
          </ActionButton>
          <DialogContainer onDismiss={() => setModalState('closed')}>
            {shouldShowModal && modalState !== 'closed' && (
              <ArrayFieldModal
                element={elements.at(modalState.index)!}
                value={modalState.value}
                onChange={handleModalChange}
                onSave={handleModalSave}
              />
            )}
          </DialogContainer>
        </VStack>
      )}
    </Field>
  )
}

interface ArrayFieldModalProps {
  element: GenericPreviewProps<ComponentSchema, unknown>
  value: unknown
  onChange: (cb: (value: unknown) => unknown) => void
  onSave: () => void
}

function ArrayFieldModal({ element, value, onChange, onSave }: ArrayFieldModalProps) {
  return (
    <Dialog>
      <Heading>Edit item</Heading>
      <Content>
        <ArrayFieldItemModalContent
          onChange={onChange}
          schema={element.schema as any}
          value={value}
        />
      </Content>
      <ButtonGroup>
        <Button prominence="low" onPress={() => {}}>
          Cancel
        </Button>
        <Button prominence="high" onPress={onSave}>
          Done
        </Button>
      </ButtonGroup>
    </Dialog>
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
  }, [value, many])

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
  switch (schema.kind) {
    case 'child':
      return false
    case 'array':
    case 'conditional':
    case 'form':
    case 'relationship':
      return true
    case 'object':
      return Object.values(schema.fields).some(canFieldBeFocused)
    default:
      assertNever(schema)
  }
}

function findFocusableObjectFieldKey(schema: ObjectField): string | undefined {
  return Object.entries(schema.fields).find(([, innerProp]) =>
    canFieldBeFocused(innerProp)
  )?.[0]
}

function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined

  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {Object.entries(fields)
          .filter(([, propVal]) => isNonChildFieldPreviewProps(propVal))
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

function ConditionalFieldPreview({
  schema,
  autoFocus,
  discriminant,
  onChange,
  value,
}: DefaultFieldProps<'conditional'>) {
  const schemaDiscriminant = schema.discriminant as FormField<string | boolean, unknown>

  const discriminantInput = useMemo(
    () => (
      <schemaDiscriminant.Input
        autoFocus={!!autoFocus}
        value={discriminant}
        onChange={onChange}
        forceValidation={false}
      />
    ),
    [autoFocus, schemaDiscriminant, discriminant, onChange]
  )

  return (
    <HStack gap="xlarge">
      {discriminantInput}
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
} as const

export const FormValueContentFromPreviewProps: MemoExoticComponent<
  (
    props: GenericPreviewProps<ComponentSchema, unknown> & {
      autoFocus?: boolean
      forceValidation?: boolean
    }
  ) => ReactElement
> = memo(function FormValueContentFromPreview(props) {
  const Comp = fieldRenderers[props.