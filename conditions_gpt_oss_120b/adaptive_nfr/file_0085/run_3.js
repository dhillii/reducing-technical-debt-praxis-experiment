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

/**
 * Validate a password field value against its validation rules.
 */
function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  const validators: Record<Value['kind'], (v: any) => string | undefined> = {
    initial: v => validateInitial(v, isRequired, fieldLabel),
    editing: v => validateEditing(v, validation, fieldLabel),
  }
  return validators[value.kind](value)
}

/**
 * Validation for the initial (non‑editing) state.
 */
function validateInitial(
  value: { isSet: boolean | null },
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.isSet === null || value.isSet === true) {
    return undefined
  }
  if (isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

/**
 * Validation for the editing state.
 */
function validateEditing(
  value: { value: string; confirm: string },
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (value.confirm !== value.value) {
    return `The passwords do not match`
  }

  const val = value.value

  const minLengthError = checkMinLength(val, validation.length.min, fieldLabel)
  if (minLengthError) return minLengthError

  const maxLengthError = checkMaxLength(val, validation.length.max, fieldLabel)
  if (maxLengthError) return maxLengthError

  const matchError = checkMatch(val, validation.match)
  if (matchError) return matchError

  const rejectCommonError = checkRejectCommon(val, validation.rejectCommon, fieldLabel)
  if (rejectCommonError) return rejectCommonError

  return undefined
}

/**
 * Check that the value meets the minimum length requirement.
 */
function checkMinLength(
  val: string,
  min: number,
  fieldLabel: string
): string | undefined {
  if (val.length < min) {
    return min === 1
      ? `${fieldLabel} must not be empty`
      : `${fieldLabel} must be at least ${min} characters long`
  }
  return undefined
}

/**
 * Check that the value does not exceed the maximum length, if defined.
 */
function checkMaxLength(
  val: string,
  max: number | null,
  fieldLabel: string
): string | undefined {
  if (max !== null && val.length > max) {
    return `${fieldLabel} must be no longer than ${max} characters`
  }
  return undefined
}

/**
 * Validate the value against a custom regular expression, if provided.
 */
function checkMatch(
  val: string,
  match: Validation['match']
): string | undefined {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return undefined
}

/**
 * Reject common passwords using the dumb‑passwords library, if enabled.
 */
function checkRejectCommon(
  val: string,
  rejectCommon: boolean,
  fieldLabel: string
): string | undefined {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
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
        <Checkbox {...readonlyCheckboxProps(value.isSet)} />
      ) : value.kind === 'initial' ? (
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
      ) : (
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
            aria-describedby={messageId} // don't repeat the description announcement for the confirm field
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