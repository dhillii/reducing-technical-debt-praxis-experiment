/**
 * TokenStore - a lightweight utility for retrieving tokens and comments
 * from an ESTree AST. This implementation focuses on clarity and low
 * cyclomatic complexity by delegating option handling to small helper
 * functions.
 */
"use strict";

class TokenStore {
  constructor(tokens, comments) {
    this.tokens = tokens || [];
    this.comments = comments || [];
    // Merge tokens and comments into a single sorted array.
    this._all = this._mergeSorted(this.tokens, this.comments);
  }

  /* ------------------------------------------------------------------ *
   *  Private helpers
   * ------------------------------------------------------------------ */

  _mergeSorted(tokens, comments) {
    const merged = [];
    let i = 0,
      j = 0;
    while (i < tokens.length && j < comments.length) {
      if (tokens[i].range[0] <= comments[j].range[0]) {
        merged.push(tokens[i++]);
      } else {
        merged.push(comments[j++]);
      }
    }
    while (i < tokens.length) merged.push(tokens[i++]);
    while (j < comments.length) merged.push(comments[j++]);
    return merged;
  }

  _binarySearch(arr, pos) {
    let lo = 0,
      hi = arr.length - 1,
      mid,
      best = -1;
    while (lo <= hi) {
      mid = (lo + hi) >> 1;
      const item = arr[mid];
      if (item.range[0] <= pos && item.range[1] >= pos) {
        return mid;
      }
      if (item.range[0] < pos) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  _parseOptions(arg1, arg2, arg3) {
    const opts = { before: 0, after: 0, includeComments: false };
    if (typeof arg1 === "number") {
      opts.before = arg1;
      if (typeof arg2 === "number") {
        opts.after = arg2;
        if (typeof arg3 === "object") Object.assign(opts, arg3);
      } else if (typeof arg2 === "function") {
        opts.filter = arg2;
      } else if (typeof arg2 === "object") {
        Object.assign(opts, arg2);
      }
    } else if (typeof arg1 === "function") {
      opts.filter = arg1;
    } else if (typeof arg1 === "object") {
      Object.assign(opts, arg1);
    }
    return opts;
  }

  _applyFilter(items, opts) {
    let result = items;
    if (!opts.includeComments) {
      result = result.filter(
        (t) => t.type !== "Block" && t.type !== "Line"
      );
    }
    if (opts.filter) {
      result = result.filter(opts.filter);
    }
    return result;
  }

  _sliceAround(node, before, after, opts) {
    const startIdx = this._binarySearch(this._all, node.range[0]);
    const endIdx = this._binarySearch(this._all, node.range[1]);
    const start = Math.max(0, startIdx - before);
    const end = Math.min(this._all.length - 1, endIdx + after);
    return this._applyFilter(this._all.slice(start, end + 1), opts);
  }

  _sliceBefore(node, count, opts) {
    const idx = this._binarySearch(this._all, node.range[0]);
    const start = Math.max(0, idx - count);
    return this._applyFilter(this._all.slice(start, idx), opts);
  }

  _sliceAfter(node, count, opts) {
    const idx = this._binarySearch(this._all, node.range[1]);
    const end = Math.min(this._all.length, idx + 1 + count);
    return this._applyFilter(this._all.slice(idx + 1, end), opts);
  }

  _sliceBetween(left, right, opts) {
    const leftIdx = this._binarySearch(this._all, left.range[1]);
    const rightIdx = this._binarySearch(this._all, right.range[0]);
    return this._applyFilter(this._all.slice(leftIdx + 1, rightIdx), opts);
  }

  /* ------------------------------------------------------------------ *
   *  Public API
   * ------------------------------------------------------------------ */

  getTokens(node, a, b, c) {
    const opts = this._parseOptions(a, b, c);
    return this._sliceAround(node, opts.before, opts.after, opts);
  }

  getTokensBefore(node, arg) {
    const opts = this._parseOptions(arg);
    const count = typeof arg === "number" ? arg : opts.count ?? Infinity;
    return this._sliceBefore(node, count, opts);
  }

  getTokenBefore(node, arg) {
    const list = this.getTokensBefore(node, arg);
    return list.length ? list[list.length - 1] : null;
  }

  getTokensAfter(node, arg) {
    const opts = this._parseOptions(arg);
    const count = typeof arg === "number" ? arg : opts.count ?? Infinity;
    return this._sliceAfter(node, count, opts);
  }

  getTokenAfter(node, arg) {
    const list = this.getTokensAfter(node, arg);
    return list.length ? list[0] : null;
  }

  getFirstTokens(node, arg) {
    const opts = this._parseOptions(arg);
    const count = typeof arg === "number" ? arg : opts.count ?? Infinity;
    const all = this._sliceAround(node, 0, 0, opts);
    return all.slice(0, count);
  }

  getFirstToken(node, arg) {
    const list = this.getFirstTokens(node, arg);
    return list.length ? list[0] : null;
  }

  getLastTokens(node, arg) {
    const opts = this._parseOptions(arg);
    const count = typeof arg === "number" ? arg : opts.count ?? Infinity;
    const all = this._sliceAround(node, 0, 0, opts);
    return all.slice(-count);
  }

  getLastToken(node, arg) {
    const list = this.getLastTokens(node, arg);
    return list.length ? list[list.length - 1] : null;
  }

  getFirstTokensBetween(left, right, arg) {
    const opts = this._parseOptions(arg);
    const count = typeof arg === "number" ? arg : opts.count ?? Infinity;
    const all = this._sliceBetween(left, right, opts);
    return all.slice(0, count);
  }

  getFirstTokenBetween(left, right, arg) {
    const list = this.getFirstTokensBetween(left, right, arg);
    return list.length ? list[0] : null;
  }

  getLastTokensBetween(left, right, arg) {
    const opts = this._parseOptions(arg);
    const count = typeof arg === "number" ? arg : opts.count ?? Infinity;
    const all = this._sliceBetween(left, right, opts);
    return all.slice(-count);
  }

  getLastTokenBetween(left, right, arg) {
    const list = this.getLastTokensBetween(left, right, arg);
    return list.length ? list[list.length - 1] : null;
  }

  getTokensBetween(left, right, padding) {
    const leftIdx = this._binarySearch(this._all, left.range[1]);
    const rightIdx = this._binarySearch(this._all, right.range[0]);
    let start = leftIdx + 1;
    let end = rightIdx;
    if (typeof padding === "number") {
      start = Math.max(0, start - padding);
      end = Math.min(this._all.length, end + padding);
    }
    return this._all.slice(start, end);
  }

  getTokenByRangeStart(start, opts = {}) {
    const idx = this._binarySearch(this._all, start);
    if (idx === -1) return null;
    const token = this._all[idx];
    if (token.range[0] !== start) return null;
    if (!opts.includeComments && (token.type === "Block" || token.type === "Line"))
      return null;
    return token;
  }

  commentsExistBetween(left, right) {
    const leftIdx = this._binarySearch(this.comments, left.range[1]);
    const rightIdx = this._binarySearch(this.comments, right.range[0]);
    return leftIdx + 1 <= rightIdx - 1;
  }

  getCommentsBefore(nodeOrToken) {
    const start = nodeOrToken.range[0];
    const idx = this._binarySearch(this.comments, start);
    const result = [];
    for (let i = 0; i <= idx; i++) {
      if (this.comments[i].range[1] <= start) result.push(this.comments[i]);
    }
    return result;
  }

  getCommentsAfter(nodeOrToken) {
    const end = nodeOrToken.range[1];
    const idx = this._binarySearch(this.comments, end);
    const result = [];
    for (let i = idx + 1; i < this.comments.length; i++) {
      if (this.comments[i].range[0] >= end) result.push(this.comments[i]);
    }
    return result;
  }

  getCommentsInside(node) {
    const start = node.range[0];
    const end = node.range[1];
    return this.comments.filter(
      (c) => c.range[0] >= start && c.range[1] <= end
    );
  }
}

module.exports = TokenStore;