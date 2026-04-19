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

// Type definitions
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

// Helper function to validate field values
function validateField(value: Value, isRequired: boolean): boolean {
  if (isRequired) {
    if (value.kind === 'update' && value.initial === null) {
      return true
    }
    return value.value !== null
  }
  return true
}

// Helper function to get density level based on options count
function getDensityLevel(optionsCount: number): 'spacious' | 'regular' | 'compact' {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  return densityLevels[Math.min(Math.floor((optionsCount - 1) / 3), 2)]
}

// Helper function to transform string value to type-appropriate value
function transformValue(v: string | null, fieldType: 'string' | 'integer' | 'enum'): string | number | null {
  return v === null ? null : fieldType === 'integer' ? parseInt(v) : v
}

// Helper function to get default value
function getDefaultValue(
  options: Option[],
  defaultValue: string | number | null
): Option | null {
  if (defaultValue === null) return null
  const stringifiedDefault = defaultValue.toString()
  return options.find(x => x.value === stringifiedDefault) ?? null
}

// Helper function to deserialize data
function deserializeValue(
  data: Record<string, unknown>,
  fieldKey: string,
  options: readonly { label: string; value: string | number }[],
  fieldType: 'string' | 'integer' | 'enum'
): { kind: 'update'; initial: Option | null; value: Option | null } {
  for (const option of options) {
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

// Helper function to serialize value
function serializeValue(value: Value, fieldKey: string): Record<string, string | number | null> {
  return { [fieldKey]: transformValue(value.value?.value ?? null, 'string') }
}

// Helper function to render field element based on display mode
function renderFieldElement(
  field: {
    label: string
    description: string
    displayMode: 'select' | 'segmented-control' | 'radio'
    options: Option[]
  },
  errorMessage: string | undefined,
  isDisabled: boolean,
  isReadOnly: boolean,
  isRequired: boolean,
  onChange: ((key: Key | null) => void) | undefined,
  selectedKey: Key | null,
  textValue: string,
  autoFocus: boolean,
  longestLabelLength: number
): JSX.Element {
  switch (field.displayMode) {
    case 'segmented-control':
      return (
        <SegmentedControl
          label={field.label}
          description={field.description}
          errorMessage={errorMessage}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          isRequired={isRequired}
          items={field.options}
          onChange={onChange}
          value={selectedKey}
          textValue={textValue}
        >
          {item => <Item key={item.value}>{item.label}</Item>}
        </SegmentedControl>
      )
    case 'radio':
      return (
        <RadioGroup
          label={field.label}
          description={field.description}
          errorMessage={errorMessage}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          isRequired={isRequired}
          onChange={onChange}
          value={selectedKey}
        >
          {field.options.map(item => (
            <Radio key={item.value} value={item.value}>
              {item.label}
            </Radio>
          ))}
        </RadioGroup>
      )
    default:
      return (
        <Picker
          autoFocus={autoFocus}
          label={field.label}
          description={field.description}
          errorMessage={errorMessage}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          isRequired={isRequired}
          items={field.options}
          onSelectionChange={onChange}
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
}

// Helper function to render filter
function renderFilter(
  options: Option[],
  typeLabel: string,
  onChange: (selection: string[]) => void,
  value: string[],
  autoFocus: boolean
): JSX.Element {
  const density = getDensityLevel(options.length)
  const listView = (
    <ListView
      aria-label={typeLabel}
      density={density}
      items={options}
      flex
      minHeight={0}
      maxHeight="100%"
      selectionMode="multiple"
      onSelectionChange={selection => {
        if (selection === 'all') return
        onChange([...selection].filter(x => typeof x === 'string'))
      }}
      selectedKeys={value}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </ListView>
  )

  return listView
}

// Helper function to render filter label
function renderFilterLabel(
  type: 'matches' | 'not_matches',
  value: string[],
  options: Option[]
): string {
  const listFormatter = useListFormatter({
    style: 'short',
    type: 'disjunction',
  })

  if (value.length === 0) {
    return type === 'not_matches' ? `is set` : `is not set`
  }
  const values = new Set(value)
  const labels = options
    .filter(opt => values.has(opt.value))
    .map(i => i.label)
  const prefix = type === 'not_matches' ? `is not` : `is`

  if (value.length === 1) return `${prefix} ${labels[0]}`
  if (value.length === 2) return `${prefix} ${listFormatter.format(labels)}`
  return `${prefix} ${listFormatter.format([labels[0], `${value.length - 1} more`])}`
}

// Helper function to parse GraphQL filter
function parseGraphQLFilter(
  value: Record<string, unknown>
): Array<{ type: 'matches' | 'not_matches'; value: string[] }> {
  return entriesTyped(value).flatMap(([type, value]) => {
    if (type === 'equals' && value != null) {
      return { type: 'matches', value: [value] }
    }
    if (type === 'notIn' || type === 'in') {
      if (!value) return []
      return {
        type: type === 'notIn' ? 'not_matches' : 'matches',
        value: value.filter(x => x != null),
      }
    }
    return []
  })
}

// Helper function to generate GraphQL filter
function generateGraphQLFilter(
  fieldKey: string,
  type: 'matches' | 'not_matches',
  options: string[]
): Record<string, unknown> {
  return {
    [fieldKey]: {
      [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => transformValue(x, 'string')),
    },
  }
}

// Main Field component
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
  const isInvalid = !validateField(value, isRequired)
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

  const fieldElement = renderFieldElement(
    field,
    errorMessage,
    isNull,
    isReadOnly,
    isRequired,
    onSelectionChange,
    selectedKey,
    field.options.find(item => item.value === selectedKey)?.label || '',
    autoFocus,
    longestLabelLength
  )

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

// Cell component
export const Cell: CellComponent<typeof controller> = ({ value, field }) => {
  const label = field.options.find(x => x.value === value)?.label
  return <Text>{label}</Text>
}

// Controller function
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

  const fieldKey = config.fieldKey
  const fieldType = config.fieldMeta.type
  const defaultValue = config.fieldMeta.defaultValue

  return {
    fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: fieldKey,
    defaultValue: {
      kind: 'create',
      value: getDefaultValue(optionsWithStringValues, defaultValue),
    },
    type: fieldType,
    displayMode: config.fieldMeta.displayMode,
    options: optionsWithStringValues,
    deserialize: data => deserializeValue(data, fieldKey, config.fieldMeta.options, fieldType),
    serialize: value => serializeValue(value, fieldKey),
    validate: (value, opts) => validateField(value, opts.isRequired),
    filter: {
      Filter(props) {
        const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props

        if (context === 'edit') {
          return (
            <VStack gap="medium" flex minHeight={0} maxHeight="100%">
              <FieldLabel elementType="span">{typeLabel}</FieldLabel>
              {renderFilter(optionsWithStringValues, typeLabel, onChange, value, autoFocus)}
            </VStack>
          )
        }

        return renderFilter(optionsWithStringValues, typeLabel, onChange, value, autoFocus)
      },
      graphql: ({ type, value: options }) => generateGraphQLFilter(fieldKey, type, options),
      parseGraphQL: parseGraphQLFilter,
      Label({ type, value }) {
        return renderFilterLabel(type, value, optionsWithStringValues)
      },
      types: {
        matches: {
          label: 'Matches',
          initialValue: [],
        },
        not_matches: {
          label: 'Does not match',
          initialValue: [],
        },
      },
    },
  }
}
```