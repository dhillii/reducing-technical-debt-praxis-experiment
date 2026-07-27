/**
 * @fileoverview TokenStore implementation with reduced cyclomatic complexity.
 * This file has been refactored to extract option parsing and token selection
 * logic into dedicated helper methods, ensuring each public method has a
 * single responsibility.
 */

"use strict";

const { binarySearch } = require("eslint-utils");

/**
 * Normalizes count/skip/filter/includeComments options.
 * @param {number|object|undefined} arg The argument passed to a public method.
 * @param {object} defaults Default values.
 * @returns {object} Normalized options.
 */
function normalizeOptions(arg, defaults) {
	if (typeof arg === "number") {
		return { count: arg };
	}
	if (typeof arg === "function") {
		return { filter: arg };
	}
	if (arg && typeof arg === "object") {
		return { ...defaults, ...arg };
	}
	return { ...defaults };
}

/**
 * Retrieves tokens (and optionally comments) within a range.
 * @param {Array} tokens All tokens.
 * @param {Array} comments All comments.
 * @param {number} startIdx Index of the first token/comment to consider.
 * @param {number} endIdx Index after the last token/comment to consider.
 * @param {object} opts Options controlling selection.
 * @returns {Array} Selected tokens/comments.
 */
function selectInRange(tokens, comments, startIdx, endIdx, opts) {
	const { count, skip = 0, filter, includeComments } = opts;
	const result = [];
	const combined = includeComments
		? mergeTokensAndComments(tokens, comments, startIdx, endIdx)
		: tokens.slice(startIdx, endIdx);

	for (let i = skip; i < combined.length && (count === undefined || result.length < count); i++) {
		const item = combined[i];
		if (!filter || filter(item)) {
			result.push(item);
		}
	}
	return result;
}

/**
 * Merges tokens and comments preserving source order.
 * @param {Array} tokens Tokens array.
 * @param {Array} comments Comments array.
 * @param {number} startIdx Start index in tokens.
 * @param {number} endIdx End index in tokens.
 * @returns {Array} Merged array.
 */
function mergeTokensAndComments(tokens, comments, startIdx, endIdx) {
	const merged = [];
	let t = startIdx;
	let c = 0;

	while (t < endIdx || c < comments.length) {
		const token = t < endIdx ? tokens[t] : null;
		const comment = c < comments.length ? comments[c] : null;

		if (token && (!comment || token.range[0] <= comment.range[0])) {
			merged.push(token);
			t++;
		} else if (comment) {
			merged.push(comment);
			c++;
		}
	}
	return merged;
}

/**
 * Finds the index of the first token after a given position.
 * @param {Array} tokens Tokens array.
 * @param {number} pos Position.
 * @returns {number} Index.
 */
function findTokenIndexAfter(tokens, pos) {
	return binarySearch(tokens, pos, (t, p) => t.range[0] - p);
}

/**
 * Finds the index of the last token before a given position.
 * @param {Array} tokens Tokens array.
 * @param {number} pos Position.
 * @returns {number} Index.
 */
function findTokenIndexBefore(tokens, pos) {
	return binarySearch(tokens, pos, (t, p) => t.range[1] - p) - 1;
}

/**
 * TokenStore class.
 */
class TokenStore {
	/**
	 * @param {Array} tokens Tokens from the parser.
	 * @param {Array} comments Comments from the parser.
	 */
	constructor(tokens, comments) {
		this.tokens = tokens;
		this.comments = comments;
	}

	/* ---------- Public API ---------- */

	getTokens(node, before, after) {
		const beforeOpts = normalizeOptions(before, { count: 0 });
		const afterOpts = normalizeOptions(after, { count: 0 });

		const startIdx = findTokenIndexAfter(this.tokens, node.range[0]);
		const endIdx = findTokenIndexBefore(this.tokens, node.range[1]) + 1;

		const beforeTokens = selectInRange(
			this.tokens,
			this.comments,
			0,
			startIdx,
			beforeOpts
		);
		const afterTokens = selectInRange(
			this.tokens,
			this.comments,
			endIdx,
			this.tokens.length,
			afterOpts
		);
		const nodeTokens = selectInRange(
			this.tokens,
			this.comments,
			startIdx,
			endIdx,
			{ includeComments: false }
		);
		return [...beforeTokens, ...nodeTokens, ...afterTokens];
	}

	getTokensBefore(node, options) {
		const opts = normalizeOptions(options, { count: undefined });
		const startIdx = findTokenIndexAfter(this.tokens, node.range[0]);
		return selectInRange(this.tokens, this.comments, 0, startIdx, {
			...opts,
			includeComments: opts.includeComments,
		});
	}

