function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const alignment = parent?.dataset.align
  if (alignment === 'center' || alignment === 'end') {
    return alignment
  }

  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
  }
}

function extractMarksFromNodeName(nodeName: string, element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
  return marks
}

function extractMarksFromStyles(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { fontWeight, textDecoration, fontStyle, verticalAlign } = element.style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (element.nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  if (element.nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  } else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  ) {
    marks.add('bold')
  }

  if (fontStyle === 'italic') {
    marks.add('italic')
  }

  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()

  const nameBasedMarks = extractMarksFromNodeName(element.nodeName, element)
  nameBasedMarks.forEach(mark => marks.add(mark))

  const styleBasedMarks = extractMarksFromStyles(element)
  styleBasedMarks.forEach(mark => marks.add(mark))

  return marks
}