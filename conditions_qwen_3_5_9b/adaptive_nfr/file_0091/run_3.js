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

  if (!parent) {
    return undefined
  }

  const attribute = parent.dataset.align

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

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
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

function isNodeTextContentEmpty(node: globalThis.Node): boolean {
  return !node.textContent
}

function isNodeBreak(node: globalThis.Node): boolean {
  return node.nodeName === 'BR'
}

function isNodeImage(node: globalThis.Node): boolean {
  return node.nodeName === 'IMG'
}

function isNodeHorizontalRule(node: globalThis.Node): boolean {
  return node.nodeName === 'HR'
}

function isNodeListItem(node: globalThis.Node): boolean {
  return node.nodeName === 'LI'
}

function isNodeParagraph(node: globalThis.Node): boolean {
  return node.nodeName === 'P'
}

function isNodeHeading(node: globalThis.Node): boolean {
  return typeof headings[node.nodeName] === 'number'
}

function isNodeBlockquote(node: globalThis.Node): boolean {
  return node.nodeName === 'BLOCKQUOTE'
}

function isNodeOrderedList(node: globalThis.Node): boolean {
  return node.nodeName === 'OL'
}

function isNodeUnorderedList(node: globalThis.Node): boolean {
  return node.nodeName === 'UL'
}

function isNodeDivWithInlineChildren(node: globalThis.Node): boolean {
  return node.nodeName === 'DIV' && !isBlock(node.childNodes[0] as DeserializedNode)
}

function isNodeLink(node: globalThis.Node): boolean {
  return node.nodeName === 'A'
}

function isNodePre(node: globalThis.Node): boolean {
  return node.nodeName === 'PRE'
}

function isNodeDropboxQuote(node: globalThis.Node): boolean {
  return node.classList.contains('listtype-quote')
}

function isNodeBlock(node: globalThis.Node): boolean {
  return node instanceof globalThis.HTMLElement && isBlock(node as DeserializedNode)
}

function isNodeHasNonEmptyTextContent(node: globalThis.Node): boolean {
  return Node.string(node).trim() !== ''
}

export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    if (isNodeTextContentEmpty(el)) {
      return []
    }
    return getInlineNodes(el.textContent)
  }

  if (isNodeBreak(el)) {
    return getInlineNodes('\n')
  }

  if (isNodeImage(el)) {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (isNodeHorizontalRule(el)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  const marks = marksFromElementAttributes(el)

  if (isNodeDropboxQuote(el)) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (isNodeLink(el)) {
      const href = el.getAttribute('href')
      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (isNodePre(el)) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (isNodeListItem(el)) {
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

    if (isNodeParagraph(el)) {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    if (isNodeHeading(el)) {
      const headingLevel = headings[nodeName]
      return [
        { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
      ]
    }

    if (isNodeBlockquote(el)) {
      return [{ type: 'blockquote', children }]
    }
    if (isNodeOrderedList(el)) {
      return [{ type: 'ordered-list', children }]
    }
    if (isNodeUnorderedList(el)) {
      return [{ type: 'unordered-list', children }]
    }
    if (isNodeDivWithInlineChildren(el)) {
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

  const hasBlockNodes = deserializedNodes.some(isBlock)

  if (hasBlockNodes) {
    const result: DeserializedNode[] = []
    let queuedInlines: InlineFromExternalPaste[] = []

    const flushInlines = (): void => {
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

      if (isNodeHasNonEmptyTextContent(node)) {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}