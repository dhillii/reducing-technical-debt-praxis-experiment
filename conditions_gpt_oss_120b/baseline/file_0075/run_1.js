"use strict";

class TokenStore {
  constructor(tokens, comments) {
    this.tokens = tokens || [];
    this.comments = comments || [];
    this._all = this.tokens.concat(this.comments).sort((a, b) => a.range[0] - b.range[0]);
  }

  // ---------- internal helpers ----------
  _parseArgs(arg1, arg2) {
    let before = 0;
    let after = 0;
    const options = {};

    if (typeof arg1 === "number") {
      before = arg1;
    } else if (arg1 && typeof arg1 === "object") {
      Object.assign(options, arg1);
    }

    if (typeof arg2 === "number") {
      after = arg2;
    } else if (arg2 && typeof arg2 === "object") {
      Object.assign(options, arg2);
    }

    return { before, after, options };
  }

  _filterItems(items, options) {
    if (!options) return items;
    const { filter, includeComments } = options;
    let result = items;
    if (filter) {
      result = result.filter(filter);
    }
    if (includeComments === false) {
      result = result.filter(item => item.type !== "Block" && item.type !== "Line");
    }
    return result;
  }

  _sliceRange(node, includeComments) {
    const start = node.range[0];
    const end = node.range[1];
    const items = this._all.filter(item => {
      const within = item.range[0] >= start && item.range[1] <= end;
      if (!within) return false;
      if (!includeComments && (item.type === "Block" || item.type === "Line")) {
        return false;
      }
      return true;
    });
    return items;
  }

  _findIndexAtPosition(pos) {
    // binary search for first item whose range[0] >= pos
    let lo = 0;
    let hi = this._all.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._all[mid].range[0] < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ---------- public API ----------
  getTokens(node, arg1, arg2) {
    const { before, after, options } = this._parseArgs(arg1, arg2);
    const includeComments = options && options.includeComments;
    const startIdx = this._findIndexAtPosition(node.range[0]);
    const endIdx = this._findIndexAtPosition(node.range[1]) - 1;
    const sliceStart = Math.max(0, startIdx - before);
    const sliceEnd = Math.min(this._all.length - 1, endIdx + after);
    const raw = this._all.slice(sliceStart, sliceEnd + 1);
    return this._filterItems(raw, options);
  }

  getTokensBefore(node, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const startIdx = this._findIndexAtPosition(node.range[0]);
    const sliceStart = Math.max(0, startIdx - count);
    const raw = this._all.slice(sliceStart, startIdx);
    return this._filterItems(raw, { includeComments, filter });
  }

  getTokenBefore(node, arg) {
    const opts = typeof arg === "object" ? arg : { skip: arg };
    const { skip = 0, includeComments, filter } = opts;
    const beforeItems = this.getTokensBefore(node, { count: skip + 1, includeComments, filter });
    return beforeItems[beforeItems.length - 1] || null;
  }

  getTokensAfter(node, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const endIdx = this._findIndexAtPosition(node.range[1]);
    const sliceEnd = Math.min(this._all.length, endIdx + count);
    const raw = this._all.slice(endIdx, sliceEnd);
    return this._filterItems(raw, { includeComments, filter });
  }

  getTokenAfter(node, arg) {
    const opts = typeof arg === "object" ? arg : { skip: arg };
    const { skip = 0, includeComments, filter } = opts;
    const afterItems = this.getTokensAfter(node, { count: skip + 1, includeComments, filter });
    return afterItems[skip] || null;
  }

  getFirstTokens(node, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const items = this._sliceRange(node, includeComments);
    const filtered = this._filterItems(items, { filter });
    return filtered.slice(0, count);
  }

  getFirstToken(node, arg) {
    const opts = typeof arg === "object" ? arg : { skip: arg };
    const { skip = 0, includeComments, filter } = opts;
    const items = this.getFirstTokens(node, { count: skip + 1, includeComments, filter });
    return items[skip] || null;
  }

  getLastTokens(node, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const items = this._sliceRange(node, includeComments);
    const filtered = this._filterItems(items, { filter });
    return filtered.slice(-count);
  }

  getLastToken(node, arg) {
    const opts = typeof arg === "object" ? arg : { skip: arg };
    const { skip = 0, includeComments, filter } = opts;
    const items = this.getLastTokens(node, { count: skip + 1, includeComments, filter });
    return items[items.length - 1 - skip] || null;
  }

  getFirstTokensBetween(left, right, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const leftEnd = this._findIndexAtPosition(left.range[1]);
    const rightStart = this._findIndexAtPosition(right.range[0]);
    const raw = this._all.slice(leftEnd, rightStart);
    const filtered = this._filterItems(raw, { includeComments, filter });
    return filtered.slice(0, count);
  }

  getFirstTokenBetween(left, right, arg) {
    const opts = typeof arg === "object" ? arg : { skip: arg };
    const { skip = 0, includeComments, filter } = opts;
    const items = this.getFirstTokensBetween(left, right, { count: skip + 1, includeComments, filter });
    return items[skip] || null;
  }

  getLastTokensBetween(left, right, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const leftEnd = this._findIndexAtPosition(left.range[1]);
    const rightStart = this._findIndexAtPosition(right.range[0]);
    const raw = this._all.slice(leftEnd, rightStart);
    const filtered = this._filterItems(raw, { includeComments, filter });
    return filtered.slice(-count);
  }

  getLastTokenBetween(left, right, arg) {
    const opts = typeof arg === "object" ? arg : { skip: arg };
    const { skip = 0, includeComments, filter } = opts;
    const items = this.getLastTokensBetween(left, right, { count: skip + 1, includeComments, filter });
    return items[items.length - 1 - skip] || null;
  }

  getTokensBetween(left, right, arg) {
    const { count = Number.MAX_SAFE_INTEGER, includeComments, filter } = typeof arg === "object" ? arg : { count: arg };
    const leftEnd = this._findIndexAtPosition(left.range[1]);
    const rightStart = this._findIndexAtPosition(right.range[0]);
    const raw = this._all.slice(leftEnd, rightStart);
    const filtered = this._filterItems(raw, { includeComments, filter });
    return filtered.slice(0, count);
  }

  getTokenByRangeStart(start, options = {}) {
    const includeComments = options.includeComments;
    const candidate = this._all.find(item => item.range[0] === start && (includeComments || (item.type !== "Block" && item.type !== "Line")));
    return candidate || null;
  }

  commentsExistBetween(leftToken, rightToken) {
    return this.comments.some(c => c.range[0] > leftToken.range[1] && c.range[1] < rightToken.range[0]);
  }

  getCommentsBefore(nodeOrToken, options = {}) {
    const includeComments = true;
    const start = nodeOrToken.range[0];
    const idx = this._findIndexAtPosition(start);
    const slice = this._all.slice(0, idx);
    return slice.filter(item => (item.type === "Block" || item.type === "Line"));
  }

  getCommentsAfter(nodeOrToken, options = {}) {
    const start = nodeOrToken.range[1];
    const idx = this._findIndexAtPosition(start);
    const slice = this._all.slice(idx);
    return slice.filter(item => (item.type === "Block" || item.type === "Line"));
  }

  getCommentsInside(node) {
    return this.comments.filter(c => c.range[0] >= node.range[0] && c.range[1] <= node.range[1]);
  }
}

module.exports = TokenStore;