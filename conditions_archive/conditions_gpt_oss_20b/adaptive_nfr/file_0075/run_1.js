/**
 * @fileoverview TokenStore implementation for ESLint.
 * @author Brandon Mills
 */

"use strict";

const assert = require("chai").assert;

/**
 * TokenStore provides utilities for querying tokens and comments
 * from a parsed source code AST.
 */
class TokenStore {
	/**
	 * @param {Token[]} tokens - Array of tokens from the parser.
	 * @param {Comment[]} comments - Array of comments from the parser.
	 */
	constructor(tokens, comments) {
		this.tokens = tokens || [];
		this.comments = comments || [];
		// Merge tokens and comments into a single sorted stream.
		this._combined = this._mergeStreams(this.tokens, this.comments);
	}

	/**
	 * Merge two sorted arrays into a single sorted array.
	 * @private
	 * @param {Token[]} tokens
	 * @param {Comment[]} comments
	 * @returns {Array} merged array
	 */
	_mergeStreams(tokens, comments) {
		const merged = [];
		let i = 0;
		let j = 0;
		while (i < tokens.length && j < comments.length) {
			if (tokens[i].range[0] <= comments[j].range[0]) {
				merged.push(tokens[i++]);
			} else {
				merged.push(comments[j++]);
			}
		}
		return merged.concat(tokens.slice(i)).concat(comments.slice(j));
	}

	/**
	 * Resolve options object from arguments.
	 * @private
	 * @param {any} options
	 * @returns {Object}
	 */
	_resolveOptions(options) {
		if (typeof options === "number") {
			return { count: options };
		}
		return options || {};
	}

	/**
	 * Get the stream of tokens or comments based on includeComments flag.
	 * @private
	 * @param {boolean} includeComments
	 * @returns {Array}
	 */
	_getStream(includeComments) {
		return includeComments ? this._combined : this.tokens;
	}

	/**
	 * Filter items by filter function.
	 * @private
	 * @param {Array} items
	 * @param {Function} filter
	 * @returns {Array}
	 */
	_applyFilter(items, filter) {
		if (!filter) return items;
		return items.filter(filter);
	}

	/**
	 * Apply count to items.
	 * @private
	 * @param {Array} items
	 * @param {number} count
	 * @returns {Array}
	 */
	_applyCount(items, count) {
		if (typeof count !== "number") return items;
		return items.slice(0, count);
	}

	/**
	 * Apply skip to items (for token before/after).
	 * @private
	 * @param {Array} items
	 * @param {number} skip
	 * @returns {Array}
	 */
	_applySkip(items, skip) {
		if (typeof skip !== "number") return items;
		return items.slice(skip);
	}

	/**
	 * Get items between two positions.
	 * @private
	 * @param {number} start
	 * @param {number} end
	 * @param {Array} stream
	 * @returns {Array}
	 */
	_getItemsBetween(start, end, stream) {
		return stream.filter(
			(item) => item.range[0] >= start && item.range[1] <= end
		);
	}

	/**
	 * Get items before a position.
	 * @private
	 * @param {number} pos
	 * @param {Array} stream
	 * @returns {Array}
	 */
	_getItemsBefore(pos, stream) {
		return stream.filter((item) => item.range[1] <= pos);
	}

	/**
	 * Get items after a position.
	 * @private
	 * @param {number} pos
	 * @param {Array} stream
	 * @returns {Array}
	 */
	_getItemsAfter(pos, stream) {
		return stream.filter((item) => item.range[0] >= pos);
	}

	/**
	 * Resolve node or token to its range.
	 * @private
	 * @param {Object} node
	 * @returns {Array} [start, end]
	 */
	_getRange(node) {
		if (node && Array.isArray(node.range)) {
			return node.range;
		}
		throw new Error("Node or token must have a range property");
	}

