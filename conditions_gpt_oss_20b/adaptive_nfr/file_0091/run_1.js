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
 * Returns the alignment of an element based on its parent data attribute or CSS text-align.
 * @param element - The element to inspect.
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

/**
 * Parses an HTML string into Slate nodes.
 * @param html - The HTML string to parse.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserializes a single DOM node into Slate nodes.
 * @param el - The DOM node to deserialize.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  const nodeName = el.nodeName

  if (isBreak(el)) {
    return getInlineNodes('\n')
  }

  if (isImage(el)) {
    return getInlineNodes(el.alt ?? '')
  }

  if (isHorizontalRule(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isListQuote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, () => {
    if (isAnchor(el)) {
      const href = el.href
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isPre(el) && el.textContent) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(el)) {
      return handleListItem(children)
    }

    if (isParagraph(el)) {
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

    if (isBlockQuote(el)) {
      return [{ type: 'blockquote', children }]
    }

    if (isOrderedList(el)) {
      return [{ type: 'ordered-list', children }]
    }

    if (isUnorderedList(el)) {
      return [{ type: 'unordered-list', children }]
    }

    if (isDivWithInlineChildren(el, children)) {
      return [{ type: 'paragraph', children }]
    }

    return deserialized
  })
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

/** Helper predicates and handlers */

/** @returns true if the element is a line break. */
function isBreak(el: HTMLElement): boolean {
  return el.nodeName === 'BR'
}

/** @returns true if the element is an image. */
function isImage(el: HTMLElement): boolean {
  return el.nodeName === 'IMG'
}

/** @returns true if the element is a horizontal rule. */
function isHorizontalRule(el: HTMLElement): boolean {
  return el.nodeName === 'HR'
}

/** @returns true if the element has the listtype-quote class. */
function isListQuote(el: HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/** @returns true if the element is an anchor. */
function isAnchor(el: HTMLElement): boolean {
  return el.nodeName === 'A'
}

/** @returns true if the element is a preformatted block. */
function isPre(el: HTMLElement): boolean {
  return el.nodeName === 'PRE'
}

/** @returns true if the element is a list item. */
function isListItem(el: HTMLElement): boolean {
  return el.nodeName === 'LI'
}

/** @returns true if the element is a paragraph. */
function isParagraph(el: HTMLElement): boolean {
  return el.nodeName === 'P'
}

/** @returns true if the element is a blockquote. */
function isBlockQuote(el: HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/** @returns true if the element is an ordered list. */
function isOrderedList(el: HTMLElement): boolean {
  return el.nodeName === 'OL'
}

/** @returns true if the element is an unordered list. */
function isUnorderedList(el: HTMLElement): boolean {
  return el.nodeName === 'UL'
}

/** @returns true if the element is a div containing only inline children. */
function isDivWithInlineChildren(el: HTMLElement, children: DeserializedNode[]): boolean {
  return el.nodeName === 'DIV' && !isBlock(children[0] as any)
}

/** Handles list item deserialization, separating nested lists. */
function handleListItem(children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined
  const listItemContent: Block = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (
        nestedList === undefined &&
        (node.type === 'ordered-list' || node.type === 'unordered-list')
      ) {
        nestedList = node as Block
        return false
      }
      return true
    }),
  }
  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return [{ type: 'list-item', children: listItemChildren }]
}