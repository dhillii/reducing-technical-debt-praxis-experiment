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

/* -------------------------------------------------------------------------- */
/* Helper utilities                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Determines whether the current value is considered invalid.
 */
function isInvalidValue(value: Value, isRequired: boolean): boolean {
  if (!isRequired) return false
  if (value.kind === 'update' && value.initial === null) return false
  return value.value === null
}

/**
 * Returns the appropriate error message based on validation state.
 */
function getErrorMessage(
  isInvalid: boolean,
  isDirty: boolean,
  forceValidation: boolean,
  label: string
): string | undefined {
  return isInvalid && (isDirty || forceValidation) ? `${label} is required.` : undefined
}

/**
 * Extracts the selected key from the field value.
 */
function getSelectedKey(value: Value, preNullValue: Value['value'] | null): string | number | null {
  return value.value?.value || preNullValue?.value || null
}

/**
 * Renders the appropriate field UI based on the display mode.
 */
function renderFieldElement(
  field: AdminSelectFieldMeta,
  selectedKey: string | number | null,
  longestLabelLength: number,
  isNull: boolean,
  isReadOnly: boolean,
  isRequired: boolean,
  errorMessage: string | undefined,
  onSelectionChange: (key: Key | null) => void,
  autoFocus: boolean
) {
  switch (field.displayMode) {
    case 'segmented-control':
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
    case 'radio':
      return (
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
    default:
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
}

/**
 * Handles selection changes for the field.
 */
function handleSelectionChange(
  key: Key | null,
  onChange: ((value: Value) => void) | undefined,
  fieldOptions: readonly { label: string; value: string | number }[],
  currentValue: Value,
  setDirty: (dirty: boolean) => void
) {
  if (!onChange) return
  const newValue: Value['value'] = fieldOptions.find(opt => opt.value === key) ?? null
  onChange({ ...currentValue, value: newValue })
  setDirty(true)
}

/**
 * Handles toggling of the nullable state.
 */
function handleNullChange(
  isChecked: boolean,
  onChange: ((value: Value) => void) | undefined,
  currentValue: Value,
  preNullValue: Value['value'] | null,
  fieldOptions: readonly { label: string; value: string | number }[],
  setPreNullValue: (v: Value['value'] | null) => void,
  setDirty: (dirty: boolean) => void
) {
  if (!onChange) return
  if (isChecked) {
    onChange({ ...currentValue, value: null })
    setPreNullValue(currentValue.value)
  } else {
    onChange({ ...currentValue, value: preNullValue || fieldOptions[0] })
  }
  setDirty(true)
}

/**
 * Renders the list view used in the filter UI.
 */
function renderFilterListView(
  options: Option[],
  value: readonly (string | number)[],
  onChange: (v: readonly (string | number)[]) => void,
  otherProps: Record<string, unknown>,
  typeLabel: string,
  context: string
) {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  const density = densityLevels[Math.min(Math.floor((options.length - 1) / 3), 2)]

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
        onChange([...selection].filter(x => typeof x === 'string') as readonly (string | number)[])
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
}

/* -------------------------------------------------------------------------- */
/* Component implementation                                                  */
/* -------------------------------------------------------------------------- */

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation, onChange, value, isRequired } = props
  const [isDirty, setDirty] = useState(false)
  const [preNullValue, setPreNullValue] = useState(
    value.value || (value.kind === 'update' ? value.initial : null)
  )

  const longestLabelLength = useMemo(
    () => field.options.reduce((a, item) => Math.max(a, item.label.length), 0),
    [field.options]
  )

  const selectedKey = getSelectedKey(value, preNullValue)
  const isNullable = !isRequired
  const isNull = isNullable && value.value?.value == null
  const isInvalid = isInvalidValue(value, isRequired)
  const isReadOnly = onChange == null
  const errorMessage = getErrorMessage(isInvalid, isDirty, forceValidation, field.label)

  const onSelectionChange = (key: Key | null) =>
    handleSelectionChange(key, onChange, field.options, value, setDirty)

  const onNullChange = (checked: boolean) =>
    handleNullChange(
      checked,
      onChange,
      value,
      preNullValue,
      field.options,
      setPreNullValue,
      setDirty
    )

  const fieldElement = renderFieldElement(
    field,
    selectedKey,
    longestLabelLength,
    isNull,
    isReadOnly,
    isRequired,
    errorMessage,
    onSelectionChange,
    autoFocus
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

export const Cell: CellComponent<typeof controller> = ({ value, field }) => {
  const label = field.options.find(x => x.value === value)?.label
  return <Text>{label}</Text>
}

/* -------------------------------------------------------------------------- */
/* Controller definition                                                     */
/* -------------------------------------------------------------------------- */

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
  if (!isRequired) return true
  if (value.kind === 'update' && value.initial === null) return true
  return value.value !== null
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

  const toTypedValue = (v: string | null) =>
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
          return { kind: 'update', initial: stringifiedOption, value: stringifiedOption }
        }
      }
      return { kind: 'update', initial: null, value: null }
    },
    serialize: value => ({ [config.fieldKey]: toTypedValue(value.value?.value ?? null) }),
    validate: (value, opts) => validate(value, opts.isRequired),
    filter: {
      Filter(props) {
        const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props
        return renderFilterListView(
          optionsWithStringValues,
          value,
          onChange,
          otherProps,
          typeLabel,
          context
        )
      },
      graphql: ({ type, value: options }) => ({
        [config.fieldKey]: {
          [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => toTypedValue(x)),
        },
      }),
      parseGraphQL(value) {
        return entriesTyped(value).flatMap(([type, val]) => {
          if (type === 'equals' && val != null) {
            return { type: 'matches', value: [val] }
          }
          if (type === 'notIn' || type === 'in') {
            if (!val) return []
            return {
              type: type === 'notIn' ? 'not_matches' : 'matches',
              value: val.filter(x => x != null),
            }
          }
          return []
        })
      },
      Label({ type, value }) {
        const listFormatter = useListFormatter({ style: 'short', type: 'disjunction' })

        if (value.length === 0) {
          return type === 'not_matches' ? `is set` : `is not set`
        }

        const selected = new Set(value)
        const labels = optionsWithStringValues
          .filter(opt => selected.has(opt.value))
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