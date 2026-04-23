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

/**
 * Validates a value against a set of validation rules.
 * @param value The value to validate.
 * @param validation The validation rules.
 * @param isRequired Whether the value is required.
 * @param label The label of the field.
 * @param hasAutoIncrementDefault Whether the field has an auto-increment default.
 * @returns An error message if the value is invalid, or undefined if it is valid.
 */
function validateValue(
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
 * Creates a field controller for an integer field.
 * @param config The configuration for the field controller.
 * @returns The field controller.
 */
export function createFieldController(
  config: FieldControllerConfig<{
    validation: Validation
    defaultValue: number | null | 'autoincrement'
  }>
): FieldController<Value, number | null, SimpleFieldTypeInfo<'Int'>['inputs']['where']> & {
  validation: Validation
  hasAutoIncrementDefault: boolean
} {
  const validate = (value: Value, opts: { isRequired: boolean }) => {
    return validateValue(
      value,
      config.fieldMeta.validation,
      opts.isRequired,
      config.label,
      config.fieldMeta.defaultValue === 'autoincrement'
    )
  }

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
      Filter: createFilterComponent,
      graphql: createFilterGraphQL,
      parseGraphQL: parseFilterGraphQL,
      Label: createFilterLabel,
      types: createFilterTypes,
    },
  }
}

/**
 * Creates a filter component for the field.
 * @param props The props for the filter component.
 * @returns The filter component.
 */
function createFilterComponent(props: any) {
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
    context === 'add' ? { label: props.config.label, description: typeLabel } : { label: typeLabel }

  return (
    <NumberField
      {...otherProps}
      {...labelProps}
      autoFocus={autoFocus}
      errorMessage={
        (forceValidation || isDirty) &&
        !validateValue({ kind: 'update', initial: null, value }, props.config.validation, true, props.config.label, props.config.hasAutoIncrementDefault)
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
 * Creates a GraphQL query for the filter.
 * @param props The props for the GraphQL query.
 * @returns The GraphQL query.
 */
function createFilterGraphQL(props: any) {
  if (props.type === 'empty') return { [props.config.fieldKey]: { equals: null } }
  if (props.type === 'not_empty') return { [props.config.fieldKey]: { not: { equals: null } } }
  if (props.type === 'not') return { [props.config.fieldKey]: { not: { equals: props.value } } }
  return { [props.config.fieldKey]: { [props.type]: props.value } }
}

/**
 * Parses a GraphQL query for the filter.
 * @param value The GraphQL query.
 * @returns The parsed filter.
 */
function parseFilterGraphQL(value: any) {
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
 * Creates a label for the filter.
 * @param props The props for the label.
 * @returns The label.
 */
function createFilterLabel(props: any) {
  if (props.type === 'empty' || props.type === 'not_empty') return props.label.toLocaleLowerCase()
  const operator = TYPE_OPERATOR_MAP[props.type as keyof typeof TYPE_OPERATOR_MAP]
  return `${operator} ${props.value}`
}

/**
 * Creates the types for the filter.
 * @returns The types.
 */
function createFilterTypes() {
  return {
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
  }
}

/**
 * Creates a field component for the field.
 * @param props The props for the field component.
 * @returns The field component.
 */
export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  isRequired,
}: FieldProps<typeof createFieldController>) {
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
    return validateValue(
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