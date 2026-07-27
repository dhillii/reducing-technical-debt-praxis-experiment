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

const getSelectedKey = (value: Value, preNullValue: Value['value'] | null) => {
  return value.value?.value || preNullValue?.value || null
}

const getErrorMessage = (isInvalid: boolean, isDirty: boolean, forceValidation: boolean, field: Field) => {
  return isInvalid && (isDirty || forceValidation) ? `${field.label} is required.` : undefined
}

const getIsInvalid = (value: Value, isRequired: boolean) => {
  return !validate(value, isRequired)
}

const getIsReadOnly = (onChange: ((value: Value) => void) | null) => {
  return onChange == null
}

const getIsNullable = (isRequired: boolean) => {
  return !isRequired
}

const getIsNull = (isNullable: boolean, value: Value) => {
  return isNullable && value.value?.value == null
}

const getLongestLabelLength = (field: Field) => {
  return field.options.reduce((a, item) => Math.max(a, item.label.length), 0)
}

const getNewValue = (field: Field, key: Key | null) => {
  return field.options.find(opt => opt.value === key) ?? null
}

const getSelectedOption = (field: Field, selectedKey: Key | null) => {
  return field.options.find(item => item.value === selectedKey)
}

const getSelectedLabel = (selectedOption: Option | undefined) => {
  return selectedOption?.label || ''
}

const getDensity = (options: readonly Option[]) => {
  const densityLevels = ['spacious', 'regular', 'compact'] as const
  return densityLevels[Math.min(Math.floor((options.length - 1) / 3), 2)]
}

const getListView = (options: readonly Option[], value: string[], onChange: (value: string[]) => void) => {
  const density = getDensity(options)
  return (
    <ListView
      aria-label="Filter"
      density={density}
      items={options}
      flex
      minHeight={0}
      maxHeight="100%"
      selectionMode="multiple"
      onSelectionChange={selection => {
        if (selection === 'all') return // irrelevant for this case

        onChange([...selection].filter(x => typeof x === 'string'))
      }}
      selectedKeys={value}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </ListView>
  )
}

const getFilterLabel = (type: string, value: string[]) => {
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

const getFilterTypes = () => {
  return {
    matches: {
      label: 'Matches',
      initialValue: [],
    },
    not_matches: {
      label: 'Does not match',
      initialValue: [],
    },
  }
}

const getFilter = (config: Config) => {
  return {
    Filter(props) {
      const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props

      const listView = getListView(optionsWithStringValues, value, onChange)

      if (context === 'edit') {
        return (
          <VStack gap="medium" flex minHeight={0} maxHeight="100%">
            {/* intentionally not linked: the `ListView` has an explicit "aria-label" to avoid awkwardness with IDs and forked render */}
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
      return getFilterLabel(type, value)
    },
    types: getFilterTypes(),
  }
}

const getController = (config: Config) => {
  const optionsWithStringValues = config.fieldMeta.options.map(x => ({
    label: x.label,
    value: x.value.toString(),
  }))

  // Transform from string value to type appropriate value
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
    filter: getFilter(config),
  }
}

const getDisplayModeComponent = (field: Field, selectedKey: Key | null, onSelectionChange: (key: Key | null) => void) => {
  switch (field.displayMode) {
    case 'segmented-control':
      return (
        <SegmentedControl
          label={field.label}
          description={field.description}
          errorMessage={getErrorMessage(getIsInvalid(value, isRequired), isDirty, forceValidation, field)}
          isDisabled={getIsNull(getIsNullable(isRequired), value)}
          isReadOnly={getIsReadOnly(onChange)}
          isRequired={isRequired}
          items={field.options}
          onChange={onSelectionChange}
          value={selectedKey}
          textValue={getSelectedLabel(getSelectedOption(field, selectedKey))}
        >
          {item => <Item key={item.value}>{item.label}</Item>}
        </SegmentedControl>
      )
    case 'radio':
      return (
        <RadioGroup
          label={field.label}
          description={field.description}
          errorMessage={getErrorMessage(getIsInvalid(value, isRequired), isDirty, forceValidation, field)}
          isDisabled={getIsNull(getIsNullable(isRequired), value)}
          isReadOnly={getIsReadOnly(onChange)}
          isRequired={isRequired}
          onChange={onSelectionChange}
          // maintain the previous value when set to null in aid of continuity
          // for the user. it will be cleared when the item is saved
          value={value.value?.value ?? preNullValue?.value}
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
          errorMessage={getErrorMessage(getIsInvalid(value, isRequired), isDirty, forceValidation, field)}
          isDisabled={getIsNull(getIsNullable(isRequired), value)}
          isReadOnly={getIsReadOnly(onChange)}
          isRequired={isRequired}
          items={field.options}
          onSelectionChange={onSelectionChange}
          selectedKey={selectedKey}
          flex={{ mobile: true, desktop: 'initial' }}
          UNSAFE_style={{
            fontSize: tokenSchema.typography.text.regular.size,
            width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${getLongestLabelLength(field)}ex + ${tokenSchema.size.icon.regular}), 100%)`,
          }}
        >
          {item => <Item key={item.value}>{item.label}</Item>}
        </Picker>
      )
  }
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation, onChange, value, isRequired } = props
  const [isDirty, setDirty] = useState(false)
  const [preNullValue, setPreNullValue] = useState(
    value.value || (value.kind === 'update' ? value.initial : null)
  )

  const selectedKey = getSelectedKey(value, preNullValue)
  const isNullable = getIsNullable(isRequired)
  const isNull = getIsNull(isNullable, value)
  const isInvalid = getIsInvalid(value, isRequired)
  const isReadOnly = getIsReadOnly(onChange)
  const errorMessage = getErrorMessage(isInvalid, isDirty, forceValidation, field)

  const onSelectionChange = (key: Key | null) => {
    if (!onChange) return

    const newValue = getNewValue(field, key)

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

  const fieldElement = getDisplayModeComponent(field, selectedKey, onSelectionChange)

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

function validate(value: Value, isRequired: boolean) {
  if (isRequired) {
    // if you got null initially on the update screen, we want to allow saving
    // since the user probably doesn't have read access control
    if (value.kind === 'update' && value.initial === null) return true
    return value.value !== null
  }
  return true
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
  return getController(config)
}