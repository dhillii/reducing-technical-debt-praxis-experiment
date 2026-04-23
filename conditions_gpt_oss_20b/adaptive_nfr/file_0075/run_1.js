"use strict";

/**
 * TokenStore provides utilities for navigating tokens and comments
 * within an AST.  The implementation is intentionally simple
 * and focuses on correctness rather than performance.
 */
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
	 * Return all tokens (and optionally comments) that belong to a node.
	 * @param {Node} node
	 * @param {number|Object} [countBeforeOrOptions]
	 * @param {number} [countAfter]
	 * @returns {Token[]}
	 */
	getTokens(node, countBeforeOrOptions, countAfter) {
		const { start, end } = this._getRange(node);
		let tokens = this._tokensInRange(start, end, false);

		// Handle options
		if (typeof countBeforeOrOptions === "object") {
			const opts = countBeforeOrOptions;
			if (opts.includeComments) {
				tokens = this._mergeTokensAndComments(tokens, start, end);
			}
			if (opts.filter) {
				tokens = tokens.filter(opts.filter);
			}
			if (opts.countBefore) {
				const before = this.getTokensBefore(node, opts.countBefore);
				tokens = before.concat(tokens);
			}
			if (opts.countAfter) {
				const after = this.getTokensAfter(node, opts.countAfter);
				tokens = tokens.concat(after);
			}
			return tokens;
		}

		// Numeric arguments
		let countBefore = 0;
		if (typeof countBeforeOrOptions === "number") {
			countBefore = countBeforeOrOptions;
		}
		if (typeof countAfter === "number") {
			const before = this.getTokensBefore(node, countBefore);
			const after = this.getTokensAfter(node, countAfter);
			return before.concat(tokens, after);
		}
		if (countBefore) {
			const before = this.getTokensBefore(node, countBefore);
			return before.concat(tokens);
		}
		return tokens;
	}

	/**
	 * Return tokens before a node.
	 * @param {Node} node
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getTokensBefore(node, countOrOptions) {
		const { start } = this._getRange(node);
		let tokens = this._tokensBeforeRange(start, false);

		if (typeof countOrOptions === "object") {
			const opts = countOrOptions;
			if (opts.includeComments) {
				tokens = this._mergeTokensAndCommentsBefore(tokens, start);
			}
			if (opts.filter) {
				tokens = tokens.filter(opts.filter);
			}
			if (opts.count) {
				tokens = tokens.slice(-opts.count);
			}
			return tokens;
		}

		if (typeof countOrOptions === "number") {
			return tokens.slice(-countOrOptions);
		}
		return tokens;
	}

	/**
	 * Return a single token before a node.
	 * @param {Node} node
	 * @param {number|Object} [skipOrOptions]
	 * @returns {Token|null}
	 */
	getTokenBefore(node, skipOrOptions) {
		const tokens = this.getTokensBefore(node, skipOrOptions);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	/**
	 * Return tokens after a node.
	 * @param {Node} node
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getTokensAfter(node, countOrOptions) {
		const { end } = this._getRange(node);
		let tokens = this._tokensAfterRange(end, false);

		if (typeof countOrOptions === "object") {
			const opts = countOrOptions;
			if (opts.includeComments) {
				tokens = this._mergeTokensAndCommentsAfter(tokens, end);
			}
			if (opts.filter) {
				tokens = tokens.filter(opts.filter);
			}
			if (opts.count) {
				tokens = tokens.slice(0, opts.count);
			}
			return tokens;
		}

		if (typeof countOrOptions === "number") {
			return tokens.slice(0, countOrOptions);
		}
		return tokens;
	}

	/**
	 * Return a single token after a node.
	 * @param {Node} node
	 * @param {number|Object} [skipOrOptions]
	 * @returns {Token|null}
	 */
	getTokenAfter(node, skipOrOptions) {
		const tokens = this.getTokensAfter(node, skipOrOptions);
		return tokens.length ? tokens[0] : null;
	}

	/**
	 * Return the first N tokens of a node.
	 * @param {Node} node
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getFirstTokens(node, countOrOptions) {
		const tokens = this.getTokens(node, countOrOptions);
		return tokens.slice(0, this._countFromOptions(countOrOptions));
	}

	/**
	 * Return the first token of a node.
	 * @param {Node} node
	 * @param {Object} [options]
	 * @returns {Token|null}
	 */
	getFirstToken(node, options) {
		const tokens = this.getFirstTokens(node, options);
		return tokens.length ? tokens[0] : null;
	}

	/**
	 * Return the last N tokens of a node.
	 * @param {Node} node
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getLastTokens(node, countOrOptions) {
		const tokens = this.getTokens(node, countOrOptions);
		return tokens.slice(-this._countFromOptions(countOrOptions));
	}

	/**
	 * Return the last token of a node.
	 * @param {Node} node
	 * @param {Object} [options]
	 * @returns {Token|null}
	 */
	getLastToken(node, options) {
		const tokens = this.getLastTokens(node, options);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	/**
	 * Return the first N tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getFirstTokensBetween(left, right, countOrOptions) {
		const tokens = this.getTokensBetween(left, right, countOrOptions);
		return tokens.slice(0, this._countFromOptions(countOrOptions));
	}

	/**
	 * Return the first token between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [skipOrOptions]
	 * @returns {Token|null}
	 */
	getFirstTokenBetween(left, right, skipOrOptions) {
		const tokens = this.getTokensBetween(left, right, skipOrOptions);
		return tokens.length ? tokens[0] : null;
	}

	/**
	 * Return the last N tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getLastTokensBetween(left, right, countOrOptions) {
		const tokens = this.getTokensBetween(left, right, countOrOptions);
		return tokens.slice(-this._countFromOptions(countOrOptions));
	}

	/**
	 * Return the last token between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [skipOrOptions]
	 * @returns {Token|null}
	 */
	getLastTokenBetween(left, right, skipOrOptions) {
		const tokens = this.getTokensBetween(left, right, skipOrOptions);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	/**
	 * Return all tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getTokensBetween(left, right, countOrOptions) {
		const { end: leftEnd } = this._getRange(left);
		const { start: rightStart } = this._getRange(right);
		let tokens = this._tokensBetweenRange(leftEnd, rightStart, false);

		if (typeof countOrOptions === "object") {
			const opts = countOrOptions;
			if (opts.includeComments) {
				tokens = this._mergeTokensAndCommentsBetween(tokens, leftEnd, rightStart);
			}
			if (opts.filter) {
				tokens = tokens.filter(opts.filter);
			}
			if (opts.count) {
				tokens = tokens.slice(0, opts.count);
			}
			if (opts.countAfter) {
				const after = this.getTokensAfter(right, opts.countAfter);
				tokens = tokens.concat(after);
			}
			if (opts.countBefore) {
				const before = this.getTokensBefore(left, opts.countBefore);
				tokens = before.concat(tokens);
			}
			return tokens;
		}

		// Numeric arguments: countBefore and countAfter
		let countBefore = 0;
		let countAfter = 0;
		if (typeof countOrOptions === "number") {
			countBefore = countOrOptions;
		}
		if (typeof countAfter === "number") {
			countAfter = countAfter;
		}
		if (countBefore) {
			const before = this.getTokensBefore(left, countBefore);
			tokens = before.concat(tokens);
		}
		if (countAfter) {
			const after = this.getTokensAfter(right, countAfter);
			tokens = tokens.concat(after);
		}
		return tokens;
	}

	/**
	 * Return the token at a specific range start.
	 * @param {number} index
	 * @param {Object} [options]
	 * @returns {Token|null}
	 */
	getTokenByRangeStart(index, options = {}) {
		const token = this.tokens.find(t => t.range[0] === index);
		if (token) return token;
		if (options.includeComments) {
			return this.comments.find(c => c.range[0] === index) || null;
		}
		return null;
	}

	/**
	 * Determine if any comments exist between two tokens.
	 * @param {Token} token1
	 * @param {Token} token2
	 * @returns {boolean}
	 */
	commentsExistBetween(token1, token2) {
		const start = token1.range[1];
		const end = token2.range[0];
		return this.comments.some(c => c.range[0] > start && c.range[1] < end);
	}

	/**
	 * Return comments before a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @returns {Comment[]}
	 */
	getCommentsBefore(nodeOrToken) {
		const { start } = this._getRange(nodeOrToken);
		return this.comments.filter(c => c.range[1] <= start);
	}

	/**
	 * Return comments after a node or token.
	 * @param {Node|Token} nodeOrToken
	 * @returns {Comment[]}
	 */
	getCommentsAfter(nodeOrToken) {
		const { end } = this._getRange(nodeOrToken);
		return this.comments.filter(c => c.range[0] >= end);
	}

	/**
	 * Return comments inside a node.
	 * @param {Node} node
	 * @returns {Comment[]}
	 */
	getCommentsInside(node) {
		const { start, end } = this._getRange(node);
		return this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
	}

	/* ------------------------------------------------------------------
	 * Helper methods
	 * ------------------------------------------------------------------ */

	_getRange(node) {
		if (node.range) return { start: node.range[0], end: node.range[1] };
		// For tokens or comments
		return { start: node.range[0], end: node.range[1] };
	}

	_tokensInRange(start, end, includeComments) {
		const tokens = this.tokens.filter(t => t.range[0] >= start && t.range[1] <= end);
		if (!includeComments) return tokens;
		const comments = this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
		return this._mergeSorted(tokens, comments);
	}

	_tokensBeforeRange(start, includeComments) {
		const tokens = this.tokens.filter(t => t.range[1] <= start);
		if (!includeComments) return tokens;
		const comments = this.comments.filter(c => c.range[1] <= start);
		return this._mergeSorted(tokens, comments);
	}

	_tokensAfterRange(end, includeComments) {
		const tokens = this.tokens.filter(t => t.range[0] >= end);
		if (!includeComments) return tokens;
		const comments = this.comments.filter(c => c.range[0] >= end);
		return this._mergeSorted(tokens, comments);
	}

	_tokensBetweenRange(leftEnd, rightStart, includeComments) {
		const tokens = this.tokens.filter(t => t.range[0] >= leftEnd && t.range[1] <= rightStart);
		if (!includeComments) return tokens;
		const comments = this.comments.filter(c => c.range[0] >= leftEnd && c.range[1] <= rightStart);
		return this._mergeSorted(tokens, comments);
	}

	_mergeTokensAndComments(tokens, start, end) {
		const comments = this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
		return this._mergeSorted(tokens, comments);
	}

	_mergeTokensAndCommentsBefore(tokens, start) {
		const comments = this.comments.filter(c => c.range[1] <= start);
		return this._mergeSorted(tokens, comments);
	}

	_mergeTokensAndCommentsAfter(tokens, end) {
		const comments = this.comments.filter(c => c.range[0] >= end);
		return this._mergeSorted(tokens, comments);
	}

	_mergeTokensAndCommentsBetween(tokens, leftEnd, rightStart) {
		const comments = this.comments.filter(c => c.range[0] >= leftEnd && c.range[1] <= rightStart);
		return this._mergeSorted(tokens, comments);
	}

	_mergeSorted(a, b) {
		const result = [];
		let i = 0, j = 0;
		while (i < a.length && j < b.length) {
			if (a[i].range[0] <= b[j].range[0]) {
				result.push(a[i++]);
			} else {
				result.push(b[j++]);
			}
		}
		return result.concat(a.slice(i)).concat(b.slice(j));
	}

	_countFromOptions(countOrOptions) {
		if (typeof countOrOptions === "number") return countOrOptions;
		if (typeof countOrOptions === "object" && countOrOptions.count) return countOrOptions.count;
		return 0;
	}
}

module.exports = TokenStore;