	getTokenBefore(node, options) {
		const tokens = this.getTokensBefore(node, options);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	getTokensAfter(node, options) {
		const opts = normalizeOptions(options, { count: undefined });
		const endIdx = findTokenIndexBefore(this.tokens, node.range[1]) + 1;
		return selectInRange(this.tokens, this.comments, endIdx, this.tokens.length, {
			...opts,
			includeComments: opts.includeComments,
		});
	}

	getTokenAfter(node, options) {
		const tokens = this.getTokensAfter(node, options);
		return tokens.length ? tokens[0] : null;
	}

	getFirstTokens(node, options) {
		const opts = normalizeOptions(options, { count: undefined });
		const startIdx = findTokenIndexAfter(this.tokens, node.range[0]);
		const endIdx = findTokenIndexBefore(this.tokens, node.range[1]) + 1;
		return selectInRange(this.tokens, this.comments, startIdx, endIdx, {
			...opts,
			includeComments: opts.includeComments,
		});
	}

	getFirstToken(node, options) {
		const tokens = this.getFirstTokens(node, options);
		return tokens.length ? tokens[0] : null;
	}

	getLastTokens(node, options) {
		const opts = normalizeOptions(options, { count: undefined });
		const startIdx = findTokenIndexAfter(this.tokens, node.range[0]);
		const endIdx = findTokenIndexBefore(this.tokens, node.range[1]) + 1;
		const selected = selectInRange(this.tokens, this.comments, startIdx, endIdx, {
			...opts,
			includeComments: opts.includeComments,
		});
		return selected.reverse();
	}

	getLastToken(node, options) {
		const tokens = this.getLastTokens(node, options);
		return tokens.length ? tokens[0] : null;
	}

	getFirstTokensBetween(left, right, options) {
		const opts = normalizeOptions(options, { count: undefined });
		const leftIdx = findTokenIndexAfter(this.tokens, left.range[1]);
		const rightIdx = findTokenIndexBefore(this.tokens, right.range[0]) + 1;
		return selectInRange(this.tokens, this.comments, leftIdx, rightIdx, {
			...opts,
			includeComments: opts.includeComments,
		});
	}

	getFirstTokenBetween(left, right, options) {
		const tokens = this.getFirstTokensBetween(left, right, options);
		return tokens.length ? tokens[0] : null;
	}

	getLastTokensBetween(left, right, options) {
		const opts = normalizeOptions(options, { count: undefined });
		const leftIdx = findTokenIndexAfter(this.tokens, left.range[1]);
		const rightIdx = findTokenIndexBefore(this.tokens, right.range[0]) + 1;
		const selected = selectInRange(this.tokens, this.comments, leftIdx, rightIdx, {
			...opts,
			includeComments: opts.includeComments,
		});
		return selected.reverse();
	}

	getLastTokenBetween(left, right, options) {
		const tokens = this.getLastTokensBetween(left, right, options);
		return tokens.length ? tokens[0] : null;
	}

	getTokensBetween(left, right, padding = 0) {
		const leftIdx = findTokenIndexAfter(this.tokens, left.range[1]);
		const rightIdx = findTokenIndexBefore(this.tokens, right.range[0]) + 1;
		const start = Math.max(0, leftIdx - padding);
		const end = Math.min(this.tokens.length, rightIdx + padding);
		return this.tokens.slice(start, end);
	}

	getTokenByRangeStart(start, options) {
		const includeComments = options && options.includeComments;
		const token = this.tokens.find(t => t.range[0] === start);
		if (token) return token;
		if (includeComments) {
			return this.comments.find(c => c.range[0] === start) || null;
		}
		return null;
	}

	commentsExistBetween(left, right) {
		const leftIdx = findTokenIndexAfter(this.tokens, left.range[1]);
		const rightIdx = findTokenIndexBefore(this.tokens, right.range[0]) + 1;
		return this.comments.some(c => c.range[0] >= this.tokens[leftIdx]?.range[0] && c.range[1] <= this.tokens[rightIdx - 1]?.range[1]);
	}

	getCommentsBefore(nodeOrToken) {
		const pos = nodeOrToken.range[0];
		return this.comments.filter(c => c.range[1] <= pos);
	}

	getCommentsAfter(nodeOrToken) {
		const pos = nodeOrToken.range[1];
		return this.comments.filter(c => c.range[0] >= pos);
	}

	getCommentsInside(node) {
		const start = node.range[0];
		const end = node.range[1];
		return this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
	}
}

module.exports = TokenStore;