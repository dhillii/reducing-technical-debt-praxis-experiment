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

/** Validates editing state password constraints */
function validateEditingState(
  value: Value,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (value.kind !== 'editing') {
    return undefined
  }

  if (value.confirm !== value.value) {
    return `The passwords do not match`
  }

  const val = value.value

  const minLengthError = validateMinLength(val, validation.length.min, fieldLabel)
  if (minLengthError) return minLengthError

  const maxLengthError = validateMaxLength(val, validation.length.max, fieldLabel)
  if (maxLengthError) return maxLengthError

  const regexError = validateRegexMatch(val, validation.match)
  if (regexError) return regexError

  const commonError = validateCommonPassword(val, validation.rejectCommon, fieldLabel)
  if (commonError) return commonError

  return undefined
}

/** Validates initial state requirements */
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

function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  const initialError = validateInitialState(value, isRequired, fieldLabel)
  if (initialError) return initialError

  return validateEditingState(value, validation, fieldLabel)
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

/** Renders the readonly state of the password field */
function ReadOnlyField({ value }: { value: Value }) {
  return <Checkbox {...readonlyCheckboxProps(value.isSet)} />
}

/** Renders the initial state with action button to start editing */
function InitialField({
  value,
  field,
  autoFocus,
  onChange,
  triggerRef,
}: {
  value: Value & { kind: 'initial' }
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

/** Renders password input fields and controls */
function EditingField({
  value,
  field,
  validationMessage,
  secureTextEntry,
  setSecureTextEntry,
  touched,
  setTouched,
  onChange,
  onEscape,
  cancelEditing,
  descriptionId,
  messageId,
}: {
  value: Value & { kind: 'editing' }
  field: { label: string }
  validationMessage?: string
  secureTextEntry: boolean
  setSecureTextEntry: (value: boolean) => void
  touched: { value: boolean; confirm: boolean }
  setTouched: (touched: { value: boolean; confirm: boolean }) => void
  onChange: (value: Value) => void
  onEscape: (e: React.KeyboardEvent) => void
  cancelEditing: () => void
  descriptionId: string
  messageId: string
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
          onChange={onChange!}
          triggerRef={triggerRef}
        />
      ) : (
        <EditingField
          value={value}
          field={field}
          validationMessage={validationMessage}
          secureTextEntry={secureTextEntry}
          setSecureTextEntry={setSecureTextEntry}
          touched={touched}
          setTouched={setTouched}
          onChange={onChange!}
          onEscape={onEscape}
          cancelEditing={cancelEditing}
          descriptionId={descriptionId}
          messageId={messageId}
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

/** Builds the validation regex from serialized format */
function buildValidationRegex(
  match: PasswordFieldMeta['validation']['match']
): Validation['match'] {
  if (match === null) return null
  return {
    regex: new RegExp(match.regex.source, match.regex.flags),
    explanation: match.explanation,
  }
}

/** Builds the validation object from field metadata */
function buildValidation(fieldMeta: PasswordFieldMeta): Validation {
  return {
    ...fieldMeta.validation,
    match: buildValidationRegex(fieldMeta.validation.match),
  }
}

export function controller(config: FieldControllerConfig<PasswordFieldMeta>): FieldController<
  Value,
  boolean | null,
  { isSet?: boolean | null | undefined }
> & {
  validation: Validation
} {
  const validation = buildValidation(config.fieldMeta)

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
                [config.fieldKey]: {
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
          },
  }
}
```