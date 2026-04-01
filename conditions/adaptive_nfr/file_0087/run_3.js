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
    items: Option[]
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
  items: Option[]
  value: string | number | null
  textValue: string
}): JSX.Element {
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
  items: Option[]
  value: string | number | null
  preNullValue: string | number | null | undefined
}): JSX.Element {
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
  items: Option[]
  value: string | number | null
  longestLabelLength: number
  autoFocus: boolean
}): JSX.Element {
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

/**
 * Validates the field value based on required status.
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
 * Determines the appropriate GraphQL filter key based on filter type.
 */
function getGraphQLFilterKey(type: string): 'in' | 'notIn' {
  return type === 'not_matches' ? 'notIn' : 'in'
}

/**
 * Determines the filter type label prefix based on filter type.
 */
function getFilterTypePrefix(type: string): string {
  return type === 'not_matches' ? 'is not' : 'is'
}

/**
 * Parses GraphQL filter value into filter type and value.
 */
function parseGraphQLFilterEntry(
  type: string,
  value: unknown
): { type: string; value: string[] } | null {
  if (type === 'equals' && value != null) {
    return { type: 'matches', value: [String(value)] }
  }
  if (type === 'notIn' || type === 'in') {
    if (!Array.isArray(value)) return null
    return {
      type: type === 'notIn' ? 'not_matches' : 'matches',
      value: value.filter(x => x != null).map(String),
    }
  }
  return null
}

/**
 * Formats filter label based on filter type and selected values.
 */
function formatFilterLabel(
  type: string,
  value: string[],
  optionsWithStringValues: Option[],
  listFormatter: ReturnType<typeof useListFormatter>
): string {
  if (value.length === 0) {
    return type === 'not_matches' ? 'is set' : 'is not set'
  }

  const values = new Set(value)
  const labels = optionsWithStringValues
    .filter(opt => values.has(opt.value))
    .map(i => i.label)
  const prefix = getFilterTypePrefix(type)

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
          [getGraphQLFilterKey(type)]: options.map(x => t(x)),
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
```