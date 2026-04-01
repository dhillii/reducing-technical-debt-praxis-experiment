```typescript
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

/** Validates minimum length constraint */
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

/** Validates maximum length constraint */
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

/** Validates regex match constraint */
function validateRegexMatch(
  val: string,
  match: { regex: RegExp; explanation: string } | null
): string | undefined {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return undefined
}

/** Validates common password constraint */
function validateCommonPassword(val: string, rejectCommon: boolean, fieldLabel: string): string | undefined {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

/** Validates editing state password constraints */
function validateEditingState(
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

  const regexError = validateRegexMatch(value, validation.match)
  if (regexError) return regexError

  const commonError = validateCommonPassword(value, validation.rejectCommon, fieldLabel)
  if (commonError) return commonError

  return undefined
}

/** Validates initial state password constraints */
function validateInitialState(
  isSet: boolean | null,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (isSet === null || isSet === true) {
    return undefined
  }
  if (isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial') {
    return validateInitialState(value.isSet, isRequired, fieldLabel)
  }

  return validateEditingState(value.value, value.confirm, validation, fieldLabel)
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

/** Renders the readonly view for password field */
function ReadOnlyView({ value }: { value: Value }) {
  return <Checkbox {...readonlyCheckboxProps(value.isSet)} />
}

/** Renders the initial state view with action button */
function InitialStateView({
  value,
  field,
  autoFocus,
  onChange,
  triggerRef,
}: {
  value: Extract<Value, { kind: 'initial' }>
  field: { label: string }
  autoFocus?: boolean
  onChange: (value: Value) => void
  triggerRef: React.RefObject<HTMLButtonElement>
}) {
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

/** Renders password input fields for editing state */
function PasswordInputFields({
  value,
  field,
  validationMessage,
  secureTextEntry,
  descriptionId,
  messageId,
  touched,
  onChange,
  onEscape,
  setTouched,
}: {
  value: Extract<Value, { kind: 'editing' }>
  field: { label: string }
  validationMessage?: string
  secureTextEntry: boolean
  descriptionId: string
  messageId: string
  touched: { value: boolean; confirm: boolean }
  onChange: (value: Value) => void
  onEscape: (e: React.KeyboardEvent) => void
  setTouched: (touched: { value: boolean; confirm: boolean }) => void
}) {
  return (
    <>
      <TextField
        autoFocus
        aria-label={`new ${field.label}`}
        aria-describedby={[descriptionId, messageId].filter(Boolean).join(' ')}
        // @ts-expect-error — needs to be fixed in "@keystar/ui"
        isInvalid={!!validationMessage}
        onBlur={() => setTouched({ ...touched, value: true })}
        onChange={text => onChange({ ...value, value: text })}
        onKeyDown={onEscape}
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
        onBlur={() => setTouched({ ...touched, confirm: true })}
        onChange={text => onChange({ ...value, confirm: text })}
        onKeyDown={onEscape}
        placeholder="Confirm"
        type={secureTextEntry ? 'password' : 'text'}
        value={value.confirm}
        flex
      />
    </>
  )
}

/** Renders action buttons for editing state */
function EditingActionButtons({
  secureTextEntry,
  setSecureTextEntry,
  cancelEditing,
}: {
  secureTextEntry: boolean
  setSecureTextEntry: (value: boolean) => void
  cancelEditing: () => void
}) {
  return (
    <Flex gap="regular">
      <ToggleButton
        aria-label="show"
        isSelected={!secureTextEntry}
        onPress={() => setSecureTextEntry(bool => !bool)}
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
      <ActionButton onPress={cancelEditing}>Cancel</ActionButton>
    </Flex>
  )
}

/** Renders the editing state view with input fields and controls */
function EditingStateView({
  value,
  field,
  validationMessage,
  secureTextEntry,
  setSecureTextEntry,
  descriptionId,
  messageId,
  touched,
  setTouched,
  onChange,
  onEscape,
  cancelEditing,
}: {
  value: Extract<Value, { kind: 'editing' }>
  field: { label: string }
  validationMessage?: string
  secureTextEntry: boolean
  setSecureTextEntry: (value: boolean) => void
  descriptionId: string
  messageId: string
  touched: { value: boolean; confirm: boolean }
  setTouched: (touched: { value: boolean; confirm: boolean }) => void
  onChange: (value: Value) => void
  onEscape: (e: React.KeyboardEvent) => void
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
      <PasswordInputFields
        value={value}
        field={field}
        validationMessage={validationMessage}
        secureTextEntry={secureTextEntry}
        descriptionId={descriptionId}
        messageId={messageId}
        touched={touched}
        onChange={onChange}
        onEscape={onEscape}
        setTouched={setTouched}
      />
      <EditingActionButtons
        secureTextEntry={secureTextEntry}
        setSecureTextEntry={setSecureTextEntry}
        cancelEditing={cancelEditing}
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
        <ReadOnlyView value={value} />
      ) : value.kind === 'initial' ? (
        <InitialStateView
          value={value}
          field={field}
          autoFocus={autoFocus}
          onChange={onChange}
          triggerRef={triggerRef}
        />
      ) : (
        <EditingStateView
          value={value}
          field={field}
          validationMessage={validationMessage}
          secureTextEntry={secureTextEntry}
          setSecureTextEntry={setSecureTextEntry}
          descriptionId={descriptionId}
          messageId={messageId}
          touched={touched}
          setTouched={setTouched}
          onChange={onChange}
          onEscape={onEscape}
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

export function controller(config: FieldControllerConfig<PasswordFieldMeta>): FieldController<
  Value,
  boolean | null,
  { isSet?: boolean | null | undefined }
> & {
  validation: Validation
} {
  const validation: Validation = {
    ...config.fieldMeta.validation,
    match:
      config.fieldMeta.validation.match === null
        ? null
        : {
            regex: new RegExp(
              config.fieldMeta.validation.match.regex.source,
              config.fieldMeta.validation.match.regex.flags
            ),
            explanation: config.fieldMeta.validation.match.explanation,
          },
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
    filter:
      config.fieldMeta.isNullable === false
        ? undefined
        : {
            Filter(props) {
              const { autoFocus, context, typeLabel, onChange, value