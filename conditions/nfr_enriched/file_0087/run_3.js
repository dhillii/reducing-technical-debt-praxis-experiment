import { useListFormatter } from '@react-aria/i18n'
import { type Key, useMemo, useState } from 'react'

import { FieldLabel } from '@keystar/ui/field'
import { VStack } from '@keystar/ui/layout'
import { ListView } from '@keystar/ui/list-view'
import { Item, Picker } from '@keystar/ui/picker'
import { Radio, RadioGroup } from '@keystar/ui/radio'
import { tokenSchema } from '@keystar/ui/style'
import { Text } from '@keystar/ui/typography'

import { NullableFieldWrapper } from '../../../../admin-ui/components'
import { SegmentedControl } from './SegmentedControl'

import { entriesTyped } from '../../../../lib/core/utils'
import type {
  CellComponent,
  FieldController,
  FieldControllerConfig,
  FieldProps,
  SimpleFieldTypeInfo,
} from '../../../../types'

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation, onChange, value, isRequired } = props
  const [isDirty, setDirty] = useState(false)
  const [preNullValue, setPreNullValue] = useState(
    value.value || (value.kind === 'update' ? value.initial : null)
  )
  const longestLabelLength = useMemo(() => {
    return field.options.reduce((a, item) => Math.max(a, item.label.length), 0)
  }, [field.options])

  const selectedKey = value.value?.value || preNullValue?.value || null
  const isNullable = !isRequired
  const isNull = isNullable && value.value?.value == null
  const isInvalid = !validate(value, isRequired)
  const isReadOnly = onChange == null
  const errorMessage =
    isInvalid && (isDirty || forceValidation) ? `${field.label} is required.` : undefined

  const onSelectionChange = (key: Key | null) => {
    if (!onChange) return

    const newValue: Value['value'] = field.options.find(opt => opt.value === key) ?? null

    onChange({ ...value, value: newValue })
    setDirty(true)
  }

  const onNullChange = (isChecked: boolean) => {
    if (!onChange) return

    if (isChecked) {
      onChange({ ...value, value: null })
      setPreNullValue(value.value)
    } else {
      onChange({ ...value, value: preNullValue || field.options[0] })
    }
    setDirty(true)
  }

  const fieldElement = renderFieldElement({
    displayMode: field.displayMode,
    field,
    autoFocus,
    errorMessage,
    isNull,
    isReadOnly,
    isRequired,
    selectedKey,
    onSelectionChange,
    preNullValue: preNullValue?.value,
    value,
    longestLabelLength,
  })

  return (
    <NullableFieldWrapper
      isAllowed={!isRequired}
      autoFocus={isNull && autoFocus}
      label={field.label}
      isReadOnly={isReadOnly}
      isNull={isNull}
      onChange={onNullChange}
    >
      {fieldElement}
    </NullableFieldWrapper>
  )
}

interface RenderFieldElementProps {
  displayMode: string
  field: any
  autoFocus?: boolean
  errorMessage?: string
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  selectedKey: string | number | null
  onSelectionChange: (key: Key | null) => void
  preNullValue: string | number | null | undefined
  value: Value
  longestLabelLength: number
}

function renderFieldElement(props: RenderFieldElementProps) {
  const {
    displayMode,
    field,
    autoFocus,
    errorMessage,
    isNull,
    isReadOnly,
    isRequired,
    selectedKey,
    onSelectionChange,
    preNullValue,
    value,
    longestLabelLength,
  } = props

  switch (displayMode) {
    case 'segmented-control':
      return renderSegmentedControl({
        field,
        errorMessage,
        isNull,
        isReadOnly,
        isRequired,
        selectedKey,
        onSelectionChange,
      })
    case 'radio':
      return renderRadioGroup({
        field,
        errorMessage,
        isNull,
        isReadOnly,
        isRequired,
        selectedKey,
        preNullValue,
        value,
        onSelectionChange,
      })
    default:
      return renderPicker({
        field,
        autoFocus,
        errorMessage,
        isNull,
        isReadOnly,
        isRequired,
        selectedKey,
        onSelectionChange,
        longestLabelLength,
      })
  }
}

interface SegmentedControlProps {
  field: any
  errorMessage?: string
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  selectedKey: string | number | null
  onSelectionChange: (key: Key | null) => void
}

