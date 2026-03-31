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

const ALIGNMENT_VALUES = new Set(['center', 'end'])
const BOLD_FONT_WEIGHTS = new Set(['bold', 'bolder', '1000'])
const BOLD_WEIGHT_PATTERN = /^[5-9]\d{2}$/

// ============================================================================
// Alignment Detection
// ============================================================================

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const confluenceAlign = element.parentElement?.getAttribute('data-align')
  if (confluenceAlign && ALIGNMENT_VALUES.has(confluenceAlign)) {
    return confluenceAlign as 'center' | 'end'
  }

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const { textAlign } = element.style
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }

  return undefined
}

// ============================================================================
// Mark Detection
// ============================================================================

function addMarkFromNodeName(marks: Set<Mark>, nodeName: string): void {
  const mark = TEXT_MARK_TAGS[nodeName]
  if (mark) {
    marks.add(mark)
  }
}

function addMarksFromTextDecoration(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

function addMarksFromFontWeight(marks: Set<Mark>, fontWeight: string): void {
  if (BOLD_FONT_WEIGHTS.has(fontWeight) || BOLD_WEIGHT_PATTERN.test(fontWeight)) {
    marks.add('bold')
  }
}

function addMarksFromVerticalAlign(marks: Set<Mark>, verticalAlign: string): void {
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }
}

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  addMarkFromNodeName(marks, nodeName)
  addMarksFromTextDecoration(marks, textDecoration)
  addMarksFromFontWeight(marks, fontWeight)
  addMarksFromVerticalAlign(marks, verticalAlign)

  if (fontStyle === 'italic') {
    marks.add('italic')
  }

  // Confluence code span
  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }

  // Google Docs <b> tag handling
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  }

  return marks
}

// ============================================================================
// Node Deserialization
// ============================================================================

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
    default:
      return null
  }
}

function deserializeListItem(
  el: globalThis.HTMLElement,
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
  el: globalThis.HTMLElement,
  children: DeserializedNode[],
  deserialized: DeserializedNode[]
): DeserializedNode[] | null {
  const { nodeName } = el

  if (nodeName === 'LI') {
    return deserializeListItem(el, children)
  }

  if (nodeName === 'P') {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
  }

  const headingLevel = HEADING_LEVELS[nodeName]
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

  return null
}

function deserializeLink(el: globalThis.HTMLElement): DeserializedNode[] | null {
  const href = el.getAttribute('href')
  if (!href) {
    return null
  }

  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function deserializeCodeBlock(el: globalThis.HTMLElement): DeserializedNode[] | null {
  if (!el.textContent) {
    return null
  }

  return [{ type: 'code', children: [{ text: el.textContent }] }]
}

function deserializeDropboxPaperBlockquote(
  el: globalThis.HTMLElement,
  marks: Set<Mark>
): DeserializedNode[] | null {
  if (!el.classList.contains('listtype-quote')) {
    return null
  }

  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  const specialResult = deserializeSpecialElement(el)
  if (specialResult) {
    return specialResult
  }

  const marks = marksFromElementAttributes(el)

  const dropboxResult = deserializeDropboxPaperBlockquote(el, marks)
  if (dropboxResult) {
    return dropboxResult
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (nodeName === 'A') {
      const linkResult = deserializeLink(el)
      if (linkResult) {
        return linkResult
      }
    }

    if (nodeName === 'PRE') {
      const codeResult = deserializeCodeBlock(el)
      if (codeResult) {
        return codeResult
      }
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    const blockResult = deserializeBlockElement(el, children, deserialized)
    if (blockResult) {
      return blockResult
    }

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

// ============================================================================
// Node Fixing
// ============================================================================

function flushInlinesToParagraph(
  inlines: InlineFromExternalPaste[],
  result: DeserializedNode[]
): void {
  if (inlines.length > 0) {
    result.push({ type: 'paragraph', children: inlines })
  }
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

  for (const node of deserializedNodes) {
    if (isBlock(node)) {
      flushInlinesToParagraph(queuedInlines, result)
      queuedInlines = []
      result.push(node)
      continue
    }

    // Ignore whitespace between block level elements
    if (Node.string(node).trim() !== '') {
      queuedInlines.push(node)
    }
  }

  flushInlinesToParagraph(queuedInlines, result)
  return result as DeserializedNodes
}

// ============================================================================
// Public API
// ============================================================================

export function deserializeHTML(html: string): DeserializedNodes {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}
```