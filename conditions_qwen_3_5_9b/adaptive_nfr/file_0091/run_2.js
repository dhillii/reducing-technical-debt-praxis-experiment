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

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement

  if (!parent) {
    return undefined
  }

  const datasetAlign = parent.dataset.align

  if (datasetAlign === 'center' || datasetAlign === 'end') {
    return datasetAlign
  }

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

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
  }

  if (textDecoration === 'line-through') {
    marks.add('strikethrough')
  }

  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }

  if (nodeName === 'B' && fontWeight !== 'normal') {
    marks.add('bold')
  }

  if (isBoldFontWeight(fontWeight)) {
    marks.add('bold')
  }

  if (style.fontStyle === 'italic') {
    marks.add('italic')
  }

  if (verticalAlign === 'super') {
    marks.add('superscript')
  }

  if (verticalAlign === 'sub') {
    marks.add('subscript')
  }

  return marks
}

function isBoldFontWeight(fontWeight: string | undefined): boolean {
  if (typeof fontWeight !== 'string') {
    return false
  }

  if (fontWeight === 'bold' || fontWeight === 'bolder') {
    return true
  }

  if (fontWeight === '1000') {
    return true
  }

  if (/^[5-9]\d{2}$/.test(fontWeight)) {
    return true
  }

  return false
}

export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent

    if (!text) {
      return []
    }

    return getInlineNodes(text)
  }

  if (el.nodeName === 'BR') {
    return getInlineNodes('\n')
  }

  if (el.nodeName === 'IMG') {
    const alt = el.getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }

  if (el.nodeName === 'HR') {
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
    const { nodeName } = el

    if (nodeName === 'A') {
      const href = el.getAttribute('href')

      if (href) {
        return setLinkForChildren(href, () =>
          forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
        )
      }
    }

    if (nodeName === 'PRE' && el.textContent) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return processListItem(children)
    }

    if (nodeName === 'P') {
      return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
    }

    if (isHeadingNode(nodeName)) {
      const headingLevel = headings[nodeName]

      if (typeof headingLevel === 'number') {
        return [
          { type: 'heading', level: headingLevel, textAlign: getAlignmentFromElement(el), children },
        ]
      }
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

    return deserialized
  })
}

function processListItem(children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined

  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (nestedList === undefined && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
        nestedList = node
        return false
      }
      return true
    }),
  }

  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent]
  return [{ type: 'list-item', children: listItemChildren }]
}

function isHeadingNode(nodeName: string): boolean {
  return nodeName.startsWith('H')
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

  if (hasBlockNodes(deserializedNodes)) {
    return processBlockNodes(deserializedNodes)
  }

  return deserializedNodes as DeserializedNodes
}

function hasBlockNodes(nodes: DeserializedNode[]): boolean {
  return nodes.some(isBlock)
}

function processBlockNodes(nodes: DeserializedNode[]): DeserializedNodes {
  const result: DeserializedNode[] = []
  let queuedInlines: InlineFromExternalPaste[] = []

  const flushInlines = (): void => {
    if (queuedInlines.length) {
      result.push({ type: 'paragraph', children: queuedInlines })
      queuedInlines = []
    }
  }

  for (const node of nodes) {
    if (isBlock(node)) {
      flushInlines()
      result.push(node)
      continue
    }

    if (hasNonEmptyText(node)) {
      queuedInlines.push(node)
    }
  }

  flushInlines()
  return result as DeserializedNodes
}

function hasNonEmptyText(node: DeserializedNode): boolean {
  return Node.string(node).trim() !== ''
}
```