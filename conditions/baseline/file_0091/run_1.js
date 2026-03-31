```typescript
import { Node } from 'slate'
import { type Block, isBlock } from '../editor-shared'
import { type Mark } from '../utils'
import {
  type InlineFromExternalPaste,
  addMarksToChildren,
  getInlineNodes,
  forceDisableMarkForChildren,
  setLinkForChildren,
} from './utils'

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

// Constants
const HEADING_LEVELS: Record<string, (Node & { type: 'heading' })['level']> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
}

const TEXT_MARK_TAGS: Record<string, Mark> = {
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

// Alignment extraction
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const confluenceAlign = element.parentElement?.getAttribute('data-align')
  if (confluenceAlign === 'center' || confluenceAlign === 'end') {
    return confluenceAlign
  }

  if (!(element instanceof HTMLElement)) return undefined

  const { textAlign } = element.style
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'

  return undefined
}

// Mark extraction
function extractMarkFromNodeName(nodeName: string): Mark | undefined {
  return TEXT_MARK_TAGS[nodeName]
}

function extractMarksFromFontWeight(fontWeight: string): Mark | undefined {
  if (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  ) {
    return 'bold'
  }
  return undefined
}

function extractMarksFromTextDecoration(textDecoration: string): Mark | undefined {
  if (textDecoration === 'underline') return 'underline'
  if (textDecoration === 'line-through') return 'strikethrough'
  return undefined
}

function extractMarksFromVerticalAlign(verticalAlign: string): Mark | undefined {
  if (verticalAlign === 'super') return 'superscript'
  if (verticalAlign === 'sub') return 'subscript'
  return undefined
}

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  // Node name marks
  const nodeNameMark = extractMarkFromNodeName(nodeName)
  if (nodeNameMark) marks.add(nodeNameMark)

  // Text decoration marks
  const decorationMark = extractMarksFromTextDecoration(textDecoration)
  if (decorationMark) marks.add(decorationMark)

  // Confluence code span
  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }

  // Font weight marks
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  } else if (typeof fontWeight === 'string') {
    const weightMark = extractMarksFromFontWeight(fontWeight)
    if (weightMark) marks.add(weightMark)
  }

  // Font style marks
  if (fontStyle === 'italic') {
    marks.add('italic')
  }

  // Vertical align marks
  const verticalMark = extractMarksFromVerticalAlign(verticalAlign)
  if (verticalMark) marks.add(verticalMark)

  return marks
}

// Node type handlers
function handleTextNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  return text ? getInlineNodes(text) : []
}

function handleBreakNode(): DeserializedNode[] {
  return getInlineNodes('\n')
}

function handleImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.getAttribute('alt') ?? ''
  return getInlineNodes(alt)
}

function handleHorizontalRuleNode(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

function handleLinkNode(el: globalThis.HTMLElement): DeserializedNode[] | null {
  const href = el.getAttribute('href')
  if (!href) return null

  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function handlePreNode(el: globalThis.HTMLElement): DeserializedNode[] | null {
  if (!el.textContent) return null
  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

function handleListItemNode(children: DeserializedNode[]): DeserializedNode[] {
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

function handleParagraphNode(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

function handleHeadingNode(
  el: globalThis.HTMLElement,
  level: number,
  children: DeserializedNode[]
): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

function handleBlockquoteNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

function handleListNode(
  nodeName: string,
  children: DeserializedNode[]
): DeserializedNode[] | null {
  if (nodeName === 'OL') {
    return [{ type: 'ordered-list', children }]
  }
  if (nodeName === 'UL') {
    return [{ type: 'unordered-list', children }]
  }
  return null
}

function handleDivNode(children: DeserializedNode[]): DeserializedNode[] | null {
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return null
}

function handleConfluenceBlockquote(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] | null {
  if (!el.classList.contains('listtype-quote')) return null

  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

// Main deserialization
export function deserializeHTML(html: string): DeserializedNodes {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return handleTextNode(el)
  }

  const { nodeName } = el

  if (nodeName === 'BR') return handleBreakNode()
  if (nodeName === 'IMG') return handleImageNode(el)
  if (nodeName === 'HR') return handleHorizontalRuleNode()

  const marks = marksFromElementAttributes(el)

  // Handle Confluence blockquote
  const confluenceResult = handleConfluenceBlockquote(el, marks)
  if (confluenceResult) return confluenceResult

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    // Handle link
    if (nodeName === 'A') {
      const linkResult = handleLinkNode(el)
      if (linkResult) return linkResult
    }

    // Handle pre
    if (nodeName === 'PRE') {
      const preResult = handlePreNode(el)
      if (preResult) return preResult
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    // Handle list item
    if (nodeName === 'LI') return handleListItemNode(children)

    // Handle paragraph
    if (nodeName === 'P') return handleParagraphNode(el, children)

    // Handle heading
    const headingLevel = HEADING_LEVELS[nodeName]
    if (typeof headingLevel === 'number') {
      return handleHeadingNode(el, headingLevel, children)
    }

    // Handle blockquote
    if (nodeName === 'BLOCKQUOTE') return handleBlockquoteNode(children)

    // Handle lists
    const listResult = handleListNode(nodeName, children)
    if (listResult) return listResult

    // Handle div
    const divResult = handleDivNode(children)
    if (divResult) return divResult

    return deserialized
  })
}

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: DeserializedNode[] = []
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

  const flushInlines = (): void => {
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
```