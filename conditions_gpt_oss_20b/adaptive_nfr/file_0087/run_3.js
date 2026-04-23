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

/**
 * Determines if the field is nullable based on the required flag.
 */
function isNullableField(isRequired: boolean): boolean {
  return !isRequired
}

/**
 * Determines if the current value is null for a nullable field.
 */
function isNullValue(value: Value, isNullable: boolean): boolean {
  return isNullable && value.value?.value == null
}

/**
 * Validates the field value against the required flag.
 */
function isInvalidValue(value: Value, isRequired: boolean): boolean {
  return !validate(value, isRequired)
}

/**
 * Generates the error message for a required field.
 */
function getErrorMessage(
  field: AdminSelectFieldMeta,
  isInvalid: boolean,
  isDirty: boolean,
  forceValidation: boolean
): string | undefined {
  return isInvalid && (isDirty || forceValidation)
    ? `${field.label} is required.`
    : undefined
}

/**
 * Retrieves the selected key from the value or pre-null value.
 */
function getSelectedKey(value: Value, preNullValue: Option | null): string | number | null {
  return value.value?.value ?? preNullValue?.value ?? null
}

/**
 * Retrieves the text value for the picker based on the selected key.
 */
function getTextValue(field: AdminSelectFieldMeta, selectedKey: string | number | null): string {
  return field.options.find(item => item.value === selectedKey)?.label ?? ''
}

/**
 * Generates the style object for the picker component.
 */
function getPickerStyle(longestLabelLength: number): object {
  return {
    fontSize: tokenSchema.typography.text.regular.size,
    width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${longestLabelLength}ex + ${tokenSchema.size.icon.regular}), 100%)`,
  }
}

/**
 * Renders the list view used in the filter component.
 */
function renderListView(
  options: Option[],
  value: string[],
  onChange: (value: string[]) => void,
  otherProps: any
) {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  const density =
    densityLevels[Math.min(Math.floor((options.length - 1) / 3), 2)]

  return (
    <ListView
      aria-label={otherProps.typeLabel}
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
      {...otherProps}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </ListView>
  )
}

/**
 * Generates the label string for the filter component.
 */
function getFilterLabel(
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

/**
 * Parses GraphQL filter values into internal representation.
 */
function parseGraphQLFilter(value: any, t: (v: string | null) => string | number | null) {
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

/**
 * Strategy object for rendering field elements based on display mode.
 */
const fieldRenderers = {
  'segmented-control': (
    props: {
      field: AdminSelectFieldMeta
      errorMessage: string | undefined
      isDisabled: boolean
      isReadOnly: boolean
      isRequired: boolean
      items: Option[]
      onChange: (key: Key | null) => void
      value: string | number | null
      textValue: string
    }
  ) => (
    <SegmentedControl
      label={props.field.label}
      description={props.field.description}
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
  radio: (
    props: {
      field: AdminSelectFieldMeta
      errorMessage: string | undefined
      isDisabled: boolean
      isReadOnly: boolean
      isRequired: boolean
      onChange: (key: Key | null) => void
      value: string | number | null
    }
  ) => (
    <RadioGroup
      label={props.field.label}
      description={props.field.description}
      errorMessage={props.errorMessage}
      isDisabled={props.isDisabled}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      onChange={props.onChange}
      value={props.value}
    >
      {props.field.options.map(item => (
        <Radio key={item.value} value={item.value}>
          {item.label}
        </Radio>
      ))}
    </RadioGroup>
  ),
  select: (
    props: {
      field: AdminSelectFieldMeta
      errorMessage: string | undefined
      isDisabled: boolean
      isReadOnly: boolean
      isRequired: boolean
      items: Option[]
      onSelectionChange: (key: Key | null) => void
      selectedKey: string | number | null
      longestLabelLength: number
    }
  ) => (
    <Picker
      autoFocus={props.field.autoFocus}
      label={props.field.label}
      description={props.field.description}
      errorMessage={props.errorMessage}
      isDisabled={props.isDisabled}
      isReadOnly={props.isReadOnly}
      isRequired={props.isRequired}
      items={props.items}
      onSelectionChange={props.onSelectionChange}
      selectedKey={props.selectedKey}
      flex={{ mobile: true, desktop: 'initial' }}
      UNSAFE_style={getPickerStyle(props.longestLabelLength)}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </Picker>
  ),
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

  const isNullable = isNullableField(isRequired)
  const isNull = isNullValue(value, isNullable)
  const isInvalid = isInvalidValue(value, isRequired)
  const errorMessage = getErrorMessage(field, isInvalid, isDirty, forceValidation)

  const selectedKey = getSelectedKey(value, preNullValue)
  const textValue = getTextValue(field, selectedKey)

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

  const fieldElement = fieldRenderers[field.displayMode]({
    field,
    errorMessage,
    isDisabled: isNull,
    isReadOnly: onChange == null,
    isRequired,
    items: field.options,
    onChange: onSelectionChange,
    value: selectedKey,
    textValue,
    selectedKey,
    longestLabelLength,
  })

  return (
    <NullableFieldWrapper
      isAllowed={!isRequired}
      autoFocus={isNull && autoFocus}
      label={field.label}
      isReadOnly={onChange == null}
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

        const listView = renderListView(
          optionsWithStringValues,
          value,
          onChange,
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
      graphql: ({ type, value: options }) => ({
        [config.fieldKey]: {
          [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => t(x)),
        },
      }),
      parseGraphQL: value => parseGraphQLFilter(value, t),
      Label({ type, value }) {
        return getFilterLabel(type, value, optionsWithStringValues)
      },
      types: FILTER_TYPES,
    },
  }
}