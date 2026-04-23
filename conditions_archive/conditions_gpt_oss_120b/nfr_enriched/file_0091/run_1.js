import { Node } from 'slate';
import { type Block, isBlock } from '../editor-shared';
import { type Mark } from '../utils';
import {
  type InlineFromExternalPaste,
  addMarksToChildren,
  getInlineNodes,
  forceDisableMarkForChildren,
  setLinkForChildren,
} from './utils';

function getAlignmentFromElement(element: globalThis.Element): 'center' | 'end' | undefined {
  const parent = element.parentElement;
  const align = parent?.dataset.align;
  if (align === 'center' || align === 'end') {
    return align;
  }
  if (element instanceof HTMLElement) {
    const { textAlign } = element.style;
    if (textAlign === 'center') return 'center';
    if (textAlign === 'right' || textAlign === 'end') return 'end';
  }
}

/* Mapping of heading tags to levels */
const headings: Record<string, (Node & { type: 'heading' })['level'] | undefined> = {
  H1: 1,
  H2: 2,
  H3: 3,
  H4: 4,
  H5: 5,
  H6: 6,
};

/* Mapping of HTML tags to Slate marks */
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
};

/**
 * Extracts Slate marks from an element's attributes and styles.
 */
function marksFromElementAttributes(element: globalThis.HTMLElement): Set<Mark> {
  const marks = new Set<Mark>();
  const { nodeName, style, classList } = element;

  const tagMark = TEXT_TAGS[nodeName];
  if (tagMark) marks.add(tagMark);

  const { fontWeight, textDecoration, verticalAlign, fontStyle } = style;

  if (textDecoration === 'underline') marks.add('underline');
  else if (textDecoration === 'line-through') marks.add('strikethrough');

  if (nodeName === 'SPAN' && classList.contains('code')) marks.add('code');

  if (nodeName === 'B' && fontWeight !== 'normal') marks.add('bold');
  else if (
    typeof fontWeight === 'string' &&
    (fontWeight === 'bold' ||
      fontWeight === 'bolder' ||
      fontWeight === '1000' ||
      /^[5-9]\d{2}$/.test(fontWeight))
  ) {
    marks.add('bold');
  }

  if (fontStyle === 'italic') marks.add('italic');

  if (verticalAlign === 'super') marks.add('superscript');
  else if (verticalAlign === 'sub') marks.add('subscript');

  return marks;
}

/**
 * Handles elements that have a direct mapping to Slate nodes without further recursion.
 */
function handleDirectElement(el: globalThis.HTMLElement): DeserializedNode[] | undefined {
  const { nodeName } = el;

  if (nodeName === 'BR') return getInlineNodes('\n');

  if (nodeName === 'IMG') {
    const alt = el.getAttribute('alt');
    return getInlineNodes(alt ?? '');
  }

  if (nodeName === 'HR') return [{ type: 'divider', children: [{ text: '' }] }];

  return undefined;
}

/**
 * Handles anchor elements, applying link and disabling underline.
 */
function handleAnchor(el: globalThis.HTMLElement): DeserializedNode[] | undefined {
  const href = el.getAttribute('href');
  if (href) {
    return setLinkForChildren(href, () =>
      forceDisableMarkForChildren('underline', () => deserializeNodes(el.childNodes))
    );
  }
  return undefined;
}

/**
 * Handles preformatted text blocks.
 */
function handlePre(el: globalThis.HTMLElement): DeserializedNode[] | undefined {
  if (el.textContent) {
    return [{ type: 'code', children: [{ text: el.textContent || '' }] }];
  }
  return undefined;
}

/**
 * Handles list items, extracting nested lists if present.
 */
function handleListItem(children: DeserializedNode[]): DeserializedNode[] {
  let nestedList: Block | undefined;
  const listItemContent = {
    type: 'list-item-content' as const,
    children: children.filter(node => {
      if (!nestedList && (node.type === 'ordered-list' || node.type === 'unordered-list')) {
        nestedList = node;
        return false;
      }
      return true;
    }),
  };
  const listItemChildren = nestedList ? [listItemContent, nestedList] : [listItemContent];
  return [{ type: 'list-item', children: listItemChildren }];
}

