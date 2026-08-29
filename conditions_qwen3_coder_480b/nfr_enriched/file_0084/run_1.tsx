import { useState } from 'react'

import { ContextualHelp } from '@keystar/ui/contextual-help'
import { Content } from '@keystar/ui/slots'
import { NumberField } from '@keystar/ui/number-field'

import { Heading, Text } from '@keystar/ui/typography'

import type {
  FieldController,
  FieldControllerConfig,
  FieldProps,
  SimpleFieldTypeInfo,
} from '../../../../types'
import { entriesTyped } from '../../../../lib/core/utils'

// TODO: extract
const TYPE_OPERATOR_MAP = {
  equals: '=',
  not: '≠',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
} as const

type Value =
  | { kind: 'create'; value: number | null }
  | { kind: 'update'; initial: number | null; value: number | null }

type Validation = {
  min: number
  max: number
}

type ValidateOptions = {
  isRequired: boolean
}

type ControllerConfig = FieldControllerConfig<{
  validation: Validation
  defaultValue: number | null | 'autoincrement'
}>

type ControllerReturnType = FieldController<
  Value,
  number | null,
  SimpleFieldTypeInfo<'Int'>['inputs']['where']
> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
}

type FilterProps = Parameters<ControllerReturnType['filter']['Filter']>[0]

function validateInput(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  label: string,
  hasAutoIncrementDefault: boolean
): string | undefined {
  const { value: input, kind } = value
  if (kind === 'create' && hasAutoIncrementDefault && input === null) return
  if (kind === 'update' && value.initial === null && input === null) return
  if (isRequired && input === null) return `${label} is required`
  if (typeof input !== 'number') return
  const v = input
  if (!Number.isInteger(v)) return `${label} is not a valid integer`
  if (validation.min !== undefined && v < validation.min)
    return `${label} must be greater than or equal to ${validation.min}`
  if (validation.max !== undefined && v > validation.max)
    return `${label} must be less than or equal to ${validation.max}`
}

function createValidateFunction(config: ControllerConfig) {
  return (value: Value, opts: ValidateOptions) => {
    return validateInput(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }
}

function renderAutoIncrementField(autoFocus: boolean, field: any) {
  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      isReadOnly
      contextualHelp={
        <ContextualHelp>
          <Heading>Auto increment</Heading>
          <Content>
            <Text>
              This field is set to auto increment. It will default to the next available number.
            </Text>
          </Content>
        </ContextualHelp>
      }
    />
  )
}

function renderEditableField(
  props: Readonly<FieldProps<typeof controller>>,
  validate: (value: Value) => string | undefined,
  isDirty: boolean,
  setDirty: React.Dispatch<React.SetStateAction<boolean>>
) {
  const { field, value, onChange, autoFocus, forceValidation, isRequired } = props
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  return (
    <NumberField
      autoFocus={autoFocus}
      description={field.description}
      label={field.label}
      errorMessage={(forceValidation || isDirty) && validate(value)}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      width="alias.singleLineWidth"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.({ ...value, value: !Number.isFinite(x) ? null : x })}
      value={value.value ?? NaN}
    />
  )
}

function renderFilterComponent(props: Readonly<FilterProps>, config: ControllerConfig) {
  const {
    autoFocus,
    context,
    forceValidation,
    typeLabel,
    onChange,
    type,
    value,
    ...otherProps
  } = props
  
  const [isDirty, setDirty] = useState(false)
  if (type === 'empty' || type === 'not_empty') return null

  const labelProps =
    context === 'add' ? { label: config.label, description: typeLabel } : { label: typeLabel }

  const validate = (val: number | null) => {
    return validateInput(
      { kind: 'update', initial: null, value: val },
      config.fieldMeta.validation,
      true,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }

  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={
        (forceValidation || isDirty) &&
        !validate(value)
          ? 'Required'
          : null
      }
      step={1}
      width="auto"
      onBlur={() => setDirty(true)}
      onChange={x => onChange?.(!Number.isFinite(x) ? null : x)}
      value={value ?? NaN}
    />
  )
}

function generateGraphQLFilter({ type, value }: { type: string; value: number | null }, fieldKey: string) {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

function parseGraphQLValue(value: any) {
  return entriesTyped(value).flatMap(([type, value]) => {
    if (type === 'equals' && value === null) {
      return [{ type: 'empty', value: null }]
    }
    if (!value) return []
    if (type === 'equals') return { type: 'equals', value }
    if (type === 'not') {
      if (value?.equals === null) return { type: 'not_empty', value: null }
      if (value?.equals === undefined) return []
      return { type: 'not', value: value.equals }
    }
    if (type === 'gt' || type === 'gte' || type === 'lt' || type === 'lte') {
      return { type, value }
    }
    return []
  })
}

function getFilterLabel({ label, type, value }: { label: string; type: string; value: number | null }) {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

export function controller(config: ControllerConfig): ControllerReturnType {
  const validate = createValidateFunction(config)

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: config.fieldKey,
    validation: config.fieldMeta.validation,
    defaultValue: {
      kind: 'create',
      value:
        config.fieldMeta.defaultValue === 'autoincrement' ? null : config.fieldMeta.defaultValue,
    },
    deserialize: data => ({
      kind: 'update',
      value: data[config.fieldKey],
      initial: data[config.fieldKey],
    }),
    serialize: value => ({ [config.fieldKey]: value.value }),
    hasAutoIncrementDefault: config.fieldMeta.defaultValue === 'autoincrement',
    validate: (value, opts) => validate(value, opts) === undefined,
    filter: {
      Filter(props) {
        return renderFilterComponent(props, config)
      },

      graphql: ({ type, value }) => generateGraphQLFilter({ type, value }, config.fieldKey),
      parseGraphQL: parseGraphQLValue,
      Label: getFilterLabel,
      types: {
        equals: {
          label: 'Is exactly',
          initialValue: null,
        },
        not: {
          label: 'Is not exactly',
          initialValue: null,
        },
        gt: {
          label: 'Is greater than',
          initialValue: null,
        },
        lt: {
          label: 'Is less than',
          initialValue: null,
        },
        gte: {
          label: 'Is greater than or equal to',
          initialValue: null,
        },
        lte: {
          label: 'Is less than or equal to',
          initialValue: null,
        },
        empty: {
          label: 'Is empty',
          initialValue: null,
        },
        not_empty: {
          label: 'Is not empty',
          initialValue: null,
        },
      },
    },
  }
}

export function Field(props: Readonly<FieldProps<typeof controller>>) {
  const { field, value, autoFocus } = props
  const [isDirty, setDirty] = useState(false)

  if (field.hasAutoIncrementDefault && value.kind === 'create') {
    return renderAutoIncrementField(autoFocus, field)
  }

  const validate = (val: Value) => {
    return validateInput(
      val,
      field.validation,
      props.isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )
  }

  return renderEditableField(props, validate, isDirty, setDirty)
}