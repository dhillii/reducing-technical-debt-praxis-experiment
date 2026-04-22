/**
 * TokenStore – a lightweight utility for navigating tokens and comments.
 *
 * The implementation focuses on clarity and low cyclomatic complexity.
 * All public methods accept a flexible set of arguments that are normalized
 * internally.
 */

"use strict";

class TokenStore {
	/**
	 * @param {Array} tokens   Array of token objects from Espree.
	 * @param {Array} comments Array of comment objects from Espree.
	 */
	constructor(tokens, comments) {
		/** @type {Array<{range: number[], type: string, value: string}>} */
		this._items = [...tokens, ...comments].sort((a, b) => a.range[0] - b.range[0]);
		/** @type {Array} */
		this._tokens = tokens;
		/** @type {Array} */
		this._comments = comments;
	}

	/* --------------------------------------------------------------------- *
	 * Helper utilities
	 * --------------------------------------------------------------------- */

	/**
	 * Normalizes arguments for methods that accept (node, before?, after?, options?).
	 */
	_normalizeGetTokensArgs(node, a, b, c) {
		const opts = { filter: null, includeComments: false };
		let before = 0;
		let after = 0;

		if (typeof a === "number") {
			before = a;
			after = typeof b === "number" ? b : 0;
			if (c && typeof c === "object") Object.assign(opts, c);
		} else if (typeof a === "function") {
			opts.filter = a;
			if (b && typeof b === "object") Object.assign(opts, b);
		} else if (a && typeof a === "object") {
			Object.assign(opts, a);
		}
		return { node, before, after, opts };
	}

	/**
	 * Normalizes arguments for methods that accept (node, countOrOptions).
	 */
	_normalizeCountArgs(node, arg) {
		const opts = { filter: null, includeComments: false, count: null };
		if (typeof arg === "number") {
			opts.count = arg;
		} else if (arg && typeof arg === "object") {
			Object.assign(opts, arg);
		}
		return { node, opts };
	}

	/**
	 * Returns the slice of items that belong to `node`.
	 */
	_itemsInNode(node, includeComments) {
		const start = node.range[0];
		const end = node.range[1];
		return this._items.filter(
			it => it.range[0] >= start && it.range[1] <= end && (includeComments || it.type !== "Block" && it.type !== "Line")
		);
	}

	/**
	 * Returns the index of the first item whose start is >= `pos`.
	 */
	_findIndexAt(pos) {
		let lo = 0;
		let hi = this._items.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this._items[mid].range[0] < pos) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/**
	 * Filters an array according to `filter` and comment inclusion.
	 */
	_applyOptions(arr, { filter, includeComments }) {
		return arr.filter(it => {
			if (!includeComments && (it.type === "Block" || it.type === "Line")) return false;
			return !filter || filter(it);
		});
	}

	/* --------------------------------------------------------------------- *
	 * Public API – token retrieval
	 * --------------------------------------------------------------------- */

	getTokens(node, beforeOrOptions, afterOrOptions, maybeOptions) {
		const { before, after, opts } = this._normalizeGetTokensArgs(node, beforeOrOptions, afterOrOptions, maybeOptions);
		const all = this._itemsInNode(node, opts.includeComments);
		const startIdx = before ? Math.max(0, this._findIndexAt(node.range[0]) - before) : this._findIndexAt(node.range[0]);
		const endIdx = after ? this._findIndexAt(node.range[1]) + after : this._findIndexAt(node.range[1]);
		const slice = this._items.slice(startIdx, endIdx);
		return this._applyOptions(slice, opts);
	}

	getTokensBefore(node, arg) {
		const { opts } = this._normalizeCountArgs(node, arg);
		const startIdx = this._findIndexAt(node.range[0]);
		const slice = this._items.slice(0, startIdx);
		const filtered = this._applyOptions(slice, opts);
		if (opts.count != null) return filtered.slice(-opts.count);
		return filtered;
	}

	getTokenBefore(nodeOrToken, arg) {
		const { opts } = this._normalizeCountArgs(nodeOrToken, arg);
		const pos = nodeOrToken.range[0];
		const idx = this._findIndexAt(pos) - 1;
		if (idx < 0) return null;
		const candidates = this._applyOptions(this._items.slice(0, idx + 1), opts);
		if (candidates.length === 0) return null;
		const skip = opts.skip || 0;
		return candidates[candidates.length - 1 - skip] || null;
	}

	getTokensAfter(node, arg) {
		const { opts } = this._normalizeCountArgs(node, arg);
		const endIdx = this._findIndexAt(node.range[1]);
		const slice = this._items.slice(endIdx);
		const filtered = this._applyOptions(slice, opts);
		if (opts.count != null) return filtered.slice(0, opts.count);
		return filtered;
	}

