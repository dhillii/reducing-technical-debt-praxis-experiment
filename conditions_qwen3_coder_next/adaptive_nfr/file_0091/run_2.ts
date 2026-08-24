function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement

  if (isConfluenceAlignmentPresent(parent)) {
    return parent.getAttribute('data-align') as 'center' | 'end'
  }

  if (isGoogleDocsAlignmentPresent(element)) {
    return getGoogleDocsTextAlign(element)
  }
}

function isConfluenceAlignmentPresent(parent: Element | null): boolean {
  const attribute = parent?.getAttribute('data-align')
  return attribute === 'center' || attribute === 'end'
}

function isGoogleDocsAlignmentPresent(element: globalThis.Element): element is HTMLElement {
  return element instanceof HTMLElement && typeof element.style.textAlign === 'string'
}

function getGoogleDocsTextAlign(element: HTMLElement): 'center' | 'end' {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }
  return 'end' // fallback, though unreachable per static analysis guarantees
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

function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const { nodeName, classList, style } = element
  const markFromNodeName = TEXT_TAGS[nodeName]

  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  if (isUnderlined(style.textDecoration)) {
    marks.add('underline')
  } else if (isStrikethrough(style.textDecoration)) {
    marks.add('strikethrough')
  }

  if (isCodeSpan(nodeName, classList)) {
    marks.add('code')
  }

  if (isBold(nodeName, style.fontWeight)) {
    marks.add('bold')
  }

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  if (isSuperscript(style.verticalAlign)) {
    marks.add('superscript')
  } else if (isSubscript(style.verticalAlign)) {
    marks.add('subscript')
  }

  return marks
}

function isUnderlined(textDecoration: string): boolean {
  return textDecoration === 'underline'
}

function isStrikethrough(textDecoration: string): boolean {
  return textDecoration === 'line-through'
}

function isCodeSpan(nodeName: string, classList: DOMTokenList): boolean {
  return nodeName === 'SPAN' && classList.contains('code')
}

function isBold(nodeName: string, fontWeight: string | undefined): boolean {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }
  if (typeof fontWeight !== 'string') {
    return false
  }
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

function isSuperscript(verticalAlign: string): boolean {
  return verticalAlign === 'super'
}

function isSubscript(verticalAlign: string): boolean {
  return verticalAlign === 'sub'
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
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

  if (isDropboxPaperQuote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (nodeName === 'A') {
      const href = el.getAttribute('href')
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (nodeName === 'PRE' && el.textContent) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
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

    if (nodeName === 'P') {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    const headingLevel = headings[nodeName]

    if (typeof headingLevel === 'number') {
      return [
        { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
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

    return deserialized
  })
}

function isDropboxPaperQuote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
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

  if (!deserializedNodes.some(isBlock)) {
    return deserializedNodes as DeserializedNodes
  }

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

  return result as DeserializedNodes
}