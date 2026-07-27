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
 * Determines the alignment of an element based on its parent data attribute
 * or its own CSS text-align property.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const attribute = parent?.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
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

function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
  const { fontWeight, textDecoration, verticalAlign } = style

  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
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
  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
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

  return addMarksToChildren(marks, () => processElement(el, marks))
}

/**
 * Dispatches element processing based on nodeName.
 */
function processElement(el: HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  switch (el.nodeName) {
    case 'A':
      return handleLink(el)
    case 'PRE':
      return handlePre(el)
    case 'LI':
      return handleListItem(el)
    case 'P':
      return handleParagraph(el)
    case 'BLOCKQUOTE':
      return handleBlockquote(el)
    case 'OL':
      return handleOrderedList(el)
    case 'UL':
      return handleUnorderedList(el)
    case 'DIV':
      return handleDiv(el)
    default:
      return handleDefault(el)
  }
}

/**
 * Handles <a> elements, applying link and disabling underline.
 */
function handleLink(el: HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) {
    return deserializeNodes(el.childNodes)
  }
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handles <pre> elements as code blocks.
 */
function handlePre(el: HTMLElement): DeserializedNode[] {
  if (!el.textContent) return []
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/**
 * Handles <li> elements, separating nested lists.
 */
function handleListItem(el: HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  let nestedList: Block | undefined
  const listItemContent: Block = {
    type: 'list-item-content',
    children: children.filter(node => {
      if (!nestedList && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
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
 * Handles <p> elements, applying alignment.
 */
function handleParagraph(el: HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/**
 * Handles heading elements.
 */
function handleHeading(el: HTMLElement): DeserializedNode[] {
  const headingLevel = headings[el.nodeName]
  if (typeof headingLevel !== 'number') return []
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [
    {
      type: 'heading',
      level: headingLevel,
      textAlign: getAlignmentFromElement(el),
      children,
    },
  ]
}

/**
 * Handles <blockquote> elements.
 */
function handleBlockquote(el: HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'blockquote', children }]
}

/**
 * Handles ordered lists.
 */
function handleOrderedList(el: HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'ordered-list', children }]
}

/**
 * Handles unordered lists.
 */
function handleUnorderedList(el: HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  return [{ type: 'unordered-list', children }]
}

/**
 * Handles <div> elements that are not block-level.
 */
function handleDiv(el: HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return deserialized
}

/**
 * Default handler for elements not explicitly handled.
 */
function handleDefault(el: HTMLElement): DeserializedNode[] {
  return deserializeNodes(el.childNodes)
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