	getTokenAfter(nodeOrToken, arg) {
		const { opts } = this._normalizeCountArgs(nodeOrToken, arg);
		const pos = nodeOrToken.range[1];
		const idx = this._findIndexAt(pos);
		const candidates = this._applyOptions(this._items.slice(idx), opts);
		if (candidates.length === 0) return null;
		const skip = opts.skip || 0;
		return candidates[skip] || null;
	}

	getFirstTokens(node, arg) {
		const { opts } = this._normalizeCountArgs(node, arg);
		const all = this._itemsInNode(node, opts.includeComments);
		const filtered = this._applyOptions(all, opts);
		if (opts.count != null) return filtered.slice(0, opts.count);
		return filtered;
	}

	getFirstToken(node, arg) {
		const tokens = this.getFirstTokens(node, arg);
		return tokens[0] || null;
	}

	getLastTokens(node, arg) {
		const { opts } = this._normalizeCountArgs(node, arg);
		const all = this._itemsInNode(node, opts.includeComments);
		const filtered = this._applyOptions(all, opts);
		if (opts.count != null) return filtered.slice(-opts.count);
		return filtered;
	}

	getLastToken(node, arg) {
		const tokens = this.getLastTokens(node, arg);
		return tokens[tokens.length - 1] || null;
	}

	/* --------------------------------------------------------------------- *
	 * Public API – token ranges between nodes
	 * --------------------------------------------------------------------- */

	_getBetween(leftNode, rightNode) {
		const leftIdx = this._findIndexAt(leftNode.range[1]);
		const rightIdx = this._findIndexAt(rightNode.range[0]);
		return this._items.slice(leftIdx, rightIdx);
	}

	getFirstTokensBetween(leftNode, rightNode, arg) {
		const { opts } = this._normalizeCountArgs(null, arg);
		const slice = this._getBetween(leftNode, rightNode);
		const filtered = this._applyOptions(slice, opts);
		if (opts.count != null) return filtered.slice(0, opts.count);
		return filtered;
	}

	getFirstTokenBetween(leftNode, rightNode, arg) {
		const tokens = this.getFirstTokensBetween(leftNode, rightNode, arg);
		return tokens[0] || null;
	}

	getLastTokensBetween(leftNode, rightNode, arg) {
		const { opts } = this._normalizeCountArgs(null, arg);
		const slice = this._getBetween(leftNode, rightNode);
		const filtered = this._applyOptions(slice, opts);
		if (opts.count != null) return filtered.slice(-opts.count);
		return filtered;
	}

	getLastTokenBetween(leftNode, rightNode, arg) {
		const tokens = this.getLastTokensBetween(leftNode, rightNode, arg);
		return tokens[tokens.length - 1] || null;
	}

	getTokensBetween(leftNode, rightNode, padding = 0) {
		const slice = this._getBetween(leftNode, rightNode);
		if (padding) {
			const leftIdx = this._findIndexAt(leftNode.range[0]) - padding;
			const rightIdx = this._findIndexAt(rightNode.range[1]) + padding;
			return this._items.slice(Math.max(0, leftIdx), Math.min(this._items.length, rightIdx));
		}
		return slice;
	}

	getTokenByRangeStart(start, arg) {
		const { opts } = this._normalizeCountArgs(null, arg);
		const idx = this._items.findIndex(it => it.range[0] === start);
		if (idx === -1) return null;
		const candidate = this._items[idx];
		if (!opts.includeComments && (candidate.type === "Block" || candidate.type === "Line")) return null;
		return candidate;
	}

	/* --------------------------------------------------------------------- *
	 * Public API – comment utilities
	 * --------------------------------------------------------------------- */

	commentsExistBetween(leftToken, rightToken) {
		const leftIdx = this._findIndexAt(leftToken.range[1]);
		const rightIdx = this._findIndexAt(rightToken.range[0]);
		return this._items.slice(leftIdx, rightIdx).some(it => it.type === "Block" || it.type === "Line");
	}

	getCommentsBefore(nodeOrToken) {
		const pos = nodeOrToken.range[0];
		const idx = this._findIndexAt(pos);
		return this._items.slice(0, idx).filter(it => it.type === "Block" || it.type === "Line");
	}

	getCommentsAfter(nodeOrToken) {
		const pos = nodeOrToken.range[1];
		const idx = this._findIndexAt(pos);
		return this._items.slice(idx).filter(it => it.type === "Block" || it.type === "Line");
	}

	getCommentsInside(node) {
		const start = node.range[0];
		const end = node.range[1];
		return this._items.filter(
			it => it.type === "Block" || it.type === "Line"
				? it.range[0] >= start && it.range[1] <= end
				: false
		);
	}
}

module.exports = TokenStore;