function renderSegmentedControl(props: SegmentedControlProps) {
  const { field, errorMessage, isNull, isReadOnly, isRequired, selectedKey, onSelectionChange } =
    props

  return (
    <SegmentedControl
      label={field.label}
      description={field.description}
      errorMessage={errorMessage}
      isDisabled={isNull}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      items={field.options}
      onChange={onSelectionChange}
      value={selectedKey}
      textValue={field.options.find((item: any) => item.value === selectedKey)?.label || ''}
    >
      {(item: any) => <Item key={item.value}>{item.label}</Item>}
    </SegmentedControl>
  )
}

interface RadioGroupProps {
  field: any
  errorMessage?: string
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  selectedKey: string | number | null
  preNullValue: string | number | null | undefined
  value: Value
  onSelectionChange: (key: Key | null) => void
}

function renderRadioGroup(props: RadioGroupProps) {
  const {
    field,
    errorMessage,
    isNull,
    isReadOnly,
    isRequired,
    preNullValue,
    value,
    onSelectionChange,
  } = props

  return (
    <RadioGroup
      label={field.label}
      description={field.description}
      errorMessage={errorMessage}
      isDisabled={isNull}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      onChange={onSelectionChange}
      value={value.value?.value ?? preNullValue}
    >
      {field.options.map((item: any) => (
        <Radio key={item.value} value={item.value}>
          {item.label}
        </Radio>
      ))}
    </RadioGroup>
  )
}

interface PickerProps {
  field: any
  autoFocus?: boolean
  errorMessage?: string
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  selectedKey: string | number | null
  onSelectionChange: (key: Key | null) => void
  longestLabelLength: number
}

