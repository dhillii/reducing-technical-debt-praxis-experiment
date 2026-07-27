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

// Extracted function to handle selection change
/**
 * Handles selection change by finding the new value and calling the onChange callback.
 * @param {Key | null} key - The selected key.
 * @param {FieldProps<typeof controller>} props - The field props.
 */
const handleSelectionChange = (key: Key | null, props: FieldProps<typeof controller>) => {
  if (!props.onChange) return

  const newValue = props.field.options.find(opt => opt.value === key) ?? null
  props.onChange({ ...props.value, value: newValue })
}

// Extracted function to handle null change
/**
 * Handles null change by setting the value to null or the previous value.
 * @param {boolean} isChecked - Whether the null checkbox is checked.
 * @param {FieldProps<typeof controller>} props - The field props.
 */
const handleNullChange = (isChecked: boolean, props: FieldProps<typeof controller>) => {
  if (!props.onChange) return

  if (isChecked) {
    props.onChange({ ...props.value, value: null })
    props.setPreNullValue(props.value.value)
  } else {
    props.onChange({ ...props.value, value: props.preNullValue || props.field.options[0] })
  }
  props.setDirty(true)
}

// Extracted function to get the field element
/**
 * Returns the field element based on the display mode.
 * @param {FieldProps<typeof controller>} props - The field props.
 * @returns {JSX.Element} The field element.
 */
const getFieldElement = (props: FieldProps<typeof controller>) => {
  const displayModes: { [key: string]: JSX.Element } = {
    'segmented-control': (
      <SegmentedControl
        label={props.field.label}
        description={props.field.description}
        errorMessage={props.errorMessage}
        isDisabled={props.isNull}
        isReadOnly={props.isReadOnly}
        isRequired={props.isRequired}
        items={props.field.options}
        onChange={key => handleSelectionChange(key, props)}
        value={props.selectedKey}
        textValue={props.field.options.find(item => item.value === props.selectedKey)?.label || ''}
      >
        {item => <Item key={item.value}>{item.label}</Item>}
      </SegmentedControl>
    ),
    radio: (
      <RadioGroup
        label={props.field.label}
        description={props.field.description}
        errorMessage={props.errorMessage}
        isDisabled={props.isNull}
        isReadOnly={props.isReadOnly}
        isRequired={props.isRequired}
        onChange={key => handleSelectionChange(key, props)}
        value={props.value.value?.value ?? props.preNullValue?.value}
      >
        {props.field.options.map(item => (
          <Radio key={item.value} value={item.value}>
            {item.label}
          </Radio>
        ))}
      </RadioGroup>
    ),
    default: (
      <Picker
        autoFocus={props.autoFocus}
        label={props.field.label}
        description={props.field.description}
        errorMessage={props.errorMessage}
        isDisabled={props.isNull}
        isReadOnly={props.isReadOnly}
        isRequired={props.isRequired}
        items={props.field.options}
        onSelectionChange={key => handleSelectionChange(key, props)}
        selectedKey={props.selectedKey}
        flex={{ mobile: true, desktop: 'initial' }}
        UNSAFE_style={{
          fontSize: tokenSchema.typography.text.regular.size,
          width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${props.longestLabelLength}ex + ${tokenSchema.size.icon.regular}), 100%)`,
        }}
      >
        {item => <Item key={item.value}>{item.label}</Item>}
      </Picker>
    ),
  }

  return displayModes[props.field.displayMode] || displayModes.default
}

export function Field(props: FieldProps<typeof controller>) {
  const [isDirty, setDirty] = useState(false)
  const [preNullValue, setPreNullValue] = useState(
    props.value.value || (props.value.kind === 'update' ? props.value.initial : null)
  )
  const longestLabelLength = useMemo(() => {
    return props.field.options.reduce((a, item) => Math.max(a, item.label.length), 0)
  }, [props.field.options])

  const selectedKey = props.value.value?.value || preNullValue?.value || null
  const isNullable = !props.isRequired
  const isNull = isNullable && props.value.value?.value == null
  const isInvalid = !validate(props.value, props.isRequired)
  const isReadOnly = props.onChange == null
  const errorMessage =
    isInvalid && (isDirty || props.forceValidation) ? `${props.field.label} is required.` : undefined

  return (
    <NullableFieldWrapper
      isAllowed={!props.isRequired}
      autoFocus={isNull && props.autoFocus}
      label={props.field.label}
      isReadOnly={isReadOnly}
      isNull={isNull}
      onChange={isChecked => handleNullChange(isChecked, props)}
    >
      {getFieldElement(props)}
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