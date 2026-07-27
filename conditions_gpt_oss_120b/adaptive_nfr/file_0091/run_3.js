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
 * Determines the alignment of an element based on its parent data attribute or its own style.
 * @param element The element to evaluate.
 * @returns 'center' | 'end' | undefined
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (isCenterOrEnd(align)) {
    return align
  }
  if (!(element instanceof HTMLElement)) {
    return undefined
  }
  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }
  if (isRightOrEnd(textAlign)) {
    return 'end'
  }
  return undefined
}

/** @returns true when value is 'center' or 'end' */
function isCenterOrEnd(value: string | undefined): value is 'center' | 'end' {
  return value === 'center' || value === 'end'
}

/** @returns true when value is 'right' or 'end' */
function isRightOrEnd(value: string): boolean {
  return value === 'right' || value === 'end'
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

/**
 * Extracts marks from an element's attributes and styles.
 * @param element The element to inspect.
 * @returns A set of marks.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style } = element

  const markFromNodeName = getMarkFromNodeName(nodeName)
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const textDecorationMark = getTextDecorationMark(style.textDecoration)
  if (textDecorationMark) {
    marks.add(textDecorationMark)
  }

  if (isCodeSpan(element)) {
    marks.add('code')
  }

  if (isBold(element)) {
    marks.add('bold')
  }

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  if (style.verticalAlign === 'super') {
    marks.add('superscript')
  } else if (style.verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

/** @returns the mark associated with a node name, if any */
function getMarkFromNodeName(nodeName: string): Mark | undefined {
  return TEXT_TAGS[nodeName]
}

/** @returns the mark for a given textDecoration value, if any */
function getTextDecorationMark(textDecoration: string): Mark | undefined {
  if (textDecoration === 'underline') {
    return 'underline'
  }
  if (textDecoration === 'line-through') {
    return 'strikethrough'
  }
  return undefined
}

/** @returns true when the element is a <span class="code"> */
function isCodeSpan(element: globalThis.HTMLElement): boolean {
  return element.nodeName === 'SPAN' && element.classList.contains('code')
}

/** @returns true when the element should be considered bold */
function isBold(element: globalThis.HTMLElement): boolean {
  const { nodeName, style } = element
  const { fontWeight } = style
  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }
  if (typeof fontWeight === 'string') {
    return (
      fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight)
    )
  }
  return false
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

  const nodeName = el.nodeName
  if (nodeName === 'BR') {
    return getInlineNodes('\n')
  }
  if (nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }
  if (nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  if (el.classList.contains('listtype-quote')) {
    const marks = marksFromElementAttributes(el)
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
      },
    ])
  }

  const marks = marksFromElementAttributes(el)
  const result = computeElementResult(el)
  return addMarksToChildren(marks, () => result)
}

/**
 * Computes the Slate node representation for a given element.
 * @param el The element to process.
 * @returns An array of deserialized nodes.
 */
function computeElementResult(el: globalThis.HTMLElement): DeserializedNode[] {
  const nodeName = el.nodeName

  if (nodeName === 'A') {
    const href = el.getAttribute('href')
    if (href) {
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }
    return []
  }

  if (nodeName === 'PRE' && el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  if (nodeName === 'LI') {
    return buildListItem(children)
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
 * Constructs a list-item node, handling possible nested lists.
 * @param children The deserialized children of the list item.
 * @returns An array containing a single list-item node.
 */
function buildListItem(children: DeserializedNode[]): DeserializedNode[] {
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