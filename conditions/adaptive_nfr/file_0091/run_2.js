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
  const confluenceAlign = parent?.dataset.align
  if (confluenceAlign === 'center' || confluenceAlign === 'end') {
    return confluenceAlign
  }

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  return getAlignmentFromGoogleDocs(element)
}

/** @internal Extracts alignment from Google Docs style attributes */
function getAlignmentFromGoogleDocs(element: HTMLElement): 'center' | 'end' | undefined {
  const textAlign = element.style.textAlign
  if (textAlign === 'center') {
    return 'center'
  }
  if (textAlign === 'right' || textAlign === 'end') {
    return 'end'
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
  } else if (isBoldFontWeight(fontWeight)) {
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

/** @internal Determines if font weight indicates bold styling */
function isBoldFontWeight(fontWeight: string): boolean {
  if (fontWeight === 'bold' || fontWeight === 'bolder' || fontWeight === '1000') {
    return true
  }
  return /^[5-9]\d{2}$/.test(fontWeight)
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

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

  if (el.classList.contains('listtype-quote')) {
    return deserializeDropboxQuote(marks, el)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    return deserializeElementByNodeName(el)
  })
}

/** @internal Deserializes text nodes */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/** @internal Deserializes image nodes */
function deserializeImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? ''
  return getInlineNodes(alt)
}

/** @internal Deserializes Dropbox Paper blockquotes */
function deserializeDropboxQuote(marks: Set<Mark>, el: globalThis.HTMLElement): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

/** @internal Routes element deserialization by node name */
function deserializeElementByNodeName(el: globalThis.HTMLElement): DeserializedNode[] {
  const { nodeName } = el

  if (nodeName === 'A') {
    return deserializeAnchorElement(el)
  }

  if (nodeName === 'PRE') {
    return deserializePreElement(el)
  }

  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  if (nodeName === 'LI') {
    return deserializeListItem(children)
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

  return deserializeNodes(el.childNodes)
}

/** @internal Deserializes anchor elements */
function deserializeAnchorElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.dataset.href
  if (!href) {
    return deserializeNodes(el.childNodes)
  }
  return setLinkForChildren(href, () =>
    forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
  )
}

/** @internal Deserializes pre elements */
function deserializePreElement(el: globalThis.HTMLElement): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return deserializeNodes(el.childNodes)
  }
  return [{ type: 'code', children: [{ text }] }]
}

/** @internal Deserializes list item elements */
function deserializeListItem(children: DeserializedNodes): DeserializedNode[] {
  let nestedList: Block | undefined

  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (isNestedList(node) && nestedList === undefined) {
        nestedList = node
        return false
      }
      return true
    }),
  }

  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return [{ type: 'list-item', children: listItemChildren }]
}

/** @internal Checks if node is a nested list */
function isNestedList(node: DeserializedNode): boolean {
  return node.type === 'ordered-list' || node.type === 'unordered-list'
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

  return fixBlockMixedWithInlines(deserializedNodes)
}

/** @internal Fixes nodes when blocks are mixed with inline content */
function fixBlockMixedWithInlines(deserializedNodes: DeserializedNode[]): DeserializedNodes {
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

    if (isSignificantContent(node)) {
      queuedInlines.push(node)
    }
  }

  flushInlines()
  return result as DeserializedNodes
}

/** @internal Checks if node contains significant non-whitespace content */
function isSignificantContent(node: DeserializedNode): boolean {
  return Node.string(node).trim() !== ''
}