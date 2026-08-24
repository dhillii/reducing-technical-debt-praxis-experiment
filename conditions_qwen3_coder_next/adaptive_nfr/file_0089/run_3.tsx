import { type Key, type MemoExoticComponent, type ReactElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ArrayField, ComponentSchema, ConditionalField, FormField, GenericPreviewProps, InitialOrUpdateValueFromComponentPropField, ObjectField, RelationshipField, ValueForComponentSchema } from './api'
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

const previewPropsToValueConverter: { [Kind in ComponentSchema['kind']]: (props: GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown>) => ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>> } = {
  child() { return null },
  form(props) { return props.value },
  array(props) {
    const values = props.elements.map(x => previewPropsToValue(x))
    setKeysForArrayValue(values, props.elements.map(x => x.key))
    return values
  },
  conditional(props) {
    return { discriminant: props.discriminant, value: previewPropsToValue(props.value) }
  },
  object(props) {
    return Object.fromEntries(Object.entries(props.fields).map(([key, val]) => [key, previewPropsToValue(val)]))
  },
  relationship(props) { return props.value },
}

const valueToUpdaters: { [Kind in ComponentSchema['kind']]: (value: ValueForComponentSchema<Extract<ComponentSchema, { kind: Kind }>, schema: Extract<ComponentSchema, { kind: Kind }>) => InitialOrUpdateValueFromComponentPropField<Extract<ComponentSchema, { kind: Kind }>> } = {
  child() { return undefined },
  form(value) { return value },
  array(value, schema) {
    const keys = getKeysForArrayValue(value)
    return value.map((x, i) => ({ key: keys[i], value: valueToUpdater(x, schema.element) }))
  },
  conditional(value, schema) {
    return { discriminant: value.discriminant, value: valueToUpdater(value.value, schema.values[value.discriminant.toString()]) }
  },
  object(value, schema) {
    return Object.fromEntries(Object.entries(schema.fields).map(([key, schema]) => [key, valueToUpdater(value[key], schema)]))
  },
  relationship(value) { return value },
}

export function previewPropsToValue<Schema extends ComponentSchema>(props: GenericPreviewProps<ComponentSchema, unknown>): ValueForComponentSchema<Schema> {
  return (previewPropsToValueConverter[props.schema.kind] as any)(props)
}

function valueToUpdater<Schema extends ComponentSchema>(value: ValueForComponentSchema<Schema>, schema: ComponentSchema): InitialOrUpdateValueFromComponentPropField<Schema> {
  return (valueToUpdaters[schema.kind] as any)(value, schema)
}

function isKind<Kind extends ComponentSchema['kind']>(props: GenericPreviewProps<ComponentSchema, unknown>, kind: Kind): props is GenericPreviewProps<Extract<ComponentSchema, { kind: Kind }>, unknown> {
  return props.schema.kind === kind
}

export function previewPropsOnChange<Schema extends ComponentSchema>(value: ValueForComponentSchema<Schema>, props: GenericPreviewProps<ComponentSchema, unknown>) {
  if (isKind(props, 'child')) return
  const updateKind = () => props.onChange(valueToUpdater(value, props.schema))
  if (isKind(props, 'form') || isKind(props, 'relationship') || isKind(props, 'object') || isKind(props, 'array')) {
    updateKind()
    return
  }
  if (isKind(props, 'conditional')) {
    const updater = valueToUpdater(value, props.schema)
    props.onChange(updater.discriminant, updater.value)
    return
  }
  assertNever(props)
}

function ArrayFieldPreview(props: DefaultFieldProps<'array'>) {
  const { elements, onChange, schema } = props
  const { label } = schema
  const [modalState, setModalState] = useState<[{ index: number, value: unknown, forceValidation: boolean }, 'closed'] | 'closed'>('closed')

  const handleOpenItem = (index: number) => {
    const element = elements.at(index)
    if (!element) return
    setModalState([{ index, value: previewPropsToValue(element), forceValidation: false }, 'open'])
  }

  const closeModal = () => setModalState('closed')

  const handleUpdate = useCallback((cb: (value: unknown) => unknown) => {
    setModalState(([prev, status]) => {
      if (status === 'closed') return 'closed'
      const updated = cb(prev.value)
      return [{ ...prev, value: updated, forceValidation: prev.forceValidation }, 'open']
    })
  }, [])

  const handleSubmit = () => {
    if (typeof modalState !== 'string' && modalState[1] === 'open') {
      const [state] = modalState
      const element = elements.at(state.index)
      if (!element) return
      if (!clientSideValidateProp(element.schema, state.value)) {
        setModalState(([prev, status]) => {
          if (status === 'closed') return 'closed'
          return [{ ...prev, forceValidation: true }, 'open']
        })
        return
      }
      previewPropsOnChange(state.value, element)
      closeModal()
    }
  }

  return (
    <Field label={label} labelElementType="span">
      {groupProps => (
        <VStack gap="medium" role="group" minWidth={0} {...groupProps}>
          <ArrayFieldListView {...props} aria-label={label ?? ''} onOpenItem={handleOpenItem} />
          <ActionButton alignSelf="start" autoFocus={props.autoFocus} onPress={() => onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])}>Add</ActionButton>
          <DialogContainer onDismiss={closeModal}>
            { renderArrayModal(modalState, elements, schema, handleUpdate, handleSubmit, closeModal) }
          </DialogContainer>
        </VStack>
      )}
    </Field>
  )
}

