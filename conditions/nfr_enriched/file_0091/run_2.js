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

// ============================================================================
// Constants
// ============================================================================

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

const BLOCK_ELEMENT_NAMES = new Set(['A', 'PRE', 'LI', 'P', 'BLOCKQUOTE', 'OL', 'UL', 'DIV', 'BR', 'IMG', 'HR'])

// ============================================================================
// Alignment Detection
// ============================================================================

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const confluenceAlign = element.parentElement?.getAttribute('data-align')
  if (confluenceAlign === 'center' || confluenceAlign === 'end') {
    return confluenceAlign
  }

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const { textAlign } = element.style
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'

  return undefined
}

// ============================================================================
// Mark Detection
// ============================================================================

function getMarkFromFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

function extractMarksFromElement(element: HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  // Mark from tag name
  const tagMark = TEXT_MARK_TAGS[nodeName]
  if (tagMark) {
    marks.add(tagMark)
  }

  // Text decoration marks
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  // Confluence code span
  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }

  // Font weight marks
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  } else if (typeof fontWeight === 'string' && getMarkFromFontWeight(fontWeight)) {
    marks.add('bold')
  }

  // Font style marks
  if (fontStyle === 'italic') {
    marks.add('italic')
  }

  // Vertical alignment marks
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

// ============================================================================
// Node Deserialization
// ============================================================================

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

function deserializeTextNode(node: globalThis.Node): DeserializedNode[] {
  const text = node.textContent
  return text ? getInlineNodes(text) : []
}

function deserializeSpecialElement(element: HTMLElement): DeserializedNode[] | null {
  const { nodeName } = element

  if (nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (nodeName === 'IMG') {
    const alt = element.getAttribute('alt') ?? ''
    return getInlineNodes(alt)
  }

  if (nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  return null
}

function deserializeListItem(
  element: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] {
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

function deserializeBlockElement(
  element: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] | null {
  const { nodeName } = element

  if (nodeName === 'P') {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(element), children }]
  }

  if (nodeName === 'LI') {
    return deserializeListItem(element, children)
  }

  const headingLevel = HEADING_LEVELS[nodeName]
  if (typeof headingLevel === 'number') {
    return [
      {
        type: 'heading',
        level: headingLevel,
        textAlign: getAlignmentFromElement(element),
        children,
      },
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

  return null
}

function deserializeLink(element: HTMLElement): DeserializedNode[] | null {
  const href = element.getAttribute('href')
  if (!href) {
    return null
  }

  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(element.childNodes))
  )
}

function deserializeCodeBlock(element: HTMLElement): DeserializedNode[] | null {
  if (!element.textContent) {
    return null
  }

  return [{ type: 'code', children: [{ text: element.textContent }] }]
}

function deserializeDropboxPaperBlockquote(element: HTMLElement): DeserializedNode[] | null {
  if (!element.classList.contains('listtype-quote')) {
    return null
  }

  const marks = extractMarksFromElement(element)
  marks.delete('italic')

  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(element.childNodes)) },
  ])
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  // Check for special elements first
  const specialResult = deserializeSpecialElement(el)
  if (specialResult) {
    return specialResult
  }

  // Check for Dropbox Paper blockquote
  const dropboxResult = deserializeDropboxPaperBlockquote(el)
  if (dropboxResult) {
    return dropboxResult
  }

  const marks = extractMarksFromElement(el)

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    // Handle link
    if (nodeName === 'A') {
      const linkResult = deserializeLink(el)
      if (linkResult) {
        return linkResult
      }
    }

    // Handle code block
    if (nodeName === 'PRE') {
      const codeResult = deserializeCodeBlock(el)
      if (codeResult) {
        return codeResult
      }
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    // Handle block elements
    const blockResult = deserializeBlockElement(el, children)
    if (blockResult) {
      return blockResult
    }

    return deserialized
  })
}

function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const result: DeserializedNode[] = []
  for (const node of nodes) {
    result.push(...deserializeHTMLNode(node))
  }
  return result
}

// ============================================================================
// Node Fixing
// ============================================================================

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

// ============================================================================
// Public API
// ============================================================================

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}
```