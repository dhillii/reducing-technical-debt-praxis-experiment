"use strict";

/**
 * TokenStore provides utilities for navigating tokens and comments
 * within an AST produced by espree.
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
	 * Returns tokens (and optionally comments) that belong to a node.
	 * @param {Node} node
	 * @param {number|Object} [countBeforeOrOptions]
	 * @param {number|Object} [countAfterOrUndefined]
	 * @param {Object} [options]
	 * @returns {Token[]}
	 */
	getTokens(node, countBeforeOrOptions, countAfterOrUndefined, options) {
		let countBefore = 0;
		let countAfter = 0;
		if (typeof countBeforeOrOptions === "number") {
			countBefore = countBeforeOrOptions;
			if (typeof countAfterOrUndefined === "number") {
				countAfter = countAfterOrUndefined;
			} else if (typeof countAfterOrUndefined === "object") {
				options = countAfterOrUndefined;
			}
		} else if (typeof countBeforeOrOptions === "object") {
			options = countBeforeOrOptions;
		}
		if (!options) options = {};

		const tokens = this._getTokensInRange(node.range, options);
		const before = this._getTokensBefore(node, options);
		const after = this._getTokensAfter(node, options);

		const result = [];
		if (countBefore > 0) {
			result.push(...before.slice(-countBefore));
		}
		result.push(...tokens);
		if (countAfter > 0) {
			result.push(...after.slice(0, countAfter));
		}
		return result;
	}

	/**
	 * Returns tokens before a node.
	 * @param {Node} node
	 * @param {Object|number} [optionsOrCount]
	 * @returns {Token[]}
	 */
	getTokensBefore(node, optionsOrCount) {
		let options = {};
		if (typeof optionsOrCount === "number") {
			options.count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			options = optionsOrCount;
		}
		return this._getTokensBefore(node, options);
	}

	/**
	 * Returns the first token before a node.
	 * @param {Node} node
	 * @param {Object|number} [optionsOrSkip]
	 * @returns {Token|null}
	 */
	getTokenBefore(node, optionsOrSkip) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			options = optionsOrSkip;
		}
		const before = this._getTokensBefore(node, options);
		return before.length ? before[before.length - 1] : null;
	}

	/**
	 * Returns tokens after a node.
	 * @param {Node} node
	 * @param {Object|number} [optionsOrCount]
	 * @returns {Token[]}
	 */
	getTokensAfter(node, optionsOrCount) {
		let options = {};
		if (typeof optionsOrCount === "number") {
			options.count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			options = optionsOrCount;
		}
		return this._getTokensAfter(node, options);
	}

	/**
	 * Returns the first token after a node.
	 * @param {Node} node
	 * @param {Object|number} [optionsOrSkip]
	 * @returns {Token|null}
	 */
	getTokenAfter(node, optionsOrSkip) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			options = optionsOrSkip;
		}
		const after = this._getTokensAfter(node, options);
		return after.length ? after[0] : null;
	}

	/**
	 * Returns the first N tokens from a node's token stream.
	 * @param {Node} node
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getFirstTokens(node, countOrOptions) {
		let options = {};
		if (typeof countOrOptions === "number") {
			options.count = countOrOptions;
		} else if (typeof countOrOptions === "object") {
			options = countOrOptions;
		}
		const tokens = this._getTokensInRange(node.range, options);
		if (options.count !== undefined) {
			return tokens.slice(0, options.count);
		}
		return tokens;
	}

	/**
	 * Returns the first token from a node's token stream.
	 * @param {Node} node
	 * @param {Object|number} [optionsOrSkip]
	 * @returns {Token|null}
	 */
	getFirstToken(node, optionsOrSkip) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			options = optionsOrSkip;
		}
		const tokens = this._getTokensInRange(node.range, options);
		if (tokens.length === 0) return null;
		if (options.skip !== undefined) {
			return tokens[options.skip] || null;
		}
		return tokens[0];
	}

	/**
	 * Returns the last N tokens from a node's token stream.
	 * @param {Node} node
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getLastTokens(node, countOrOptions) {
		let options = {};
		if (typeof countOrOptions === "number") {
			options.count = countOrOptions;
		} else if (typeof countOrOptions === "object") {
			options = countOrOptions;
		}
		const tokens = this._getTokensInRange(node.range, options);
		if (options.count !== undefined) {
			return tokens.slice(-options.count);
		}
		return tokens;
	}

	/**
	 * Returns the last token from a node's token stream.
	 * @param {Node} node
	 * @param {Object|number} [optionsOrSkip]
	 * @returns {Token|null}
	 */
	getLastToken(node, optionsOrSkip) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			options = optionsOrSkip;
		}
		const tokens = this._getTokensInRange(node.range, options);
		if (tokens.length === 0) return null;
		if (options.skip !== undefined) {
			const idx = tokens.length - 1 - options.skip;
			return tokens[idx] || null;
		}
		return tokens[tokens.length - 1];
	}

	/**
	 * Returns the first N tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getFirstTokensBetween(left, right, countOrOptions) {
		let options = {};
		if (typeof countOrOptions === "number") {
			options.count = countOrOptions;
		} else if (typeof countOrOptions === "object") {
			options = countOrOptions;
		}
		const between = this._getTokensBetween(left, right, options);
		if (options.count !== undefined) {
			return between.slice(0, options.count);
		}
		return between;
	}

	/**
	 * Returns the first token between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object|number} [optionsOrSkip]
	 * @returns {Token|null}
	 */
	getFirstTokenBetween(left, right, optionsOrSkip) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			options = optionsOrSkip;
		}
		const between = this._getTokensBetween(left, right, options);
		if (between.length === 0) return null;
		if (options.skip !== undefined) {
			return between[options.skip] || null;
		}
		return between[0];
	}

	/**
	 * Returns the last N tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {number|Object} [countOrOptions]
	 * @returns {Token[]}
	 */
	getLastTokensBetween(left, right, countOrOptions) {
		let options = {};
		if (typeof countOrOptions === "number") {
			options.count = countOrOptions;
		} else if (typeof countOrOptions === "object") {
			options = countOrOptions;
		}
		const between = this._getTokensBetween(left, right, options);
		if (options.count !== undefined) {
			return between.slice(-options.count);
		}
		return between;
	}

	/**
	 * Returns the last token between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object|number} [optionsOrSkip]
	 * @returns {Token|null}
	 */
	getLastTokenBetween(left, right, optionsOrSkip) {
		let options = {};
		if (typeof optionsOrSkip === "number") {
			options.skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			options = optionsOrSkip;
		}
		const between = this._getTokensBetween(left, right, options);
		if (between.length === 0) return null;
		if (options.skip !== undefined) {
			const idx = between.length - 1 - options.skip;
			return between[idx] || null;
		}
		return between[between.length - 1];
	}

	/**
	 * Returns all tokens between two nodes.
	 * @param {Node} left
	 * @param {Node} right
	 * @returns {Token[]}
	 */
	getTokensBetween(left, right) {
		return this._getTokensBetween(left, right, {});
	}

	/**
	 * Returns a token or comment at a specific range start.
	 * @param {number} start
	 * @param {Object} [options]
	 * @returns {Token|null}
	 */
	getTokenByRangeStart(start, options = {}) {
		const all = options.includeComments ? [...this.tokens, ...this.comments] : this.tokens;
		for (const t of all) {
			if (t.range[0] === start) return t;
		}
		return null;
	}

	/**
	 * Checks if any comments exist between two tokens.
	 * @param {Token} left
	 * @param {Token} right
	 * @returns {boolean}
	 */
	commentsExistBetween(left, right) {
		for (const c of this.comments) {
			if (c.range[0] > left.range[1] && c.range[1] < right.range[0]) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Returns comments before a node or token.
	 * @param {Node|Token} node
	 * @returns {Comment[]}
	 */
	getCommentsBefore(node) {
		const start = node.range[0];
		return this.comments.filter(c => c.range[1] <= start);
	}

	/**
	 * Returns comments after a node or token.
	 * @param {Node|Token} node
	 * @returns {Comment[]}
	 */
	getCommentsAfter(node) {
		const end = node.range[1];
		return this.comments.filter(c => c.range[0] >= end);
	}

	/**
	 * Returns comments inside a node.
	 * @param {Node} node
	 * @returns {Comment[]}
	 */
	getCommentsInside(node) {
		const [start, end] = node.range;
		return this.comments.filter(c => c.range[0] >= start && c.range[1] <= end);
	}

	/* ------------------------------------------------------------------
	 * Internal helper methods
	 * ------------------------------------------------------------------ */

	/**
	 * Retrieves tokens (and optionally comments) within a range.
	 * @private
	 * @param {[number, number]} range
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	_getTokensInRange(range, options) {
		const [start, end] = range;
		const items = options.includeComments ? [...this.tokens, ...this.comments] : this.tokens;
		const filtered = items.filter(item => item.range[0] >= start && item.range[1] <= end);
		if (options.filter) {
			return filtered.filter(options.filter);
		}
		return filtered;
	}

	/**
	 * Retrieves tokens before a node.
	 * @private
	 * @param {Node} node
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	_getTokensBefore(node, options) {
		const start = node.range[0];
		const items = options.includeComments ? [...this.tokens, ...this.comments] : this.tokens;
		let before = items.filter(item => item.range[1] <= start);
		if (options.filter) {
			before = before.filter(options.filter);
		}
		if (options.count !== undefined) {
			before = before.slice(-options.count);
		}
		if (options.skip !== undefined) {
			before = before.slice(0, before.length - options.skip);
		}
		return before;
	}

	/**
	 * Retrieves tokens after a node.
	 * @private
	 * @param {Node} node
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	_getTokensAfter(node, options) {
		const end = node.range[1];
		const items = options.includeComments ? [...this.tokens, ...this.comments] : this.tokens;
		let after = items.filter(item => item.range[0] >= end);
		if (options.filter) {
			after = after.filter(options.filter);
		}
		if (options.count !== undefined) {
			after = after.slice(0, options.count);
		}
		if (options.skip !== undefined) {
			after = after.slice(options.skip);
		}
		return after;
	}

	/**
	 * Retrieves tokens between two nodes.
	 * @private
	 * @param {Node} left
	 * @param {Node} right
	 * @param {Object} options
	 * @returns {Token[]}
	 */
	_getTokensBetween(left, right, options) {
		const leftEnd = left.range[1];
		const rightStart = right.range[0];
		const items = options.includeComments ? [...this.tokens, ...this.comments] : this.tokens;
		let between = items.filter(item => item.range[0] > leftEnd && item.range[1] < rightStart);
		if (options.filter) {
			between = between.filter(options.filter);
		}
		if (options.count !== undefined) {
			between = between.slice(0, options.count);
		}
		if (options.skip !== undefined) {
			between = between.slice(options.skip);
		}
		return between;
	}
}

module.exports = TokenStore;