function renderArrayModal(
  modalState: typeof ArrayFieldPreview extends () => infer R ? R['modalState'] : never,
  elements: typeof ArrayFieldPreview extends () => infer R ? R['props']['elements'] : never,
  schema: typeof ArrayFieldPreview extends () => infer R ? R['props']['schema'] : never,
  onChange: (cb: (value: unknown) => unknown) => void,
  handleSubmit: () => void,
  closeModal: () => void
) {
  if (modalState === 'closed') return null
  if (schema.element.kind === 'child') return null

  const [state, status] = modalState as [{ index: number, value: unknown, forceValidation: boolean }, 'open']
  const element = elements.at(state.index)
  if (!element) return null

  return (
    <Dialog>
      <Heading>Edit item</Heading>
      <Content>
        <ArrayFieldItemModalContent onChange={onChange} schema={element.schema as any} value={state.value} />
      </Content>
      <ButtonGroup>
        <Button prominence="low" onPress={closeModal}>Cancel</Button>
        <Button prominence="high" onPress={handleSubmit}>Done</Button>
      </ButtonGroup>
    </Dialog>
  )
}

function RelationshipFieldPreview(props: DefaultFieldProps<'relationship'>) {
  const { autoFocus, onChange, schema, value } = props
  const { listKey, label, description, filter, sort, many } = schema
  const list = useList(listKey)

  const formValue = many ? buildManyValue(value) : buildOneValue(value)

  return (
    <RelationshipFieldView
      autoFocus={autoFocus} isRequired={false}
      field={{
        label, description: description ?? '', display: 'select', listKey: '?', fieldKey: '?',
        defaultValue: null as any, deserialize: null as any, serialize: null as any, graphqlSelection: null as any,
        refListKey: list.key, many, hideCreate: true, refLabelField: list.labelField,
        refSearchFields: list.initialSearchFields, columns: list.initialColumns, initialSort: null,
        selectFilter: filter || null, selectSort: sort ?? list.initialSort,
      }}
      onChange={val => {
        if (val.kind === 'count') return
        const { value } = val
        if (value === null) return onChange(null)
        if (Array.isArray(value)) return onChange(value.map(x => ({ id: x.id, label: x.label })))
        return onChange({ id: value.id, label: value.label })
      }}
      value={formValue}
      itemValue={{}}
    />
  )
}

function buildManyValue(value: any) {
  if (value !== null && !('length' in value)) throw TypeError('bad value')
  const manyValue = value === null ? [] : value.map(x => ({ id: x.id, label: x.label || x.id.toString(), data: x.data, built: undefined }))
  return { kind: 'many' as const, id: '', initialValue: manyValue, value: manyValue }
}

function buildOneValue(value: any) {
  if (value !== null && 'length' in value) throw TypeError('bad value')
  const oneValue = value ? { id: value.id, label: value.label || x.id.toString(), data: value.data, built: undefined } : null
  return { kind: 'one' as const, id: '', initialValue: oneValue, value: oneValue }
}

function FormFieldPreview({ schema, autoFocus, forceValidation, onChange, value }: DefaultFieldProps<'form'>) {
  return <schema.Input autoFocus={!!autoFocus} value={value} onChange={onChange} forceValidation={!!forceValidation} />
}

function canFieldBeFocused(schema: ComponentSchema): boolean {
  switch (schema.kind) {
    case 'child': return false
    case 'array': return true
    case 'conditional': return true
    case 'form': return true
    case 'relationship': return true
    case 'object': return Object.values(schema.fields).some(canFieldBeFocused)
    default: assertNever(schema)
  }
}

