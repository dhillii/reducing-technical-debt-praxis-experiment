function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  // confluence
  const alignment = parent?.dataset.align
  // note: we don't show html that confluence would parse as alignment
  // we could change that but meh
  // (they match on div.fabric-editor-block-mark with data-align)
  if (alignment === 'center' || alignment === 'end') {
    return alignment as 'center' | 'end'
  }
  if (element instanceof HTMLElement) {
    // Google docs
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    // TODO: RTL things?
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
  }
}