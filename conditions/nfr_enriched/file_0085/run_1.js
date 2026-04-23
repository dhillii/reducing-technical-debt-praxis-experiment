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
  match: Validation['match'],
  fieldLabel: string
): string | undefined {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return undefined
}

// Validates common password constraint
function validateCommonPassword(
  val: string,
  rejectCommon: boolean,
  fieldLabel: string
): string | undefined {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

// Validates initial state constraints
function validateInitialState(
  value: Value,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial' && (value.isSet === null || value.isSet === true)) {
    return undefined
  }
  if (value.kind === 'initial' && isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

// Validates password confirmation match
function validatePasswordMatch(value: Value): string | undefined {
  if (value.kind === 'editing' && value.confirm !== value.value) {
    return `The passwords do not match`
  }
  return undefined
}

// Validates editing state password constraints
function validateEditingPassword(
  value: Value,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (value.kind !== 'editing') {
    return undefined
  }

  const val = value.value
  const minLengthError = validateMinLength(val, validation.length.min, fieldLabel)
  if (minLengthError) return minLengthError

  const maxLengthError = validateMaxLength(val, validation.length.max, fieldLabel)
  if (maxLengthError) return maxLengthError

  const patternError = validatePattern(val, validation.match, fieldLabel)
  if (patternError) return patternError

  const commonError = validateCommonPassword(val, validation.rejectCommon, fieldLabel)
  if (commonError) return commonError

  return undefined
}

function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  const initialError = validateInitialState(value, isRequired, fieldLabel)
  if (initialError) return initialError

  const matchError = validatePasswordMatch(value)
  if (matchError) return matchError

  const editingError = validateEditingPassword(value, validation, fieldLabel)
  if (editingError) return editingError

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
  value: Value
  field: { label: string }
  autoFocus?: boolean
  triggerRef: React.RefObject<HTMLButtonElement>
  onChange: (value: Value) => void
}) {
  const { value, field, autoFocus, triggerRef, onChange } = props
  return (
    <ActionButton
      ref={triggerRef}
      alignSelf="start"
      autoFocus={autoFocus}
      onPress={() => {
        onChange({
          kind: 'editing',
          confirm: '',
          value: '',
          isSet: value.isSet,
        })
      }}
    >
      {value.isSet ? `Change ` : `Set `}
      {field.label.toLocaleLowerCase()}
    </ActionButton>
  )
}

// Renders password input fields for editing
function PasswordInputFields(props: {
  value: Value
  field: { label: string }
  secureTextEntry: boolean
  validationMessage?: string
  descriptionId: string
  messageId: string
  touched: { value: boolean; confirm: boolean }
  onChange: (value: Value) => void
  onBlur: (field: 'value' | 'confirm') => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const {
    value,
    field,
    secureTextEntry,
    validationMessage,
    descriptionId,
    messageId,
    touched,
    onChange,
    onBlur,
    onKeyDown,
  } = props

  if (value.kind !== 'editing') return null

  return (
    <>
      <TextField
        autoFocus
        aria-label={`new ${field.label}`}
        aria-describedby={[descriptionId, messageId].filter(Boolean).join(' ')}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!validationMessage}
        onBlur={() => onBlur('value')}
        onChange={text => onChange({ ...value, value: text })}
        onKeyDown={onKeyDown}
        placeholder="New"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.value}
        flex
      />
      <TextField
        aria-label={`confirm ${field.label}`}
        aria-describedby={messageId}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!validationMessage}
        onBlur={() => onBlur('confirm')}
        onChange={text => onChange({ ...value, confirm: text })}
        onKeyDown={onKeyDown}
        placeholder="Confirm"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.confirm}
        flex
      />
    </>
  )
}

// Renders action buttons for password editing
function PasswordActionButtons(props: {
  secureTextEntry: boolean
  onToggleSecureEntry: () => void
  onCancel: () => void
}) {
  const { secureTextEntry, onToggleSecureEntry, onCancel } = props
  return (
    <Flex gap="regular">
      <ToggleButton
        aria-label="show"
        isSelected={!secureTextEntry}
        onPress={onToggleSecureEntry}
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
      <ActionButton onPress={onCancel}>Cancel</ActionButton>
    </Flex>
  )
}

// Renders the editing state with password input fields and controls
function EditingField(props: {
  value: Value
  field: { label: string; description?: string }
  secureTextEntry: boolean
  validationMessage?: string
  descriptionId: string
  messageId: string
  touched: { value: boolean; confirm: boolean }
  onChange: (value: Value) => void
  onBlur: (field: 'value' | 'confirm') => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onToggleSecureEntry: () => void
  onCancel: () => void
}) {
  const {
    value,
    field,
    secureTextEntry,
    validationMessage,
    descriptionId,
    messageId,
    touched,
    onChange,
    onBlur,
    onKeyDown,
    onToggleSecureEntry,
    onCancel,
  } = props

  return (
    <Flex
      gap="regular"
      UNSAFE_className={css({
        [containerQueries.below.tablet]: {
          flexDirection: 'column',
        },
      })}
    >
      <PasswordInputFields
        value={value}
        field={field}
        secureTextEntry={secureTextEntry}
        validationMessage={validationMessage}
        descriptionId={descriptionId}
        messageId={messageId}
        touched={touched}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      <PasswordActionButtons
        secureTextEntry={secureTextEntry}
        onToggleSecureEntry={onToggleSecureEntry}
        onCancel={onCancel}
      />
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

  const handleBlur = (field: 'value' | 'confirm') => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  // reset when the user cancels, or when the form is submitted
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
          validationMessage={validationMessage}
          descriptionId={descriptionId}
          messageId={messageId}
          touched={touched}
          onChange={onChange}
          onBlur={handleBlur}
          onKeyDown={onEscape}
          onToggleSecureEntry={() => setSecureTextEntry(bool => !bool)}
          onCancel={cancelEditing}
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

// Constructs validation object from field metadata
function buildValidation(fieldMeta: PasswordFieldMeta['validation']): Validation {
  return {
    ...fieldMeta,
    match:
      fieldMeta.match === null
        ? null
        : {
            regex: new RegExp(fieldMeta.match.regex.source, fieldMeta.match.regex.flags),
            explanation: fieldMeta.match.explanation,
          },
  }
}

// Builds the filter configuration for password field
function buildFilterConfig(
  fieldKey: string,
  isNullable: boolean
): FieldController<Value, boolean | null, { isSet?: boolean | null | undefined }>['filter'] {
  if (!isNullable) {
    return undefined
  }

  return {
    Filter(props) {
      const { autoFocus, context, typeLabel, onChange, value, type, ...otherProps } = props
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
    graphql({ type, value }) {
      return {
        [fieldKey]: {
          isSet: type === 'not' ? !value : value,
        },
      }
    },
    parseGraphQL: value => {
      if (value?.isSet !== undefined) {
        return [{ type: 'is', value: value.isSet }]
      }
      return []
    },
    Label({ type, value }) {
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
  const validation = buildValidation(config.fieldMeta.validation)

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
    filter: buildFilterConfig(config.fieldKey, config.fieldMeta.isNullable),
  }
}