function findFocusableObjectFieldKey(schema: ObjectField): string | undefined {
  for (const [key, innerProp] of Object.entries(schema.fields)) {
    if (canFieldBeFocused(innerProp)) return key
  }
}

function ObjectFieldPreview({ schema, autoFocus, fields }: DefaultFieldProps<'object'>) {
  const firstFocusable = autoFocus ? findFocusableObjectFieldKey(schema) : undefined
  return (
    <HStack gap="medium" paddingTop="medium">
      <GroupIndicatorLine />
      <VStack gap="xlarge" flex minWidth={0}>
        {renderObjectFields(fields, firstFocusable)}
      </VStack>
    </HStack>
  )
}

function renderObjectFields(fields: Record<string, any>, firstFocusable?: string): ReactElement[] {
  return Object.entries(fields)
    .filter(([, propVal]) => isNonChildFieldPreviewProps(propVal))
    .map(([key, propVal]) => (
      <FormValueContentFromPreviewProps autoFocus={key === firstFocusable} key={key} {...propVal} />
    ))
}

function ConditionalFieldPreview({ schema, autoFocus, discriminant, onChange, value }: DefaultFieldProps<'conditional'>) {
  const schemaDiscriminant = schema.discriminant as FormField<string | boolean, unknown>
  return (
    <HStack gap="xlarge">
      {useMemo(() => (
        <schemaDiscriminant.Input autoFocus={!!autoFocus} value={discriminant} onChange={onChange} forceValidation={false} />
      ), [autoFocus, schemaDiscriminant, discriminant, onChange])}
      {isNonChildFieldPreviewProps(value) && <FormValueContentFromPreviewProps {...value} />}
    </HStack>
  )
}

export type NonChildFieldComponentSchema =
  | FormField<any, any> | ObjectField
  | ConditionalField<FormField<any, any>, { [key: string]: ComponentSchema }>
  | RelationshipField<boolean> | ArrayField<ComponentSchema>

function isNonChildFieldPreviewProps(props: GenericPreviewProps<ComponentSchema, unknown>): props is GenericPreviewProps<NonChildFieldComponentSchema, unknown> {
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

export const FormValueContentFromPreviewProps: MemoExoticComponent<(props: GenericPreviewProps<ComponentSchema, unknown> & { autoFocus?: boolean, forceValidation?: boolean }) => ReactElement> = memo(function FormValueContentFromPreview(props) {
  const Comp = fieldRenderers[props.schema.kind]
  return <Comp {...(props as any)} />
})

function useEventCallback<Func extends (...args: any) => any>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => callbackRef.current(...args), [])
  useEffect(() => { callbackRef.current = callback }, [callback])
  return cb as any
}

function ArrayFieldListView<Element extends ComponentSchema>(
  props: GenericPreviewProps<ArrayField<Element>, unknown> & { 'aria-label': string; onOpenItem: (index: number) => void }
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
        return { [dragType]: key, 'text/plain': key }
      })
    },
    getAllowedDropOperations() { return ['move', 'cancel'] },
    async onDrop(e) {
      if (e.target.type !== 'root' && e.target.dropPosition !== 'on') {
        let keys: Key[] = []
        for (let item of e.items) {
          if (item.kind === 'text') {
            let key: string | undefined
            if (item.types.has(dragType)) {
              key = JSON.parse(await item.getText(dragType))
              keys.push(key as Key)
            } else if (item.types.has('text/plain')) {
              key = await item.getText('text/plain')
              keys = key.split('\n').map(val => val.replaceAll('"', '')) as Key[]
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

  const onRemoveKey = useEventCallback((key: string) => props.onChange(props.elements.map(x => ({ key: x.key })).filter(val => val.key !== key)))

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

function ArrayFieldItemModalContent(props: { schema: NonChildFieldComponentSchema, value: unknown, onChange: (cb: (value: unknown) => unknown) => void }) {
  const previewProps = useMemo(
    () => createGetPreviewProps(props.schema, props.onChange, () => undefined)(props.value),
    [props.schema, props.onChange, props.value]
  )
  return <FormValueContentFromPreviewProps {...previewProps} />
}

function arrayFieldEmptyState() {
  return (
    <VStack gap="large" alignItems="center" justifyContent="center" height="100%" padding="regular">
      <Text elementType="h3" align="center" color="neutralSecondary" size="large" weight="medium">Empty list</Text>
      <Text align="center" color="neutralTertiary">Add the first item to see it here.</Text>
    </VStack>
  )
}