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

// Alignment detection
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const confluenceAlign = element.parentElement?.getAttribute('data-align')
  if (confluenceAlign === 'center' || confluenceAlign === 'end') {
    return confluenceAlign
  }

  if (!(element instanceof HTMLElement)) return undefined

  const textAlign = element.style.textAlign
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'

  return undefined
}

// Mark extraction
function extractMarkFromNodeName(nodeName: string): Mark | undefined {
  return TEXT_MARK_TAGS[nodeName]
}

function extractMarksFromFontWeight(fontWeight: string): Mark[] {
  const marks: Mark[] = []
  if (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  ) {
    marks.push('bold')
  }
  return marks
}

function extractMarksFromTextDecoration(textDecoration: string): Mark[] {
  const marks: Mark[] = []
  if (textDecoration === 'underline') marks.push('underline')
  else if (textDecoration === 'line-through') marks.push('strikethrough')
  return marks
}

function extractMarksFromVerticalAlign(verticalAlign: string): Mark[] {
  const marks: Mark[] = []
  if (verticalAlign === 'super') marks.push('superscript')
  else if (verticalAlign === 'sub') marks.push('subscript')
  return marks
}

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const { fontWeight, textDecoration, verticalAlign } = style

  // Node name marks
  const nodeNameMark = extractMarkFromNodeName(nodeName)
  if (nodeNameMark) marks.add(nodeNameMark)

  // Text decoration marks
  extractMarksFromTextDecoration(textDecoration).forEach(m => marks.add(m))

  // Confluence code span
  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }

  // Bold handling
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  } else if (typeof fontWeight === 'string') {
    extractMarksFromFontWeight(fontWeight).forEach(m => marks.add(m))
  }

  // Italic handling
  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  // Vertical align marks
  extractMarksFromVerticalAlign(verticalAlign).forEach(m => marks.add(m))

  return marks
}

// Node deserialization
function deserializeTextNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  return text ? getInlineNodes(text) : []
}

function deserializeSpecialElement(el: globalThis.HTMLElement): DeserializedNode[] | null {
  switch (el.nodeName) {
    case 'BR':
      return getInlineNodes('\n')
    case 'IMG':
      return getInlineNodes(el.getAttribute('alt') ?? '')
    case 'HR':
      return [{ type: 'divider', children: [{ text: '' }] }]
    case 'PRE':
      return el.textContent ? [{ type: 'code', children: [{ text: el.textContent }] }] : null
    default:
      return null
  }
}

function deserializeListItem(el: globalThis.HTMLElement, children: DeserializedNode[]): Block {
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
  return { type: 'list-item', children: listItemChildren }
}

function deserializeBlockElement(
  nodeName: string,
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] | null {
  switch (nodeName) {
    case 'LI':
      return [deserializeListItem(el, children)]
    case 'P':
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    case 'BLOCKQUOTE':
      return [{ type: 'blockquote', children }]
    case 'OL':
      return [{ type: 'ordered-list', children }]
    case 'UL':
      return [{ type: 'unordered-list', children }]
    case 'DIV':
      if (!isBlock(children[0])) {
        return [{ type: 'paragraph', children }]
      }
      return null
    default: {
      const headingLevel = HEADING_LEVELS[nodeName]
      if (typeof headingLevel === 'number') {
        return [
          {
            type: 'heading',
            level: headingLevel,
            textAlign: getAlignmentFromElement(el),
            children,
          },
        ]
      }
      return null
    }
  }
}

function deserializeLink(el: globalThis.HTMLElement): DeserializedNode[] | null {
  const href = el.getAttribute('href')
  if (!href) return null

  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function deserializeDropboxPaperBlockquote(el: globalThis.HTMLElement): DeserializedNode[] | null {
  if (!el.classList.contains('listtype-quote')) return null

  const marks = marksFromElementAttributes(el)
  marks.delete('italic')

  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  // Check for Dropbox Paper blockquote first
  const dropboxBlockquote = deserializeDropboxPaperBlockquote(el)
  if (dropboxBlockquote) return dropboxBlockquote

  // Check for special elements
  const specialElement = deserializeSpecialElement(el)
  if (specialElement) return specialElement

  const marks = marksFromElementAttributes(el)

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    // Handle links
    if (nodeName === 'A') {
      const link = deserializeLink(el)
      if (link) return link
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    // Try to deserialize as block element
    const blockElement = deserializeBlockElement(nodeName, el, children)
    if (blockElement) return blockElement

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

export function deserializeHTML(html: string): DeserializedNodes {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}
```