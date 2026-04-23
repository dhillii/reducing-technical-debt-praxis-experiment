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

function getConfluenceAlignment(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const attribute = parent?.dataset.align
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  return undefined
}

function getGoogleDocsAlignment(element: globalThis.HTMLElement): 'center' | 'end' | undefined {
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
  if (element instanceof HTMLElement) {
    const googleDocsAlignment = getGoogleDocsAlignment(element)
    if (googleDocsAlignment) {
      return googleDocsAlignment
    }
  }
  return getConfluenceAlignment(element)
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

function addMarkFromNodeName(marks: Set<Mark>, nodeName: string): void {
  const markFromNodeName = TEXT_TAGS[nodeName]
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }
}

function addMarkFromTextDecoration(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

function addMarkFromFontWeight(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
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
}

function addMarkFromVerticalAlign(marks: Set<Mark>, verticalAlign: string): void {
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }
}

function addConfluenceCodeMark(marks: Set<Mark>, element: globalThis.HTMLElement, nodeName: string): void {
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }
}

function marksFromElementAttributes(element: globalThis.HTMLElement) {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element

  addMarkFromNodeName(marks, nodeName)
  addMarkFromTextDecoration(marks, style.textDecoration)
  addConfluenceCodeMark(marks, element, nodeName)
  addMarkFromFontWeight(marks, nodeName, style.fontWeight)

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  addMarkFromVerticalAlign(marks, style.verticalAlign)

  return marks
}

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

function deserializeBreakNode(): DeserializedNode[] {
  return getInlineNodes('\n')
}

function deserializeImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt ?? ''
  return getInlineNodes(alt)
}

function deserializeDividerNode(): DeserializedNode[] {
  return [{ type: 'divider', children: [{ text: '' }] }]
}

function deserializeDropboxQuoteNode(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  marks.delete('italic')
  return addMarksToChildren(marks, () => [
    { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
  ])
}

function deserializeLinkNode(el: globalThis.HTMLElement): DeserializedNode[] | null {
  const href = el.dataset.href
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return null
}

function deserializeCodeBlockNode(el: globalThis.HTMLElement): DeserializedNode[] | null {
  if (el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }
  return null
}

function deserializeListItemNode(children: DeserializedNode[]): DeserializedNode[] {
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

function deserializeParagraphNode(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
}

function deserializeHeadingNode(el: globalThis.HTMLElement, level: number, children: DeserializedNode[]): DeserializedNode[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(el), children },
  ]
}

function deserializeBlockquoteNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'blockquote', children }]
}

function deserializeOrderedListNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'ordered-list', children }]
}

function deserializeUnorderedListNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'unordered-list', children }]
}

function deserializeDivAsParaNode(children: DeserializedNode[]): DeserializedNode[] {
  return [{ type: 'paragraph', children }]
}

function deserializeElementNode(el: globalThis.HTMLElement, marks: Set<Mark>): DeserializedNode[] {
  const { nodeName } = el
  const deserialized = deserializeNodes(el.childNodes)
  const children = fixNodesForBlockChildren(deserialized)

  if (nodeName === 'LI') {
    return deserializeListItemNode(children)
  }

  if (nodeName === 'P') {
    return deserializeParagraphNode(el, children)
  }

  const headingLevel = headings[nodeName]
  if (typeof headingLevel === 'number') {
    return deserializeHeadingNode(el, headingLevel, children)
  }

  if (nodeName === 'BLOCKQUOTE') {
    return deserializeBlockquoteNode(children)
  }

  if (nodeName === 'OL') {
    return deserializeOrderedListNode(children)
  }

  if (nodeName === 'UL') {
    return deserializeUnorderedListNode(children)
  }

  if (nodeName === 'DIV' && !isBlock(children[0])) {
    return deserializeDivAsParaNode(children)
  }

  return deserialized
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    return deserializeTextNode(el)
  }

  const { nodeName } = el

  if (nodeName === 'BR') {
    return deserializeBreakNode()
  }

  if (nodeName === 'IMG') {
    return deserializeImageNode(el)
  }

  if (nodeName === 'HR') {
    return deserializeDividerNode()
  }

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    return deserializeDropboxQuoteNode(el, marks)
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (nodeName === 'A') {
      const linkResult = deserializeLinkNode(el)
      if (linkResult) {
        return linkResult
      }
    }

    if (nodeName === 'PRE') {
      const codeResult = deserializeCodeBlockNode(el)
      if (codeResult) {
        return codeResult
      }
    }

    return deserializeElementNode(el, marks)
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
    return fixBlockMixedWithInlines(deserializedNodes)
  }

  return deserializedNodes as DeserializedNodes
}

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

    if (Node.string(node).trim() !== '') {
      queuedInlines.push(node)
    }
  }

  flushInlines()
  return result as DeserializedNodes
}