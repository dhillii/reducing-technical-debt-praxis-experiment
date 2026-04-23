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
 * Returns the alignment of the given element.
 * @param element The element to get the alignment from.
 * @returns The alignment of the element, or undefined if not found.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (!parent) return undefined

  // Check if the parent has a data-align attribute
  if (parent.dataset.align === 'center' || parent.dataset.align === 'end') {
    return parent.dataset.align
  }

  // Check if the element is an HTMLElement
  if (!(element instanceof globalThis.HTMLElement)) return undefined

  // Check the text alignment of the element
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

/**
 * Returns the marks from the given element's attributes.
 * @param element The element to get the marks from.
 * @returns The marks from the element's attributes.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element

  // Check if the node name corresponds to a mark
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  // Check the text decoration
  const textDecoration = style.textDecoration
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  // Check for confluence code mark
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  // Check for Google Docs bold mark
  if (nodeName === 'B' && style.fontWeight !== 'normal') {
    marks.add('bold')
  } else if (
    typeof style.fontWeight === 'string' &&
    (style.fontWeight === 'bold' ||
      style.fontWeight === 'bolder' ||
      style.fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(style.fontWeight))
  ) {
    marks.add('bold')
  }

  // Check for italic mark
  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  // Check for subscript and superscript marks
  const verticalAlign = style.verticalAlign
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

/**
 * Deserializes the given HTML string.
 * @param html The HTML string to deserialize.
 * @returns The deserialized nodes.
 */
export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserializes the given HTML node.
 * @param el The HTML node to deserialize.
 * @returns The deserialized nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    return deserializeImageNode(el)
  }

  if (el.nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)
  return deserializeElementNode(el, marks)
}

/**
 * Deserializes the given text node.
 * @param el The text node to deserialize.
 * @returns The deserialized nodes.
 */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/**
 * Deserializes the given image node.
 * @param el The image node to deserialize.
 * @returns The deserialized nodes.
 */
function deserializeImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt
  return getInlineNodes(alt ?? '')
}

/**
 * Deserializes the given element node.
 * @param el The element node to deserialize.
 * @param marks The marks from the element's attributes.
 * @returns The deserialized nodes.
 */
function deserializeElementNode(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (nodeName === 'A') {
      return deserializeLinkNode(el)
    }

    if (nodeName === 'PRE' && el.textContent) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return deserializeListItemNode(el, children)
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

/**
 * Deserializes the given link node.
 * @param el The link node to deserialize.
 * @returns The deserialized nodes.
 */
function deserializeLinkNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.dataset.href
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return deserializeNodes(el.childNodes)
}

/**
 * Deserializes the given list item node.
 * @param el The list item node to deserialize.
 * @param children The children of the list item node.
 * @returns The deserialized nodes.
 */
function deserializeListItemNode(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
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

/**
 * Deserializes the given nodes.
 * @param nodes The nodes to deserialize.
 * @returns The deserialized nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Fixes the nodes for block children.
 * @param deserializedNodes The deserialized nodes to fix.
 * @returns The fixed nodes.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    return [{ text: '' }]
  }
  if (deserializedNodes.some(isBlock)) {
    return fixNodesForBlockChildrenWithBlocks(deserializedNodes)
  }
  return deserializedNodes as DeserializedNodes
}

/**
 * Fixes the nodes for block children with blocks.
 * @param deserializedNodes The deserialized nodes to fix.
 * @returns The fixed nodes.
 */
function fixNodesForBlockChildrenWithBlocks(deserializedNodes: DeserializedNode[]): DeserializedNodes {
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