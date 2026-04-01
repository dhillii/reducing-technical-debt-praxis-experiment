```typescript
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

/** Checks if parent has confluence data-align attribute with valid alignment value */
function getConfluenceAlignment(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const attribute = parent?.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  return undefined
}

/** Extracts text alignment from Google Docs style attribute */
function getGoogleDocsAlignment(element: HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
  }
  return undefined
}

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const confluenceAlign = getConfluenceAlignment(element)
  if (confluenceAlign) {
    return confluenceAlign
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

/** Checks if text decoration indicates underline */
function hasUnderlineDecoration(textDecoration: string): boolean {
  return textDecoration === 'underline'
}

/** Checks if text decoration indicates strikethrough */
function hasStrikethroughDecoration(textDecoration: string): boolean {
  return textDecoration === 'line-through'
}

/** Checks if element is a span with code class (Confluence) */
function isConfluenceCodeSpan(nodeName: string, classList: DOMTokenList): boolean {
  return nodeName === 'SPAN' && classList.contains('code')
}

/** Checks if bold weight is explicitly set */
function isBoldFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

/** Checks if B element has non-normal font weight */
function isBElementWithBoldWeight(nodeName: string, fontWeight: string): boolean {
  return nodeName === 'B' && fontWeight !== 'normal'
}

/** Checks if vertical align indicates superscript */
function isSuperscriptAlign(verticalAlign: string): boolean {
  return verticalAlign === 'super'
}

/** Checks if vertical align indicates subscript */
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

  if (hasUnderlineDecoration(textDecoration)) {
    marks.add('underline')
  } else if (hasStrikethroughDecoration(textDecoration)) {
    marks.add('strikethrough')
  }

  if (isConfluenceCodeSpan(nodeName, element.classList)) {
    marks.add('code')
  }

  if (isBElementWithBoldWeight(nodeName, fontWeight)) {
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

/** Checks if element is a non-HTML node */
function isNonHTMLNode(el: globalThis.Node): el is globalThis.Node & { textContent: string | null } {
  return !(el instanceof globalThis.HTMLElement)
}

/** Checks if element is a line break */
function isLineBreak(nodeName: string): boolean {
  return nodeName === 'BR'
}

/** Checks if element is an image */
function isImage(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/** Checks if element is a horizontal rule */
function isHorizontalRule(nodeName: string): boolean {
  return nodeName === 'HR'
}

/** Checks if element is a Dropbox Paper blockquote */
function isDropboxPaperBlockquote(classList: DOMTokenList): boolean {
  return classList.contains('listtype-quote')
}

/** Checks if element is an anchor tag */
function isAnchor(nodeName: string): boolean {
  return nodeName === 'A'
}

/** Checks if element is a preformatted code block */
function isPreformattedCode(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && textContent
}

/** Checks if element is a list item */
function isListItem(nodeName: string): boolean {
  return nodeName === 'LI'
}

/** Checks if element is a paragraph */
function isParagraph(nodeName: string): boolean {
  return nodeName === 'P'
}

/** Checks if element is a blockquote */
function isBlockquote(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/** Checks if element is an ordered list */
function isOrderedList(nodeName: string): boolean {
  return nodeName === 'OL'
}

/** Checks if element is an unordered list */
function isUnorderedList(nodeName: string): boolean {
  return nodeName === 'UL'
}

/** Checks if element is a div without block children */
function isDivWithoutBlockChildren(nodeName: string, firstChild: DeserializedNode | undefined): boolean {
  return nodeName === 'DIV' && !isBlock(firstChild)
}

function deserializeNonHTMLNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

function deserializeLineBreak(): DeserializedNode[] {
  return getInlineNodes('\n')
}

function deserializeImage(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? el.getAttribute('alt') ?? ''
  return getInlineNodes(alt)
}

function deserializeHorizontalRule(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

function deserializeDropboxPaperBlockquote(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

function deserializeAnchor(el: globalThis.HTMLElement): DeserializedNode[] | null {
  const href = el.dataset.href ?? el.getAttribute('href')
  if (!href) {
    return null
  }
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

function deserializePreformattedCode(el: globalThis.HTMLElement): DeserializedNode[] {
  return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
}

function deserializeListItem(children: DeserializedNode[]): DeserializedNode[] {
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

function deserializeParagraph(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

function deserializeHeading(nodeName: string, el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] | null {
  const headingLevel = headings[nodeName]
  if (typeof headingLevel !== 'number') {
    return null
  }
  return [
    { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
  ]
}

function deserializeBlockquote(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

function deserializeOrderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

function deserializeUnorderedList(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

function deserializeDivWithoutBlocks(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (isNonHTMLNode(el)) {
    return deserializeNonHTMLNode(el)
  }

  if (!(el instanceof globalThis.HTMLElement)) {
    return []
  }

  const { nodeName } = el

  if (isLineBreak(nodeName)) {
    return deserializeLineBreak()
  }

  if (isImage(nodeName)) {
    return deserializeImage(el)
  }

  if (isHorizontalRule(nodeName)) {
    return deserializeHorizontalRule()
  }

  const marks = marksFromElementAttributes(el)

  if (isDropboxPaperBlockquote(el.classList)) {
    return deserializeDropboxPaperBlockquote(el, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (isAnchor(nodeName)) {
      const anchorResult = deserializeAnchor(el)
      if (anchorResult !== null) {
        return anchorResult
      }
    }

    if (isPreformattedCode(nodeName, el.textContent)) {
      return deserializePreformattedCode(el)
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isListItem(nodeName)) {
      return deserializeListItem(children)
    }

    if (isParagraph(nodeName)) {
      return deserializeParagraph(el, children)
    }

    const headingResult = deserializeHeading(nodeName, el, children)
    if (headingResult !== null) {
      return headingResult
    }

    if (isBlockquote(nodeName)) {
      return deserializeBlockquote(children)
    }

    if (isOrderedList(nodeName)) {
      return deserializeOrderedList(children)
    }

    if (isUnorderedList(nodeName)) {
      return deserializeUnorderedList(children)
    }

    if (isDivWithoutBlockChildren(nodeName, children[0])) {
      return deserializeDivWithoutBlocks(children)
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
```