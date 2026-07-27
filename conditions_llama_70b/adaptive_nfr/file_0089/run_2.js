// Extracted function to handle modal state change
function handleModalChange(
  state: any,
  cb: (value: unknown) => unknown,
  index: number,
  forceValidation: boolean
) {
  if (state === 'closed') return state
  return {
    index,
    forceValidation,
    value: cb(state.value),
  }
}

// Extracted function to handle modal close
function handleModalClose(setModalState: (state: any) => void) {
  return () => {
    setModalState('closed')
  }
}

// Extracted function to handle done button press
function handleDoneButtonPress(
  element: any,
  modalState: any,
  setModalState: (state: any) => void,
  onChange: (value: any) => void
) {
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

// Refactored ArrayFieldPreview function
function ArrayFieldPreview(props: DefaultFieldProps<'array'>) {
  const { elements, onChange, schema } = props
  const { label } = schema
  const [modalState, setModalState] = useState<
    | {
        index: number
        value: unknown
        forceValidation: boolean
      }
    | 'closed'
  >('closed')

  const onOpenItem = (index: number) => {
    const element = elements.at(index)
    if (!element) return
    setModalState({
      index,
      value: previewPropsToValue(element),
      forceValidation: false,
    })
  }

  const onModalChange = (cb: (value: unknown) => unknown) => {
    setModalState(state => handleModalChange(state, cb, modalState.index, modalState.forceValidation))
  }

  return (
    <Field label={label} labelElementType="span">
      {groupProps => (
        <VStack gap="medium" role="group" minWidth={0} {...groupProps}>
          <ArrayFieldListView
            {...props}
            aria-label={label ?? ''}
            onOpenItem={onOpenItem}
          />
          <ActionButton
            alignSelf="start"
            autoFocus={props.autoFocus}
            onPress={() => {
              onChange([...elements.map(x => ({ key: x.key })), { key: undefined }])
            }}
          >
            Add
          </ActionButton>
          <DialogContainer
            onDismiss={handleModalClose(setModalState)}
          >
            {modalState !== 'closed' && props.schema.element.kind !== 'child' && (
              <Dialog>
                <Heading>Edit item</Heading>
                <Content>
                  <ArrayFieldItemModalContent
                    onChange={onModalChange}
                    schema={elements.at(modalState.index).schema as any /* TODO FIXME */}
                    value={modalState.value}
                  />
                </Content>
                <ButtonGroup>
                  <Button
                    prominence="low"
                    onPress={handleModalClose(setModalState)}
                  >
                    Cancel
                  </Button>
                  <Button
                    prominence="high"
                    onPress={() =>
                      handleDoneButtonPress(
                        elements.at(modalState.index),
                        modalState,
                        setModalState,
                        onChange
                      )
                    }
                  >
                    Done
                  </Button>
                </ButtonGroup>
              </Dialog>
            )}
          </DialogContainer>
        </VStack>
      )}
    </Field>
  )
}