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

function isEmpty(value: string): boolean {
  return value.length === 0
}

function validateLength(
  value: string,
  min: number,
  max: number | null,
  fieldLabel: string
): string | undefined {
  if (value.length < min) {
    if (min === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${min} characters long`
  }
  if (max !== null && value.length > max) {
    return `${fieldLabel} must be no longer than ${max} characters`
  }
  return undefined
}

function validateMatch(
  value: string,
  match: Validation['match']
): string | undefined {
  if (match && !match.regex.test(value)) {
    return match.explanation
  }
  return undefined
}

function validateCommon(
  value: string,
  rejectCommon: boolean,
  fieldLabel: string
): string | undefined {
  if (rejectCommon && dumbPasswords.check(value)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

function validateRequired(
  value: Value,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial' && isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

function validateEditing(
  value: Value,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (value.kind !== 'editing') return undefined
  if (value.confirm !== value.value) {
    return `The passwords do not match`
  }
  const val = value.value
  const lengthError = validateLength(val, validation.length.min, validation.length.max, fieldLabel)
  if (lengthError) return lengthError
  const matchError = validateMatch(val, validation.match)
  if (matchError) return matchError
  const commonError = validateCommon(val, validation.rejectCommon, fieldLabel)
  if (commonError) return commonError
  return undefined
}

export function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (value.kind === 'initial' && (value.isSet === null || value.isSet === true)) {
    return undefined
  }
  const requiredError = validateRequired(value, isRequired, fieldLabel)
  if (requiredError) return requiredError
  return validateEditing(value, validation, fieldLabel)
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
    if (isEmpty(value.value) && isEmpty(value.confirm)) {
      cancelEditing()
    }
  }

  useEffect(() => {
    if (value.kind === 'initial') {
      setTouched({ value: false, confirm: false })
      setSecureTextEntry(true)
    }
  }, [value.kind])

  const renderReadOnly = () => <Checkbox {...readonlyCheckboxProps(value.isSet)} />

  const renderInitial = () => (
    <ActionButton
      ref={triggerRef}
      alignSelf="start"
      autoFocus={autoFocus}
      onPress={() => {
        onChange?.({
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

  const renderEditing = () => (
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
        onChange={text => onChange?.({ ...value, value: text })}
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
        onChange={text => onChange?.({ ...value, confirm: text })}
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
      {isReadOnly
        ? renderReadOnly()
        : value.kind === 'initial'
        ? renderInitial()
        : renderEditing()}
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

export function controller(
  config: FieldControllerConfig<PasswordFieldMeta>
): FieldController<
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

  const createFilter = () => ({
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
    parseGraphQL: (value: any) => {
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
  })

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
    deserialize: data => ({
      kind: 'initial',
      isSet: data[config.fieldKey]?.isSet ?? null,
    }),
    serialize: value => {
      if (value.kind === 'initial') return {}
      return { [config.fieldKey]: value.value }
    },
    filter:
      config.fieldMeta.isNullable === false
        ? undefined
        : createFilter(),
  }
}