/**
 * Maps generic block-level elements to Slate node types.
 */
function mapBlockElement(
  el: globalThis.HTMLElement,
  children: DeserializedNode[]
): DeserializedNode[] | undefined {
  const { nodeName } = el;

  if (nodeName === 'P') {
    return [{ type: 'paragraph', textAlign: getAlignmentFromElement(el), children }];
  }

  const headingLevel = headings[nodeName];
  if (typeof headingLevel === 'number') {
    return [
      {
        type: 'heading',
        level: headingLevel,
        textAlign: getAlignmentFromElement(el),
        children,
      },
    ];
  }

  if (nodeName === 'BLOCKQUOTE') return [{ type: 'blockquote', children }];
  if (nodeName === 'OL') return [{ type: 'ordered-list', children }];
  if (nodeName === 'UL') return [{ type: 'unordered-list', children }];

  if (nodeName === 'DIV' && !isBlock(children[0])) {
    return [{ type: 'paragraph', children }];
  }

  return undefined;
}

/**
 * Primary deserialization entry point for a single DOM node.
 */
export function deserializeHTMLNode(el: globalThis.Node): DeserializedNode[] {
  if (!(el instanceof globalThis.HTMLElement)) {
    const text = el.textContent;
    return text ? getInlineNodes(text) : [];
  }

  const direct = handleDirectElement(el);
  if (direct) return direct;

  if (el.classList.contains('listtype-quote')) {
    const marks = marksFromElementAttributes(el);
    marks.delete('italic');
    return addMarksToChildren(marks, () => [
      {
        type: 'blockquote',
        children: fixNodesForBlockChildren(deserializeNodes(el.childNodes)),
      },
    ]);
  }

  const marks = marksFromElementAttributes(el);
  return addMarksToChildren(marks, () => {
    const children = fixNodesForBlockChildren(deserializeNodes(el.childNodes));

    const specialHandlers: ((el: globalThis.HTMLElement) => DeserializedNode[] | undefined)[] = [
      handleAnchor,
      handlePre,
    ];

    for (const handler of specialHandlers) {
      const result = handler(el);
      if (result) return result;
    }

    if (el.nodeName === 'LI') return handleListItem(children);

    const mapped = mapBlockElement(el, children);
    return mapped ?? children;
  });
}

/**
 * Deserializes a collection of DOM nodes.
 */
function deserializeNodes(nodes: Iterable<globalThis.Node>): DeserializedNode[] {
  const output: DeserializedNode[] = [];
  for (const node of nodes) {
    output.push(...deserializeHTMLNode(node));
  }
  return output;
}

/**
 * Ensures that a list of deserialized nodes conforms to Slate's block/inline expectations.
 */
function fixNodesForBlockChildren(deserializedNodes: DeserializedNode[]): DeserializedNodes {
  if (!deserializedNodes.length) {
    return [{ text: '' }];
  }

  if (deserializedNodes.some(isBlock)) {
    const result: DeserializedNode[] = [];
    let queuedInlines: InlineFromExternalPaste[] = [];

    const flushInlines = () => {
      if (queuedInlines.length) {
        result.push({ type: 'paragraph', children: queuedInlines });
        queuedInlines = [];
      }
    };

    for (const node of deserializedNodes) {
      if (isBlock(node)) {
        flushInlines();
        result.push(node);
        continue;
      }

      if (Node.string(node).trim() !== '') {
        queuedInlines.push(node);
      }
    }

    flushInlines();
    return result as DeserializedNodes;
  }

  return deserializedNodes as DeserializedNodes;
}

/**
 * Public API: parses HTML string into Slate nodes.
 */
export function deserializeHTML(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return fixNodesForBlockChildren(deserializeNodes(parsed.body.childNodes));
}

/* Types */
type DeserializedNode = InlineFromExternalPaste | Block;
type DeserializedNodes = [DeserializedNode, ...DeserializedNode[]];