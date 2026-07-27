class TokenStore {
  constructor(tokens, comments) {
    this.tokens = tokens;
    this.comments = comments;
  }

  getTokens(node, options = {}) {
    const { before = 0, after = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithPadding(filteredTokens, before, after);
  }

  getTokensBefore(node, options = {}) {
    const { count = 1, filter, includeComments = false } = options;
    const tokens = this._getTokensBefore(node.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getTokenBefore(node, options = {}) {
    const { skip = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensBefore(node.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getTokensAfter(node, options = {}) {
    const { count = 1, filter, includeComments = false } = options;
    const tokens = this._getTokensAfter(node.range[1], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getTokenAfter(node, options = {}) {
    const { skip = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensAfter(node.range[1], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens[skip] || null;
  }

  getFirstTokens(node, options = {}) {
    const { count = 1, filter, includeComments = false } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstToken(node, options = {}) {
    const { skip = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens[skip] || null;
  }

  getLastTokens(node, options = {}) {
    const { count = 1, filter, includeComments = false } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastToken(node, options = {}) {
    const { skip = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getFirstTokensBetween(node1, node2, options = {}) {
    const { count = 1, filter, includeComments = false } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstTokenBetween(node1, node2, options = {}) {
    const { skip = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens[skip] || null;
  }

  getLastTokensBetween(node1, node2, options = {}) {
    const { count = 1, filter, includeComments = false } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastTokenBetween(node1, node2, options = {}) {
    const { skip = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getTokensBetween(node1, node2, options = {}) {
    const { padding = 0, filter, includeComments = false } = options;
    const tokens = this._getTokensBetween(node1.range[1] - padding, node2.range[0] + padding, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens;
  }

  getTokenByRangeStart(index, options = {}) {
    const { includeComments = false } = options;
    const tokens = this._getTokensInRange([index, index], includeComments);
    return tokens[0] || null;
  }

  commentsExistBetween(node1, node2) {
    const comments = this._getCommentsBetween(node1.range[1], node2.range[0]);
    return comments.length > 0;
  }

  getCommentsBefore(node) {
    const comments = this._getCommentsBefore(node.range[0]);
    return comments;
  }

  getCommentsAfter(node) {
    const comments = this._getCommentsAfter(node.range[1]);
    return comments;
  }

  getCommentsInside(node) {
    const comments = this._getCommentsInRange(node.range);
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

  _getTokensBefore(index, includeComments) {
    const tokens = this.tokens.filter(token => token.range[1] < index);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[1] < index);
      return [...tokens, ...comments];
    }
    return tokens;
  }

  _getTokensAfter(index, includeComments) {
    const tokens = this.tokens.filter(token => token.range[0] > index);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[0] > index);
      return [...tokens, ...comments];
    }
    return tokens;
  }

  _getTokensBetween(start, end, includeComments) {
    const tokens = this.tokens.filter(token => token.range[0] > start && token.range[1] < end);
    if (includeComments) {
      const comments = this.comments.filter(comment => comment.range[0] > start && comment.range[1] < end);
      return [...tokens, ...comments];
    }
    return tokens;
  }

  _filterTokens(tokens, filter) {
    if (filter) {
      return tokens.filter(filter);
    }
    return tokens;
  }

  _getTokensWithPadding(tokens, before, after) {
    const paddedTokens = [];
    if (before > 0) {
      const beforeTokens = this._getTokensBefore(tokens[0].range[0], false);
      paddedTokens.push(...beforeTokens.slice(-before));
    }
    paddedTokens.push(...tokens);
    if (after > 0) {
      const afterTokens = this._getTokensAfter(tokens[tokens.length - 1].range[1], false);
      paddedTokens.push(...afterTokens.slice(0, after));
    }
    return paddedTokens;
  }

  _getCommentsInRange(range) {
    return this.comments.filter(comment => comment.range[0] >= range[0] && comment.range[1] <= range[1]);
  }

  _getCommentsBefore(index) {
    return this.comments.filter(comment => comment.range[1] < index);
  }

  _getCommentsAfter(index) {
    return this.comments.filter(comment => comment.range[0] > index);
  }

  _getCommentsBetween(start, end) {
    return this.comments.filter(comment => comment.range[0] > start && comment.range[1] < end);
  }
}