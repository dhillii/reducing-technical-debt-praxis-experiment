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

type FieldFilterProps = Parameters<
  NonNullable<ControllerReturnType['filter']['Filter']>
>[0]

type GraphQLOutput = ReturnType<NonNullable<ControllerReturnType['filter']['graphql']>>

type ParsedGraphQLValue = ReturnType<NonNullable<ControllerReturnType['filter']['parseGraphQL']>>

type FilterLabelProps = Parameters<NonNullable<ControllerReturnType['filter']['Label']>>[0]

/**
 * Validates a numeric value against field constraints
 */
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

/**
 * Creates validation function with bound configuration
 */
function createValidator(config: ControllerConfig) {
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

/**
 * Renders filter UI for the integer field
 */
function renderFilter(props: Readonly<FieldFilterProps>, config: ControllerConfig) {
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

  const validate = createValidator(config)

  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={
        (forceValidation || isDirty) &&
        !validate({ kind: 'update', initial: null, value }, { isRequired: true })
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

/**
 * Converts filter values to GraphQL query format
 */
function convertToGraphQL({ type, value }: { type: string; value: number | null }, fieldKey: string): GraphQLOutput {
  if (type === 'empty') return { [fieldKey]: { equals: null } }
  if (type === 'not_empty') return { [fieldKey]: { not: { equals: null } } }
  if (type === 'not') return { [fieldKey]: { not: { equals: value } } }
  return { [fieldKey]: { [type]: value } }
}

/**
 * Parses GraphQL filter values back to internal representation
 */
function parseFromGraphQL(value: Record<string, any>): ParsedGraphQLValue {
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

/**
 * Renders the label for filter display
 */
function renderFilterLabel({ label, type, value }: FilterLabelProps): string {
  if (type === 'empty' || type === 'not_empty') return label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${value}`
}

/**
 * Defines available filter types for the integer field
 */
const filterTypes = {
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
} as const

export function controller(config: ControllerConfig): ControllerReturnType {
  const validate = createValidator(config)

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
        return renderFilter(props, config)
      },
      graphql: ({ type, value }) => convertToGraphQL({ type, value }, config.fieldKey),
      parseGraphQL: parseFromGraphQL,
      Label: renderFilterLabel,
      types: filterTypes,
    },
  }
}

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: Readonly<FieldProps<typeof controller>>) {
  const [isDirty, setDirty] = useState(false)
  const isReadOnly = !onChange || field.hasAutoIncrementDefault

  if (field.hasAutoIncrementDefault && value.kind === 'create') {
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

  const validate = (value: Value) => {
    return validateInput(
      value,
      field.validation,
      isRequired,
      field.label,
      field.hasAutoIncrementDefault
    )
  }

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