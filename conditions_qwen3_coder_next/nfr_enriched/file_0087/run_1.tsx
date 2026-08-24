const onSelectionChange = (key: Key | null, onChange: (value: Value) => void, field: any, setValue: (v: Value) => void, setDirty: () => void) => {
  if (!onChange) return

  const newValue = findOptionByValue(field.options, key) ?? null
  const updatedValue = { ...getValueForUpdate(field.options, key), value: newValue }

  onChange(updatedValue)
  setDirty()
}

const findOptionByValue = (options: any[], key: Key | null) => {
  return options.find(opt => opt.value === key) ?? null
}

const getValueForUpdate = (options: any[], key: Key | null) => {
  return { value: findOptionByValue(options, key) ?? null }
}

const onNullChange = (isChecked: boolean, onChange: (value: Value) => void, value: Value, preNullValue: any, setPreNullValue: (v: any) => void, setDirty: () => void, field: any) => {
  if (!onChange) return

  if (isChecked) {
    onChange({ ...value, value: null })
    setPreNullValue(value.value)
  } else {
    const restoredValue = preNullValue || field.options[0]
    onChange({ ...value, value: restoredValue })
  }
  setDirty()
}

const getSelectedKey = (value: Value, preNullValue: any, isRequired: boolean) => {
  if (!isRequired && value.value?.value == null) return null
  return value.value?.value || preNullValue?.value || null
}

const getErrorMessage = (isInvalid: boolean, isDirty: boolean, forceValidation: boolean, fieldLabel: string) => {
  if (isInvalid && (isDirty || forceValidation)) {
    return `${fieldLabel} is required.`
  }
  return undefined
}

const renderFieldElement = (field: any, selectedKey: Key | null, autoFocus: boolean, isRequired: boolean, isReadOnly: boolean, isNull: boolean, errorMessage: string | undefined, onSelectionChange: (key: Key | null) => void, longestLabelLength: number) => {
  switch (field.displayMode) {
    case 'segmented-control':
      return renderSegmentedControl(field, selectedKey, autoFocus, isRequired, isReadOnly, isNull, errorMessage, onSelectionChange)
    case 'radio':
      return renderRadioGroup(field, selectedKey, autoFocus, isRequired, isReadOnly, isNull, errorMessage, onSelectionChange)
    default:
      return renderPicker(field, selectedKey, autoFocus, isRequired, isReadOnly, isNull, errorMessage, onSelectionChange, longestLabelLength)
  }
}

const renderSegmentedControl = (field: any, selectedKey: Key | null, autoFocus: boolean, isRequired: boolean, isReadOnly: boolean, isNull: boolean, errorMessage: string | undefined, onSelectionChange: (key: Key | null) => void) => {
  return (
    <SegmentedControl
      label={field.label}
      description={field.description}
      errorMessage={errorMessage}
      isDisabled={isNull}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      items={field.options}
      onChange={onSelectionChange}
      value={selectedKey}
      textValue={field.options.find(item => item.value === selectedKey)?.label || ''}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </SegmentedControl>
  )
}

const renderRadioGroup = (field: any, selectedKey: Key | null, autoFocus: boolean, isRequired: boolean, isReadOnly: boolean, isNull: boolean, errorMessage: string | undefined, onSelectionChange: (key: Key | null) => void) => {
  return (
    <RadioGroup
      label={field.label}
      description={field.description}
      errorMessage={errorMessage}
      isDisabled={isNull}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      onChange={onSelectionChange}
      value={selectedKey ?? null}
    >
      {field.options.map(item => (
        <Radio key={item.value} value={item.value}>
          {item.label}
        </Radio>
      ))}
    </RadioGroup>
  )
}

const renderPicker = (field: any, selectedKey: Key | null, autoFocus: boolean, isRequired: boolean, isReadOnly: boolean, isNull: boolean, errorMessage: string | undefined, onSelectionChange: (key: Key | null) => void, longestLabelLength: number) => {
  return (
    <Picker
      autoFocus={autoFocus}
      label={field.label}
      description={field.description}
      errorMessage={errorMessage}
      isDisabled={isNull}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      items={field.options}
      onSelectionChange={onSelectionChange}
      selectedKey={selectedKey}
      flex={{ mobile: true, desktop: 'initial' }}
      UNSAFE_style={{
        fontSize: tokenSchema.typography.text.regular.size,
        width: `clamp(${tokenSchema.size.alias.singleLineWidth}, calc(${longestLabelLength}ex + ${tokenSchema.size.icon.regular}), 100%)`,
      }}
    >
      {item => <Item key={item.value}>{item.label}</Item>}
    </Picker>
  )
}