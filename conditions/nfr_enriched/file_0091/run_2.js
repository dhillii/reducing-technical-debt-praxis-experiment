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

function getMarkFromNodeName(nodeName: string): Mark | undefined {
  return TEXT_TAGS[nodeName]
}

function addTextDecorationMarks(marks: Set<Mark>, textDecoration: string): void {
  if (textDecoration === 'underline') {
    marks.add('underline')
  } else if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }
}

function addConfluenceCodeMark(marks: Set<Mark>, nodeName: string, classList: DOMTokenList): void {
  if (nodeName === 'SPAN' && classList.contains('code')) {
    marks.add('code')
  }
}

function addBoldMark(marks: Set<Mark>, nodeName: string, fontWeight: string): void {
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

function addItalicMark(marks: Set<Mark>, fontStyle: string): void {
  if (fontStyle === 'italic') {
    marks.add('italic')
  }
}

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

  const markFromNodeName = getMarkFromNodeName(nodeName)
  if (markFromNodeName) {
    marks.add(markFromNodeName)
  }

  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style

  addTextDecorationMarks(marks, textDecoration)
  addConfluenceCodeMark(marks, nodeName, element.classList)
  addBoldMark(marks, nodeName, fontWeight)
  addItalicMark(marks, fontStyle)
  addVerticalAlignMarks(marks, verticalAlign)

  return marks
}

function deserializeImageNode(element: globalThis.HTMLElement): InlineFromExternalPaste[] {
  const alt = element.dataset.alt ?? ''
  return getInlineNodes(alt)
}

function deserializeLinkNode(element: globalThis.HTMLElement): DeserializedNode[] {
  const href = element.dataset.href
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(element.childNodes))
    )
  }
  return deserializeNodes(element.childNodes)
}

function deserializeCodeBlockNode(element: globalThis.HTMLElement): Block[] {
  return [{ type: 'code', children: [{ text: element.textContent || '' }] }]
}

function deserializeListItemNode(children: DeserializedNode[]): Block[] {
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

function deserializeParagraphNode(element: globalThis.HTMLElement, children: DeserializedNode[]): Block[] {
  return [{ type: 'paragraph', textAlign: getAlignmentFromElement(element), children }]
}

function deserializeHeadingNode(element: globalThis.HTMLElement, level: number, children: DeserializedNode[]): Block[] {
  return [
    { type: 'heading', level, textAlign: getAlignmentFromElement(element), children },
  ]
}

function deserializeBlockquoteNode(children: DeserializedNode[]): Block[] {
  return [{ type: 'blockquote', children }]
}

function deserializeOrderedListNode(children: DeserializedNode[]): Block[] {
  return [{ type: 'ordered-list', children }]
}

function deserializeUnorderedListNode(children: DeserializedNode[]): Block[] {
  return [{ type: 'unordered-list', children }]
}

function deserializeDivNode(children: DeserializedNode[], deserialized: DeserializedNode[]): DeserializedNode[] {
  if (!isBlock(children[0])) {
    return [{ type: 'paragraph', children }]
  }
  return deserialized
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent
    if (!text) {
      return []
    }
    return getInlineNodes(text)
  }

  const { nodeName } = el

  if (nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (nodeName === 'IMG') {
    return deserializeImageNode(el)
  }

  if (nodeName === 'HR') {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    if (nodeName === 'A') {
      return deserializeLinkNode(el)
    }

    if (nodeName === 'PRE' && el.textContent) {
      return deserializeCodeBlockNode(el)
    }

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

    if (nodeName === 'DIV') {
      return deserializeDivNode(children, deserialized)
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