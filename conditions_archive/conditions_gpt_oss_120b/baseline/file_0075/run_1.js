```javascript
"use strict";

const { range: RANGE } = Symbol("range");

/**
 * TokenStore provides utilities for accessing tokens and comments in an AST.
 */
class TokenStore {
	constructor(tokens, comments) {
		this.tokens = tokens.slice().sort((a, b) => a.range[0] - b.range[0]);
		this.comments = (comments || []).slice().sort((a, b) => a.range[0] - b.range[0]);
		this._all = this.tokens.concat(this.comments).sort((a, b) => a.range[0] - b.range[0]);
	}

	/* --------------------------------------------------------------------- */
	/* Helpers                                                             */
	/* --------------------------------------------------------------------- */

	_findIndex(arr, pos) {
		let lo = 0, hi = arr.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (arr[mid].range[0] < pos) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	_filter(arr, opts) {
		if (!opts) return arr;
		const { filter } = opts;
		return filter ? arr.filter(filter) : arr;
	}

	_slice(arr, start, end) {
		return arr.slice(start, end);
	}

	_parseOptions(arg1, arg2) {
		if (typeof arg1 === "number") {
			return { before: arg1, after: typeof arg2 === "number" ? arg2 : 0 };
		}
		if (typeof arg1 === "function") {
			return { filter: arg1 };
		}
		if (typeof arg1 === "object" && arg1 !== null) {
			return arg1;
		}
		return {};
	}

	_collect(node, opts) {
		const includeComments = opts && opts.includeComments;
		const source = includeComments ? this._all : this.tokens;
		const start = node.range[0];
		const end = node.range[1];
		const startIdx = this._findIndex(source, start);
		const result = [];
		for (let i = startIdx; i < source.length && source[i].range[1] <= end; i++) {
			result.push(source[i]);
		}
		return this._filter(result, opts);
	}

	_collectBetween(left, right, opts) {
		const includeComments = opts && opts.includeComments;
		const source = includeComments ? this._all : this.tokens;
		const start = left.range[1];
		const end = right.range[0];
		const startIdx = this._findIndex(source, start);
		const result = [];
		for (let i = startIdx; i < source.length && source[i].range[0] < end; i++) {
			result.push(source[i]);
		}
		return this._filter(result, opts);
	}

	/* --------------------------------------------------------------------- */
	/* Public API                                                            */
	/* --------------------------------------------------------------------- */

	getTokens(node, arg1, arg2) {
		const opts = this._parseOptions(arg1, arg2);
		const tokens = this._collect(node, opts);
		const before = opts.before || 0;
		const after = opts.after || 0;
		const startIdx = this._findIndex(this._all, node.range[0]) - before;
		const endIdx = this._findIndex(this._all, node.range[1]) + after;
		const slice = this._slice(this._all, Math.max(0, startIdx), Math.min(this._all.length, endIdx));
		return this._filter(slice, opts);
	}

	getTokensBefore(node, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const allBefore = this._collect(node, { includeComments: opts.includeComments });
		const filtered = this._filter(allBefore, opts);
		return filtered.slice(-Math.min(count, filtered.length));
	}

	getTokenBefore(node, arg) {
		const tokens = this.getTokensBefore(node, arg);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	getTokensAfter(node, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const allAfter = this._collect(node, { includeComments: opts.includeComments });
		const filtered = this._filter(allAfter, opts);
		return filtered.slice(0, Math.min(count, filtered.length));
	}

	getTokenAfter(node, arg) {
		const tokens = this.getTokensAfter(node, arg);
		return tokens.length ? tokens[0] : null;
	}

	getFirstTokens(node, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const tokens = this._collect(node, opts);
		return tokens.slice(0, Math.min(count, tokens.length));
	}

	getFirstToken(node, arg) {
		const tokens = this.getFirstTokens(node, arg);
		return tokens.length ? tokens[0] : null;
	}

	getLastTokens(node, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const tokens = this._collect(node, opts);
		return tokens.slice(-Math.min(count, tokens.length));
	}

	getLastToken(node, arg) {
		const tokens = this.getLastTokens(node, arg);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	getFirstTokensBetween(left, right, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const tokens = this._collectBetween(left, right, opts);
		return tokens.slice(0, Math.min(count, tokens.length));
	}

	getFirstTokenBetween(left, right, arg) {
		const tokens = this.getFirstTokensBetween(left, right, arg);
		return tokens.length ? tokens[0] : null;
	}

	getLastTokensBetween(left, right, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const tokens = this._collectBetween(left, right, opts);
		return tokens.slice(-Math.min(count, tokens.length));
	}

	getLastTokenBetween(left, right, arg) {
		const tokens = this.getLastTokensBetween(left, right, arg);
		return tokens.length ? tokens[tokens.length - 1] : null;
	}

	getTokensBetween(left, right, arg) {
		const opts = typeof arg === "object" ? arg : { count: arg };
		const count = opts.count ?? Infinity;
		const tokens = this._collectBetween(left, right, opts);
		return tokens.slice(0, Math.min(count, tokens.length));
	}

	getTokenByRangeStart(start, opts = {}) {
		const source = opts.includeComments ? this._all : this.tokens;
		const idx = this._findIndex(source, start);
		if (idx < source.length && source[idx].range[0] === start) {
			return source[idx];
		}
		return null;
	}

	commentsExistBetween(left, right) {
		const start = left.range[1];
		const end = right.range[0];
		return this.comments.some(c => c.range[0] >= start && c.range[1] <= end);
	}

	_getPrevTokenOrComment(nodeOrToken) {
		const pos = nodeOrToken.range[0];
		const idx = this._findIndex(this._all, pos) - 1;
		return idx >= 0 ? this._all[idx] : null;
	}

	_getNextTokenOrComment(nodeOrToken) {
		const pos = nodeOrToken.range[1];
		const idx = this._findIndex(this._all, pos);
		return idx < this._all.length ? this._all[idx] : null;
	}

	getCommentsBefore(nodeOrToken) {
		const prev = this._getPrevTokenOrComment(nodeOrToken);
		if (!prev) return [];
		const idx = this.comments.findIndex(c => c.range[1] === prev.range[0]);
		return idx >= 0 ? [this.comments[idx]] : [];
	}

	getCommentsAfter(nodeOrToken) {
		const next = this._getNextTokenOrComment(nodeOrToken);
		if (!next) return [];
		const idx = this.comments.findIndex(c => c.range[0] === next.range[1]);
		return idx >= 0 ? [this.comments[idx]] : [];
	}

	getCommentsInside(node) {
		return this.comments.filter(c => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]);
	}
}

module.exports = TokenStore;
```