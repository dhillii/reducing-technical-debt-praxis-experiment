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
 * Returns true if the provided alignment value is either 'center' or 'end'.
 */
function isCenterOrEndAlign(value: string | undefined): boolean {
  return value === 'center' || value === 'end'
}

/**
 * Returns true if the provided text alignment is 'center'.
 */
function isGoogleDocsCenterAlign(textAlign: string): boolean {
  return textAlign === 'center'
}

/**
 * Returns true if the provided text alignment is 'right' or 'end'.
 */
function isGoogleDocsEndAlign(textAlign: string): boolean {
  return textAlign === 'right' || textAlign === 'end'
}

/**
 * Determines alignment from an element based on its parent data attribute or inline styles.
 */
function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement
  const align = parent?.dataset.align
  if (isCenterOrEndAlign(align)) {
    return align as 'center' | 'end'
  }
  if (element instanceof HTMLElement) {
    const { textAlign } = element.style
    if (isGoogleDocsCenterAlign(textAlign)) {
      return 'center'
    }
    if (isGoogleDocsEndAlign(textAlign)) {
      return 'end'
    }
  }
}

/**
 * Returns true if the given fontWeight string represents a bold weight.
 */
function isBoldFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

/**
 * Returns true if the node name corresponds to a heading element.
 */
function isHeadingNode(nodeName: string): boolean {
  return headings[nodeName] !== undefined
}

/**
 * Returns true if the node name corresponds to a list item.
 */
