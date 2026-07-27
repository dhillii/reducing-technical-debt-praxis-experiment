function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (isInitialValue(value) && isRequired) {
    return `${fieldLabel} is required`
  }
  if (isInitialValue(value) && !isRequired) {
    return undefined
  }
  if (isEditingValue(value) && !doPasswordsMatch(value)) {
    return `The passwords do not match`
  }
  if (isEditingValue(value)) {
    return validateEditingValue(value, validation, fieldLabel)
  }
  return undefined
}

function isInitialValue(value: Value): boolean {
  return value.kind === 'initial'
}

function isEditingValue(value: Value): boolean {
  return value.kind === 'editing'
}

function doPasswordsMatch(value: Value): boolean {
  return value.value === value.confirm
}

function validateEditingValue(
  value: Value,
  validation: Validation,
  fieldLabel: string
): string | undefined {
  if (!isValidLength(value.value, validation.length, fieldLabel)) {
    return getLengthErrorMessage(value.value, validation.length, fieldLabel)
  }
  if (validation.match && !validation.match.regex.test(value.value)) {
    return validation.match.explanation
  }
  if (validation.rejectCommon && dumbPasswords.check(value.value)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return undefined
}

function isValidLength(
  value: string,
  lengthValidation: { min: number; max: number | null },
  fieldLabel: string
): boolean {
  return (
    value.length >= lengthValidation.min &&
    (lengthValidation.max === null || value.length <= lengthValidation.max)
  )
}

function getLengthErrorMessage(
  value: string,
  lengthValidation: { min: number; max: number | null },
  fieldLabel: string
): string {
  if (value.length < lengthValidation.min) {
    if (lengthValidation.min === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${lengthValidation.min} characters long`
  }
  if (lengthValidation.max !== null && value.length > lengthValidation.max) {
    return `${fieldLabel} must be no longer than ${lengthValidation.max} characters`
  }
  return ''
}