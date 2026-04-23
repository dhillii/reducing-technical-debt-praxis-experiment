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

// Extracted function to calculate the longest label length
const calculateLongestLabelLength = (options: readonly { label: string; value: string | number }[]) => {
  return options.reduce((a, item) => Math.max(a, item.label.length), 0)
}

// Extracted function to get the selected key
const getSelectedKey = (value: any, preNullValue: any) => {
  return value.value?.value || preNullValue?.value || null
}

// Extracted function to determine if the field is nullable
const isFieldNullable = (isRequired: boolean) => {
  return !isRequired
}

// Extracted function to determine if the field is null
const isFieldNull = (isNullable: boolean, value: any) => {
  return isNullable && value.value?.value == null
}

// Extracted function to determine if the field is invalid
const isFieldInvalid = (value: any, isRequired: boolean, isDirty: boolean, forceValidation: boolean) => {
  return !validate(value, isRequired) && (isDirty || forceValidation)
}

// Extracted function to get the error message
const getErrorMessage = (field: any, isInvalid: boolean, isDirty: boolean, forceValidation: boolean) => {
  return isInvalid && (isDirty || forceValidation) ? `${field.label} is required.` : undefined
}

// Extracted function to handle selection change
const handleSelectionChange = (onChange: any, field: any, selectedKey: Key | null) => {
  if (!onChange) return

  const newValue = field.options.find(opt => opt.value === selectedKey) ?? null
  onChange({ ...field.value, value: newValue })
}

// Extracted function to handle null change
const handleNullChange = (onChange: any, value: any, preNullValue: any, isNull: boolean) => {
  if (!onChange) return

  if (isNull) {
    onChange({ ...value, value: null })
  } else {
    onChange({ ...value, value: preNullValue || field.options[0] })
  }
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation, onChange, value, isRequired } = props
  const [isDirty, setDirty] = useState(false)
  const [preNullValue, setPreNullValue] = useState(
    value.value || (value.kind === 'update' ? value.initial : null)
  )

  const longestLabelLength = useMemo(() => calculateLongestLabelLength(field.options), [field.options])
  const selectedKey = getSelectedKey(value, preNullValue)
  const isNullable = isFieldNullable(isRequired)
  const isNull = isFieldNull(isNullable, value)
  const isInvalid = isFieldInvalid(value, isRequired, isDirty, forceValidation)
  const errorMessage = getErrorMessage(field, isInvalid, isDirty, forceValidation)

  const onSelectionChange = (key: Key | null) => {
    handleSelectionChange(onChange, field, key)
    setDirty(true)
  }

  const onNullChange = (isChecked: boolean) => {
    handleNullChange(onChange, value, preNullValue, isChecked)
    setDirty(true)
  }

  const fieldElement = (() => {
    switch (field.displayMode) {
      case 'segmented-control':
        return (
          <SegmentedControl
            label={field.label}
            description={field.description}
            errorMessage={errorMessage}
            isDisabled={isNull}
            isReadOnly={!onChange}
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
            isReadOnly={!onChange}
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
      default:
        return (
          <Picker
            autoFocus={autoFocus}
            label={field.label}
            description={field.description}
            errorMessage={errorMessage}
            isDisabled={isNull}
            isReadOnly={!onChange}
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
  })()

  return (
    <NullableFieldWrapper
      isAllowed={!isRequired}
      autoFocus={isNull && autoFocus}
      label={field.label}
      isReadOnly={!onChange}
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

// Extracted function to validate the value
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

// Extracted function to transform options to string values
const transformOptionsToStringValues = (options: readonly { label: string; value: string | number }[]) => {
  return options.map(x => ({
    label: x.label,
    value: x.value.toString(),
  }))
}

// Extracted function to transform string value to type appropriate value
const transformStringValueToTypeValue = (value: string | null, type: 'string' | 'integer' | 'enum') => {
  return value === null ? null : type === 'integer' ? parseInt(value) : value
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
  const optionsWithStringValues = transformOptionsToStringValues(config.fieldMeta.options)

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
    serialize: value => ({ [config.fieldKey]: transformStringValueToTypeValue(value.value?.value ?? null, config.fieldMeta.type) }),
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
              if (selection === 'all') return // irrelevant for this case

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
          [type === 'not_matches' ? 'notIn' : 'in']: options.map(x => transformStringValueToTypeValue(x, config.fieldMeta.type)),
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