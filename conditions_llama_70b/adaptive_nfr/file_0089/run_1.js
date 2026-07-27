const element = elements.at(modalState.index)
if (!element) return
const onModalChange = useCallback((cb: (value: unknown) => unknown) => {
  setModalState(state => {
    if (state === 'closed') return state
    return {
      index: modalState.index,
      forceValidation: state.forceValidation,
      value: cb(state.value),
    }
  })
}, [modalState.index, modalState.forceValidation, modalState.value])

// ...

const handleModalChange = (cb: (value: unknown) => unknown) => {
  onModalChange(cb)
}

// ...

const handleModalClose = () => {
  setModalState('closed')
}

// ...

const handleModalSave = () => {
  if (!clientSideValidateProp(element.schema, modalState.value)) {
    setModalState(state => ({
      ...(state as any),
      forceValidation: true,
    }))
    return
  }
  previewPropsOnChange(modalState.value, element)
  setModalState('closed')
}

// ...

return (
  <DialogContainer
    onDismiss={handleModalClose}
  >
    {modalState !== 'closed' && (
      <Dialog>
        <Heading>Edit item</Heading>
        <Content>
          <ArrayFieldItemModalContent
            onChange={handleModalChange}
            schema={element.schema as any /* TODO FIXME */}
            value={modalState.value}
          />
        </Content>
        <ButtonGroup>
          <Button
            prominence="low"
            onPress={handleModalClose}
          >
            Cancel
          </Button>
          <Button
            prominence="high"
            onPress={handleModalSave}
          >
            Done
          </Button>
        </ButtonGroup>
      </Dialog>
    )}
  </DialogContainer>
)