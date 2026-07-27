// Extracted function to handle modal state change
function handleModalChange(
  state: { index: number; value: unknown; forceValidation: boolean } | 'closed',
  cb: (value: unknown) => unknown
): { index: number; value: unknown; forceValidation: boolean } | 'closed' {
  if (state === 'closed') return state
  return {
    index: state.index,
    forceValidation: state.forceValidation,
    value: cb(state.value),
  }
}

// Extracted function to handle modal validation
function handleModalValidation(
  element: GenericPreviewProps<ComponentSchema, unknown>,
  modalState: { index: number; value: unknown; forceValidation: boolean } | 'closed'
): void {
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

  const handleOpenItem = (index: number) => {
    const element = elements.at(index)
    if (!element) return
    setModalState({
      index,
      value: previewPropsToValue(element),
      forceValidation: false,
    })
  }

  return (
    <Field label={label} labelElementType="span">
      {groupProps => (
        <VStack gap="medium" role="group" minWidth={0} {...groupProps}>
          <ArrayFieldListView
            {...props}
            aria-label={label ?? ''}
            onOpenItem={handleOpenItem}
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
            onDismiss={() => {
              setModalState('closed')
            }}
          >
            {modalState !== 'closed' && (
              <Dialog>
                <Heading>Edit item</Heading>
                <Content>
                  <ArrayFieldItemModalContent
                    onChange={(cb: (value: unknown) => unknown) =>
                      setModalState(state => handleModalChange(state, cb))
                    }
                    schema={elements.at(modalState.index).schema as any}
                    value={modalState.value}
                  />
                </Content>
                <ButtonGroup>
                  <Button
                    prominence="low"
                    onPress={() => {
                      setModalState('closed')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    prominence="high"
                    onPress={() => handleModalValidation(elements.at(modalState.index), modalState)}
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