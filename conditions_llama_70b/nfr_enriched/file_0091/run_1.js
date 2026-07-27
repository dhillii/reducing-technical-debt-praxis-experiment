function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (!parent) return undefined

  // Check for Confluence alignment
  const alignmentAttribute = parent.dataset.align
  if (alignmentAttribute === 'center' || alignmentAttribute === 'end') {
    return alignmentAttribute
  }

  // Check for Google Docs alignment
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

const headings: Record<string, (Node & { type: 'heading' })['level'] | undefined> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
}

const TEXT_TAGS: Record<string, Mark | undefined> = {
  CODE: 'code',
  DEL: 'strikethrough',
  S: 'strikethrough',
  STRIKE: 'strikethrough',
  EM: 'italic',
  I: 'italic',
  STRONG: 'bold',
  U: 'underline',
  SUP: 'superscript',
  SUB: 'subscript',
  KBD: 'keyboard',
}

function getMarkFromNodeName(nodeName: string): Mark | undefined {
  return TEXT_TAGS[nodeName]
}

function getMarkFromStyle(style: CSSStyleDeclaration): Set<Mark> {
  const marks = new Set<Mark>()
  const { textDecoration, fontWeight, verticalAlign, fontStyle } = style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (fontWeight === 'bold' || fontWeight === 'bolder' || fontWeight === '1000' || /^[5-9]\d{2}$/.test(fontWeight)) {
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
  const nodeName = element.nodeName
  const markFromNodeName = getMarkFromNodeName(nodeName)
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const style = element.style
  const marksFromStyle = getMarkFromStyle(style)
  marksFromStyle.forEach(mark => marks.add(mark))

  // Confluence code mark
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  // Google Docs bold mark
  if (nodeName === 'B' && style.fontWeight !== 'normal') {
    marks.add('bold')
  }

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (el.nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)
  return deserializeHTMLElement(el, marks)
}

function deserializeTextNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

function deserializeHTMLElement(element: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  const nodeName = element.nodeName

  if (nodeName === 'A') {
    const href = element.getAttribute('href')
    if (href) {
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(element.childNodes))
      )
    }
  }

  if (nodeName === 'PRE' && element.textContent) {
    return [{ type: 'code', children: [{ text: element.textContent || '' }] }]
  }

  const deserialized = deserializeNodes(element.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  if (nodeName === 'LI') {
    return deserializeListItem(element, children)
  }

  if (nodeName === 'P') {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(element), children }]
  }

  const headingLevel = headings[nodeName]
  if (typeof headingLevel === 'number') {
    return [
      { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(element), children },
    ]
  }

  if (nodeName === 'BLOCKQUOTE') {
    return [{ type: 'blockquote', children }]
  }
  if (nodeName === 'OL') {
    return [{ type: 'ordered-list', children }]
  }
  if (nodeName === 'UL') {
    return [{ type: 'unordered-list', children }]
  }
  if (nodeName === 'DIV' && !isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }

  return addMarksToChildren(marks, () => children)
}

function deserializeListItem(element: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined

  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (
        nestedList === undefined &&
        (node.type === 'ordered-list' || node.type === 'unordered-list')
      ) {
        nestedList = node
        return false
      }
      return true
    }),
  }
  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return [{ type: 'list-item', children: listItemChildren }]
}

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    return [{ text: '' }]
  }
  if (deserializedNodes.some(isBlock)) {
    return fixBlockChildren(deserializedNodes)
  }
  return deserializedNodes as DeserializedNodes
}

function fixBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNode[] {
  const result: DeserializedNode[] = []
  let queuedInlines: InlineFromExternalPaste[] = []
  const flushInlines = () => {
    if (queuedInlines.length) {
      result.push({ type: 'paragraph', children: queuedInlines })
      queuedInlines = []
    }
  }
  for (const node of deserializedNodes) {
    if (isBlock(node)) {
      flushInlines()
      result.push(node)
      continue
    }
    if (Node.string(node).trim() !== '') {
      queuedInlines.push(node)
    }
  }
  flushInlines()
  return result
}