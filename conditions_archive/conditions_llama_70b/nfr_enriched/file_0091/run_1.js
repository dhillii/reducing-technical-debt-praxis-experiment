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

/**
 * Extracts the alignment from an HTML element.
 * 
 * @param element The HTML element to extract alignment from.
 * @returns The alignment of the element, or undefined if not found.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  // confluence
  const attribute = parent?.dataset.align
  // note: we don't show html that confluence would parse as alignment
  // we could change that but meh
  // (they match on div.fabric-editor-block-mark with data-align)
  if (attribute === 'center' || attribute === 'end') {
    return attribute
  }
  if (element instanceof HTMLElement) {
    // Google docs
    const textAlign = element.style.textAlign
    if (textAlign === 'center') {
      return 'center'
    }
    // TODO: RTL things?
    if (textAlign === 'right' || textAlign === 'end') {
      return 'end'
    }
  }
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
 * Extracts marks from an HTML element's attributes.
 * 
 * @param element The HTML element to extract marks from.
 * @returns A set of marks extracted from the element.
 */
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
  // confluence
  if (nodeName === 'SPAN' && element.classList.contains('code')) {
    marks.add('code')
  }
  // Google Docs does weird things with <b>
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
  // Google Docs uses vertical align for subscript and superscript instead of <sup> and <sub>
  if (verticalAlign === 'super') {
    marks.add('superscript')
  } else if (verticalAlign === 'sub') {
    marks.add('subscript')
  }
  return marks
}

/**
 * Deserializes an HTML string into a Slate-compatible node structure.
 * 
 * @param html The HTML string to deserialize.
 * @returns The deserialized node structure.
 */
export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

type DeserializedNode = InlineFromExternalPaste | Block

type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]]

/**
 * Deserializes a single HTML node into a Slate-compatible node structure.
 * 
 * @param el The HTML node to deserialize.
 * @returns The deserialized node structure.
 */
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

  // Dropbox Paper displays blockquotes as lists for some reason
  if (el.classList.contains('listtype-quote')) {
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  return addMarksToChildren(marks, (): DeserializedNode[] => {
    const { nodeName } = el

    if (nodeName === 'A') {
      return deserializeLinkNode(el)
    }

    if (nodeName === 'PRE' && el.textContent) {
      return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
    }

    const deserialized = deserializeNodes(el.childNodes)
    const children = fixNodesForBlockChildren(deserialized)

    if (nodeName === 'LI') {
      return deserializeListItemNode(el, children)
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

/**
 * Deserializes a text node into a Slate-compatible node structure.
 * 
 * @param el The text node to deserialize.
 * @returns The deserialized node structure.
 */
function deserializeTextNode(el: globalThis.Node): DeserializedNode[] {
  const text = el.textContent
  if (!text) {
    return []
  }
  return getInlineNodes(text)
}

/**
 * Deserializes an image node into a Slate-compatible node structure.
 * 
 * @param el The image node to deserialize.
 * @returns The deserialized node structure.
 */
function deserializeImageNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const alt = el.dataset.alt
  return getInlineNodes(alt ?? '')
}

/**
 * Deserializes a link node into a Slate-compatible node structure.
 * 
 * @param el The link node to deserialize.
 * @returns The deserialized node structure.
 */
function deserializeLinkNode(el: globalThis.HTMLElement): DeserializedNode[] {
  const href = el.dataset.href
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    )
  }
  return deserializeNodes(el.childNodes)
}

/**
 * Deserializes a list item node into a Slate-compatible node structure.
 * 
 * @param el The list item node to deserialize.
 * @param children The children of the list item node.
 * @returns The deserialized node structure.
 */
function deserializeListItemNode(el: globalThis.HTMLElement, children: DeserializedNode[]): DeserializedNode[] {
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

/**
 * Deserializes a collection of HTML nodes into a Slate-compatible node structure.
 * 
 * @param nodes The HTML nodes to deserialize.
 * @returns The deserialized node structure.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: (InlineFromExternalPaste | Block)[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Fixes the node structure for block children.
 * 
 * @param deserializedNodes The deserialized node structure.
 * @returns The fixed node structure.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    // Slate also gets unhappy if an element has no children
    // the empty text nodes will get normalized away if they're not needed
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
      // we want to ignore whitespace between block level elements
      // useful info about whitespace in html:
      // https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Whitespace
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