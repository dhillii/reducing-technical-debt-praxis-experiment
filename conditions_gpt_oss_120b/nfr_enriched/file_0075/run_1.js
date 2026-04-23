/**
 * @fileoverview TokenStore implementation – refactored to reduce cyclomatic complexity.
 * Maintains original public API and behavior.
 */

"use strict";

const { range: rangeUtil } = require("eslint-utils");

// Helper to create a map from range start to index.
function createRangeMap(items) {
	const map = new Map();
	for (let i = 0; i < items.length; i++) {
		map.set(items[i].range[0], i);
	}
	return map;
}

// Helper to merge tokens and comments into a single sorted array.
function mergeTokensAndComments(tokens, comments) {
	const merged = [];
	let i = 0,
		j = 0;
	while (i < tokens.length && j < comments.length) {
		if (tokens[i].range[0] < comments[j].range[0]) {
			merged.push(tokens[i++]);
		} else {
			merged.push(comments[j++]);
		}
	}
	while (i < tokens.length) merged.push(tokens[i++]);
	while (j < comments.length) merged.push(comments[j++]);
	return merged;
}

// Normalizes option arguments for token retrieval methods.
function normalizeOptions(arg1, arg2) {
	let options = {
		count: undefined,
		beforeCount: 0,
		afterCount: 0,
		includeComments: false,
		filter: null,
		skip: 0,
	};

	if (typeof arg1 === "number") {
		options.beforeCount = arg1;
	}
	if (typeof arg2 === "number") {
		options.afterCount = arg2;
	}
	if (typeof arg1 === "object" && arg1 !== null) {
		Object.assign(options, arg1);
	}
	if (typeof arg2 === "object" && arg2 !== null) {
		Object.assign(options, arg2);
	}
	return options;
}

// Core class.
class TokenStore {
	/**
	 * @param {Array} tokens
	 * @param {Array} comments
	 */
	constructor(tokens, comments) {
		this.tokens = tokens;
		this.comments = comments;
		this.tokenMap = createRangeMap(tokens);
		this.commentMap = createRangeMap(comments);
		this.all = mergeTokensAndComments(tokens, comments);
	}

	// Retrieves tokens (and optionally comments) for a node.
	getTokens(node, arg1, arg2) {
		const opts = normalizeOptions(arg1, arg2);
		const range = node.range;
		const startIdx = this._findIndex(range[0]);
		const endIdx = this._findIndex(range[1], true);
		return this._sliceRange(startIdx, endIdx, opts);
	}

	// Retrieves tokens before a node.
	getTokensBefore(node, arg) {
		const opts = normalizeOptions(arg);
		const range = node.range;
		const startIdx = this._findIndex(range[0]);
		const slice = this._sliceRange(0, startIdx, opts);
		return opts.count !== undefined ? slice.slice(-opts.count) : slice;
	}

	// Retrieves a single token before a node.
	getTokenBefore(node, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokensBefore(node, opts);
		return tokens[opts.skip] || null;
	}

	// Retrieves tokens after a node.
	getTokensAfter(node, arg) {
		const opts = normalizeOptions(arg);
		const range = node.range;
		const endIdx = this._findIndex(range[1], true);
		const slice = this._sliceRange(endIdx, this.all.length, opts);
		return opts.count !== undefined ? slice.slice(0, opts.count) : slice;
	}

	// Retrieves a single token after a node.
	getTokenAfter(node, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokensAfter(node, opts);
		return tokens[opts.skip] || null;
	}

	// Retrieves the first N tokens of a node.
	getFirstTokens(node, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokens(node);
		const filtered = this._applyFilter(tokens, opts);
		if (opts.count !== undefined) {
			return filtered.slice(0, opts.count);
		}
		return filtered;
	}

	// Retrieves the first token of a node.
	getFirstToken(node, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getFirstTokens(node, opts);
		return tokens[opts.skip] || null;
	}

	// Retrieves the last N tokens of a node.
	getLastTokens(node, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokens(node);
		const filtered = this._applyFilter(tokens, opts);
		if (opts.count !== undefined) {
			return filtered.slice(-opts.count);
		}
		return filtered;
	}

	// Retrieves the last token of a node.
	getLastToken(node, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getLastTokens(node, opts);
		return tokens[opts.skip] || null;
	}

	// Retrieves tokens between two nodes.
	getTokensBetween(leftNode, rightNode, arg) {
		const opts = normalizeOptions(arg);
		const leftIdx = this._findIndex(leftNode.range[1], true);
		const rightIdx = this._findIndex(rightNode.range[0]);
		const slice = this._sliceRange(leftIdx, rightIdx, opts);
		return opts.count !== undefined ? slice.slice(0, opts.count) : slice;
	}

