// @ts-expect-error
import dumbPasswords from 'dumb-passwords'
import { useEffect, useId, useRef, useState } from 'react'
import { useSlotId } from '@react-aria/utils'

import { ActionButton, ToggleButton } from '@keystar/ui/button'
import { Checkbox } from '@keystar/ui/checkbox'
import { FieldLabel, FieldMessage } from '@keystar/ui/field'
import { Icon } from '@keystar/ui/icon'
import { eyeIcon } from '@keystar/ui/icon/icons/eyeIcon'
import { asteriskIcon } from '@keystar/ui/icon/icons/asteriskIcon'
import { Flex, VStack } from '@keystar/ui/layout'
import { containerQueries, css } from '@keystar/ui/style'
import { TextField } from '@keystar/ui/text-field'
import { Text, VisuallyHidden } from '@keystar/ui/typography'

import type {
  CellComponent,
  FieldController,
  FieldControllerConfig,
  FieldProps,
} from '../../../../types'

// Validates minimum length constraint
function validateMinLength(
  val: string,
  minLength: number,
  fieldLabel: string
): string | undefined {
  if (val.length < minLength) {
    if (minLength === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${minLength} characters long`
  }
  return undefined
}

// Validates maximum length constraint
function validateMaxLength(
  val: string,
  maxLength: number | null,
  fieldLabel: string
): string | undefined {
  if (maxLength !== null && val.length > maxLength) {
    return `${fieldLabel} must be no longer than ${maxLength} characters`
  }
  return undefined
}

// Validates regex pattern constraint
function validatePattern(
  val: string,
  match: { regex: RegExp; explanation: string } | null
): string | undefined {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return undefined
}

// Validates common password constraint
function validateCommonPassword(val: string, rejectCommon: boolean, fieldLabel: string): string | undefined {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

// Validates editing state password constraints
function validateEditingPassword(
  value: string,
  confirm: string,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (value !== confirm) {
    return `The passwords do not match`
  }

  const minLengthError = validateMinLength(value, validation.length.min, fieldLabel)
  if (minLengthError) return minLengthError

  const maxLengthError = validateMaxLength(value, validation.length.max, fieldLabel)
  if (maxLengthError) return maxLengthError

  const patternError = validatePattern(value, validation.match)
  if (patternError) return patternError

  const commonError = validateCommonPassword(value, validation.rejectCommon, fieldLabel)
  if (commonError) return commonError

  return undefined
}

function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial' && (value.isSet === null || value.isSet === true)) {
    return undefined
  }
  if (value.kind === 'initial' && isRequired) {
    return `${fieldLabel} is required`
  }
  if (value.kind === 'editing') {
    return validateEditingPassword(value.value, value.confirm, validation, fieldLabel)
  }
  return undefined
}

function readonlyCheckboxProps(isSet: null | undefined | boolean) {
  const isIndeterminate = isSet == null
  const isSelected = isSet == null ? undefined : isSet
  return {
    children: isIndeterminate ? 'Access denied' : 'Value is set',
    isIndeterminate,
    isReadOnly: true,
    isSelected,
    prominence: 'low' as const,
  }
}

// Renders the readonly state of the password field
function ReadOnlyField(props: { value: Value }) {
  return <Checkbox {...readonlyCheckboxProps(props.value.isSet)} />
}

// Renders the initial state with action button to start editing
function InitialField(props: {
  value: Value & { kind: 'initial' }
  field: { label: string }
  autoFocus?: boolean
  triggerRef: React.RefObject<HTMLButtonElement>
  onChange: (value: Value) => void
}) {
  return (
    <ActionButton
      ref={props.triggerRef}
      alignSelf="start"
      autoFocus={props.autoFocus}
      onPress={() => {
        props.onChange({
          kind: 'editing',
          confirm: '',
          value: '',
          isSet: props.value.isSet,
        })
      }}
    >
      {props.value.isSet ? `Change ` : `Set `}
      {props.field.label.toLocaleLowerCase()}
    </ActionButton>
  )
}

// Renders password input fields and controls during editing
function EditingField(props: {
  value: Value & { kind: 'editing' }
  field: { label: string }
  secureTextEntry: boolean
  setSecureTextEntry: (value: boolean) => void
  touched: { value: boolean; confirm: boolean }
  setTouched: (touched: { value: boolean; confirm: boolean }) => void
  validationMessage?: string
  descriptionId: string
  messageId: string
  onEscape: (e: React.KeyboardEvent) => void
  onChange: (value: Value) => void
  cancelEditing: () => void
}) {
  return (
    <Flex
      gap="regular"
      UNSAFE_className={css({
        [containerQueries.below.tablet]: {
          flexDirection: 'column',
        },
      })}
    >
      <TextField
        autoFocus
        aria-label={`new ${props.field.label}`}
        aria-describedby={[props.descriptionId, props.messageId].filter(Boolean).join(' ')}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!props.validationMessage}
        onBlur={() => props.setTouched({ ...props.touched, value: true })}
        onChange={text => props.onChange({ ...props.value, value: text })}
        onKeyDown={props.onEscape}
        placeholder="New"
        type={props.secureTextEntry ? 'password' : 'text'}
        value={props.value.value}
        flex
      />
      <TextField
        aria-label={`confirm ${props.field.label}`}
        aria-describedby={props.messageId}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!props.validationMessage}
        onBlur={() => props.setTouched({ ...props.touched, confirm: true })}
        onChange={text => props.onChange({ ...props.value, confirm: text })}
        onKeyDown={props.onEscape}
        placeholder="Confirm"
        type={props.secureTextEntry ? 'password' : 'text'}
        value={props.value.confirm}
        flex
      />

      <Flex gap="regular">
        <ToggleButton
          aria-label="show"
          isSelected={!props.secureTextEntry}
          onPress={() => props.setSecureTextEntry(!props.secureTextEntry)}
        >
          <Icon src={eyeIcon} />
          <Text
            UNSAFE_className={css({
              [containerQueries.above.mobile]: {
                display: 'none',
              },
            })}
          >
            Show
          </Text>
        </ToggleButton>
        <ActionButton onPress={props.cancelEditing}>Cancel</ActionButton>
      </Flex>
    </Flex>
  )
}

export function Field(props: FieldProps<typeof controller>) {
  const { autoFocus, field, forceValidation, onChange, value } = props

  const [secureTextEntry, setSecureTextEntry] = useState(true)
  const [touched, setTouched] = useState({ value: false, confirm: false })
  const triggerRef = useRef<HTMLButtonElement>(null)

  const isReadOnly = onChange == null
  const validationMessage =
    forceValidation || (touched.value && touched.confirm)
      ? validate(value, field.validation, props.isRequired, field.label)
      : undefined

  const labelId = useId()
  const descriptionId = useSlotId([!!field.description, !!validationMessage])
  const messageId = useSlotId([!!field.description, !!validationMessage])

  const cancelEditing = () => {
    onChange?.({ kind: 'initial', isSet: value.isSet })
    setTimeout(() => {
      triggerRef.current?.focus()
    }, 0)
  }

  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || value.kind !== 'editing') return
    if (value.value === '' && value.confirm === '') {
      cancelEditing()
    }
  }

  useEffect(() => {
    if (value.kind === 'initial') {
      setTouched({ value: false, confirm: false })
      setSecureTextEntry(true)
    }
  }, [value.kind])

  return (
    <VStack
      role="group"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      gap="medium"
      minWidth={0}
    >
      <FieldLabel elementType="span" id={labelId}>
        {field.label}
      </FieldLabel>
      {!!field.description && (
        <Text id={descriptionId} size="regular" color="neutralSecondary">
          {field.description}
        </Text>
      )}
      {isReadOnly ? (
        <ReadOnlyField value={value} />
      ) : value.kind === 'initial' ? (
        <InitialField
          value={value}
          field={field}
          autoFocus={autoFocus}
          triggerRef={triggerRef}
          onChange={onChange}
        />
      ) : (
        <EditingField
          value={value}
          field={field}
          secureTextEntry={secureTextEntry}
          setSecureTextEntry={setSecureTextEntry}
          touched={touched}
          setTouched={setTouched}
          validationMessage={validationMessage}
          descriptionId={descriptionId}
          messageId={messageId}
          onEscape={onEscape}
          onChange={onChange}
          cancelEditing={cancelEditing}
        />
      )}
      {!!validationMessage && <FieldMessage id={messageId}>{validationMessage}</FieldMessage>}
    </VStack>
  )
}

export const Cell: CellComponent<typeof controller> = ({ value }) => {
  return value !== null ? (
    <div aria-label="is set" style={{ display: 'flex' }}>
      <Icon src={asteriskIcon} size="small" />
      <Icon src={asteriskIcon} size="small" />
      <Icon src={asteriskIcon} size="small" />
    </div>
  ) : (
    <VisuallyHidden>not set</VisuallyHidden>
  )
}

type Validation = {
  rejectCommon: boolean
  match: {
    regex: RegExp
    explanation: string
  } | null
  length: {
    min: number
    max: number | null
  }
}

export type PasswordFieldMeta = {
  isNullable: boolean
  validation: {
    rejectCommon: boolean
    match: {
      regex: { source: string; flags: string }
      explanation: string
    } | null
    length: {
      min: number
      max: number | null
    }
  }
}

type Value =
  | {
      kind: 'initial'
      isSet: boolean | null
    }
  | {
      kind: 'editing'
      isSet: boolean | null
      value: string
      confirm: string
    }

// Constructs validation regex from serialized format
function buildValidationRegex(match: PasswordFieldMeta['validation']['match']): Validation['match'] {
  if (match === null) return null
  return {
    regex: new RegExp(match.regex.source, match.regex.flags),
    explanation: match.explanation,
  }
}

// Builds filter configuration for password field
function buildFilterConfig(fieldKey: string, isNullable: boolean, typeLabel: string) {
  if (!isNullable) return undefined

  return {
    Filter(props: any) {
      const { autoFocus, onChange, value, ...otherProps } = props
      return (
        <Checkbox
          autoFocus={autoFocus}
          onChange={onChange}
          isSelected={value ?? false}
          {...otherProps}
        >
          {typeLabel} set
        </Checkbox>
      )
    },
    graphql({ type, value }: any) {
      return {
        [fieldKey]: {
          isSet: type === 'not' ? !value : value,
        },
      }
    },
    parseGraphQL(value: any) {
      if (value?.isSet !== undefined) {
        return [{ type: 'is', value: value.isSet }]
      }
      return []
    },
    Label({ type, value }: any) {
      if ((type === 'is' && value) || (type === 'not' && !value)) return `is set`
      return `is not set`
    },
    types: {
      is: {
        label: 'Is',
        initialValue: true,
      },
      not: {
        label: 'Is not',
        initialValue: true,
      },
    },
  }
}

export function controller(config: FieldControllerConfig<PasswordFieldMeta>): FieldController<
  Value,
  boolean | null,
  { isSet?: boolean | null | undefined }
> & {
  validation: Validation
} {
  const validation: Validation = {
    ...config.fieldMeta.validation,
    match: buildValidationRegex(config.fieldMeta.validation.match),
  }

  return {
    fieldKey: config.fieldKey,
    label: config.label,
    description: config.description,
    graphqlSelection: `${config.fieldKey} {isSet}`,
    validation,
    defaultValue: {
      kind: 'initial',
      isSet: false,
    },
    validate: (state, opts) =>
      validate(state, validation, opts.isRequired, config.label) === undefined,
    deserialize: data => ({ kind: 'initial', isSet: data[config.fieldKey]?.isSet ?? null }),
    serialize: value => {
      if (value.kind === 'initial') return {}
      return { [config.fieldKey]: value.value }
    },
    filter: buildFilterConfig(config.fieldKey, config.fieldMeta.isNullable, config.label),
  }
}