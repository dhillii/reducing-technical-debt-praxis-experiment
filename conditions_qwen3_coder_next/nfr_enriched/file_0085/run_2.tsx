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
  return validatePasswordLength(value.value, validation, fieldLabel) ??
    validatePasswordPattern(value.value, validation, fieldLabel) ??
    validateCommonPassword(value.value, validation, fieldLabel)
}

function validatePasswordLength(value: string, validation: Validation, fieldLabel: string): string | undefined {
  if (value.length < validation.length.min) {
    if (validation.length.min === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${validation.length.min} characters long`
  }
  if (validation.length.max !== null && value.length > validation.length.max) {
    return `${fieldLabel} must be no longer than ${validation.length.max} characters`
  }
  return undefined
}

function validatePasswordPattern(value: string, validation: Validation, fieldLabel: string): string | undefined {
  if (validation.match && !validation.match.regex.test(value)) {
    return validation.match.explanation
  }
  return undefined
}

function validateCommonPassword(value: string, validation: Validation, fieldLabel: string): string | undefined {
  if (validation.rejectCommon && dumbPasswords.check(value)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}