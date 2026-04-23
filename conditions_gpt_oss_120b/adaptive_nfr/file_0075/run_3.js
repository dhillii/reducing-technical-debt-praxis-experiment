/**
 * @fileoverview TokenStore implementation.
 * @author Brandon Mills
 */

"use strict";

const assert = require("chai").assert;

/**
 * TokenStore class provides utilities for retrieving tokens and comments
 * from a source code token stream.
 */
class TokenStore {
	/**
	 * @param {Token[]} tokens The array of tokens.
	 * @param {Comment[]} comments The array of comments.
	 */
	constructor(tokens, comments) {
		this.tokens = tokens;
		this.comments = comments;
		this._tokenMap = new Map(tokens.map(t => [t.range[0], t]));
		this._commentMap = new Map(comments.map(c => [c.range[0], c]));
	}

	// ----------------------------------------------------------------------
	// Public API
	// ----------------------------------------------------------------------

	/**
	 * Retrieves tokens for a node with optional surrounding tokens and filters.
	 * @param {ASTNode} node The node to retrieve tokens for.
	 * @param {number|object|function} [options] Options, count, or filter.
	 * @param {number} [after] Number of tokens after the node.
	 * @returns {Token[]} The matching tokens.
	 */
	getTokens(node, options, after) {
		const { count, before, after: afterOpt, filter, includeComments } =
			this._normalizeGetTokensArgs(options, after);
		const range = this._nodeRange(node);
		const tokens = this._collectTokensInRange(range, includeComments);
		const filtered = this._applyFilter(tokens, filter);
		return this._sliceTokens(filtered, before, afterOpt);
	}

	/**
	 * Retrieves tokens before a node.
	 * @param {ASTNode|Token} node The node or token.
	 * @param {number|object} [options] Options, count, or filter.
	 * @returns {Token[]} Tokens before the node.
	 */
	getTokensBefore(node, options) {
		const { count, filter, includeComments } = this._normalizeBeforeAfterArgs(
			options,
		);
		const range = this._nodeRange(node);
		const tokens = this._collectTokensBefore(range[0], includeComments);
		const filtered = this._applyFilter(tokens, filter);
		return this._takeFromEnd(filtered, count);
	}

	/**
	 * Retrieves a single token before a node.
	 * @param {ASTNode|Token} node The node or token.
	 * @param {number|object|function} [options] Options, skip, or filter.
	 * @returns {Token|null} The token before the node.
	 */
	getTokenBefore(node, options) {
		const { skip, filter, includeComments } = this._normalizeSingleArgs(
			options,
		);
		const beforeTokens = this.getTokensBefore(node, {
			count: Number.MAX_SAFE_INTEGER,
			filter,
			includeComments,
		});
		return beforeTokens[skip] || null;
	}

	/**
	 * Retrieves tokens after a node.
	 * @param {ASTNode|Token} node The node or token.
	 * @param {number|object} [options] Options, count, or filter.
	 * @returns {Token[]} Tokens after the node.
	 */
	getTokensAfter(node, options) {
		const { count, filter, includeComments } = this._normalizeBeforeAfterArgs(
			options,
		);
		const range = this._nodeRange(node);
		const tokens = this._collectTokensAfter(range[1], includeComments);
		const filtered = this._applyFilter(tokens, filter);
		return this._takeFromStart(filtered, count);
	}

	/**
	 * Retrieves a single token after a node.
	 * @param {ASTNode|Token} node The node or token.
	 * @param {number|object|function} [options] Options, skip, or filter.
	 * @returns {Token|null} The token after the node.
	 */
	getTokenAfter(node, options) {
		const { skip, filter, includeComments } = this._normalizeSingleArgs(
			options,
		);
		const afterTokens = this.getTokensAfter(node, {
			count: Number.MAX_SAFE_INTEGER,
			filter,
			includeComments,
		});
		return afterTokens[skip] || null;
	}

	/**
	 * Retrieves the first N tokens of a node's token stream.
	 * @param {ASTNode} node The node.
	 * @param {number|object|function} [options] Options, count, or filter.
	 * @returns {Token[]} The first tokens.
	 */
	getFirstTokens(node, options) {
		const { count, filter, includeComments } = this._normalizeGetTokensArgs(
			options,
		);
		const tokens = this.getTokens(node, {
			includeComments,
			filter,
		});
		return this._takeFromStart(tokens, count);
	}