	// Retrieves the first token between two nodes.
	getFirstTokenBetween(leftNode, rightNode, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokensBetween(leftNode, rightNode, opts);
		return tokens[opts.skip] || null;
	}

	// Retrieves the last token between two nodes.
	getLastTokenBetween(leftNode, rightNode, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokensBetween(leftNode, rightNode, opts);
		return tokens[tokens.length - 1 - opts.skip] || null;
	}

	// Retrieves first N tokens between two nodes.
	getFirstTokensBetween(leftNode, rightNode, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokensBetween(leftNode, rightNode, opts);
		if (opts.count !== undefined) {
			return tokens.slice(0, opts.count);
		}
		return tokens;
	}

	// Retrieves last N tokens between two nodes.
	getLastTokensBetween(leftNode, rightNode, arg) {
		const opts = normalizeOptions(arg);
		const tokens = this.getTokensBetween(leftNode, rightNode, opts);
		if (opts.count !== undefined) {
			return tokens.slice(-opts.count);
		}
		return tokens;
	}

	// Retrieves a token by its range start.
	getTokenByRangeStart(start, arg) {
		const opts = normalizeOptions(arg);
		if (this.tokenMap.has(start)) {
			const token = this.tokens[this.tokenMap.get(start)];
			if (!opts.filter || opts.filter(token)) {
				return token;
			}
			return null;
		}
		if (opts.includeComments && this.commentMap.has(start)) {
			const comment = this.comments[this.commentMap.get(start)];
			if (!opts.filter || opts.filter(comment)) {
				return comment;
			}
		}
		return null;
	}

	// Checks if comments exist between two tokens.
	commentsExistBetween(left, right) {
		const leftIdx = this._findIndex(left.range[1], true);
		const rightIdx = this._findIndex(right.range[0]);
		for (let i = leftIdx; i < rightIdx; i++) {
			if (this.all[i].type === "Block" || this.all[i].type === "Line") {
				return true;
			}
		}
		return false;
	}

	// Retrieves comments before a node or token.
	getCommentsBefore(nodeOrToken) {
		const start = nodeOrToken.range[0];
		const idx = this._findIndex(start);
		const comments = [];
		for (let i = idx - 1; i >= 0; i--) {
			const item = this.all[i];
			if (item.type !== "Block" && item.type !== "Line") break;
			comments.unshift(item);
		}
		return comments;
	}

	// Retrieves comments after a node or token.
	getCommentsAfter(nodeOrToken) {
		const end = nodeOrToken.range[1];
		const idx = this._findIndex(end, true);
		const comments = [];
		for (let i = idx; i < this.all.length; i++) {
			const item = this.all[i];
			if (item.type !== "Block" && item.type !== "Line") break;
			comments.push(item);
		}
		return comments;
	}

	// Retrieves comments inside a node.
	getCommentsInside(node) {
		const startIdx = this._findIndex(node.range[0]);
		const endIdx = this._findIndex(node.range[1], true);
		const inside = [];
		for (let i = startIdx; i < endIdx; i++) {
			const item = this.all[i];
			if (item.type === "Block" || item.type === "Line") {
				inside.push(item);
			}
		}
		return inside;
	}

	// ---------- Private helpers ----------

	// Finds the index of the first item whose range starts at or after `pos`.
	_findIndex(pos, after = false) {
		let low = 0,
			high = this.all.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (this.all[mid].range[0] < pos) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return after ? low : Math.max(0, low - 1);
	}

	// Slices the merged array respecting options.
	_sliceRange(startIdx, endIdx, opts) {
		const slice = this.all.slice(startIdx, endIdx);
		const withComments = opts.includeComments
			? slice
			: slice.filter(t => t.type !== "Block" && t.type !== "Line");
		const filtered = this._applyFilter(withComments, opts);
		const before = opts.beforeCount
			? filtered.slice(-opts.beforeCount)
			: [];
		const after = opts.afterCount
			? filtered.slice(0, opts.afterCount)
			: [];
		if (opts.beforeCount || opts.afterCount) {
			return before.concat(filtered, after);
		}
		return filtered;
	}

	// Applies filter callback if provided.
	_applyFilter(tokens, opts) {
		if (typeof opts.filter === "function") {
			return tokens.filter(opts.filter);
		}
		return tokens;
	}
}

module.exports = TokenStore;