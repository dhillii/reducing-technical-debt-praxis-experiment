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
    return filteredTokens.slice(skip, skip + 1)[0] || null;
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
    return filteredTokens.slice(skip, skip + 1)[0] || null;
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

  getFirstTokensBetween(node1, node2, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(0, count);
  }

  getFirstTokenBetween(node1, node2, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(skip, skip + 1)[0] || null;
  }

  getLastTokensBetween(node1, node2, options = {}) {
    const { count = 1, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-count);
  }

  getLastTokenBetween(node1, node2, options = {}) {
    const { skip = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return filteredTokens.slice(-skip - 1, -skip)[0] || null;
  }

  getTokensBetween(node1, node2, options = {}) {
    const { padding = 0, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithPadding(filteredTokens, padding, padding);
  }

  getTokenByRangeStart(index, options = {}) {
    const { includeComments } = options;
    const tokens = includeComments ? this.tokens.concat(this.comments) : this.tokens;
    return tokens.find(token => token.range[0] === index) || null;
  }

  commentsExistBetween(node1, node2) {
    return this._getTokensBetween(node1.range[1], node2.range[0], true).length > 0;
  }

  getCommentsBefore(node) {
    return this._getCommentsBefore(node.range[0]);
  }

  getCommentsAfter(node) {
    return this._getCommentsAfter(node.range[1]);
  }

  getCommentsInside(node) {
    return this._getCommentsInside(node.range);
  }

  _getTokensInRange(range, includeComments) {
    const tokens = includeComments ? this.tokens.concat(this.comments) : this.tokens;
    return tokens.filter(token => token.range[0] >= range[0] && token.range[1] <= range[1]);
  }

  _getTokensBefore(index, includeComments) {
    const tokens = includeComments ? this.tokens.concat(this.comments) : this.tokens;
    return tokens.filter(token => token.range[1] < index);
  }

  _getTokensAfter(index, includeComments) {
    const tokens = includeComments ? this.tokens.concat(this.comments) : this.tokens;
    return tokens.filter(token => token.range[0] > index);
  }

  _getTokensBetween(start, end, includeComments) {
    const tokens = includeComments ? this.tokens.concat(this.comments) : this.tokens;
    return tokens.filter(token => token.range[0] > start && token.range[1] < end);
  }

  _filterTokens(tokens, filter) {
    return filter ? tokens.filter(filter) : tokens;
  }

  _getTokensWithPadding(tokens, before, after) {
    return tokens.slice(before, -after);
  }

  _getCommentsBefore(index) {
    return this.comments.filter(comment => comment.range[1] < index);
  }

  _getCommentsAfter(index) {
    return this.comments.filter(comment => comment.range[0] > index);
  }

  _getCommentsInside(range) {
    return this.comments.filter(comment => comment.range[0] >= range[0] && comment.range[1] <= range[1]);
  }
}