	/**
	 * Retrieves the first token of a node's token stream.
	 * @param {ASTNode} node The node.
	 * @param {number|object|function} [options] Options, skip, or filter.
	 * @returns {Token|null} The first token.
	 */
	getFirstToken(node, options) {
		const { skip, filter, includeComments } = this._normalizeSingleArgs(
			options,
		);
		const tokens = this.getFirstTokens(node, {
			count: Number.MAX_SAFE_INTEGER,
			filter,
			includeComments,
		});
		return tokens[skip] || null;
	}

	/**
	 * Retrieves the last N tokens of a node's token stream.
	 * @param {ASTNode} node The node.
	 * @param {number|object|function} [options] Options, count, or filter.
	 * @returns {Token[]} The last tokens.
	 */
	getLastTokens(node, options) {
		const { count, filter, includeComments } = this._normalizeGetTokensArgs(
			options,
		);
		const tokens = this.getTokens(node, {
			includeComments,
			filter,
		});
		return this._takeFromEnd(tokens, count);
	}

	/**
	 * Retrieves the last token of a node's token stream.
	 * @param {ASTNode} node The node.
	 * @param {number|object|function} [options] Options, skip, or filter.
	 * @returns {Token|null} The last token.
	 */
	getLastToken(node, options) {
		const { skip, filter, includeComments } = this._normalizeSingleArgs(
			options,
		);
		const tokens = this.getLastTokens(node, {
			count: Number.MAX_SAFE_INTEGER,
			filter,
			includeComments,
		});
		return tokens[skip] || null;
	}

	/**
	 * Retrieves the first N tokens between two nodes.
	 * @param {ASTNode|Token} left The left node/token.
	 * @param {ASTNode|Token} right The right node/token.
	 * @param {number|object} [options] Options, count, or filter.
	 * @returns {Token[]} Tokens between the nodes.
	 */
	getFirstTokensBetween(left, right, options) {
		const { count, filter, includeComments } = this._normalizeBeforeAfterArgs(
			options,
		);
		const range = this._rangeBetween(left, right);
		const tokens = this._collectTokensInRange(range, includeComments);
		const filtered = this._applyFilter(tokens, filter);
		return this._takeFromStart(filtered, count);
	}

	/**
	 * Retrieves the first token between two nodes.
	 * @param {ASTNode|Token} left The left node/token.
	 * @param {ASTNode|Token} right The right node/token.
	 * @param {number|object} [options] Options, skip, or filter.
	 * @returns {Token|null} The first token.
	 */
	getFirstTokenBetween(left, right, options) {
		const { skip, filter, includeComments } = this._normalizeSingleArgs(
			options,
		);
		const tokens = this.getFirstTokensBetween(left, right, {
			count: Number.MAX_SAFE_INTEGER,
			filter,
			includeComments,
		});
		return tokens[skip] || null;
	}

	/**
	 * Retrieves the last N tokens between two nodes.
	 * @param {ASTNode|Token} left The left node/token.
	 * @param {ASTNode|Token} right The right node/token.
	 * @param {number|object} [options] Options, count, or filter.
	 * @returns {Token[]} Tokens between the nodes.
	 */
	getLastTokensBetween(left, right, options) {
		const { count, filter, includeComments } = this._normalizeBeforeAfterArgs(
			options,
		);
		const range = this._rangeBetween(left, right);
		const tokens = this._collectTokensInRange(range, includeComments);
		const filtered = this._applyFilter(tokens, filter);
		return this._takeFromEnd(filtered, count);
	}

	/**
	 * Retrieves the last token between two nodes.
	 * @param {ASTNode|Token} left The left node/token.
	 * @param {ASTNode|Token} right The right node/token.
	 * @param {number|object} [options] Options, skip, or filter.
	 * @returns {Token|null} The last token.
	 */
	getLastTokenBetween(left, right, options) {
		const { skip, filter, includeComments } = this._normalizeSingleArgs(
			options,
		);
		const tokens = this.getLastTokensBetween(left, right, {
			count: Number.MAX_SAFE_INTEGER,
			filter,
			includeComments,
		});
		return tokens[skip] || null;
	}

