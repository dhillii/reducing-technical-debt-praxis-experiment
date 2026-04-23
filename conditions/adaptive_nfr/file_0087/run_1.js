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

type DisplayModeRenderer = (props: {
  autoFocus: boolean
  field: { label: string; description?: string; options: Option[] }
  errorMessage: string | undefined
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  selectedKey: string | number | null
  onSelectionChange: (key: Key | null) => void
  longestLabelLength: number
}) => React.ReactNode

/** Renders a segmented control field */
const renderSegmentedControl: DisplayModeRenderer = ({
  field,
  errorMessage,
  isNull,
  isReadOnly,
  isRequired,
  selectedKey,
  onSelectionChange,
}) => (
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

/** Renders a radio group field */
const renderRadioGroup: DisplayModeRenderer = ({
  field,
  errorMessage,
  isNull,
  isReadOnly,
  isRequired,
  selectedKey,
  onSelectionChange,
}) => (
  <RadioGroup
    label={field.label}
    description={field.description}
    errorMessage={errorMessage}
    isDisabled={isNull}
    isReadOnly={isReadOnly}
    isRequired={isRequired}
    onChange={onSelectionChange}
    value={selectedKey}
  >
    {field.options.map(item => (
      <Radio key={item.value} value={item.value}>
        {item.label}
      </Radio>
    ))}
  </RadioGroup>
)

/** Renders a picker (select) field */
const renderPicker: DisplayModeRenderer = ({
  autoFocus,
  field,
  errorMessage,
  isNull,
  isReadOnly,
  isRequired,
  selectedKey,
  onSelectionChange,
  longestLabelLength,
}) => (
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

/** Maps display modes to their renderer functions */
const DISPLAY_MODE_RENDERERS: Record<string, DisplayModeRenderer> = {
  'segmented-control': renderSegmentedControl,
  'radio': renderRadioGroup,
  'select': renderPicker,
}

/** Gets the appropriate renderer for the given display mode */
const getFieldRenderer = (displayMode: string): DisplayModeRenderer => {
  return DISPLAY_MODE_RENDERERS[displayMode] || renderPicker
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

  const renderer = getFieldRenderer(field.displayMode)
  const fieldElement = renderer({
    autoFocus,
    field,
    errorMessage,
    isNull,
    isReadOnly,
    isRequired,
    selectedKey,
    onSelectionChange,
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

/** Validates the field value based on required status */
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

/** Transforms value to appropriate type based on field metadata */
const createValueTransformer = (fieldMeta: AdminSelectFieldMeta) => {
  return (v: string | null) =>
    v === null ? null : fieldMeta.type === 'integer' ? parseInt(v) : v
}

/** Determines filter density level based on option count */
const getFilterDensity = (optionCount: number): 'spacious' | 'regular' | 'compact' => {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  return densityLevels[Math.min(Math.floor((optionCount - 1) / 3), 2)]
}

/** Checks if filter type is negation */
const isNegationFilterType = (type: string): boolean => type === 'not_matches'

/** Parses GraphQL filter value into filter type and value */
const parseGraphQLFilterEntry = (
  type: string,
  value: unknown
): { type: string; value: string[] } | null => {
  if (type === 'equals' && value != null) {
    return { type: 'matches', value: [String(value)] }
  }
  if (type === 'notIn' || type === 'in') {
    if (!value) return null
    const arrayValue = Array.isArray(value) ? value : []
    return {
      type: type === 'notIn' ? 'not_matches' : 'matches',
      value: arrayValue.filter(x => x != null).map(String),
    }
  }
  return null
}

/** Formats filter label based on type and selected values */
const formatFilterLabel = (
  type: string,
  value: string[],
  optionsWithStringValues: Option[],
  listFormatter: Intl.ListFormat
): string => {
  if (value.length === 0) {
    return isNegationFilterType(type) ? `is set` : `is not set`
  }

  const values = new Set(value)
  const labels = optionsWithStringValues
    .filter(opt => values.has(opt.value))
    .map(i => i.label)
  const prefix = isNegationFilterType(type) ? `is not` : `is`

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

  const t = createValueTransformer(config.fieldMeta)
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
    serialize: value => ({ [config.fieldKey]: t(value.value?.value ?? null) }),
    validate: (value, opts) => validate(value, opts.isRequired),
    filter: {
      Filter(props) {
        const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props

        const density = getFilterDensity(optionsWithStringValues.length)
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
          [isNegationFilterType(type) ? 'notIn' : 'in']: options.map(x => t(x)),
        },
      }),
      parseGraphQL(value) {
        return entriesTyped(value).flatMap(([type, filterValue]) => {
          const parsed = parseGraphQLFilterEntry(type, filterValue)
          return parsed ? [parsed] : []
        })
      },
      Label({ type, value }) {
        const listFormatter = useListFormatter({
          style: 'short',
          type: 'disjunction',
        })

        return formatFilterLabel(type, value, optionsWithStringValues, listFormatter)
      },
      types: FILTER_TYPES,
    },
  }
}