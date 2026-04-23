"use strict";

class TokenStore {
	constructor(tokens, comments) {
		this.tokens = tokens || [];
		this.comments = comments || [];
		this._combined = null;
	}

	_getCombined(includeComments) {
		if (!includeComments) {
			return this.tokens;
		}
		if (this._combined) {
			return this._combined;
		}
		const combined = [];
		let i = 0;
		let j = 0;
		while (i < this.tokens.length && j < this.comments.length) {
			if (this.tokens[i].range[0] < this.comments[j].range[0]) {
				combined.push(this.tokens[i++]);
			} else {
				combined.push(this.comments[j++]);
			}
		}
		while (i < this.tokens.length) combined.push(this.tokens[i++]);
		while (j < this.comments.length) combined.push(this.comments[j++]);
		this._combined = combined;
		return combined;
	}

	_findStartIndex(node, includeComments) {
		const list = this._getCombined(includeComments);
		const target = node.range[0];
		let lo = 0;
		let hi = list.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid].range[0] < target) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	_findEndIndex(node, includeComments) {
		const list = this._getCombined(includeComments);
		const target = node.range[1];
		let lo = 0;
		let hi = list.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid].range[1] <= target) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	_slice(node, before = 0, after = 0, opts = {}) {
		const includeComments = !!opts.includeComments;
		const list = this._getCombined(includeComments);
		const startIdx = this._findStartIndex(node, includeComments);
		const endIdx = this._findEndIndex(node, includeComments);
		const sliceStart = Math.max(0, startIdx - before);
		const sliceEnd = Math.min(list.length, endIdx + after);
		let result = list.slice(sliceStart, sliceEnd);
		if (opts.filter) result = result.filter(opts.filter);
		if (opts.count != null) result = result.slice(0, opts.count);
		return result;
	}

	getTokens(node, beforeOrOpts, after) {
		let before = 0;
		let afterCount = 0;
		const opts = {};
		if (typeof beforeOrOpts === "number") {
			before = beforeOrOpts;
			afterCount = typeof after === "number" ? after : 0;
		} else if (beforeOrOpts && typeof beforeOrOpts === "object") {
			Object.assign(opts, beforeOrOpts);
		}
		return this._slice(node, before, afterCount, opts);
	}

	getTokensBefore(node, optsOrCount) {
		let count = Infinity;
		const opts = {};
		if (typeof optsOrCount === "number") {
			count = optsOrCount;
		} else if (optsOrCount && typeof optsOrCount === "object") {
			if (optsOrCount.count != null) count = optsOrCount.count;
			Object.assign(opts, optsOrCount);
		}
		const includeComments = !!opts.includeComments;
		const list = this._getCombined(includeComments);
		const startIdx = this._findStartIndex(node, includeComments);
		const sliceStart = Math.max(0, startIdx - count);
		let result = list.slice(sliceStart, startIdx);
		if (opts.filter) result = result.filter(opts.filter);
		if (opts.count != null) result = result.slice(-opts.count);
		return result;
	}

	getTokenBefore(node, optsOrSkip) {
		const tokens = this.getTokensBefore(node, optsOrSkip);
		return tokens[tokens.length - 1] || null;
	}

	getTokensAfter(node, optsOrCount) {
		let count = Infinity;
		const opts = {};
		if (typeof optsOrCount === "number") {
			count = optsOrCount;
		} else if (optsOrCount && typeof optsOrCount === "object") {
			if (optsOrCount.count != null) count = optsOrCount.count;
			Object.assign(opts, optsOrCount);
		}
		const includeComments = !!opts.includeComments;
		const list = this._getCombined(includeComments);
		const endIdx = this._findEndIndex(node, includeComments);
		const sliceEnd = Math.min(list.length, endIdx + count);
		let result = list.slice(endIdx, sliceEnd);
		if (opts.filter) result = result.filter(opts.filter);
		if (opts.count != null) result = result.slice(0, opts.count);
		return result;
	}

	getTokenAfter(node, optsOrSkip) {
		const tokens = this.getTokensAfter(node, optsOrSkip);
		return tokens[0] || null;
	}

	getFirstTokens(node, countOrOpts) {
		let count;
		const opts = {};
		if (typeof countOrOpts === "number") {
			count = countOrOpts;
		} else if (countOrOpts && typeof countOrOpts === "object") {
			if (countOrOpts.count != null) count = countOrOpts.count;
			Object.assign(opts, countOrOpts);
		}
		const includeComments = !!opts.includeComments;
		const list = this._getCombined(includeComments);
		const startIdx = this._findStartIndex(node, includeComments);
		const endIdx = this._findEndIndex(node, includeComments);
		let result = list.slice(startIdx, endIdx);
		if (opts.filter) result = result.filter(opts.filter);
		if (count != null) result = result.slice(0, count);
		return result;
	}

	getFirstToken(node, optsOrSkip) {
		const tokens = this.getFirstTokens(node, optsOrSkip);
		return tokens[0] || null;
	}

	getLastTokens(node, countOrOpts) {
		let count;
		const opts = {};
		if (typeof countOrOpts === "number") {
			count = countOrOpts;
		} else if (countOrOpts && typeof countOrOpts === "object") {
			if (countOrOpts.count != null) count = countOrOpts.count;
			Object.assign(opts, countOrOpts);
		}
		const includeComments = !!opts.includeComments;
		const list = this._getCombined(includeComments);
		const startIdx = this._findStartIndex(node, includeComments);
		const endIdx = this._findEndIndex(node, includeComments);
		let result = list.slice(startIdx, endIdx);
		if (opts.filter) result = result.filter(opts.filter);
		if (count != null) result = result.slice(-count);
		return result;
	}

	getLastToken(node, optsOrSkip) {
		const tokens = this.getLastTokens(node, optsOrSkip);
		return tokens[tokens.length - 1] || null;
	}

	_tokensBetween(left, right, includeComments) {
		const list = this._getCombined(includeComments);
		const leftIdx = this._findEndIndex(left, includeComments);
		const rightIdx = this._findStartIndex(right, includeComments);
		return list.slice(leftIdx, rightIdx);
	}

	getFirstTokensBetween(left, right, optsOrCount) {
		let count;
		const opts = {};
		if (typeof optsOrCount === "number") {
			count = optsOrCount;
		} else if (optsOrCount && typeof optsOrCount === "object") {
			if (optsOrCount.count != null) count = optsOrCount.count;
			Object.assign(opts, optsOrCount);
		}
		const includeComments = !!opts.includeComments;
		let result = this._tokensBetween(left, right, includeComments);
		if (opts.filter) result = result.filter(opts.filter);
		if (count != null) result = result.slice(0, count);
		return result;
	}

	getFirstTokenBetween(left, right, optsOrSkip) {
		const tokens = this.getFirstTokensBetween(left, right, optsOrSkip);
		return tokens[0] || null;
	}

	getLastTokensBetween(left, right, optsOrCount) {
		let count;
		const opts = {};
		if (typeof optsOrCount === "number") {
			count = optsOrCount;
		} else if (optsOrCount && typeof optsOrCount === "object") {
			if (optsOrCount.count != null) count = optsOrCount.count;
			Object.assign(opts, optsOrCount);
		}
		const includeComments = !!opts.includeComments;
		let result = this._tokensBetween(left, right, includeComments);
		if (opts.filter) result = result.filter(opts.filter);
		if (count != null) result = result.slice(-count);
		return result;
	}

	getLastTokenBetween(left, right, optsOrSkip) {
		const tokens = this.getLastTokensBetween(left, right, optsOrSkip);
		return tokens[tokens.length - 1] || null;
	}

	getTokensBetween(left, right, padding = 0) {
		const list = this._getCombined(false);
		const leftIdx = this._findEndIndex(left, false);
		const rightIdx = this._findStartIndex(right, false);
		if (padding) {
			const start = Math.max(0, leftIdx - padding);
			const end = Math.min(list.length, rightIdx + padding);
			return list.slice(start, end);
		}
		return list.slice(leftIdx, rightIdx);
	}

	getTokenByRangeStart(start, opts = {}) {
		const includeComments = !!opts.includeComments;
		const list = this._getCombined(includeComments);
		const dummy = { range: [start, start] };
		const idx = this._findStartIndex(dummy, includeComments);
		const token = list[idx];
		if (token && token.range[0] === start) return token;
		return null;
	}

	commentsExistBetween(leftToken, rightToken) {
		const list = this._getCombined(true);
		const leftIdx = this._findEndIndex(leftToken, true);
		const rightIdx = this._findStartIndex(rightToken, true);
		for (let i = leftIdx; i < rightIdx; i++) {
			const t = list[i];
			if (t.type === "Block" || t.type === "Line") return true;
		}
		return false;
	}

	getCommentsBefore(nodeOrToken) {
		const list = this._getCombined(true);
		const startIdx = this._findStartIndex(nodeOrToken, true);
		const result = [];
		for (let i = startIdx - 1; i >= 0; i--) {
			const t = list[i];
			if (t.type === "Block" || t.type === "Line") result.unshift(t);
			else break;
		}
		return result;
	}

	getCommentsAfter(nodeOrToken) {
		const list = this._getCombined(true);
		const endIdx = this._findEndIndex(nodeOrToken, true);
		const result = [];
		for (let i = endIdx; i < list.length; i++) {
			const t = list[i];
			if (t.type === "Block" || t.type === "Line") result.push(t);
			else break;
		}
		return result;
	}

	getCommentsInside(node) {
		const list = this._getCombined(true);
		const startIdx = this._findStartIndex(node, true);
		const endIdx = this._findEndIndex(node, true);
		const result = [];
		for (let i = startIdx; i < endIdx; i++) {
			const t = list[i];
			if (t.type === "Block" || t.type === "Line") result.push(t);
		}
		return result;
	}
}

module.exports = TokenStore;