	/**
	 * Retrieves all tokens between two nodes.
	 * @param {ASTNode|Token} left The left node/token.
	 * @param {ASTNode|Token} right The right node/token.
	 * @param {number} [padding] Number of surrounding tokens to include.
	 * @returns {Token[]} Tokens between the nodes.
	 */
	getTokensBetween(left, right, padding) {
		const range = this._rangeBetween(left, right);
		const tokens = this._collectTokensInRange(range, false);
		if (typeof padding === "number") {
			const start = Math.max(0, tokens.length - padding);
			return tokens.slice(start);
		}
		return tokens;
	}

	/**
	 * Retrieves a token by its range start.
	 * @param {number} start The range start.
	 * @param {object} [options] Options.
	 * @returns {Token|null} The token.
	 */
	getTokenByRangeStart(start, options) {
		const includeComments = options?.includeComments ?? false;
		if (includeComments) {
			return this._commentMap.get(start) || null;
		}
		return this._tokenMap.get(start) || null;
	}

	/**
	 * Determines whether comments exist between two tokens.
	 * @param {Token} left The left token.
	 * @param {Token} right The right token.
	 * @returns {boolean} True if comments exist.
	 */
	commentsExistBetween(left, right) {
		const leftIdx = this.tokens.indexOf(left);
		const rightIdx = this.tokens.indexOf(right);
		if (leftIdx === -1 || rightIdx === -1) {
			return false;
		}
		const start = left.range[1];
		const end = right.range[0];
		return this.comments.some(c => c.range[0] >= start && c.range[1] <= end);
	}

	/**
	 * Retrieves comments before a node or token.
	 * @param {ASTNode|Token} node The node or token.
	 * @returns {Comment[]} Comments before.
	 */
	getCommentsBefore(node) {
		const range = this._nodeRange(node);
		return this.comments.filter(c => c.range[1] <= range[0]);
	}

	/**
	 * Retrieves comments after a node or token.
	 * @param {ASTNode|Token} node The node or token.
	 * @returns {Comment[]} Comments after.
	 */
	getCommentsAfter(node) {
		const range = this._nodeRange(node);
		return this.comments.filter(c => c.range[0] >= range[1]);
	}

	/**
	 * Retrieves comments inside a node.
	 * @param {ASTNode} node The node.
	 * @returns {Comment[]} Comments inside.
	 */
	getCommentsInside(node) {
		const range = this._nodeRange(node);
		return this.comments.filter(
			c => c.range[0] >= range[0] && c.range[1] <= range[1],
		);
	}

	// ----------------------------------------------------------------------
	// Private helpers
	// ----------------------------------------------------------------------

	/**
	 * Normalizes arguments for getTokens and related methods.
	 * @param {number|object|function} [options] Options, count, or filter.
	 * @param {number} [after] After count.
	 * @returns {object} Normalized options.
	 */
	_normalizeGetTokensArgs(options, after) {
		let count = Number.MAX_SAFE_INTEGER;
		let before = 0;
		let afterOpt = after ?? 0;
		let filter = null;
		let includeComments = false;

		if (typeof options === "number") {
			before = options;
		} else if (typeof options === "function") {
			filter = options;
		} else if (options && typeof options === "object") {
			if (typeof options.count === "number") count = options.count;
			if (typeof options.before === "number") before = options.before;
			if (typeof options.after === "number") afterOpt = options.after;
			if (typeof options.filter === "function") filter = options.filter;
			if (options.includeComments) includeComments = true;
		}
		return { count, before, after: afterOpt, filter, includeComments };
	}

	/**
	 * Normalizes arguments for before/after token retrieval.
	 * @param {number|object} [options] Options, count, or filter.
	 * @returns {object} Normalized options.
	 */
	_normalizeBeforeAfterArgs(options) {
		let count = Number.MAX_SAFE_INTEGER;
		let filter = null;
		let includeComments = false;

		if (typeof options === "number") {
			count = options;
		} else if (options && typeof options === "object") {
			if (typeof options.count === "number") count = options.count;
			if (typeof options.filter === "function") filter = options.filter;
			if (options.includeComments) includeComments = true;
		}
		return { count, filter, includeComments };
	}

	/**
	 * Normalizes arguments for single-token retrieval.
	 * @param {number|object|function} [options] Options, skip, or filter.
	 * @returns {object} Normalized options.
	 */
	_normalizeSingleArgs(options) {
		let skip = 0;
		let filter = null;
		let includeComments = false;

		if (typeof options === "number") {
			skip = options;
		} else if (typeof options === "function") {
			filter = options;
		} else if (options && typeof options === "object") {
			if (typeof options.skip === "number") skip = options.skip;
			if (typeof options.filter === "function") filter = options.filter;
			if (options.includeComments) includeComments = true;
		}
		return { skip, filter, includeComments };
	}

