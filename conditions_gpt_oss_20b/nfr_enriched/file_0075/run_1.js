"use strict";

const assert = require("chai").assert;

class TokenStore {
	/**
	 * @param {Token[]} tokens
	 * @param {Comment[]} comments
	 */
	constructor(tokens, comments) {
		this.tokens = tokens;
		this.comments = comments;
	}

	/**
	 * Return all tokens (and optionally comments) within a node's range.
	 * @param {Node} node
	 * @param {number|Object} beforeOrOptions
	 * @param {number} after
	 * @returns {Token[]}
	 */
	getTokens(node, beforeOrOptions = 0, after = 0) {
		let before = 0;
		let options = {};

		if (typeof beforeOrOptions === "number") {
			before = beforeOrOptions;
		} else {
			options = beforeOrOptions;
		}

		const nodeTokens = this._tokensInRange(node.range[0], node.range[1], options.includeComments);
		const filtered = this._applyFilter(nodeTokens, options.filter);
		const limited = this._applyCount(filtered, options.count);

		const beforeTokens = this._tokensBefore(node, before, options);
		const afterTokens = this._tokensAfter(node, after, options);

		return [...beforeTokens, ...limited, ...afterTokens];
	}

	/**
	 * Return tokens before a node.
	 * @param {Node} node
	 * @param {number|Object} countOrOptions
	 * @returns {Token[]}
	 */
	getTokensBefore(node, countOrOptions = 0) {
		let count = 0;
		let options = {};

		if (typeof countOrOptions === "number") {
			count = countOrOptions;
		} else {
			options = countOrOptions;
		}

		const beforeTokens = this._tokensBefore(node, count, options);
		return beforeTokens;
	}

	/**
	 * Return tokens after a node.
	 * @param {Node} node
	 * @param {number|Object} countOrOptions
	 * @returns {Token[]}
	 */
	getTokensAfter(node, countOrOptions = 0) {
		let count = 0;
		let options = {};

		if (typeof countOrOptions === "number") {
			count = countOrOptions;
		} else {
			options = countOrOptions;
		}

		const afterTokens = this._tokensAfter(node, count, options);
		return afterTokens;
	}

	/**
	 * Return the first N tokens of a node.
	 * @param {Node} node
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	getFirstTokens(node, options = {}) {
		const tokens = this._tokensInRange(node.range[0], node.range[1], options.includeComments);
		const filtered = this._applyFilter(tokens, options.filter);
		return this._applyCount(filtered, options.count);
	}

	/**
	 * Return the last N tokens of a node.
	 * @param {Node} node
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	getLastTokens(node, options = {}) {
		const tokens = this._tokensInRange(node.range[0], node.range[1], options.includeComments);
		const filtered = this._applyFilter(tokens, options.filter);
		const count = options.count || filtered.length;
		return filtered.slice(-count);
	}

	/**
	 * Return the first token of a node.
	 * @param {Node} node
	 * @param {Object} options
	 * @returns {Token|null}
	 */
	getFirstToken(node, options = {}) {
		const tokens = this.getFirstTokens(node, options);
		return tokens[0] || null;
	}

	/**
	 * Return the last token of a node.
	 * @param {Node} node
	 * @param {Object} options
	 * @returns {Token|null}
	 */
	getLastToken(node, options = {}) {
		const tokens = this.getLastTokens(node, options);
		return tokens[tokens.length - 1] || null;
	}

	/**
	 * Return the first N tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	getFirstTokensBetween(left, right, options = {}) {
		const tokens = this._tokensInRange(left.range[1], right.range[0], options.includeComments);
		const filtered = this._applyFilter(tokens, options.filter);
		return this._applyCount(filtered, options.count);
	}

	/**
	 * Return the last N tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	getLastTokensBetween(left, right, options = {}) {
		const tokens = this._tokensInRange(left.range[1], right.range[0], options.includeComments);
		const filtered = this._applyFilter(tokens, options.filter);
		const count = options.count || filtered.length;
		return filtered.slice(-count);
	}

	/**
	 * Return all tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @returns {Token[]}
	 */
	getTokensBetween(left, right) {
		return this._tokensInRange(left.range[1], right.range[0], false);
	}

