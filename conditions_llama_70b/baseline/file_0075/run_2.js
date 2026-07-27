class TokenStore {
  constructor(tokens, comments) {
    this.tokens = tokens;
    this.comments = comments;
  }

  getTokens(node, options = {}) {
    const { before = 0, after = 0, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithPadding(filteredTokens, before, after);
  }

  getTokensBefore(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBefore(node.range, count, includeComments);
    return this._filterTokens(tokens, filter);
  }

  getTokenBefore(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const token = this._getTokenBefore(node.range, skip, includeComments);
    return this._filterToken(token, filter);
  }

  getTokensAfter(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensAfter(node.range, count, includeComments);
    return this._filterTokens(tokens, filter);
  }

  getTokenAfter(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const token = this._getTokenAfter(node.range, skip, includeComments);
    return this._filterToken(token, filter);
  }

  getFirstTokens(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstToken(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const token = this._getFirstToken(node.range, skip, includeComments);
    return this._filterToken(token, filter);
  }

  getLastTokens(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastToken(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const token = this._getLastToken(node.range, skip, includeComments);
    return this._filterToken(token, filter);
  }

  getFirstTokensBetween(node1, node2, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstTokenBetween(node1, node2, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const token = this._getFirstTokenBetween(node1.range, node2.range, skip, includeComments);
    return this._filterToken(token, filter);
  }

  getLastTokensBetween(node1, node2, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastTokenBetween(node1, node2, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const token = this._getLastTokenBetween(node1.range, node2.range, skip, includeComments);
    return this._filterToken(token, filter);
  }

  getTokensBetween(node1, node2, options = {}) {
    const { padding = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithPadding(filteredTokens, padding);
  }

  getTokenByRangeStart(index, options = {}) {
    const { includeComments } = options;
    const token = this._getTokenByRangeStart(index, includeComments);
    return token;
  }

  commentsExistBetween(node1, node2) {
    const comments = this._getCommentsBetween(node1.range, node2.range);
    return comments.length > 0;
  }

  getCommentsBefore(node) {
    const comments = this._getCommentsBefore(node.range);
    return comments;
  }

  getCommentsAfter(node) {
    const comments = this._getCommentsAfter(node.range);
    return comments;
  }

  getCommentsInside(node) {
    const comments = this._getCommentsInside(node.range);
    return comments;
  }

  _getTokensInRange(range, includeComments) {
    const tokens = this.tokens.filter(token => token.range[0] >= range[0] && token.range[1] <= range[1]);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[0] >= range[0] && comment.range[1] <= range[1]);
      return [...tokens, ...comments];
    }
    return tokens;
  }

  _getTokensBefore(range, count, includeComments) {
    const tokens = this.tokens.filter(token => token.range[1] <= range[0]);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[1] <= range[0]);
      return [...tokens, ...comments].slice(-count);
    }
    return tokens.slice(-count);
  }

  _getTokenBefore(range, skip, includeComments) {
    const tokens = this.tokens.filter(token => token.range[1] <= range[0]);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[1] <= range[0]);
      const allTokens = [...tokens, ...comments];
      return allTokens[allTokens.length - 1 - skip];
    }
    return tokens[tokens.length - 1 - skip];
  }

  _getTokensAfter(range, count, includeComments) {
    const tokens = this.tokens.filter(token => token.range[0] >= range[1]);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[0] >= range[1]);
      return [...tokens, ...comments].slice(0, count);
    }
    return tokens.slice(0, count);
  }

  _getTokenAfter(range, skip, includeComments) {
    const tokens = this.tokens.filter(token => token.range[0] >= range[1]);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[0] >= range[1]);
      const allTokens = [...tokens, ...comments];
      return allTokens[skip];
    }
    return tokens[skip];
  }

  _getFirstToken(range, skip, includeComments) {
    const tokens = this._getTokensInRange(range, includeComments);
    return tokens[skip];
  }

  _getLastToken(range, skip, includeComments) {
    const tokens = this._getTokensInRange(range, includeComments);
    return tokens[tokens.length - 1 - skip];
  }

  _getTokensBetween(range1, range2, includeComments) {
    const tokens = this.tokens.filter(token => token.range[0] > range1[1] && token.range[1] < range2[0]);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[0] > range1[1] && comment.range[1] < range2[0]);
      return [...tokens, ...comments];
    }
    return tokens;
  }

  _getFirstTokenBetween(range1, range2, skip, includeComments) {
    const tokens = this._getTokensBetween(range1, range2, includeComments);
    return tokens[skip];
  }

  _getLastTokenBetween(range1, range2, skip, includeComments) {
    const tokens = this._getTokensBetween(range1, range2, includeComments);
    return tokens[tokens.length - 1 - skip];
  }

  _getTokenByRangeStart(index, includeComments) {
    const token = this.tokens.find(token => token.range[0] === index);
    if (includeComments) {
      const comment = this.comments.find(comment => comment.range[0] === index);
      return token || comment;
    }
    return token;
  }

  _filterTokens(tokens, filter) {
    if (filter) {
      return tokens.filter(filter);
    }
    return tokens;
  }

  _filterToken(token, filter) {
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  _getTokensWithPadding(tokens, padding) {
    if (padding === 0) {
      return tokens;
    }
    const start = Math.max(0, tokens[0].range[0] - padding);
    const end = Math.min(this.tokens[this.tokens.length - 1].range[1], tokens[tokens.length - 1].range[1] + padding);
    return this._getTokensInRange([start, end]);
  }

  _getCommentsBefore(range) {
    return this.comments.filter(comment => comment.range[1] <= range[0]);
  }

  _getCommentsAfter(range) {
    return this.comments.filter(comment => comment.range[0] >= range[1]);
  }

  _getCommentsInside(range) {
    return this.comments.filter(comment => comment.range[0] >= range[0] && comment.range[1] <= range[1]);
  }

  _getCommentsBetween(range1, range2) {
    return this.comments.filter(comment => comment.range[0] > range1[1] && comment.range[1] < range2[0]);
  }
}