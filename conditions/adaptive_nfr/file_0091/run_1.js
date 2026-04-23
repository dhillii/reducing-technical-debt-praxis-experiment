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

/** Check if parent has confluence alignment data attribute */
function hasConfluenceAlignment(parent: Element | null): parent is Element {
  return parent !== null && (parent.dataset.align === 'center' || parent.dataset.align === 'end')
}

/** Get alignment value from confluence data attribute */
function getConfluenceAlignment(parent: Element): 'center' | 'end' | undefined {
  const align = parent.dataset.align
  return align === 'center' || align === 'end' ? align : undefined
}

/** Check if text align is center */
function isTextAlignCenter(textAlign: string): boolean {
  return textAlign === 'center'
}

/** Check if text align is end/right */
function isTextAlignEnd(textAlign: string): boolean {
  return textAlign === 'right' || textAlign === 'end'
}

/** Get alignment from Google Docs style */
function getGoogleDocsAlignment(element: HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (isTextAlignCenter(textAlign)) {
    return 'center'
  }
  if (isTextAlignEnd(textAlign)) {
    return 'end'
  }
  return undefined
}

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  if (hasConfluenceAlignment(parent)) {
    const alignment = getConfluenceAlignment(parent)
    if (alignment) {
      return alignment
    }
  }

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  return getGoogleDocsAlignment(element)
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

/** Check if font weight indicates bold */
function isBoldFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

/** Check if element is B tag with non-normal font weight */
function isBTagWithBoldWeight(nodeName: string, fontWeight: string): boolean {
  return nodeName === 'B' && fontWeight !== 'normal'
}

/** Check if text decoration is underline */
function isUnderlineDecoration(textDecoration: string): boolean {
  return textDecoration === 'underline'
}

/** Check if text decoration is line-through */
function isLineThroughDecoration(textDecoration: string): boolean {
  return textDecoration === 'line-through'
}

/** Check if element is code span from confluence */
function isConfluenceCodeSpan(nodeName: string, classList: DOMTokenList): boolean {
  return nodeName === 'SPAN' && classList.contains('code')
}

/** Check if vertical align is superscript */
function isSuperscriptAlign(verticalAlign: string): boolean {
  return verticalAlign === 'super'
}

