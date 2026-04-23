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
  const alignment = parent?.dataset?.align

  if (alignment === 'center' || alignment === 'end') {
    return alignment
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

function hasMarkFromNodeName(nodeName: string): boolean {
  return TEXT_TAGS[nodeName] !== undefined
}

function hasUnderlineStyle(style: CSSStyleDeclaration): boolean {
  return style.textDecoration === 'underline'
}

function hasLineThroughStyle(style: CSSStyleDeclaration): boolean {
  return style.textDecoration === 'line-through'
}

function hasCodeClass(element: HTMLElement): boolean {
  return element.classList.contains('code')
}

function hasBoldStyle(element: HTMLElement): boolean {
  const { nodeName, style } = element
  const fontWeight = style.fontWeight

  if (nodeName === 'B' && fontWeight !== 'normal') {
    return true
  }

  if (typeof fontWeight === 'string') {
    return fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight)
  }

  return false
}

function hasItalicStyle(style: CSSStyleDeclaration): boolean {
  return style.fontStyle === 'italic'
}

function hasSuperScriptStyle(style: CSSStyleDeclaration): boolean {
  return style.verticalAlign === 'super'
}

function hasSubScriptStyle(style: CSSStyleDeclaration): boolean {
  return style.verticalAlign === 'sub'
}

function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const style = element.style
  const { nodeName } = element

  if (hasMarkFromNodeName(nodeName)) {
    marks.add(TEXT_TAGS[nodeName]!)
  }

  const { fontWeight, textDecoration, verticalAlign } = style

  if (hasUnderlineStyle(style)) {
    marks.add('underline')
  }

  if (hasLineThroughStyle(style)) {
    marks.add('strikethrough')
  }

  if (nodeName === 'SPAN' && hasCodeClass(element)) {
    marks.add('code')
  }

  if (hasBoldStyle(element)) {
    marks.add('bold')
  }

  if (hasItalicStyle(style)) {
    marks.add('italic')
  }

  if (hasSuperScriptStyle(style)) {
    marks.add('superscript')
  }

  if (hasSubScriptStyle(style)) {
    marks.add('subscript')
  }

  return marks
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

      if (Node.string(node).trim() !== '') {
        queuedInlines.push(node)
      }
    }

    flushInlines()
    return result as DeserializedNodes
  }

  return deserializedNodes as DeserializedNodes
}
```