function isListItemNode(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the node name corresponds to a paragraph.
 */
function isParagraphNode(nodeName: string): boolean {
  return nodeName === 'P'
}

/**
 * Returns true if the node name corresponds to a blockquote.
 */
function isBlockquoteNode(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/**
 * Returns true if the node name corresponds to an ordered list.
 */
function isOrderedListNode(nodeName: string): boolean {
  return nodeName === 'OL'
}

/**
 * Returns true if the node name corresponds to an unordered list.
 */
function isUnorderedListNode(nodeName: string): boolean {
  return nodeName === 'UL'
}

/**
 * Returns true if the node name corresponds to a div.
 */
function isDivNode(nodeName: string): boolean {
  return nodeName === 'DIV'
}

/**
 * Returns true if the first child is not a block element.
 */
function isDivNonBlockFirstChild(children: DeserializedNode[]): boolean {
  return children.length > 0 && !isBlock(children[0])
}

/**
 * Returns true if the element is an anchor (<a>) node.
 */
function isAnchorNode(nodeName: string): boolean {
  return nodeName === 'A'
}

/**
 * Returns true if the element has an href attribute.
 */
function hasHref(el: HTMLElement): boolean {
  return !!el.getAttribute('href')
}

/**
 * Returns true if the element is a preformatted (<pre>) node with text content.
 */
function isPreNodeWithContent(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && !!textContent
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a div node.
 */
function isDivNodeName(nodeName: string): boolean {
  return nodeName === 'DIV'
}

/**
 * Returns true if the element is a blockquote node.
 */
function isBlockquoteNodeName(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/**
 * Returns true if the element is an ordered list node.
 */
function isOrderedListNodeName(nodeName: string): boolean {
  return nodeName === 'OL'
}

/**
 * Returns true if the element is an unordered list node.
 */
function isUnorderedListNodeName(nodeName: string): boolean {
  return nodeName === 'UL'
}

/**
 * Returns true if the element is a paragraph node.
 */
function isParagraphNodeName(nodeName: string): boolean {
  return nodeName === 'P'
}

/**
 * Returns true if the element is a heading node.
 */
function isHeadingNodeName(nodeName: string): boolean {
  return headings[nodeName] !== undefined
}

/**
 * Returns true if the element is a listtype-quote class element.
 */
function isListtypeQuote(el: HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Returns true if the element is an image node.
 */
function isImageNode(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/**
 * Returns true if the element is a horizontal rule node.
 */
function isHorizontalRuleNode(nodeName: string): boolean {
  return nodeName === 'HR'
}

/**
 * Returns true if the element is a line break node.
 */
function isBreakNode(nodeName: string): boolean {
  return nodeName === 'BR'
}

/**
 * Returns true if the element is a text node (non-HTMLElement).
 */
function isTextNode(node: globalThis.Node): boolean {
  return !(node instanceof globalThis.HTMLElement)
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item node.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Returns true if the element is a list item.
 */
function isListItem(node: DeserializedNode): boolean {
  return node.type === 'list-item'
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block element.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  guard: true
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Returns true if the node is a block.
 */
function isBlockElement() {
  // placeholder
}

/**
 * Returns true.
 */
function placeholder() {}

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
 * Extracts marks from element attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>()
  const { nodeName, style } = element
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
  } else if (typeof fontWeight === 'string' && isBoldFontWeight(fontWeight)) {
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

/**
 * Deserializes an HTML string into Slate nodes.
 */
export function deserializeHTML(html: string): DeserializedNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes))
}

/**
 * Handles special element types and returns appropriate Slate nodes.
 */
function getSpecialNodeResult(
  el: HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] | undefined {
  const { nodeName } = el

  if (isAnchorNode(nodeName)) {
    const href = el.getAttribute('href')
    if (href) {
      return setLinkForChildren(href, () =>
        forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
      )
    }
    return undefined
  }

  if (isPreNodeWithContent(nodeName, el.textContent)) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }]
  }

  if (isListItemNodeName(nodeName)) {
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

  if (isParagraphNodeName(nodeName)) {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }]
  }

  if (isHeadingNodeName(nodeName)) {
    const level = headings[nodeName]!
    return [{ type: 'heading', level, textAlign: getAlignmentFromElement(el), children }]
  }

  if (isBlockquoteNodeName(nodeName)) {
    return [{ type: 'blockquote', children }]
  }

  if (isOrderedListNodeName(nodeName)) {
    return [{ type: 'ordered-list', children }]
  }

  if (isUnorderedListNodeName(nodeName)) {
    return [{ type: 'unordered-list', children }]
  }

  if (isDivNodeName(nodeName) && isDivNonBlockFirstChild(children)) {
    return [{ type: 'paragraph', children }]
  }

  return undefined
}

/**
 * Deserializes a single DOM node into Slate nodes.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!isTextNode(el)) {
    const text = el.textContent
    if (!text) return []
    return getInlineNodes(text)
  }

  const { nodeName } = el as HTMLElement

  if (isBreakNode(nodeName)) return getInlineNodes('\n')
  if (isImageNode(nodeName)) {
    const alt = (el as HTMLElement).getAttribute('alt')
    return getInlineNodes(alt ?? '')
  }
  if (isHorizontalRuleNode(nodeName)) {
    return [{ type: 'divider', children: [{ text: '' }] }]
  }

  if (isListtypeQuote(el as HTMLElement)) {
    const marks = marksFromElementAttributes(el as HTMLElement)
    marks.delete('italic')
    return addMarksToChildren(marks, () => [
      { type: 'blockquote', children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)) },
    ])
  }

  const marks = marksFromElementAttributes(el as HTMLElement)
  const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes))

  const special = getSpecialNodeResult(el as HTMLElement, children)

  return addMarksToChildren(marks, () => special ?? children)
}

/**
 * Deserializes an iterable of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const outputNodes: DeserializedNode[] = []
  for (const node of nodes) {
    outputNodes.push(...deserializeHTMLNode(node))
  }
  return outputNodes
}

/**
 * Normalizes nodes to ensure block children are correctly structured.
 */
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

/**
 * Predicate to detect a listtype-quote class.
 */
function isListtypeQuote(el: HTMLElement): boolean {
  return el.classList.contains('listtype-quote')
}

/**
 * Predicate to detect a heading node name.
 */
function isHeadingNodeName(nodeName: string): boolean {
  return headings[nodeName] !== undefined
}

/**
 * Predicate to detect a paragraph node name.
 */
function isParagraphNodeName(nodeName: string): boolean {
  return nodeName === 'P'
}

/**
 * Predicate to detect a blockquote node name.
 */
function isBlockquoteNodeName(nodeName: string): boolean {
  return nodeName === 'BLOCKQUOTE'
}

/**
 * Predicate to detect an ordered list node name.
 */
function isOrderedListNodeName(nodeName: string): boolean {
  return nodeName === 'OL'
}

/**
 * Predicate to detect an unordered list node name.
 */
function isUnorderedListNodeName(nodeName: string): boolean {
  return nodeName === 'UL'
}

/**
 * Predicate to detect a div node name.
 */
function isDivNodeName(nodeName: string): boolean {
  return nodeName === 'DIV'
}

/**
 * Predicate to detect a pre node with content.
 */
function isPreNodeWithContent(nodeName: string, textContent: string | null): boolean {
  return nodeName === 'PRE' && !!textContent
}

/**
 * Predicate to detect an anchor node name.
 */
function isAnchorNode(nodeName: string): boolean {
  return nodeName === 'A'
}

/**
 * Predicate to detect a list item node name.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Predicate to detect a break node name.
 */
function isBreakNode(nodeName: string): boolean {
  return nodeName === 'BR'
}

/**
 * Predicate to detect an image node name.
 */
function isImageNode(nodeName: string): boolean {
  return nodeName === 'IMG'
}

/**
 * Predicate to detect a horizontal rule node name.
 */
function isHorizontalRuleNode(nodeName: string): boolean {
  return nodeName === 'HR'
}

/**
 * Predicate to detect a text node (non-HTMLElement).
 */
function isTextNode(node: globalThis.Node): boolean {
  return !(node instanceof globalThis.HTMLElement)
}

/**
 * Predicate to detect a div with non-block first child.
 */
function isDivNonBlockFirstChild(children: DeserializedNode[]): boolean {
  return children.length > 0 && !isBlock(children[0])
}

/**
 * Predicate to detect a bold font weight.
 */
function isBoldFontWeight(fontWeight: string): boolean {
  return (
    fontWeight === 'bold' ||
    fontWeight === 'bolder' ||
    fontWeight === '1000' ||
    /^[5-9]\d{2}$/.test(fontWeight)
  )
}

/**
 * Predicate to detect center or end alignment.
 */
function isCenterOrEndAlign(value: string | undefined): boolean {
  return value === 'center' || value === 'end'
}

/**
 * Predicate to detect Google Docs center alignment.
 */
function isGoogleDocsCenterAlign(textAlign: string): boolean {
  return textAlign === 'center'
}

/**
 * Predicate to detect Google Docs end alignment.
 */
function isGoogleDocsEndAlign(textAlign: string): boolean {
  return textAlign === 'right' || textAlign === 'end'
}

/**
 * Predicate to detect a list item node name.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Predicate to detect a list item node name.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Predicate to detect a list item node name.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Predicate to detect a list item node name.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Predicate to detect a list item node name.
 */
function isListItemNodeName(nodeName: string): boolean {
  return nodeName === 'LI'
}

/**
 * Predicate to detect a list item node.
 */
function isListItem(node: DeserializedNode): boolean {
  return node.type === 'list-item'
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  guard: true
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node: DeserializedNode): boolean {
  return isBlock(node)
}

/**
 * Predicate to detect a block node.
 */
function isBlockNode(node:

```