function validate(
  value: Value,
  validation: Validation,
  isRequired: boolean,
  fieldLabel: string
): string | undefined {
  if (isInitialValue(value) && isRequired) {
    return `${fieldLabel} is required`
  }
  if (isEditingValue(value) && !doPasswordsMatch(value)) {
    return `The passwords do not match`
  }
  if (isEditingValue(value)) {
    const val = value.value
    if (!meetsLengthRequirements(val, validation.length)) {
      return getLengthErrorMessage(fieldLabel, validation.length)
    }
    if (!meetsRegexRequirements(val, validation.match)) {
      return validation.match?.explanation
    }
    if (validation.rejectCommon && isCommonPassword(val)) {
      return `${fieldLabel} is too common and is not allowed`
    }
  }
  return undefined
}

function isInitialValue(value: Value): boolean {
  return value.kind === 'initial' && (value.isSet === null || value.isSet === true)
}

function isEditingValue(value: Value): boolean {
  return value.kind === 'editing'
}

function doPasswordsMatch(value: Value): boolean {
  return value.kind === 'editing' && value.confirm === value.value
}

function meetsLengthRequirements(val: string, length: { min: number; max: number | null }): boolean {
  return val.length >= length.min && (length.max === null || val.length <= length.max)
}

function getLengthErrorMessage(fieldLabel: string, length: { min: number; max: number | null }): string {
  if (length.min === 1) {
    return `${fieldLabel} must not be empty`
  }
  if (length.max !== null) {
    return `${fieldLabel} must be between ${length.min} and ${length.max} characters long`
  }
  return `${fieldLabel} must be at least ${length.min} characters long`
}

function meetsRegexRequirements(val: string, match: { regex: RegExp; explanation: string } | null): boolean {
  return match === null || match.regex.test(val)
}

function isCommonPassword(val: string): boolean {
  return dumbPasswords.check(val)
}