function renderPicker(props: PickerProps) {
  const {
    field,
    autoFocus,
    errorMessage,
    isNull,
    isReadOnly,
    isRequired,
    selectedKey,
    onSelectionChange,
    longestLabelLength,
  } = props

  return (
    <Picker
      autoFocus={autoFocus}
      label={field.label}
      description={field.description}
      errorMessage={errorMessage}
      isDisabled={isNull}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      items={field.options}
      onSelectionChange={onSelectionChange}
      selectedKey={selectedKey}
      flex={{ mobile: true, desktop: 'initial' }}
      UNSAFE_style={{
        fontSize: tokenSchema.typography.text.regular.size,
        width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${longestLabelLength}ex + ${tokenSchema.size.icon.regular}), 100%)`,
      }}
    >
      {(item: any) => <Item key={item.value}>{item.label}</Item>}
    </Picker>
  )
}

export const Cell: CellComponent<typeof controller> = ({ value, field }) => {
  const label = field.options.find(x => x.value === value)?.label
  return <Text>{label}</Text>
}

export type AdminSelectFieldMeta = {
  options: readonly { label: string; value: string | number }[]
  type: 'string' | 'integer' | 'enum'
  displayMode: 'select' | 'segmented-control' | 'radio'
  defaultValue: string | number | null
}

type Config = FieldControllerConfig<AdminSelectFieldMeta>
type Option = { label: string; value: string }
type Value =
  | { value: Option | null; kind: 'create' }
  | { value: Option | null; initial: Option | null; kind: 'update' }

function validate(value: Value, isRequired: boolean) {
  if (isRequired) {
    if (value.kind === 'update' && value.initial === null) return true
    return value.value !== null
  }
  return true
}

const FILTER_TYPES = {
  matches: {
    label: 'Matches',
    initialValue: [],
  },
  not_matches: {
    label: 'Does not match',
    initialValue: [],
  },
}

function transformValueType(v: string | null, fieldType: string): string | number | null {
  return v === null ? null : fieldType === 'integer' ? parseInt(v) : v
}

function createDefaultValue(
  optionsWithStringValues: Option[],
  stringifiedDefault: string | undefined
): Value {
  return {
    kind: 'create',
    value: optionsWithStringValues.find(x => x.value === stringifiedDefault) ?? null,
  }
}

function deserializeValue(
  data: any,
  fieldKey: string,
  fieldMetaOptions: readonly { label: string; value: string | number }[]
): Value {
  for (const option of fieldMetaOptions) {
    if (option.value === data[fieldKey]) {
      const stringifiedOption = { label: option.label, value: option.value.toString() }
      return {
        kind: 'update',
        initial: stringifiedOption,
        value: stringifiedOption,
      }
    }
  }
  return { kind: 'update', initial: null, value: null }
}

function serializeValue(value: Value, fieldKey: string, transformFn: (v: string | null) => string | number | null): Record<string, any> {
  return { [fieldKey]: transformFn(value.value?.value ?? null) }
}

function calculateDensity(optionsLength: number): 'spacious' | 'regular' | 'compact' {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  return densityLevels[Math.min(Math.floor((optionsLength - 1) / 3), 2)]
}

function renderFilterListView(
  optionsWithStringValues: Option[],
  value: string[],
  onChange: (selection: string[]) => void,
  typeLabel: string,
  otherProps: any
) {
  const density = calculateDensity(optionsWithStringValues.length)

  return (
    <ListView
      aria-label={typeLabel}
      density={density}
      items={optionsWithStringValues}
      flex
      minHeight={0}
      maxHeight="100%"
      selectionMode="multiple"
      onSelectionChange={selection => {
        if (selection === 'all') return

        onChange([...selection].filter(x => typeof x === 'string'))
      }}
      selectedKeys={value}
      {...otherProps}
    >
      {(item: any) => <Item key={item.value}>{item.label}</Item>}
    </ListView>
  )
}

function buildFilterGraphQL(
  type: string,
  options: string[],
  fieldKey: string,
  transformFn: (v: string) => string | number | null
): Record<string, any> {
  return {
    [fieldKey]: {
      [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => transformFn(x)),
    },
  }
}

function parseFilterGraphQL(value: any): Array<{ type: string; value: any[] }> {
  return entriesTyped(value).flatMap(([type, filterValue]) => {
    if (type === 'equals' && filterValue != null) {
      return { type: 'matches', value: [filterValue] }
    }
    if (type === 'notIn' || type === 'in') {
      if (!filterValue) return []
      return {
        type: type === 'notIn' ? 'not_matches' : 'matches',
        value: filterValue.filter(x => x != null),
      }
    }
    return []
  })
}

function formatFilterLabel(
  type: string,
  value: string[],
  optionsWithStringValues: Option[]
): string {
  const listFormatter = useListFormatter({
    style: 'short',
    type: 'disjunction',
  })

  if (value.length === 0) {
    return type === 'not_matches' ? `is set` : `is not set`
  }

  const values = new Set(value)
  const labels = optionsWithStringValues
    .filter(opt => values.has(opt.value))
    .map(i => i.label)
  const prefix = type === 'not_matches' ? `is not` : `is`

  if (value.length === 1) return `${prefix} ${labels[0]}`
  if (value.length === 2) return `${prefix} ${listFormatter.format(labels)}`
  return `${prefix} ${listFormatter.format([labels[0], `${value.length - 1} more`])}`
}

export function controller(config: Config): FieldController<
  Value,
  string[],
  SimpleFieldTypeInfo<'String'>['inputs']['where']
> & {
  options: Option[]
  type: 'string' | 'integer' | 'enum'
  displayMode: 'select' | 'segmented-control' | 'radio'
} {
  const optionsWithStringValues = config.fieldMeta.options.map(x => ({
    label: x.label,
    value: x.value.toString(),
  }))

  const transformFn = (v: string | null) =>
    transformValueType(v, config.fieldMeta.type)

  const stringifiedDefault = config.fieldMeta.defaultValue?.toString()

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    defaultValue: createDefaultValue(optionsWithStringValues, stringifiedDefault),
    type: config.fieldMeta.type,
    displayMode: config.fieldMeta.displayMode,
    options: optionsWithStringValues,
    deserialize: data =>
      deserializeValue(data, config.fieldKey, config.fieldMeta.options),
    serialize: value =>
      serializeValue(value, config.fieldKey, transformFn),
    validate: (value, opts) => validate(value, opts.isRequired),
    filter: {
      Filter(props) {
        const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props

        const listView = renderFilterListView(
          optionsWithStringValues,
          value,
          onChange,
          typeLabel,
          otherProps
        )

        if (context === 'edit') {
          return (
            <VStack gap="medium" flex minHeight={0} maxHeight="100%">
              <FieldLabel elementType="span">{typeLabel}</FieldLabel>
              {listView}
            </VStack>
          )
        }

        return listView
      },
      graphql: ({ type, value: options }) =>
        buildFilterGraphQL(type, options, config.fieldKey, transformFn),
      parseGraphQL: (value) =>
        parseFilterGraphQL(value),
      Label({ type, value }) {
        return formatFilterLabel(type, value, optionsWithStringValues)
      },
      types: FILTER_TYPES,
    },
  }
}