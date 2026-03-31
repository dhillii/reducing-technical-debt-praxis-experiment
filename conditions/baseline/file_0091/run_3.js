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

const ALIGNMENT_VALUES = ['center', 'end'] as const
type Alignment = (typeof ALIGNMENT_VALUES)[number]

// ============================================================================
// Alignment Detection
// ============================================================================

function getAlignmentFromConfluence(parent: Element | null): Alignment | undefined {
  const attribute = parent?.getAttribute('data-align')
  return attribute && ALIGNMENT_VALUES.includes(attribute as Alignment) ? (attribute as Alignment) : undefined
}

function getAlignmentFromGoogleDocs(element: HTMLElement): Alignment | undefined {
  const { textAlign } = element.style
  if (textAlign === 'center') return 'center'
  if (textAlign === 'right' || textAlign === 'end') return 'end'
  return undefined
}

function getAlignmentFromElement(element: globalThis.Element): Alignment | undefined {
  if (element instanceof HTMLElement) {
    return getAlignmentFromGoogleDocs(element) ?? getAlignmentFromConfluence(element.parentElement)
  }
  return getAlignmentFromConfluence(element.parentElement)
}

// ============================================================================
// Mark Detection
// ============================================================================

function addMarkFromNodeName(marks: Set<Mark>, nodeName: string): void {
  const mark = TEXT_MARK_TAGS[nodeName]
  if (mark) marks.add(mark)
}

function addMarkFromTextDecoration(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

function addMarkFromFontWeight(marks: Set<Mark>, fontWeight: string, nodeName: string): void {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
    return
  }

  const isBold =
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)

  if (isBold) marks.add('bold')
}

function addMarkFromVerticalAlign(marks: Set<Mark>, verticalAlign: string): void {
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
  addMarkFromTextDecoration(marks, textDecoration)
  addMarkFromFontWeight(marks, fontWeight, nodeName)

  if (fontStyle === 'italic') marks.add('italic')
  if (nodeName === 'SPAN' && classList.contains('code')) marks.add('code')

  addMarkFromVerticalAlign(marks, verticalAlign)

  return marks
}

// ============================================================================
// Node Deserialization
// ============================================================================

function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  return text ? getInlineNodes(text) : []
}

function deserializeSpecialElement(el: HTMLElement): DeserializedNode[] | null {
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

function deserializeLink(el: HTMLElement): DeserializedNode[] | null {
  const href = el.getAttribute('href')
  if (!href) return null

  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function deserializeListItem(children: DeserializedNode[]): DeserializedNode[] {
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
  el: HTMLElement,
  children: DeserializedNode[],
  deserialized: DeserializedNode[]
): DeserializedNode[] | null {
  const { nodeName } = el

  if (nodeName === 'LI') return deserializeListItem(children)
  if (nodeName === 'P') return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]

  const headingLevel = HEADING_LEVELS[nodeName]
  if (headingLevel) {
    return [{ type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children }]
  }

  if (nodeName === 'BLOCKQUOTE') return [{ type: 'blockquote', children }]
  if (nodeName === 'OL') return [{ type: 'ordered-list', children }]
  if (nodeName === 'UL') return [{ type: 'unordered-list', children }]
  if (nodeName === 'DIV' && !isBlock(children[0])) return [{ type: 'paragraph', children }]

  return null
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  const specialResult = deserializeSpecialElement(el)
  if (specialResult !== null) return specialResult

  const marks = marksFromElementAttributes(el)

  // Dropbox Paper blockquotes
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (el.nodeName === 'A') {
      const linkResult = deserializeLink(el)
      if (linkResult) return linkResult
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    const blockResult = deserializeBlockElement(el, children, deserialized)
    return blockResult ?? deserialized
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
// Block Children Normalization
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

// ============================================================================
// Public API
// ============================================================================

export function deserializeHTML(html: string): DeserializedNodes {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}
```