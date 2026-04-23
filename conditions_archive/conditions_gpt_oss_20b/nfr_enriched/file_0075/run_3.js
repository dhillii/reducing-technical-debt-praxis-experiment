"use strict";

/**
 * TokenStore provides convenient access to tokens and comments
 * within an AST.  All methods are intentionally simple and
 * operate on the original token and comment arrays without
 * any external dependencies.
 */
class TokenStore {
	/**
	 * @param {Token[]} tokens
	 * @param {Comment[]} comments
	 */
	constructor(tokens, comments) {
		this.tokens = tokens;
		this.comments = comments;
		/** @type {Array<{type:string,value:string,range:[number,number]}>} */
		this.all = this._mergeTokensAndComments(tokens, comments);
	}

	/* ------------------------------------------------------------------
	 * Helper methods
	 * ------------------------------------------------------------------ */

	/**
	 * Merge tokens and comments into a single sorted array.
	 * @private
	 */
	_mergeTokensAndComments(tokens, comments) {
		const all = [];
		let i = 0, j = 0;
		while (i < tokens.length || j < comments.length) {
			if (j >= comments.length ||
			    (i < tokens.length && tokens[i].range[0] <= comments[j].range[0])) {
				all.push(tokens[i++]);
			} else {
				all.push(comments[j++]);
			}
		}
		return all;
	}

	/**
	 * Return all items (tokens or comments) that lie within a range.
	 * @private
	 */
	_itemsInRange(start, end, includeComments) {
		const result = [];
		for (const item of this.all) {
			if (item.range[0] >= start && item.range[1] <= end) {
				if (!includeComments && this._isComment(item)) continue;
				result.push(item);
			}
		}
		return result;
	}

	/**
	 * Return all items before a given start index.
	 * @private
	 */
	_itemsBefore(start, includeComments) {
		const result = [];
		for (const item of this.all) {
			if (item.range[1] <= start) {
				if (!includeComments && this._isComment(item)) continue;
				result.push(item);
			}
		}
		return result;
	}

	/**
	 * Return all items after a given end index.
	 * @private
	 */
	_itemsAfter(end, includeComments) {
		const result = [];
		for (const item of this.all) {
			if (item.range[0] >= end) {
				if (!includeComments && this._isComment(item)) continue;
				result.push(item);
			}
		}
		return result;
	}

	/**
	 * Return all comments between two positions.
	 * @private
	 */
	_commentsBetween(start, end) {
		const result = [];
		for (const comment of this.comments) {
			if (comment.range[0] >= start && comment.range[1] <= end) {
				result.push(comment);
			}
		}
		return result;
	}

	/**
	 * Check if an item is a comment.
	 * @private
	 */
	_isComment(item) {
		return item.type === "Block" || item.type === "Line";
	}

	/**
	 * Apply filter if provided.
	 * @private
	 */
	_applyFilter(items, filter) {
		if (!filter) return items;
		return items.filter(filter);
	}

	/**
	 * Resolve options into a standard object.
	 * @private
	 */
	_normalizeOptions(options, defaultOpts = {}) {
		if (typeof options === "number") {
			return { countBefore: options, ...defaultOpts };
		}
		if (typeof options === "object" && options !== null) {
			return { ...defaultOpts, ...options };
		}
		return defaultOpts;
	}

	/* ------------------------------------------------------------------
	 * Public API
	 * ------------------------------------------------------------------ */

	getTokens(node, options) {
		const { countBefore = 0, countAfter = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { countBefore: 0, countAfter: 0 });

		const start = node.range[0];
		const end = node.range[1];

		const before = this._itemsBefore(start, includeComments);
		const after = this._itemsAfter(end, includeComments);
		const inside = this._itemsInRange(start, end, includeComments);

		const selectedBefore = before.slice(-countBefore);
		const selectedAfter = after.slice(0, countAfter);

		let result = [...selectedBefore, ...inside, ...selectedAfter];
		result = this._applyFilter(result, filter);
		return result;
	}

	getTokensBefore(node, options) {
		const { count = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { count: 0 });

		const start = node.range[0];
		const before = this._itemsBefore(start, includeComments);
		const selected = before.slice(-count);
		return this._applyFilter(selected, filter);
	}