	/**
	 * Returns the range of a node or token.
	 * @param {ASTNode|Token} node The node or token.
	 * @returns {[number, number]} The range.
	 */
	_nodeRange(node) {
		return node.range || [node.start, node.end];
	}

	/**
	 * Returns the range between two nodes/tokens.
	 * @param {ASTNode|Token} left The left node/token.
	 * @param {ASTNode|Token} right The right node/token.
	 * @returns {[number, number]} The range.
	 */
	_rangeBetween(left, right) {
		const leftRange = this._nodeRange(left);
		const rightRange = this._nodeRange(right);
		return [leftRange[1], rightRange[0]];
	}

	/**
	 * Collects tokens (and optionally comments) within a range.
	 * @param {[number, number]} range The range.
	 * @param {boolean} includeComments Whether to include comments.
	 * @returns {Token[]} Tokens (and comments) in range.
	 */
	_collectTokensInRange(range, includeComments) {
		const result = this.tokens.filter(t => t.range[0] >= range[0] && t.range[1] <= range[1]);
		if (includeComments) {
			const comments = this.comments.filter(c => c.range[0] >= range[0] && c.range[1] <= range[1]);
			return this._mergeSorted(result, comments);
		}
		return result;
	}

	/**
	 * Collects tokens before a position.
	 * @param {number} pos Position.
	 * @param {boolean} includeComments Whether to include comments.
	 * @returns {Token[]} Tokens before.
	 */
	_collectTokensBefore(pos, includeComments) {
		const result = this.tokens.filter(t => t.range[1] <= pos);
		if (includeComments) {
			const comments = this.comments.filter(c => c.range[1] <= pos);
			return this._mergeSorted(result, comments);
		}
		return result;
	}

	/**
	 * Collects tokens after a position.
	 * @param {number} pos Position.
	 * @param {boolean} includeComments Whether to include comments.
	 * @returns {Token[]} Tokens after.
	 */
	_collectTokensAfter(pos, includeComments) {
		const result = this.tokens.filter(t => t.range[0] >= pos);
		if (includeComments) {
			const comments = this.comments.filter(c => c.range[0] >= pos);
			return this._mergeSorted(result, comments);
		}
		return result;
	}

	/**
	 * Merges two sorted arrays of tokens/comments.
	 * @param {Token[]} a First array.
	 * @param {Comment[]} b Second array.
	 * @returns {Token[]} Merged array.
	 */
	_mergeSorted(a, b) {
		const merged = [];
		let i = 0;
		let j = 0;
		while (i < a.length && j < b.length) {
			if (a[i].range[0] <= b[j].range[0]) {
				merged.push(a[i++]);
			} else {
				merged.push(b[j++]);
			}
		}
		while (i < a.length) merged.push(a[i++]);
		while (j < b.length) merged.push(b[j++]);
		return merged;
	}

	/**
	 * Applies a filter function to a token array.
	 * @param {Token[]} tokens Tokens.
	 * @param {function|null} filter Filter function.
	 * @returns {Token[]} Filtered tokens.
	 */
	_applyFilter(tokens, filter) {
		if (typeof filter !== "function") return tokens;
		return tokens.filter(filter);
	}

	/**
	 * Takes N tokens from the start of an array.
	 * @param {Token[]} tokens Tokens.
	 * @param {number} count Number to take.
	 * @returns {Token[]} Subset.
	 */
	_takeFromStart(tokens, count) {
		if (typeof count !== "number") return tokens;
		return tokens.slice(0, count);
	}

	/**
	 * Takes N tokens from the end of an array.
	 * @param {Token[]} tokens Tokens.
	 * @param {number} count Number to take.
	 * @returns {Token[]} Subset.
	 */
	_takeFromEnd(tokens, count) {
		if (typeof count !== "number") return tokens;
		return tokens.slice(-count);
	}

	/**
	 * Slices tokens based on before and after counts.
	 * @param {Token[]} tokens Tokens.
	 * @param {number} before Number before.
	 * @param {number} after Number after.
	 * @returns {Token[]} Sliced tokens.
	 */
	_sliceTokens(tokens, before, after) {
		const start = Math.max(0, tokens.length - before - after);
		const end = tokens.length - after;
		return tokens.slice(start, end);
	}
}

module.exports = TokenStore;