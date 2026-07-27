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
    const tokens = this._getTokensBefore(node.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getTokenBefore(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensBefore(node.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getTokensAfter(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensAfter(node.range[1], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getTokenAfter(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensAfter(node.range[1], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens[skip] || null;
  }

  getFirstTokens(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstToken(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens[skip] || null;
  }

  getLastTokens(node, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastToken(node, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getFirstTokensBetween(left, right, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBetween(left.range[1], right.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstTokenBetween(left, right, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(left.range[1], right.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens[skip] || null;
  }

  getLastTokensBetween(left, right, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBetween(left.range[1], right.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastTokenBetween(left, right, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(left.range[1], right.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getTokensBetween(left, right, options = {}) {
    const { padding = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(left.range[1], right.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithPadding(filteredTokens, padding, padding);
  }

  getTokenByRangeStart(index, options = {}) {
    const { includeComments } = options;
    const tokens = includeComments ? [...this.tokens, ...this.comments] : this.tokens;
    const token = tokens.find(token => token.range[0] === index);
    return token || null;
  }

  commentsExistBetween(left, right) {
    const comments = this._getCommentsBetween(left.range[1], right.range[0]);
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
    const tokens = includeComments ? [...this.tokens, ...this.comments] : this.tokens;
    return tokens.filter(token => token.range[0] >= range[0] && token.range[1] <= range[1]);
  }

  _getTokensBefore(index, includeComments) {
    const tokens = includeComments ? [...this.tokens, ...this.comments] : this.tokens;
    return tokens.filter(token => token.range[1] < index);
  }

  _getTokensAfter(index, includeComments) {
    const tokens = includeComments ? [...this.tokens, ...this.comments] : this.tokens;
    return tokens.filter(token => token.range[0] > index);
  }

  _getTokensBetween(left, right, includeComments) {
    const tokens = includeComments ? [...this.tokens, ...this.comments] : this.tokens;
    return tokens.filter(token => token.range[0] > left && token.range[1] < right);
  }

  _filterTokens(tokens, filter) {
    if (typeof filter === 'function') {
      return tokens.filter(filter);
    }
    return tokens;
  }

  _getTokensWithPadding(tokens, before, after) {
    const paddedTokens = [];
    if (before > 0) {
      const beforeTokens = this._getTokensBefore(tokens[0].range[0]);
      paddedTokens.push(...beforeTokens.slice(-before));
    }
    paddedTokens.push(...tokens);
    if (after > 0) {
      const afterTokens = this._getTokensAfter(tokens[tokens.length - 1].range[1]);
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

  _getCommentsBetween(left, right) {
    return this.comments.filter(comment => comment.range[0] > left && comment.range[1] < right);
  }
}