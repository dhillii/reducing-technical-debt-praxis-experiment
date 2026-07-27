function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (!parent) return undefined

  const attribute = parent.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }

  if (!(element instanceof HTMLElement)) return undefined

  const textAlign = element.style.textAlign
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'

  return undefined
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

function hasMarkFromNodeName(element: globalThis.HTMLElement): boolean {
  return !!TEXT_TAGS[element.nodeName]
}

function getMarkFromNodeName(element: globalThis.HTMLElement): Mark | undefined {
  return TEXT_TAGS[element.nodeName]
}

function hasUnderlineMark(element: globalThis.HTMLElement): boolean {
  return element.style.textDecoration === 'underline'
}

function hasStrikethroughMark(element: globalThis.HTMLElement): boolean {
  return element.style.textDecoration === 'line-through'
}

function hasBoldMark(element: globalThis.HTMLElement): boolean {
  const fontWeight = element.style.fontWeight
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

function hasItalicMark(element: globalThis.HTMLElement): boolean {
  return element.style.fontStyle === 'italic'
}

function hasSuperscriptMark(element: globalThis.HTMLElement): boolean {
  return element.style.verticalAlign === 'super'
}

function hasSubscriptMark(element: globalThis.HTMLElement): boolean {
  return element.style.verticalAlign === 'sub'
}

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  if (hasMarkFromNodeName(element)) {
    marks.add(getMarkFromNodeName(element) as Mark)
  }
  if (hasUnderlineMark(element)) {
    marks.add('underline')
  } else if (hasStrikethroughMark(element)) {
    marks.add('strikethrough')
  }
  if (element.nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }
  if (element.nodeName === 'B' && element.style.fontWeight !== 'normal') {
    marks.add('bold')
  } else if (hasBoldMark(element)) {
    marks.add('bold')
  }
  if (hasItalicMark(element)) {
    marks.add('italic')
  }
  if (hasSuperscriptMark(element)) {
    marks.add('superscript')
  } else if (hasSubscriptMark(element)) {
    marks.add('subscript')
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

  const marks = marksFromElementAttributes(el as globalThis.HTMLElement)

  if (el.classList.contains('listtype-quote')) {
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
  return deserializedNodes as DeserializedNodes
}