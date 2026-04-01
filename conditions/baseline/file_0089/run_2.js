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

function renderArrayFieldModal(
  modalState: { index: number; value: unknown; forceValidation: boolean } | 'closed',
  elements: any[],
  schema: ComponentSchema
): ReactElement | null {
  if (schema.kind === 'child') return null
  if (modalState === 'closed') return null

  const element = elements.at(modalState.index)
  if (!element) return null

  return (
    <Dialog>
      <Heading>Edit item</Heading>
      <Content>
        <ArrayFieldItemModalContent
          onChange={(cb: (value: unknown) => unknown) => {
            // handled by parent
          }}
          schema={element.schema as any}
          value={modalState.value}
        />
      </Content>
      <ButtonGroup>
        <Button prominence="low">Cancel</Button>
        <Button prominence="high">Done</Button>
      </ButtonGroup>
    </Dialog>
  )
}

function handleArrayFieldModalChange(
  cb: (value: unknown) => unknown,
  modalState: { index: number; value: unknown; forceValidation: boolean } | 'closed',
  setModalState: (state: any) => void
) {
  setModalState((state: any) => {
    if (state === 'closed') return state
    return {
      index: modalState === 'closed' ? 0 : modalState.index,
      forceValidation: state.forceValidation,
      value: cb(state.value),
    }
  })
}

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

  const handleOpenItem = useCallback(
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

  const handleAddItem = useCallback(() => {
    onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])
  }, [elements, onChange])

  const handleModalDismiss = useCallback(() => {
    setModalState('closed')
  }, [])

  const handleModalChange = useCallback(
    (cb: (value: unknown) => unknown) => {
      handleArrayFieldModalChange(cb, modalState, setModalState)
    },
    [modalState]
  )

  const handleModalDone = useCallback(() => {
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

  const handleModalCancel = useCallback(() => {
    setModalState('closed')
  }, [])

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
          <DialogContainer onDismiss={handleModalDismiss}>
            {modalState !== 'closed' && (
              <Dialog>
                <Heading>Edit item</Heading>
                <Content>
                  <ArrayFieldItemModalContent
                    onChange={handleModalChange}
                    schema={(elements.at(modalState.index)?.schema as any) || ({} as any)}
                    value={modalState.value}
                  />
                </Content>
                <ButtonGroup>
                  <Button prominence="low" onPress={handleModalCancel}>
                    Cancel
                  </Button>
                  <Button prominence="high" onPress={handleModalDone}>
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

function buildRelationshipFormValue(value: any, many: boolean) {
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

function handleRelationshipChange(val: any, onChange: (value: any) => void) {
  if (val.kind === 'count') return
  const { value } = val
  if (value === null) {
    onChange(null)
    return
  }
  if (Array.isArray(value)) {
    onChange(value.map((x: any) => ({ id: x.id, label: x.label })))
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

function* generateObjectFieldItems(fields: Record<string, any>) {
  for (const [key, propVal] of Object.entries(fields)) {
    if (!isNonChildFieldPreviewProps(propVal)) continue
    yield (
      <FormValueContentFromPreviewProps
        autoFocus={false}
        key={key}
        {...propVal}
      />
    )
  }
}

function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined
  const items = useMemo(
    () => {
      const result = []
      for (const [key, propVal] of Object.entries(fields)) {
        if (!isNonChildFieldPreviewProps(propVal)) continue
        result.push(
          <FormValueContentFromPreviewProps
            autoFocus={key === firstFocusable}
            key={key}
            {...propVal}
          />
        )
      }
      return result
    },
    [fields, firstFocusable]
  )

  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {items}