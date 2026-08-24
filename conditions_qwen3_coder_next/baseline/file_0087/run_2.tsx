const onSelectionChange = (key: Key | null) => {
  if (!onChange) return

  const option = field.options.find(opt => opt.value === key)
  const newValue: Value['value'] = option ?? null

  onChange({ ...value, value: newValue })
  setDirty(true)
}