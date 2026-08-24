function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const alignment = getAlignmentFromConfluenceData(element)
  if (alignment) {
    return alignment
  }

  return getAlignmentFromTextStyle(element)
}

function getAlignmentFromConfluenceData(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const alignment = parent?.dataset.align

  if (alignment === 'center' || alignment === 'end') {
    return alignment
  }
}

function getAlignmentFromTextStyle(element: globalThis.Element): 'center' | 'end' | undefined {
  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const textAlign = element.style.textAlign

  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }
}