/** Check if vertical align is subscript */
function isSubscriptAlign(verticalAlign: string): boolean {
  return verticalAlign === 'sub'
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

  if (isUnderlineDecoration(textDecoration)) {
    marks.add('underline')
  } else if (isLineThroughDecoration(textDecoration)) {
    marks.add('strikethrough')
  }

  if (isConfluenceCodeSpan(nodeName, element.classList)) {
    marks.add('code')
  }

  if (isBTagWithBoldWeight(nodeName, fontWeight)) {
    marks.add('bold')
  } else if (typeof fontWeight === 'string' && isBoldFontWeight(fontWeight)) {
    marks.add('bold')
  }

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  if (isSuperscriptAlign(verticalAlign)) {
    marks.add('superscript')
  } else if (isSubscriptAlign(verticalAlign)) {
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

/** Check if element is non-HTML node */
function isNonHTMLNode(el: globalThis.Node): el is globalThis.Node {
  return !(el instanceof globalThis.HTMLElement)
}

/** Check if element is BR tag */
function isBRTag(nodeName: string): boolean {
  return nodeName === 'BR'
}

/** Check if element is IMG tag */
function isIMGTag(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/** Check if element is HR tag */
function isHRTag(nodeName: string): boolean {
  return nodeName === 'HR'
}

/** Check if element is dropbox paper blockquote */
function isDropboxPaperBlockquote(classList: DOMTokenList): boolean {
  return classList.contains('listtype-quote')
}

/** Check if element is anchor tag with href */
function isAnchorWithHref(nodeName: string, href: string | null): boolean {
  return nodeName === 'A' && href !== null && href !== ''
}

/** Check if element is PRE tag with content */
function isPreWithContent(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && textContent !== null && textContent !== ''
}

/** Check if element is LI tag */
function isLITag(nodeName: string): boolean {
  return nodeName === 'LI'
}

/** Check if element is P tag */
function isPTag(nodeName: string): boolean {
  return nodeName === 'P'
}

/** Check if element is BLOCKQUOTE tag */
function isBlockquoteTag(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/** Check if element is OL tag */
function isOLTag(nodeName: string): boolean {
  return nodeName === 'OL'
}

/** Check if element is UL tag */
function isULTag(nodeName: string): boolean {
  return nodeName === 'UL'
}

/** Check if element is DIV with non-block children */
function isDivWithInlineChildren(nodeName: string, firstChild: DeserializedNode | undefined): boolean {
  return nodeName === 'DIV' && !isBlock(firstChild)
}

function handleNonHTMLNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

function handleBRTag(): DeserializedNode[] {
  return getInlineNodes('\n')
}

function handleIMGTag(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? ''
  return getInlineNodes(alt)
}

function handleHRTag(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

function handleDropboxPaperBlockquote(
  el: globalThis.HTMLElement,
  marks: Set<Mark>
): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

function handleAnchorTag(el: globalThis.HTMLElement, href: string): DeserializedNode[] {
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function handlePreTag(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

function handleListItemTag(
  el: globalThis.HTMLElement,
  children: DeserializedNodes
): DeserializedNode[] {
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

function handleParagraphTag(el: globalThis.HTMLElement, children: DeserializedNodes): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

function handleHeadingTag(
  nodeName: string,
  el: globalThis.HTMLElement,
  children: DeserializedNodes
): DeserializedNode[] {
  const headingLevel = headings[nodeName]
  return [
    { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
  ]
}

function handleBlockquoteTag(children: DeserializedNodes): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

function handleOrderedListTag(children: DeserializedNodes): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

function handleUnorderedListTag(children: DeserializedNodes): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

function handleDivTag(children: DeserializedNodes): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isNonHTMLNode(el)) {
    return handleNonHTMLNode(el)
  }

  const { nodeName } = el as globalThis.HTMLElement

  if (isBRTag(nodeName)) {
    return handleBRTag()
  }

  if (isIMGTag(nodeName)) {
    return handleIMGTag(el as globalThis.HTMLElement)
  }

  if (isHRTag(nodeName)) {
    return handleHRTag()
  }

  const htmlElement = el as globalThis.HTMLElement
  const marks = marksFromElementAttributes(htmlElement)

  if (isDropboxPaperBlockquote(htmlElement.classList)) {
    return handleDropboxPaperBlockquote(htmlElement, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const href = htmlElement.getAttribute('href')
    if (isAnchorWithHref(nodeName, href)) {
      return handleAnchorTag(htmlElement, href)
    }

    if (isPreWithContent(nodeName, htmlElement.textContent)) {
      return handlePreTag(htmlElement)
    }

    const deserialized = deserializeNodes(htmlElement.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isLITag(nodeName)) {
      return handleListItemTag(htmlElement, children)
    }

    if (isPTag(nodeName)) {
      return handleParagraphTag(htmlElement, children)
    }

    const headingLevel = headings[nodeName]
    if (typeof headingLevel === 'number') {
      return handleHeadingTag(nodeName, htmlElement, children)
    }

    if (isBlockquoteTag(nodeName)) {
      return handleBlockquoteTag(children)
    }

    if (isOLTag(nodeName)) {
      return handleOrderedListTag(children)
    }

    if (isULTag(nodeName)) {
      return handleUnorderedListTag(children)
    }

    if (isDivWithInlineChildren(nodeName, children[0])) {
      return handleDivTag(children)
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

  if (!deserializedNodes.some(isBlock)) {
    return deserializedNodes as DeserializedNodes
  }

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