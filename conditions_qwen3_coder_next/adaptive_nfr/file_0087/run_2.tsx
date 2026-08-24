const onSelectionChange = (key: Key | null) => {
  if (!onChange) return

  const newValue: Value['value'] = field.options.find(opt => opt.value === key) ?? null
  onChange({ ...value, value: newValue })
  setDirty(true)
}

const onNullChange = (isChecked: boolean) => {
  if (!onChange) return

  if (isChecked) {
    onChange({ ...value, value: null })
    setPreNullValue(value.value)
  } else {
    onChange({ ...value, value: preNullValue || field.options[0] })
  }
  setDirty(true)
}

const renderFieldElement = () => {
  switch (field.displayMode) {
    case 'segmented-control':
      return renderSegmentedControl()
    case 'radio':
      return renderRadioGroup()
    default:
      return renderPicker()
  }
}

const renderSegmentedControl = () => (
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

const renderRadioGroup = () => (
  <RadioGroup
    label={field.label}
    description={field.description}
    errorMessage={errorMessage}
    isDisabled={isNull}
    isReadOnly={isReadOnly}
    isRequired={isRequired}
    onChange={onSelectionChange}
    value={value.value?.value ?? preNullValue?.value}
  >
    {field.options.map(item => (
      <Radio key={item.value} value={item.value}>
        {item.label}
      </Radio>
    ))}
  </RadioGroup>
)

const renderPicker = () => (
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