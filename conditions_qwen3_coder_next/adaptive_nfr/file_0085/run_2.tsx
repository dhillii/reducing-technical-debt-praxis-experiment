function validate(
  value,
  validation,
  isRequired,
  fieldLabel
) {
  if (isInitialAndNotModified(value)) return undefined
  if (isInitialAndRequiredButNotSet(value, isRequired)) return `${fieldLabel} is required`
  if (hasMismatchInEditingMode(value)) return `The passwords do not match`
  return validateEditingValue(value, validation, fieldLabel)
}

function isInitialAndNotModified(value) {
  return value.kind === 'initial' && (value.isSet === null || value.isSet === true)
}

function isInitialAndRequiredButNotSet(value, isRequired) {
  return value.kind === 'initial' && isRequired
}

function hasMismatchInEditingMode(value) {
  return value.kind === 'editing' && value.confirm !== value.value
}

function validateEditingValue(value, validation, fieldLabel) {
  if (value.kind !== 'editing') return undefined
  
  const val = value.value
  const lengthErrors = validateLength(val, validation.length, fieldLabel)
  if (lengthErrors) return lengthErrors
  
  const matchErrors = validateMatch(val, validation.match, fieldLabel)
  if (matchErrors) return matchErrors
  
  const rejectionErrors = validateCommonRejection(val, validation.rejectCommon, fieldLabel)
  if (rejectionErrors) return rejectionErrors
  
  return undefined
}

function validateLength(val, length, fieldLabel) {
  if (val.length < length.min) {
    return length.min === 1 
      ? `${fieldLabel} must not be empty` 
      : `${fieldLabel} must be at least ${length.min} characters long`
  }
  if (length.max !== null && val.length > length.max) {
    return `${fieldLabel} must be no longer than ${length.max} characters`
  }
  return undefined
}

function validateMatch(val, match, fieldLabel) {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return undefined
}

function validateCommonRejection(val, rejectCommon, fieldLabel) {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

function readonlyCheckboxProps(isSet) {
  const isIndeterminate = isSet == null
  const isSelected = isSet == null ? undefined : isSet
  return {
    children: isIndeterminate ? 'Access denied' : 'Value is set',
    isIndeterminate,
    isReadOnly: true,
    isSelected,
    prominence: 'low',
  }
}

export function Field(props) {
  const { autoFocus, field, forceValidation, onChange, value } = props

  const [secureTextEntry, setSecureTextEntry] = useState(true)
  const [touched, setTouched] = useState({ value: false, confirm: false })
  const triggerRef = useRef(null)

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
  const onEscape = (e) => {
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

export const Cell = ({ value }) => {
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

export function controller(config) {
  const validation = {
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