	/**
	 * Return the first token between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object|number} optionsOrSkip
	 * @returns {Token|null}
	 */
	getFirstTokenBetween(left, right, optionsOrSkip = {}) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else {
			options = optionsOrSkip;
		}
		const tokens = this.getFirstTokensBetween(left, right, options);
		return tokens[0] || null;
	}

	/**
	 * Return the last token between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object|number} optionsOrSkip
	 * @returns {Token|null}
	 */
	getLastTokenBetween(left, right, optionsOrSkip = {}) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else {
			options = optionsOrSkip;
		}
		const tokens = this.getLastTokensBetween(left, right, options);
		return tokens[tokens.length - 1] || null;
	}

	/**
	 * Return the token at a specific range start.
	 * @param {number} index
	 * @param {Object} options
	 * @returns {Token|null}
	 */
	getTokenByRangeStart(index, options = {}) {
		const candidates = options.includeComments ? [...this.tokens, ...this.comments] : this.tokens;
		for (const token of candidates) {
			if (token.range[0] === index) {
				return token;
			}
		}
		return null;
	}

	/**
	 * Determine if comments exist between two tokens.
	 * @param {Token} left
	 * @param {Token} right
	 * @returns {boolean}
	 */
	commentsExistBetween(left, right) {
		for (const comment of this.comments) {
			if (comment.range[0] >= left.range[1] && comment.range[1] <= right.range[0]) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Return comments before a node or token.
	 * @param {Node|Token} node
	 * @returns {Comment[]}
	 */
	getCommentsBefore(node) {
		const end = node.range[0];
		return this.comments.filter(c => c.range[1] <= end);
	}

	/**
	 * Return comments after a node or token.
	 * @param {Node|Token} node
	 * @returns {Comment[]}
	 */
	getCommentsAfter(node) {
		const start = node.range[1];
		return this.comments.filter(c => c.range[0] >= start);
	}

	/**
	 * Return comments inside a node.
	 * @param {Node} node
	 * @returns {Comment[]}
	 */
	getCommentsInside(node) {
		const start = node.range[0];
		const end = node.range[1];
		return this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
	}

	/**
	 * Return the token before a node or token.
	 * @param {Node|Token} node
	 * @param {Object} options
	 * @returns {Token|null}
	 */
	getTokenBefore(node, options = {}) {
		const beforeTokens = this._tokensBefore(node, Infinity, options);
		return beforeTokens[0] || null;
	}

	/**
	 * Return the token after a node or token.
	 * @param {Node|Token} node
	 * @param {Object} options
	 * @returns {Token|null}
	 */
	getTokenAfter(node, options = {}) {
		const afterTokens = this._tokensAfter(node, Infinity, options);
		return afterTokens[0] || null;
	}

	/**
	 * Internal helper: get tokens in a range.
	 * @param {number} start
	 * @param {number} end
	 * @param {boolean} includeComments
	 * @returns {Token[]}
	 */
	_tokensInRange(start, end, includeComments) {
		const result = [];
		for (const token of this.tokens) {
			if (token.range[0] >= start && token.range[1] <= end) {
				result.push(token);
			}
		}
		if (includeComments) {
			for (const comment of this.comments) {
				if (comment.range[0] >= start && comment.range[1] <= end) {
					result.push(comment);
				}
			}
		}
		result.sort((a, b) => a.range[0] - b.range[0]);
		return result;
	}

	/**
	 * Internal helper: get tokens before a node.
	 * @param {Node} node
	 * @param {number} count
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	_tokensBefore(node, count, options) {
		const result = [];
		const start = node.range[0];
		for (const token of this.tokens) {
			if (token.range[1] <= start) {
				result.push(token);
			}
		}
		if (options.includeComments) {
			for (const comment of this.comments) {
				if (comment.range[1] <= start) {
					result.push(comment);
				}
			}
		}
		result.sort((a, b) => a.range[0] - b.range[0]);
		const filtered = this._applyFilter(result, options.filter);
		return this._applyCount(filtered, count);
	}

	/**
	 * Internal helper: get tokens after a node.
	 * @param {Node} node
	 * @param {number} count
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	_tokensAfter(node, count, options) {
		const result = [];
		const end = node.range[1];
		for (const token of this.tokens) {
			if (token.range[0] >= end) {
				result.push(token);
			}
		}
		if (options.includeComments) {
			for (const comment of this.comments) {
				if (comment.range[0] >= end) {
					result.push(comment);
				}
			}
		}
		result.sort((a, b) => a.range[0] - b.range[0]);
		const filtered = this._applyFilter(result, options.filter);
		return this._applyCount(filtered, count);
	}

	/**
	 * Internal helper: apply filter callback.
	 * @param {Token[]} tokens
	 * @param {function} filter
	 * @returns {Token[]}
	 */
	_applyFilter(tokens, filter) {
		if (!filter) return tokens;
		return tokens.filter(filter);
	}

	/**
	 * Internal helper: apply count limit.
	 * @param {Token[]} tokens
	 * @param {number} count
	 * @returns {Token[]}
	 */
	_applyCount(tokens, count) {
		if (!count) return tokens;
		return tokens.slice(0, count);
	}
}

module.exports = TokenStore;