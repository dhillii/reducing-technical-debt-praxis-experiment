```typescript
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
    field,
    selectedKey,
    isNull,
    isReadOnly,
    isRequired,
    errorMessage,
    autoFocus,
    onSelectionChange,
    longestLabelLength,
    value,
    preNullValue,
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

interface FieldElementProps {
  field: { label: string; description?: string; displayMode: string; options: Option[] }
  selectedKey: string | number | null
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  errorMessage?: string
  autoFocus?: boolean
  onSelectionChange: (key: Key | null) => void
  longestLabelLength: number
  value: Value
  preNullValue: Option | null
}

/** Renders the appropriate field component based on display mode */
function renderFieldElement(props: FieldElementProps) {
  const {
    field,
    selectedKey,
    isNull,
    isReadOnly,
    isRequired,
    errorMessage,
    autoFocus,
    onSelectionChange,
    longestLabelLength,
    value,
    preNullValue,
  } = props

  switch (field.displayMode) {
    case 'segmented-control':
      return renderSegmentedControl({
        field,
        selectedKey,
        isNull,
        isReadOnly,
        isRequired,
        errorMessage,
        onSelectionChange,
      })
    case 'radio':
      return renderRadioGroup({
        field,
        selectedKey,
        isNull,
        isReadOnly,
        isRequired,
        errorMessage,
        onSelectionChange,
        value,
        preNullValue,
      })
    default:
      return renderPicker({
        field,
        selectedKey,
        isNull,
        isReadOnly,
        isRequired,
        errorMessage,
        autoFocus,
        onSelectionChange,
        longestLabelLength,
      })
  }
}

interface SegmentedControlProps {
  field: { label: string; description?: string; options: Option[] }
  selectedKey: string | number | null
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  errorMessage?: string
  onSelectionChange: (key: Key | null) => void
}

/** Renders segmented control field variant */
function renderSegmentedControl(props: SegmentedControlProps) {
  const { field, selectedKey, isNull, isReadOnly, isRequired, errorMessage, onSelectionChange } =
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
      textValue={field.options.find(item => item.value === selectedKey)?.label || ''}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </SegmentedControl>
  )
}

interface RadioGroupProps {
  field: { label: string; description?: string; options: Option[] }
  selectedKey: string | number | null
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  errorMessage?: string
  onSelectionChange: (key: Key | null) => void
  value: Value
  preNullValue: Option | null
}

/** Renders radio group field variant */
function renderRadioGroup(props: RadioGroupProps) {
  const {
    field,
    isNull,
    isReadOnly,
    isRequired,
    errorMessage,
    onSelectionChange,
    value,
    preNullValue,
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
      value={value.value?.value ?? preNullValue?.value}
    >
      {field.options.map(item => (
        <Radio key={item.value} value={item.value}>
          {item.label}
        </Radio>
      ))}
    </RadioGroup>
  )
}

interface PickerProps {
  field: { label: string; description?: string; options: Option[] }
  selectedKey: string | number | null
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  errorMessage?: string
  autoFocus?: boolean
  onSelectionChange: (key: Key | null) => void
  longestLabelLength: number
}

/** Renders picker field variant (default) */
function renderPicker(props: PickerProps) {
  const {
    field,
    selectedKey,
    isNull,
    isReadOnly,
    isRequired,
    errorMessage,
    autoFocus,
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
      {item => <Item key={item.value}>{item.label}</Item>}
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

/** Transforms value from string to appropriate type based on field metadata */
function createValueTransformer(fieldMeta: AdminSelectFieldMeta) {
  return (v: string | null) =>
    v === null ? null : fieldMeta.type === 'integer' ? parseInt(v) : v
}

/** Converts field options to string-valued options for consistent handling */
function normalizeOptions(options: readonly AdminSelectFieldMeta['options'][]) {
  return options.map(x => ({
    label: x.label,
    value: x.value.toString(),
  }))
}

/** Finds default option from normalized options */
function findDefaultOption(
  options: Option[],
  defaultValue: AdminSelectFieldMeta['defaultValue']
) {
  const stringifiedDefault = defaultValue?.toString()
  return options.find(x => x.value === stringifiedDefault) ?? null
}

/** Deserializes data into field value structure */
function deserializeFieldValue(
  data: Record<string, unknown>,
  fieldKey: string,
  fieldMeta: AdminSelectFieldMeta
): Value {
  for (const option of fieldMeta.options) {
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

/** Serializes field value for submission */
function serializeFieldValue(
  value: Value,
  fieldKey: string,
  transformer: (v: string | null) => unknown
) {
  return { [fieldKey]: transformer(value.value?.value ?? null) }
}

/** Calculates appropriate density level for list view based on option count */
function calculateListDensity(optionCount: number): 'spacious' | 'regular' | 'compact' {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  return densityLevels[Math.min(Math.floor((optionCount - 1) / 3), 2)]
}

interface FilterLabelProps {
  type: string
  value: string[]
  options: Option[]
}

/** Formats filter label for display */
function formatFilterLabel(props: FilterLabelProps) {
  const { type, value, options } = props
  const listFormatter = useListFormatter({
    style: 'short',
    type: 'disjunction',
  })

  if (value.length === 0) {
    return type === 'not_matches' ? `is set` : `is not set`
  }

  const values = new Set(value)
  const labels = options.filter(opt => values.has(opt.value)).map(i => i.label)
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
  const optionsWithStringValues = normalizeOptions(config.fieldMeta.options)
  const transformer = createValueTransformer(config.fieldMeta)
  const defaultOption = findDefaultOption(optionsWithStringValues, config.fieldMeta.defaultValue)

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    defaultValue: {
      kind: 'create',
      value: defaultOption,
    },
    type: config.fieldMeta.type,
    displayMode: config.fieldMeta.displayMode,
    options: optionsWithStringValues,
    deserialize: data => deserializeFieldValue(data, config.fieldKey, config.fieldMeta),
    serialize: value => serializeFieldValue(value, config.fieldKey, transformer),
    validate: (value, opts) => validate(value, opts.isRequired),
    filter: {
      Filter(props) {
        const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props
        const density = calculateListDensity(optionsWithStringValues.length)

        const listView = (
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
            {item => <Item key={item.value}>{item.label}</Item>}
          </ListView>
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
      graphql: ({ type, value: options }) => ({
        [config.fieldKey]: {
          [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => transformer(x)),
        },
      }),
      parseGraphQL(value) {
        return entriesTyped(value).flatMap(([type, value]) => {
          if (type