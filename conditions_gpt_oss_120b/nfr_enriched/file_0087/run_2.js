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

type Config = FieldControllerConfig<AdminSelectFieldMeta>
type Option = { label: string; value: string }
type Value =
  | { value: Option | null; kind: 'create' }
  | { value: Option | null; initial: Option | null; kind: 'update' }

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

  const selectedKey = value.value?.value || preNullValue?.value || null
  const isNullable = !isRequired
  const isNull = isNullable && value.value?.value == null
  const isInvalid = !validate(value, isRequired)
  const isReadOnly = onChange == null
  const errorMessage = computeErrorMessage(isInvalid, isDirty, forceValidation, field.label)

  const handleSelectionChange = createSelectionHandler(onChange, setDirty, value, field)
  const handleNullChange = createNullHandler(onChange, setDirty, setPreNullValue, value, preNullValue, field)

  const fieldElement = renderFieldElement({
    field,
    displayMode: field.displayMode,
    selectedKey,
    isNull,
    isReadOnly,
    isRequired,
    onSelectionChange: handleSelectionChange,
    longestLabelLength,
    autoFocus,
  })

  return (
    <NullableFieldWrapper
      isAllowed={!isRequired}
      autoFocus={isNull && autoFocus}
      label={field.label}
      isReadOnly={isReadOnly}
      isNull={isNull}
      onChange={handleNullChange}
    >
      {fieldElement}
    </NullableFieldWrapper>
  )
}

/** Compute the error message based on validation state. */
function computeErrorMessage(
  isInvalid: boolean,
  isDirty: boolean,
  forceValidation: boolean,
  label: string
): string | undefined {
  return isInvalid && (isDirty || forceValidation) ? `${label} is required.` : undefined
}

/** Create a handler for selection changes that updates the field value. */
function createSelectionHandler(
  onChange: ((v: Value) => void) | undefined,
  setDirty: (b: boolean) => void,
  currentValue: Value,
  field: { options: readonly { label: string; value: string }[] }
) {
  return (key: Key | null) => {
    if (!onChange) return
    const newValue: Value['value'] = field.options.find(opt => opt.value === key) ?? null
    onChange({ ...currentValue, value: newValue })
    setDirty(true)
  }
}

/** Create a handler for toggling the nullable state of the field. */
function createNullHandler(
  onChange: ((v: Value) => void) | undefined,
  setDirty: (b: boolean) => void,
  setPreNullValue: (v: Option | null) => void,
  currentValue: Value,
  preNullValue: Option | null,
  field: { options: readonly { label: string; value: string }[] }
) {
  return (isChecked: boolean) => {
    if (!onChange) return
    if (isChecked) {
      onChange({ ...currentValue, value: null })
      setPreNullValue(currentValue.value)
    } else {
      onChange({ ...currentValue, value: preNullValue || field.options[0] })
    }
    setDirty(true)
  }
}

/** Render the appropriate field UI based on the display mode. */
function renderFieldElement(params: {
  field: {
    label: string
    description?: string
    options: readonly { label: string; value: string }[]
    displayMode: 'select' | 'segmented-control' | 'radio'
  }
  selectedKey: string | null
  isNull: boolean
  isReadOnly: boolean
  isRequired: boolean
  onSelectionChange: (key: Key | null) => void
  longestLabelLength: number
  autoFocus: boolean
}) {
  const {
    field,
    selectedKey,
    isNull,
    isReadOnly,
    isRequired,
    onSelectionChange,
    longestLabelLength,
    autoFocus,
  } = params

  switch (field.displayMode) {
    case 'segmented-control':
      return (
        <SegmentedControl
          label={field.label}
          description={field.description}
          errorMessage={undefined}
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
          errorMessage={undefined}
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
          errorMessage={undefined}
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

function validate(value: Value, isRequired: boolean) {
  if (isRequired) {
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

        const handleSelection = (selection: Set<Key>) => {
          if (selection === 'all') return
          onChange([...selection].filter(x => typeof x === 'string'))
        }

        const listView = (
          <ListView
            aria-label={typeLabel}
            density={density}
            items={optionsWithStringValues}
            flex
            minHeight={0}
            maxHeight="100%"
            selectionMode="multiple"
            onSelectionChange={handleSelection}
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