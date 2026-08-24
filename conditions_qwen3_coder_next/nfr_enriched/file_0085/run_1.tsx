function validate(value: Value, validation: Validation, isRequired: boolean, fieldLabel: string): string | undefined {
  if (value.kind === 'initial') {
    return handleInitialValue(value, isRequired, fieldLabel)
  }
  if (value.kind === 'editing') {
    return handleEditingValue(value, validation, fieldLabel)
  }
  return undefined
}

function handleInitialValue(value: Value, isRequired: boolean, fieldLabel: string): string | undefined {
  if (value.isSet === null || value.isSet === true) {
    return undefined
  }
  if (isRequired) {
    return `${fieldLabel} is required`
  }
  return undefined
}

function handleEditingValue(value: Value, validation: Validation, fieldLabel: string): string | undefined {
  if (value.confirm !== value.value) {
    return `The passwords do not match`
  }
  const val = value.value
  const lengthError = validateLength(val, validation.length, fieldLabel)
  if (lengthError) {
    return lengthError
  }
  const matchError = validatePattern(val, validation.match, fieldLabel)
  if (matchError) {
    return matchError
  }
  if (validation.rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

function validateLength(value: string, length: Validation['length'], fieldLabel: string): string | undefined {
  if (value.length < length.min) {
    if (length.min === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${length.min} characters long`
  }
  if (length.max !== null && value.length > length.max) {
    return `${fieldLabel} must be no longer than ${length.max} characters`
  }
  return undefined
}

function validatePattern(value: string, match: Validation['match'], fieldLabel: string): string | undefined {
  if (!match) {
    return undefined
  }
  if (!match.regex.test(value)) {
    return match.explanation
  }
  return undefined
}