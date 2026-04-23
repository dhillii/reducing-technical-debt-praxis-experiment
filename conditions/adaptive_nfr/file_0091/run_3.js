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

  if (element instanceof HTMLElement) {
    return getGoogleDocsAlignment(element)
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

/** Check if font weight indicates bold */
function isBoldFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

/** Add marks from text decoration style */
function addTextDecorationMarks(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

/** Add marks from font weight style */
function addFontWeightMarks(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
    return
  }
  if (typeof fontWeight === 'string' && isBoldFontWeight(fontWeight)) {
    marks.add('bold')
  }
}

/** Add marks from vertical align style */
function addVerticalAlignMarks(marks: Set<Mark>, verticalAlign: string): void {
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }
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

  addTextDecorationMarks(marks, textDecoration)

  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  addFontWeightMarks(marks, nodeName, fontWeight)

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  addVerticalAlignMarks(marks, verticalAlign)

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/** Check if node is not an HTML element */
function isNonHTMLNode(el: globalThis.Node): el is globalThis.Node {
  return !(el instanceof globalThis.HTMLElement)
}

/** Check if node is BR element */
function isBRElement(nodeName: string): boolean {
  return nodeName === 'BR'
}

/** Check if node is IMG element */
function isIMGElement(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/** Check if node is HR element */
function isHRElement(nodeName: string): boolean {
  return nodeName === 'HR'
}

/** Check if element is Dropbox Paper blockquote */
function isDropboxPaperBlockquote(el: globalThis.HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/** Check if node is anchor element */
function isAnchorElement(nodeName: string): boolean {
  return nodeName === 'A'
}

/** Check if node is pre element with content */
function isPreElementWithContent(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && textContent !== null && textContent !== ''
}

/** Check if node is list item */
function isListItemElement(nodeName: string): boolean {
  return nodeName === 'LI'
}

/** Check if node is paragraph */
function isParagraphElement(nodeName: string): boolean {
  return nodeName === 'P'
}

/** Check if node is blockquote */
function isBlockquoteElement(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/** Check if node is ordered list */
function isOrderedListElement(nodeName: string): boolean {
  return nodeName === 'OL'
}

/** Check if node is unordered list */
function isUnorderedListElement(nodeName: string): boolean {
  return nodeName === 'UL'
}

/** Check if node is div without block children */
function isDivWithoutBlockChildren(nodeName: string, firstChild: DeserializedNode | undefined): boolean {
  return nodeName === 'DIV' && !isBlock(firstChild)
}

/** Process non-HTML text node */
function processTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/** Process IMG element */
function processIMGElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? ''
  return getInlineNodes(alt)
}

/** Process anchor element */
function processAnchorElement(el: globalThis.HTMLElement): DeserializedNode[] | null {
  const href = el.dataset.href
  if (!href) {
    return null
  }
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/** Process pre element */
function processPreElement(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

/** Process list item element */
function processListItemElement(children: DeserializedNode[]): DeserializedNode[] {
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

/** Process paragraph element */
function processParagraphElement(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

/** Process heading element */
function processHeadingElement(el: globalThis.HTMLElement, level: number, children: DeserializedNode[]): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

/** Process blockquote element */
function processBlockquoteElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

/** Process ordered list element */
function processOrderedListElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

/** Process unordered list element */
function processUnorderedListElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

/** Process div element without block children */
function processDivElement(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isNonHTMLNode(el)) {
    return processTextNode(el)
  }

  const { nodeName } = el as globalThis.HTMLElement

  if (isBRElement(nodeName)) {
    return getInlineNodes('\n')
  }

  if (isIMGElement(nodeName)) {
    return processIMGElement(el as globalThis.HTMLElement)
  }

  if (isHRElement(nodeName)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const htmlElement = el as globalThis.HTMLElement
  const marks = marksFromElementAttributes(htmlElement)

  if (isDropboxPaperBlockquote(htmlElement)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(htmlElement.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (isAnchorElement(nodeName)) {
      const result = processAnchorElement(htmlElement)
      if (result !== null) {
        return result
      }
    }

    if (isPreElementWithContent(nodeName, htmlElement.textContent)) {
      return processPreElement(htmlElement)
    }

    const deserialized = deserializeNodes(htmlElement.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItemElement(nodeName)) {
      return processListItemElement(children)
    }

    if (isParagraphElement(nodeName)) {
      return processParagraphElement(htmlElement, children)
    }

    const headingLevel = headings[nodeName]
    if (typeof headingLevel === 'number') {
      return processHeadingElement(htmlElement, headingLevel, children)
    }

    if (isBlockquoteElement(nodeName)) {
      return processBlockquoteElement(children)
    }

    if (isOrderedListElement(nodeName)) {
      return processOrderedListElement(children)
    }

    if (isUnorderedListElement(nodeName)) {
      return processUnorderedListElement(children)
    }

    if (isDivWithoutBlockChildren(nodeName, children[0])) {
      return processDivElement(children)
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

/** Check if node has non-whitespace content */
function hasNonWhitespaceContent(node: DeserializedNode): boolean {
  return Node.string(node).trim() !== ''
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

    if (hasNonWhitespaceContent(node)) {
      queuedInlines.push(node)
    }
  }

  flushInlines()
  return result as DeserializedNodes
}