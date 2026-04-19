```javascript
/**
 * @fileoverview TokenStore implementation for ESLint.
 * @author
 */

"use strict";

const assert = require("chai").assert;

/**
 * TokenStore provides utilities for navigating tokens and comments
 * within a source file.
 */
class TokenStore {
	/**
	 * @param {Token[]} tokens
	 * @param {Comment[]} comments
	 */
	constructor(tokens, comments) {
		this.tokens = tokens.slice().sort((a, b) => a.range[0] - b.range[0]);
		this.comments = comments.slice().sort((a, b) => a.range[0] - b.range[0]);
	}

	/**
	 * @private
	 * @param {boolean} includeComments
	 * @returns {Array<Token|Comment>}
	 */
	_getCombined(includeComments) {
		if (!includeComments) return this.tokens;
		return this.tokens.concat(this.comments).sort((a, b) => a.range[0] - b.range[0]);
	}

	/**
	 * @private
	 * @param {number} start
	 * @param {number} end
	 * @param {boolean} includeComments
	 * @returns {Array<Token|Comment>}
	 */
	_getItemsInRange(start, end, includeComments) {
		const items = this._getCombined(includeComments);
		return items.filter(
			(item) => item.range[0] >= start && item.range[1] <= end
		);
	}

	/**
	 * @private
	 * @param {Node|Token} node
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Array<Token|Comment>}
	 */
	_getTokensBefore(node, count, includeComments, filter) {
		const items = this._getCombined(includeComments).filter(
			(item) => item.range[1] <= node.range[0]
		);
		if (filter) items.filter(filter);
		return items.slice(-count);
	}

	/**
	 * @private
	 * @param {Node|Token} node
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Array<Token|Comment>}
	 */
	_getTokensAfter(node, count, includeComments, filter) {
		const items = this._getCombined(includeComments).filter(
			(item) => item.range[0] >= node.range[1]
		);
		if (filter) items.filter(filter);
		return items.slice(0, count);
	}

	/**
	 * @private
	 * @param {Token|Comment} token
	 * @param {number} skip
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Token|Comment|null}
	 */
	_getTokenBefore(token, skip, includeComments, filter) {
		const items = this._getCombined(includeComments);
		const idx = items.findIndex((i) => i === token);
		if (idx <= 0) return null;
		let found = null;
		let skipped = 0;
		for (let i = idx - 1; i >= 0; i--) {
			if (filter && !filter(items[i])) continue;
			if (skipped < skip) {
				skipped++;
				continue;
			}
			found = items[i];
			break;
		}
		return found;
	}

	/**
	 * @private
	 * @param {Token|Comment} token
	 * @param {number} skip
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Token|Comment|null}
	 */
	_getTokenAfter(token, skip, includeComments, filter) {
		const items = this._getCombined(includeComments);
		const idx = items.findIndex((i) => i === token);
		if (idx < 0 || idx >= items.length - 1) return null;
		let found = null;
		let skipped = 0;
		for (let i = idx + 1; i < items.length; i++) {
			if (filter && !filter(items[i])) continue;
			if (skipped < skip) {
				skipped++;
				continue;
			}
			found = items[i];
			break;
		}
		return found;
	}

	/**
	 * @private
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Array<Token|Comment>}
	 */
	_getTokensBetween(left, right, count, includeComments, filter) {
		const start = left.range[1];
		const end = right.range[0];
		const items = this._getItemsInRange(start, end, includeComments);
		if (filter) return items.filter(filter).slice(0, count);
		return items.slice(0, count);
	}

	/**
	 * @private
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Array<Token|Comment>}
	 */
	_getLastTokensBetween(left, right, count, includeComments, filter) {
		const start = left.range[1];
		const end = right.range[0];
		const items = this._getItemsInRange(start, end, includeComments);
		if (filter) return items.filter(filter).slice(-count);
		return items.slice(-count);
	}

	/**
	 * @private
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Token|Comment|null}
	 */
	_getFirstTokenBetween(left, right, count, includeComments, filter) {
		const items = this._getTokensBetween(left, right, count, includeComments, filter);
		return items[0] || null;
	}

	/**
	 * @private
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number} count
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Token|Comment|null}
	 */
	_getLastTokenBetween(left, right, count, includeComments, filter) {
		const items = this._getLastTokensBetween(left, right, count, includeComments, filter);
		return items[items.length - 1] || null;
	}

	/**
	 * @private
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number} padding
	 * @param {boolean} includeComments
	 * @param {function(Token|Comment):boolean} filter
	 * @returns {Array<Token|Comment>}
	 */
	_getTokensBetweenWithPadding(left, right, padding, includeComments, filter) {
		const before = Math.floor(padding / 2);
		const after = Math.ceil(padding / 2);
		const start = left.range[0] - before;
		const end = right.range[1] + after;
		const items = this._getItemsInRange(start, end, includeComments);
		if (filter) return items.filter(filter);
		return items;
	}

	/**
	 * @private
	 * @param {number} index
	 * @param {boolean} includeComments
	 * @returns {Token|Comment|null}
	 */
	_getTokenByRangeStart(index, includeComments) {
		const items = this._getCombined(includeComments);
		return items.find((i) => i.range[0] === index) || null;
	}

	/**
	 * @private
	 * @param {Token|Comment} token1
	 * @param {Token|Comment} token2
	 * @returns {boolean}
	 */
	_commentsExistBetween(token1, token2) {
		const start = token1.range[1];
		const end = token2.range[0];
		return this.comments.some(
			(c) => c.range[0] >= start && c.range[1] <= end
		);
	}

	/**
	 * @private
	 * @param {Node|Token} node
	 * @returns {Array<Comment>}
	 */
	_getCommentsBefore(node) {
		return this.comments.filter((c) => c.range[1] <= node.range[0]);
	}

	/**
	 * @private
	 * @param {Node|Token} node
	 * @returns {Array<Comment>}
	 */
	_getCommentsAfter(node) {
		return this.comments.filter((c) => c.range[0] >= node.range[1]);
	}

	/**
	 * @private
	 * @param {Node} node
	 * @returns {Array<Comment>}
	 */
	_getCommentsInside(node) {
		return this.comments.filter(
			(c) => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]
		);
	}

	/**
	 * Retrieve all tokens for a node, optionally including surrounding tokens.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrCountBefore]
	 * @param {number} [countAfter]
	 * @returns {Array<Token|Comment>}
	 */
	getTokens(node, optionsOrCountBefore, countAfter) {
		let countBefore = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCountBefore === "number") {
			countBefore = optionsOrCountBefore;
		} else if (typeof optionsOrCountBefore === "object") {
			countBefore = optionsOrCountBefore.count || 0;
			includeComments = !!optionsOrCountBefore.includeComments;
			filter = optionsOrCountBefore.filter || null;
		}
		if (typeof countAfter !== "number") countAfter = 0;
		const before = this._getTokensBefore(node, countBefore, includeComments, filter);
		const inside = this._getItemsInRange(node.range[0], node.range[1], includeComments).filter(filter);
		const after = this._getTokensAfter(node, countAfter, includeComments, filter);
		return before.concat(inside, after);
	}

	/**
	 * Retrieve tokens before a node.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Array<Token|Comment>}
	 */
	getTokensBefore(node, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		return this._getTokensBefore(node, count, includeComments, filter);
	}

	/**
	 * Retrieve the token before a given token.
	 * @param {Token|Comment} token
	 * @param {number|Object} [optionsOrSkip]
	 * @returns {Token|Comment|null}
	 */
	getTokenBefore(token, optionsOrSkip) {
		let skip = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrSkip === "number") {
			skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			skip = optionsOrSkip.skip || 0;
			includeComments = !!optionsOrSkip.includeComments;
			filter = optionsOrSkip.filter || null;
		}
		return this._getTokenBefore(token, skip, includeComments, filter);
	}

	/**
	 * Retrieve tokens after a node.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Array<Token|Comment>}
	 */
	getTokensAfter(node, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		return this._getTokensAfter(node, count, includeComments, filter);
	}

	/**
	 * Retrieve the token after a given token.
	 * @param {Token|Comment} token
	 * @param {number|Object} [optionsOrSkip]
	 * @returns {Token|Comment|null}
	 */
	getTokenAfter(token, optionsOrSkip) {
		let skip = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrSkip === "number") {
			skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			skip = optionsOrSkip.skip || 0;
			includeComments = !!optionsOrSkip.includeComments;
			filter = optionsOrSkip.filter || null;
		}
		return this._getTokenAfter(token, skip, includeComments, filter);
	}

	/**
	 * Retrieve the first tokens of a node.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Array<Token|Comment>}
	 */
	getFirstTokens(node, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		const items = this._getItemsInRange(node.range[0], node.range[1], includeComments);
		if (filter) return items.filter(filter).slice(0, count);
		return items.slice(0, count);
	}

	/**
	 * Retrieve the first token of a node.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrSkip]
	 * @returns {Token|Comment|null}
	 */
	getFirstToken(node, optionsOrSkip) {
		let skip = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrSkip === "number") {
			skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			skip = optionsOrSkip.skip || 0;
			includeComments = !!optionsOrSkip.includeComments;
			filter = optionsOrSkip.filter || null;
		}
		const items = this._getItemsInRange(node.range[0], node.range[1], includeComments);
		if (filter) {
			const filtered = items.filter(filter);
			return filtered[skip] || null;
		}
		return items[skip] || null;
	}

	/**
	 * Retrieve the last tokens of a node.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Array<Token|Comment>}
	 */
	getLastTokens(node, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		const items = this._getItemsInRange(node.range[0], node.range[1], includeComments);
		if (filter) return items.filter(filter).slice(-count);
		return items.slice(-count);
	}

	/**
	 * Retrieve the last token of a node.
	 * @param {Node} node
	 * @param {number|Object} [optionsOrSkip]
	 * @returns {Token|Comment|null}
	 */
	getLastToken(node, optionsOrSkip) {
		let skip = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrSkip === "number") {
			skip = optionsOrSkip;
		} else if (typeof optionsOrSkip === "object") {
			skip = optionsOrSkip.skip || 0;
			includeComments = !!optionsOrSkip.includeComments;
			filter = optionsOrSkip.filter || null;
		}
		const items = this._getItemsInRange(node.range[0], node.range[1], includeComments);
		if (filter) {
			const filtered = items.filter(filter);
			return filtered[filtered.length - 1 - skip] || null;
		}
		return items[items.length - 1 - skip] || null;
	}

	/**
	 * Retrieve the first tokens between two nodes.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Array<Token|Comment>}
	 */
	getFirstTokensBetween(left, right, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		return this._getTokensBetween(left, right, count, includeComments, filter);
	}

	/**
	 * Retrieve the first token between two nodes.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Token|Comment|null}
	 */
	getFirstTokenBetween(left, right, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		return this._getFirstTokenBetween(left, right, count, includeComments, filter);
	}

	/**
	 * Retrieve the last tokens between two nodes.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Array<Token|Comment>}
	 */
	getLastTokensBetween(left, right, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		return this._getLastTokensBetween(left, right, count, includeComments, filter);
	}

	/**
	 * Retrieve the last token between two nodes.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} [optionsOrCount]
	 * @returns {Token|Comment|null}
	 */
	getLastTokenBetween(left, right, optionsOrCount) {
		let count = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrCount === "number") {
			count = optionsOrCount;
		} else if (typeof optionsOrCount === "object") {
			count = optionsOrCount.count || 0;
			includeComments = !!optionsOrCount.includeComments;
			filter = optionsOrCount.filter || null;
		}
		return this._getLastTokenBetween(left, right, count, includeComments, filter);
	}

	/**
	 * Retrieve tokens between two nodes, optionally with padding.
	 * @param {Node|Token} left
	 * @param {Node|Token} right
	 * @param {number|Object} [optionsOrPadding]
	 * @returns {Array<Token|Comment>}
	 */
	getTokensBetween(left, right, optionsOrPadding) {
		let padding = 0;
		let includeComments = false;
		let filter = null;
		if (typeof optionsOrPadding === "number") {
			padding = optionsOrPadding;
		} else if (typeof optionsOrPadding === "object") {
			padding = optionsOrPadding.count || 0;
			includeComments = !!optionsOrPadding.includeComments;
			filter = optionsOrPadding.filter || null;
		}
		return this._getTokensBetweenWithPadding(left, right, padding, includeComments, filter);
	}

	/**
	 * Retrieve a token by its range start.
	 * @param {number} index
	 * @param {Object} [options]
	 * @returns {Token|Comment|null}
	 */
	getTokenByRangeStart(index, options) {
		const includeComments = !!(options && options.includeComments);
		return this._getTokenByRangeStart(index, includeComments);
	}

	/**
	 * Check if comments exist between two tokens.
	 * @param {Token|Comment} token1
	 * @param {Token|Comment} token2
	 * @returns {boolean}
	 */
	commentsExistBetween(token1, token2) {
		return this._commentsExistBetween(token1, token2);
	}

	/**
	 * Retrieve comments before a node or token.
	 * @param {Node|Token} node
	 * @returns {Array<Comment>}
	 */
	getCommentsBefore(node) {
		return this._getCommentsBefore(node);
	}

	/**
	 * Retrieve comments after a node or token.
	 * @param {Node|Token} node
	 * @returns {Array<Comment>}
	 */
	getCommentsAfter(node) {
		return this._getCommentsAfter(node);
	}

	/**
	 * Retrieve comments inside a node.
	 * @param {Node} node
	 * @returns {Array<Comment>}
	 */
	getCommentsInside(node) {
		return this._getCommentsInside(node);
	}
}

module.exports = TokenStore;
```