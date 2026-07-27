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
    if (!meetsLengthRequirements(val, validation.length, fieldLabel)) {
      return undefined
    }
    if (!meetsRegexRequirements(val, validation.match, fieldLabel)) {
      return undefined
    }
    if (!meetsCommonPasswordRequirements(val, validation.rejectCommon, fieldLabel)) {
      return undefined
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
  return value.value === value.confirm
}

function meetsLengthRequirements(val: string, length: { min: number; max: number | null }, fieldLabel: string): boolean {
  if (val.length < length.min) {
    if (length.min === 1) {
      return `${fieldLabel} must not be empty`
    }
    return `${fieldLabel} must be at least ${length.min} characters long`
  }
  if (length.max !== null && val.length > length.max) {
    return `${fieldLabel} must be no longer than ${length.max} characters`
  }
  return true
}

function meetsRegexRequirements(val: string, match: { regex: RegExp; explanation: string } | null, fieldLabel: string): boolean {
  if (match && !match.regex.test(val)) {
    return match.explanation
  }
  return true
}

function meetsCommonPasswordRequirements(val: string, rejectCommon: boolean, fieldLabel: string): boolean {
  if (rejectCommon && dumbPasswords.check(val)) {
    return `${fieldLabel} is too common and is not allowed`
  }
  return true
}