	/**
	 * Get tokens for a node.
	 * @param {Object} node
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getTokens(node, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [start, end] = this._getRange(node);
		let items = this._getItemsBetween(start, end, stream);
		items = this._applyFilter(items, filter);
		items = this._applyCount(items, count);
		return items;
	}

	/**
	 * Get tokens before a node.
	 * @param {Object} node
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getTokensBefore(node, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [start] = this._getRange(node);
		let items = this._getItemsBefore(start, stream);
		items = this._applyFilter(items, filter);
		if (typeof count === "number") {
			items = items.slice(-count);
		}
		return items;
	}

	/**
	 * Get tokens after a node.
	 * @param {Object} node
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getTokensAfter(node, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [, end] = this._getRange(node);
		let items = this._getItemsAfter(end, stream);
		items = this._applyFilter(items, filter);
		if (typeof count === "number") {
			items = items.slice(0, count);
		}
		return items;
	}

	/**
	 * Get first tokens of a node.
	 * @param {Object} node
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getFirstTokens(node, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [start, end] = this._getRange(node);
		let items = this._getItemsBetween(start, end, stream);
		items = this._applyFilter(items, filter);
		items = this._applyCount(items, count);
		return items;
	}

	/**
	 * Get last tokens of a node.
	 * @param {Object} node
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getLastTokens(node, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [start, end] = this._getRange(node);
		let items = this._getItemsBetween(start, end, stream);
		items = this._applyFilter(items, filter);
		if (typeof count === "number") {
			items = items.slice(-count);
		}
		return items;
	}

	/**
	 * Get first tokens between two nodes.
	 * @param {Object} left
	 * @param {Object} right
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getFirstTokensBetween(left, right, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [, leftEnd] = this._getRange(left);
		const [rightStart] = this._getRange(right);
		let items = this._getItemsBetween(leftEnd, rightStart, stream);
		items = this._applyFilter(items, filter);
		items = this._applyCount(items, count);
		return items;
	}

	/**
	 * Get last tokens between two nodes.
	 * @param {Object} left
	 * @param {Object} right
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getLastTokensBetween(left, right, options) {
		const { count, includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [, leftEnd] = this._getRange(left);
		const [rightStart] = this._getRange(right);
		let items = this._getItemsBetween(leftEnd, rightStart, stream);
		items = this._applyFilter(items, filter);
		if (typeof count === "number") {
			items = items.slice(-count);
		}
		return items;
	}

	/**
	 * Get all tokens between two nodes.
	 * @param {Object} left
	 * @param {Object} right
	 * @param {Object|number} [options]
	 * @returns {Token[]}
	 */
	getTokensBetween(left, right, options) {
		const { includeComments, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [, leftEnd] = this._getRange(left);
		const [rightStart] = this._getRange(right);
		let items = this._getItemsBetween(leftEnd, rightStart, stream);
		items = this._applyFilter(items, filter);
		return items;
	}

	/**
	 * Get first token between two nodes.
	 * @param {Object} left
	 * @param {Object} right
	 * @param {Object|number} [options]
	 * @returns {Token|null}
	 */
	getFirstTokenBetween(left, right, options) {
		const tokens = this.getFirstTokensBetween(left, right, options);
		return tokens.length ? tokens[0] : null;
	}

	/**
	 * Get last token between two nodes.
	 * @param {Object} left
	 * @param {Object} right
	 * @param {Object|number} [options]
	 * @returns {Token|null}
	 */
	getLastTokenBetween(left, right, options) {
		const tokens = this.getLastTokensBetween(left, right, options);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	/**
	 * Get token before a node or token.
	 * @param {Object} nodeOrToken
	 * @param {Object|number} [options]
	 * @returns {Token|null}
	 */
	getTokenBefore(nodeOrToken, options) {
		const { includeComments, skip, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [start] = this._getRange(nodeOrToken);
		// Find index of first item with range[0] >= start
		let idx = stream.findIndex((item) => item.range[0] >= start);
		if (idx === -1) idx = stream.length;
		let prevIdx = idx - 1;
		if (typeof skip === "number") {
			prevIdx -= skip;
		}
		while (prevIdx >= 0) {
			const item = stream[prevIdx];
			if (!filter || filter(item)) {
				return item;
			}
			prevIdx--;
		}
		return null;
	}

	/**
	 * Get token after a node or token.
	 * @param {Object} nodeOrToken
	 * @param {Object|number} [options]
	 * @returns {Token|null}
	 */
	getTokenAfter(nodeOrToken, options) {
		const { includeComments, skip, filter } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const [, end] = this._getRange(nodeOrToken);
		// Find index of first item with range[0] > end
		let idx = stream.findIndex((item) => item.range[0] > end);
		if (idx === -1) idx = stream.length;
		let nextIdx = idx;
		if (typeof skip === "number") {
			nextIdx += skip;
		}
		while (nextIdx < stream.length) {
			const item = stream[nextIdx];
			if (!filter || filter(item)) {
				return item;
			}
			nextIdx++;
		}
		return null;
	}

	/**
	 * Get token by range start index.
	 * @param {number} index
	 * @param {Object} [options]
	 * @returns {Token|null}
	 */
	getTokenByRangeStart(index, options) {
		const { includeComments } = this._resolveOptions(options);
		const stream = this._getStream(includeComments);
		const item = stream.find((t) => t.range[0] === index);
		return item || null;
	}

	/**
	 * Check if any comments exist between two tokens.
	 * @param {Token} token1
	 * @param {Token} token2
	 * @returns {boolean}
	 */
	commentsExistBetween(token1, token2) {
		const [end1] = token1.range;
		const [start2] = token2.range;
		return this.comments.some(
			(c) => c.range[0] >= end1 && c.range[1] <= start2
		);
	}

	/**
	 * Get comments before a node.
	 * @param {Object} node
	 * @returns {Comment[]}
	 */
	getCommentsBefore(node) {
		const [start] = this._getRange(node);
		return this.comments.filter((c) => c.range[1] <= start);
	}

	/**
	 * Get comments after a node.
	 * @param {Object} node
	 * @returns {Comment[]}
	 */
	getCommentsAfter(node) {
		const [, end] = this._getRange(node);
		return this.comments.filter((c) => c.range[0] >= end);
	}

	/**
	 * Get comments inside a node.
	 * @param {Object} node
	 * @returns {Comment[]}
	 */
	getCommentsInside(node) {
		const [start, end] = this._getRange(node);
		return this.comments.filter(
			(c) => c.range[0] >= start && c.range[1] <= end
		);
	}
}

module.exports = TokenStore;