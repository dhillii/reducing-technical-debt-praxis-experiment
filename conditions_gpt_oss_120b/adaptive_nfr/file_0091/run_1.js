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
 * Returns the alignment value from the element's parent data attribute or style.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (isCenterOrEndAlignment(align)) {
    return align
  }
  if (element instanceof HTMLElement) {
    const textAlign = element.style.textAlign
    if (isGoogleDocsCenter(textAlign)) {
      return 'center'
    }
    if (isGoogleDocsEnd(textAlign)) {
      return 'end'
    }
  }
}

/**
 * Checks if the alignment value is either 'center' or 'end'.
 */
function isCenterOrEndAlignment(value: string | undefined): value is 'center' | 'end' {
  return value === 'center' || value === 'end'
}

/**
 * Checks if the text-align style indicates center alignment.
 */
function isGoogleDocsCenter(textAlign: string): boolean {
  return textAlign === 'center'
}

/**
 * Checks if the text-align style indicates end/right alignment.
 */
function isGoogleDocsEnd(textAlign: string): boolean {
  return textAlign === 'right' || textAlign === 'end'
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
 * Extracts marks from an element based on its tag name and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style } = element
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
 * Determines if the element represents a blockquote rendered as a list.
 */
function isBlockquoteListClass(el: HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Determines if the element is an anchor (<a>) with an href attribute.
 */
function isAnchorWithHref(el: HTMLElement): boolean {
  return el.nodeName === 'A' && !!el.getAttribute('href')
}

/**
 * Determines if the element is a <pre> with text content.
 */
function isPreWithContent(el: HTMLElement): boolean {
  return el.nodeName === 'PRE' && !!el.textContent
}

/**
 * Determines if the element is a list item (<li>).
 */
function isListItem(el: HTMLElement): boolean {
  return el.nodeName === 'LI'
}

/**
 * Determines if the element is a paragraph (<p>).
 */
function isParagraph(el: HTMLElement): boolean {
  return el.nodeName === 'P'
}

/**
 * Determines if the element is a heading (H1-H6).
 */
function isHeading(el: HTMLElement): boolean {
  return typeof headings[el.nodeName] === 'number'
}

/**
 * Retrieves the heading level for a heading element.
 */
function getHeadingLevel(el: HTMLElement): number {
  return headings[el.nodeName] as number
}

/**
 * Determines if the element is a blockquote (<blockquote>).
 */
function isBlockquote(el: HTMLElement): boolean {
  return el.nodeName === 'BLOCKQUOTE'
}

/**
 * Determines if the element is an ordered list (<ol>).
 */
function isOrderedList(el: HTMLElement): boolean {
  return el.nodeName === 'OL'
}

/**
 * Determines if the element is an unordered list (<ul>).
 */
function isUnorderedList(el: HTMLElement): boolean {
  return el.nodeName === 'UL'
}

/**
 * Determines if the element is a div that should be treated as a paragraph.
 */
function isDivParagraph(el: HTMLElement, children: DeserializedNode[]): boolean {
  return el.nodeName === 'DIV' && !isBlock(children[0])
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

  if (isBlockquoteListClass(el)) {
    const marks = marksFromElementAttributes(el)
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  const marks = marksFromElementAttributes(el)

  if (isAnchorWithHref(el)) {
    const href = el.getAttribute('href')!
    return addMarksToChildren(marks, () =>
      setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    )
  }

  if (isPreWithContent(el)) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

  if (isListItem(el)) {
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
    return addMarksToChildren(marks, () => [{ type: 'list-item', children: listItemChildren }])
  }

  if (isParagraph(el)) {
    return addMarksToChildren(marks, () => [
      { type: 'paragraph', textAlign: getAlignmentFromElement(el), children },
    ])
  }

  if (isHeading(el)) {
    const level = getHeadingLevel(el)
    return addMarksToChildren(marks, () => [
      { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
    ])
  }

  if (isBlockquote(el)) {
    return addMarksToChildren(marks, () => [{ type: 'blockquote', children }])
  }

  if (isOrderedList(el)) {
    return addMarksToChildren(marks, () => [{ type: 'ordered-list', children }])
  }

  if (isUnorderedList(el)) {
    return addMarksToChildren(marks, () => [{ type: 'unordered-list', children }])
  }

  if (isDivParagraph(el, children)) {
    return addMarksToChildren(marks, () => [{ type: 'paragraph', children }])
  }

  return addMarksToChildren(marks, () => children)
}

/**
 * Deserializes an iterable of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: DeserializedNode[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Ensures that block children are correctly wrapped in paragraphs when needed.
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