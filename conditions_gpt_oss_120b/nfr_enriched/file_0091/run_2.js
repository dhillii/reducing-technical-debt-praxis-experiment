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
 * Retrieves alignment from an element based on its parent data attribute or inline style.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (align === 'center' || align === 'end') {
    return align
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
  }
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
 * Mapping of HTML tags to Slate marks.
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
 * Extracts Slate marks from an element's attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style, classList } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }

  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  } else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  ) {
    marks.add('bold')
  }

  if (fontStyle === 'italic') {
    marks.add('italic')
  }

  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
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
 * Public entry point for deserializing a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    return text ? getInlineNodes(text) : []
  }

  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    return handleImageNode(el) ?? []
  }

  if (el.nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => decideNodeType(el))
}

/**
 * Handles <img> elements by extracting the alt attribute.
 */
function handleImageNode(el: globalThis.HTMLElement): DeserializedNode[] | undefined {
  const alt = el.getAttribute('alt')
  return alt ? getInlineNodes(alt) : undefined
}

/**
 * Determines the appropriate Slate node(s) for a given element.
 */
function decideNodeType(el: globalThis.HTMLElement): DeserializedNode[] {
  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

  if (el.nodeName === 'A') {
    const linkResult = handleLinkNode(el, children)
    if (linkResult) return linkResult
  }

  if (el.nodeName === 'PRE' && el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  if (el.nodeName === 'LI') {
    return [handleListItemNode(el, children)]
  }

  if (el.nodeName === 'P') {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
  }

  const headingLevel = headings[el.nodeName]
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

  const blockResult = handleBlockElements(el, children)
  if (blockResult) return blockResult

  return deserializeNodes(el.childNodes)
}

/**
 * Handles <a> elements by applying link data.
 */
function handleLinkNode(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] | undefined {
  const href = el.getAttribute('href')
  if (!href) return undefined
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handles list item elements, extracting nested lists if present.
 */
function handleListItemNode(el: globalThis.HTMLElement, children: DeserializedNode[]): Block {
  let nestedList: Block | undefined

  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (!nestedList && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
        nestedList = node
        return false
      }
      return true
    }),
  }

  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return { type: 'list-item', children: listItemChildren }
}

/**
 * Handles block-level elements such as blockquote, ordered/unordered lists, and fallback paragraphs.
 */
function handleBlockElements(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] | undefined {
  switch (el.nodeName) {
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
      break
  }
  return undefined
}

/**
 * Recursively deserializes a collection of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = []
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node))
  }
  return output
}

/**
 * Ensures that block children have appropriate paragraph wrappers.
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