	getTokenBefore(node, options) {
		const tokens = this.getTokensBefore(node, options);
		return tokens[tokens.length - 1] || null;
	}

	getTokensAfter(node, options) {
		const { count = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { count: 0 });

		const end = node.range[1];
		const after = this._itemsAfter(end, includeComments);
		const selected = after.slice(0, count);
		return this._applyFilter(selected, filter);
	}

	getTokenAfter(node, options) {
		const tokens = this.getTokensAfter(node, options);
		return tokens[0] || null;
	}

	getFirstTokens(node, options) {
		const { count = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { count: 0 });

		const start = node.range[0];
		const end = node.range[1];
		const inside = this._itemsInRange(start, end, includeComments);
		const selected = inside.slice(0, count);
		return this._applyFilter(selected, filter);
	}

	getFirstToken(node, options) {
		const tokens = this.getFirstTokens(node, options);
		return tokens[0] || null;
	}

	getLastTokens(node, options) {
		const { count = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { count: 0 });

		const start = node.range[0];
		const end = node.range[1];
		const inside = this._itemsInRange(start, end, includeComments);
		const selected = inside.slice(-count);
		return this._applyFilter(selected, filter);
	}

	getLastToken(node, options) {
		const tokens = this.getLastTokens(node, options);
		return tokens[tokens.length - 1] || null;
	}

	getFirstTokensBetween(left, right, options) {
		const { count = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { count: 0 });

		const start = left.range[1];
		const end = right.range[0];
		const between = this._itemsBetween(start, end, includeComments);
		const selected = between.slice(0, count);
		return this._applyFilter(selected, filter);
	}

	getFirstTokenBetween(left, right, options) {
		const tokens = this.getFirstTokensBetween(left, right, options);
		return tokens[0] || null;
	}

	getLastTokensBetween(left, right, options) {
		const { count = 0, filter, includeComments = false } =
			this._normalizeOptions(options, { count: 0 });

		const start = left.range[1];
		const end = right.range[0];
		const between = this._itemsBetween(start, end, includeComments);
		const selected = between.slice(-count);
		return this._applyFilter(selected, filter);
	}

	getLastTokenBetween(left, right, options) {
		const tokens = this.getLastTokensBetween(left, right, options);
		return tokens[tokens.length - 1] || null;
	}

	getTokensBetween(left, right, options) {
		const { filter, includeComments = false } =
			this._normalizeOptions(options, { filter: null, includeComments: false });

		const start = left.range[1];
		const end = right.range[0];
		const between = this._itemsBetween(start, end, includeComments);
		return this._applyFilter(between, filter);
	}

	getTokenByRangeStart(start, options) {
		const { includeComments = false } = this._normalizeOptions(options, { includeComments: false });

		for (const item of this.all) {
			if (item.range[0] === start) {
				if (!includeComments && this._isComment(item)) return null;
				return item;
			}
		}
		return null;
	}

	/**
	 * Return true if any comment exists between two tokens.
	 */
	commentsExistBetween(token1, token2) {
		const start = token1.range[1];
		const end = token2.range[0];
		for (const comment of this.comments) {
			if (comment.range[0] > start && comment.range[1] < end) {
				return true;
			}
		}
		return false;
	}

	getCommentsBefore(node) {
		const start = node.range[0];
		return this._commentsBetween(0, start);
	}

	getCommentsAfter(node) {
		const end = node.range[1];
		return this._commentsBetween(end, Infinity);
	}

	getCommentsInside(node) {
		const start = node.range[0];
		const end = node.range[1];
		return this._commentsBetween(start, end);
	}

	/* ------------------------------------------------------------------
	 * Private helper for between
	 * ------------------------------------------------------------------ */

	_itemsBetween(start, end, includeComments) {
		const result = [];
		for (const item of this.all) {
			if (item.range[0] >= start && item.range[1] <= end) {
				if (!includeComments && this._isComment(item)) continue;
				result.push(item);
			}
		}
		return result;
	}
}

module.exports = TokenStore;