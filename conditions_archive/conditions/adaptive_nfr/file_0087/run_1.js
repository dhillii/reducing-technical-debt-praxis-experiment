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

  const commonProps = {
    label: field.label,
    description: field.description,
    errorMessage,
    isDisabled: isNull,
    isReadOnly,
    isRequired,
    onChange: onSelectionChange,
  }

  const fieldElement = renderFieldByDisplayMode(
    field.displayMode,
    {
      ...commonProps,
      items: field.options,
      value: selectedKey,
      preNullValue: preNullValue?.value,
      textValue: field.options.find(item => item.value === selectedKey)?.label || '',
      longestLabelLength,
      autoFocus,
    }
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

/**
 * Renders the appropriate field component based on display mode.
 * Dispatches to specific renderers to reduce cyclomatic complexity.
 */
function renderFieldByDisplayMode(
  displayMode: string,
  props: {
    label: string
    description: string
    errorMessage: string | undefined
    isDisabled: boolean
    isReadOnly: boolean
    isRequired: boolean
    onChange: (key: Key | null) => void
    items: { label: string; value: string }[]
    value: string | number | null
    preNullValue: string | number | null | undefined
    textValue: string
    longestLabelLength: number
    autoFocus: boolean
  }
) {
  const renderers: Record<string, () => JSX.Element> = {
    'segmented-control': () => renderSegmentedControl(props),
    'radio': () => renderRadio(props),
  }

  const renderer = renderers[displayMode]
  return renderer ? renderer() : renderPicker(props)
}

/**
 * Renders a segmented control field component.
 */
function renderSegmentedControl(props: {
  label: string
  description: string
  errorMessage: string | undefined
  isDisabled: boolean
  isReadOnly: boolean
  isRequired: boolean
  onChange: (key: Key | null) => void
  items: { label: string; value: string }[]
  value: string | number | null
  textValue: string
}) {
  return (
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
  )
}

/**
 * Renders a radio group field component.
 */
function renderRadio(props: {
  label: string
  description: string
  errorMessage: string | undefined
  isDisabled: boolean
  isReadOnly: boolean
  isRequired: boolean
  onChange: (key: Key | null) => void
  items: { label: string; value: string }[]
  value: string | number | null
  preNullValue: string | number | null | undefined
}) {
  return (
    <RadioGroup
      label={props.label}
      description={props.description}
      errorMessage={props.errorMessage}
      isDisabled={props.isDisabled}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      onChange={props.onChange}
      value={props.value ?? props.preNullValue}
    >
      {props.items.map(item => (
        <Radio key={item.value} value={item.value}>
          {item.label}
        </Radio>
      ))}
    </RadioGroup>
  )
}

/**
 * Renders a picker (select) field component.
 */
function renderPicker(props: {
  label: string
  description: string
  errorMessage: string | undefined
  isDisabled: boolean
  isReadOnly: boolean
  isRequired: boolean
  onChange: (key: Key | null) => void
  items: { label: string; value: string }[]
  value: string | number | null
  longestLabelLength: number
  autoFocus: boolean
}) {
  return (
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
      flex={{ mobile: true, desktop: 'initial' }}
      UNSAFE_style={{
        fontSize: tokenSchema.typography.text.regular.size,
        width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${props.longestLabelLength}ex + ${tokenSchema.size.icon.regular}), 100%)`,
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

/**
 * Determines the density level for the filter list view based on option count.
 */
function getFilterDensity(optionCount: number): 'spacious' | 'regular' | 'compact' {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  return densityLevels[Math.min(Math.floor((optionCount - 1) / 3), 2)]
}

/**
 * Builds the GraphQL filter query based on filter type and selected values.
 */
function buildGraphQLFilter(
  type: string,
  options: string[],
  fieldKey: string,
  transform: (v: string) => string | number | null
): Record<string, Record<string, (string | number | null)[]>> {
  const isNotMatches = type === 'not_matches'
  return {
    [fieldKey]: {
      [isNotMatches ? 'notIn' : 'in']: options.map(x => transform(x)),
    },
  }
}

/**
 * Parses GraphQL filter value into filter type and value.
 */
function parseGraphQLFilterValue(
  type: string,
  value: unknown
): { type: string; value: (string | number)[] } | null {
  if (type === 'equals' && value != null) {
    return { type: 'matches', value: [value as string | number] }
  }
  if (type === 'notIn' || type === 'in') {
    if (!value) return null
    const values = (value as (string | number | null)[]).filter(x => x != null)
    return {
      type: type === 'notIn' ? 'not_matches' : 'matches',
      value: values as (string | number)[],
    }
  }
  return null
}

/**
 * Formats the filter label based on type and selected values.
 */
function formatFilterLabel(
  type: string,
  value: string[],
  options: { label: string; value: string }[]
): string {
  if (value.length === 0) {
    return type === 'not_matches' ? `is set` : `is not set`
  }

  const listFormatter = useListFormatter({
    style: 'short',
    type: 'disjunction',
  })

  const values = new Set(value)
  const labels = options
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

  const t = (v: string | null) =>
    v === null ? null : config.fieldMeta.type === 'integer' ? parseInt(v) : v

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
      graphql: ({ type, value: options }) =>
        buildGraphQLFilter(type, options, config.fieldKey, t),
      parseGraphQL(value) {
        return entriesTyped(value).flatMap(([type, filterValue]) => {
          const result = parseGraphQLFilterValue(type, filterValue)
          return result ? [result] : []
        })
      },
      Label({ type, value }) {
        return formatFilterLabel(type, value, optionsWithStringValues)
      },
      types: FILTER_TYPES,
    },
  }
}
```