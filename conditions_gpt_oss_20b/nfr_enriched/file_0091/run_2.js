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
 * Extracts alignment information from an element's parent data attribute or inline style.
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
 * Maps HTML element attributes and styles to Slate marks.
 */
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
    return text ? getInlineNodes(text) : []
  }

  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    return getInlineNodes(el.getAttribute('alt') ?? '')
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

  return addMarksToChildren(marks, () => {
    switch (el.nodeName) {
      case 'A':
        return handleAnchor(el)
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
  })
}

/**
 * Handles <a> elements, applying link and disabling underline.
 */
function handleAnchor(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.getAttribute('href')
  if (!href) {
    return deserializeNodes(el.childNodes)
  }
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/**
 * Handles <pre> elements, converting to a code block.
 */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/**
 * Handles <li> elements, detecting nested lists.
 */
function handleListItem(el: globalThis.HTMLElement): DeserializedNode[] {
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

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
 * Handles <p> elements, applying alignment.
 */
function handleParagraph(el: globalThis.HTMLElement): DeserializedNode[] {
  return [
    {
      type: 'paragraph',
      textAlign: getAlignmentFromElement(el),
      children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
    },
  ]
}

/**
 * Handles <blockquote> elements.
 */
function handleBlockquote(el: globalThis.HTMLElement): DeserializedNode[] {
  return [
    {
      type: 'blockquote',
      children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
    },
  ]
}

/**
 * Handles <ol> elements.
 */
function handleOrderedList(el: globalThis.HTMLElement): DeserializedNode[] {
  return [
    {
      type: 'ordered-list',
      children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
    },
  ]
}

/**
 * Handles <ul> elements.
 */
function handleUnorderedList(el: globalThis.HTMLElement): DeserializedNode[] {
  return [
    {
      type: 'unordered-list',
      children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
    },
  ]
}

/**
 * Handles <div> elements, converting to paragraph if no block child.
 */
function handleDiv(el: globalThis.HTMLElement): DeserializedNode[] {
  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return children
}

/**
 * Default handler for unknown elements.
 */
function handleDefault(el: globalThis.HTMLElement): DeserializedNode[] {
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