// very loosely based on https://github.com/ianstormtaylor/slate/blob/d22c76ae1313fe82111317417912a2670e73f5c9/site/examples/paste-html.tsx
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
 * Extracts marks based on element attributes and styles.
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

/**
 * Determines if a node is an HTMLElement.
 */
function isHTMLElement(node: globalThis.Node): node is globalThis.HTMLElement {
  return node instanceof globalThis.HTMLElement
}

/**
 * Guard predicates for element types.
 */
function isBR(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BR'
}
function isIMG(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'IMG'
}
function isHR(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'HR'
}
function isListQuote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}
function isAnchor(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'A'
}
function isPRE(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'PRE'
}
function isLI(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'LI'
}
function isParagraph(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'P'
}
function isBlockquote(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}
function isOL(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'OL'
}
function isUL(el: globalThis.HTMLElement): boolean {
  return el.nodeName === 'UL'
}
function isDivParagraph(el: globalThis.HTMLElement, children: DeserializedNode[]): boolean {
  return el.nodeName === 'DIV' && !isBlock(children[0])
}

/**
 * Handles list item deserialization.
 */
function handleListItem(children: DeserializedNode[]): DeserializedNode[] {
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
  return [{ type: 'list-item', children: listItemChildren }]
}

/**
 * Handles generic element content after marks have been applied.
 */
function handleElementContent(el: globalThis.HTMLElement): DeserializedNode[] {
  if (isAnchor(el)) {
    const href = el.getAttribute('href')
    if (href) {
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }
    return []
  }

  if (isPRE(el) && el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

  if (isLI(el)) {
    return handleListItem(children)
  }

  if (isParagraph(el)) {
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

  if (isBlockquote(el)) {
    return [{ type: 'blockquote', children }]
  }
  if (isOL(el)) {
    return [{ type: 'ordered-list', children }]
  }
  if (isUL(el)) {
    return [{ type: 'unordered-list', children }]
  }
  if (isDivParagraph(el, children)) {
    return [{ type: 'paragraph', children }]
  }

  return deserializeNodes(el.childNodes)
}

/**
 * Deserializes a single HTML node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!isHTMLElement(el)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  if (isBR(el)) {
    return getInlineNodes('\n')
  }

  if (isIMG(el)) {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isHR(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isListQuote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
      },
    ])
  }

  return addMarksToChildren(marks, () => handleElementContent(el))
}

/**
 * Deserializes a collection of nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Ensures block children have appropriate paragraph wrappers.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    // Slate also gets unhappy if an element has no children
    // the empty text nodes will get normalized away if they're not needed
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

      // ignore whitespace between block level elements
      if (Node.string(node).trim() !== '') {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}

/**
 * Entry point for HTML deserialization.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]