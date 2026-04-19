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

// Strategy interface for field rendering
interface FieldRenderStrategy {
  render: (props: FieldRenderProps) => React.ReactNode
}

// Props shared across all display modes
interface FieldRenderProps {
  label: string
  description?: string
  errorMessage?: string
  isDisabled: boolean
  isReadOnly: boolean
  isRequired: boolean
  items: readonly { label: string; value: string | number }[]
  onChange: (key: Key | null) => void
  value: Key | null
  textValue?: string
  autoFocus?: boolean
  flex?: boolean
  UNSAFE_style?: React.CSSProperties
}

// Display mode strategies
const DISPLAY_MODE_STRATEGIES: Record<
  FieldProps['field']['displayMode'],
  FieldRenderStrategy
> = {
  'segmented-control': {
    render: (props) => (
      <SegmentedControl
        label={props.label}
        description={props.description}
        errorMessage={props.errorMessage}
        isDisabled={props.isDisabled}
        isReadOnly={props.isReadOnly}
        isRequired={props.isRequired}
        items={props.items}
        onChange={props.onChange}
        value={props.value}
        textValue={props.textValue}
      >
        {item => <Item key={item.value}>{item.label}</Item>}
      </SegmentedControl>
    ),
  },
  radio: {
    render: (props) => (
      <RadioGroup
        label={props.label}
        description={props.description}
        errorMessage={props.errorMessage}
        isDisabled={props.isDisabled}
        isReadOnly={props.isReadOnly}
        isRequired={props.isRequired}
        onChange={props.onChange}
        value={props.value}
      >
        {props.items.map(item => (
          <Radio key={item.value} value={item.value}>
            {item.label}
          </Radio>
        ))}
      </RadioGroup>
    ),
  },
  select: {
    render: (props) => (
      <Picker
        autoFocus={props.autoFocus}
        label={props.label}
        description={props.description}
        errorMessage={props.errorMessage}
        isDisabled={props.isDisabled}
        isReadOnly={props.isReadOnly}
        isRequired={props.isRequired}
        items={props.items}
        onSelectionChange={props.onChange}
        selectedKey={props.value}
        flex={props.flex}
        UNSAFE_style={props.UNSAFE_style}
      >
        {item => <Item key={item.value}>{item.label}</Item>}
      </Picker>
    ),
  },
}

/**
 * Renders the field element based on the display mode strategy.
 * @param field - The field configuration
 * @param onSelectionChange - Handler for selection changes
 * @param selectedKey - Currently selected key
 * @param errorMessage - Error message to display
 * @param isDisabled - Whether the field is disabled
 * @param isReadOnly - Whether the field is read-only
 * @param isRequired - Whether the field is required
 * @param autoFocus - Whether to auto-focus the field
 * @param longestLabelLength - Maximum label length for styling
 * @returns The rendered field element
 */
function renderFieldElement(
  field: FieldProps['field'],
  onSelectionChange: (key: Key | null) => void,
  selectedKey: Key | null,
  errorMessage?: string,
  isDisabled: boolean,
  isReadOnly: boolean,
  isRequired: boolean,
  autoFocus?: boolean,
  longestLabelLength: number
): React.ReactNode {
  const strategy = DISPLAY_MODE_STRATEGIES[field.displayMode]
  if (!strategy) {
    throw new Error(`Unknown display mode: ${field.displayMode}`)
  }

  const renderProps: FieldRenderProps = {
    label: field.label,
    description: field.description,
    errorMessage,
    isDisabled,
    isReadOnly,
    isRequired,
    items: field.options,
    onChange: onSelectionChange,
    value: selectedKey,
    textValue: field.options.find(item => item.value === selectedKey)?.label || '',
    autoFocus,
    flex: { mobile: true, desktop: 'initial' },
    UNSAFE_style: {
      fontSize: tokenSchema.typography.text.regular.size,
      width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${longestLabelLength}ex + ${tokenSchema.size.icon.regular}), 100%)`,
    },
  }

  return strategy.render(renderProps)
}

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

  return (
    <NullableFieldWrapper
      isAllowed={!isRequired}
      autoFocus={isNull && autoFocus}
      label={field.label}
      isReadOnly={isReadOnly}
      isNull={isNull}
      onChange={onNullChange}
    >
      {renderFieldElement(
        field,
        onSelectionChange,
        selectedKey,
        errorMessage,
        isNull,
        isReadOnly,
        isRequired,
        autoFocus,
        longestLabelLength
      )}
    </NullableFieldWrapper>
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

/**
 * Validates the field value based on requirements.
 * @param value - The current field value
 * @param isRequired - Whether the field is required
 * @returns True if the value is valid
 */
function validate(value: Value, isRequired: boolean): boolean {
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

/**
 * Transforms a string value to the appropriate type.
 * @param v - The string value to transform
 * @param fieldMetaType - The field metadata type
 * @returns The transformed value
 */
function transformValue(v: string | null, fieldMetaType: AdminSelectFieldMeta['type']): string | number | null {
  return v === null ? null : fieldMetaType === 'integer' ? parseInt(v) : v
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

  const stringifiedDefault = config.fieldMeta.defaultValue?.toString()

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    defaultValue: {
      kind: 'create',
      value: optionsWithStringValues.find(x => x.value === stringifiedDefault) ?? null,
    },
    type: config.fieldMeta.type,
    displayMode: config.fieldMeta.displayMode,
    options: optionsWithStringValues,
    deserialize: data => {
      for (const option of config.fieldMeta.options) {
        if (option.value === data[config.fieldKey]) {
          const stringifiedOption = { label: option.label, value: option.value.toString() }
          return {
            kind: 'update',
            initial: stringifiedOption,
            value: stringifiedOption,
          }
        }
      }
      return { kind: 'update', initial: null, value: null }
    },
    serialize: value => ({ [config.fieldKey]: transformValue(value.value?.value ?? null, config.fieldMeta.type) }),
    validate: (value, opts) => validate(value, opts.isRequired),
    filter: {
      Filter(props) {
        const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props

        const densityLevels = ['spacious', 'regular', 'compact'] as const
        const density =
          densityLevels[Math.min(Math.floor((optionsWithStringValues.length - 1) / 3), 2)]
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
          [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => transformValue(x, config.fieldMeta.type)),
        },
      }),
      parseGraphQL(value) {
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
      },
      Label({ type, value }) {
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
      },
      types: FILTER_TYPES,
    },
  }
}
```