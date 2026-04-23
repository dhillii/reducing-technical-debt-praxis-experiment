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

/**
 * Returns the alignment specified by a parent element's `data-align` attribute
 * or by the element's CSS `text-align` style.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const dataAlign = parent?.dataset.align
  if (dataAlign === 'center' || dataAlign === 'end') {
    return dataAlign
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') return 'center'
    if (textAlign === 'right' || textAlign === 'end') return 'end'
  }
}

/**
 * Mapping of HTML tag names to Slate mark names.
 */
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

/**
 * Extracts marks from an element's node name.
 */
function addMarkFromNodeName(element: HTMLElement, marks: Set<Mark>) {
  const mark = TEXT_TAGS[element.nodeName]
  if (mark) marks.add(mark)
}

/**
 * Extracts marks from an element's CSS style.
 */
function addMarkFromStyle(element: HTMLElement, marks: Set<Mark>) {
  const { style } = element
  const { textDecoration, fontWeight, fontStyle, verticalAlign } = style

  if (textDecoration === 'underline') marks.add('underline')
  else if (textDecoration === 'line-through') marks.add('strikethrough')

  if (fontStyle === 'italic') marks.add('italic')

  if (verticalAlign === 'super') marks.add('superscript')
  else if (verticalAlign === 'sub') marks.add('subscript')
}

/**
 * Extracts marks specific to Confluence markup.
 */
function addMarkFromConfluence(element: HTMLElement, marks: Set<Mark>) {
  if (element.nodeName === 'SPAN' && element.classList.contains('code')) marks.add('code')
}

/**
 * Extracts marks specific to Google Docs markup.
 */
function addMarkFromGoogleDocs(element: HTMLElement, marks: Set<Mark>) {
  const { style } = element
  const { fontWeight } = style

  if (element.nodeName === 'B' && fontWeight !== 'normal') marks.add('bold')
  else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  )
    marks.add('bold')
}

/**
 * Returns a set of marks derived from an element's attributes and style.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  addMarkFromNodeName(element, marks)
  addMarkFromStyle(element, marks)
  addMarkFromConfluence(element, marks)
  addMarkFromGoogleDocs(element, marks)
  return marks
}

/**
 * Mapping of heading tag names to their numeric levels.
 */
const headings: Record<string, (Node & { type: 'heading' })['level'] | undefined> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
}

/**
 * Deserializes an HTML string into Slate nodes.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserializes a single DOM node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) return []
    return getInlineNodes(text)
  }

  if (el.nodeName === 'BR') return getInlineNodes('\n')
  if (el.nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }
  if (el.nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }]

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
      },
    ])
  }

  return addMarksToChildren(marks, () => getNodesForElement(el))
}

/**
 * Handles element-specific deserialization logic.
 */
function getNodesForElement(el: HTMLElement): DeserializedNode[] {
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
      {
        type: 'heading',
        level: headingLevel,
        textAlign: getAlignmentFromElement(el),
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

  return deserialized
}

/**
 * Recursively deserializes a collection of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Ensures that block-level children are properly wrapped in paragraphs
 * when necessary.
 */
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