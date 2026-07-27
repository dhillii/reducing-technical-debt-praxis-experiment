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
    const { count, filter, includeComments } = options;
    const tokens = this._getTokensBefore(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithCount(filteredTokens, count);
  }

  getTokenBefore(node, options = {}) {
    const { skip, filter, includeComments } = options;
    const tokens = this._getTokensBefore(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokenWithSkip(filteredTokens, skip);
  }

  getTokensAfter(node, options = {}) {
    const { count, filter, includeComments } = options;
    const tokens = this._getTokensAfter(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithCount(filteredTokens, count);
  }

  getTokenAfter(node, options = {}) {
    const { skip, filter, includeComments } = options;
    const tokens = this._getTokensAfter(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokenWithSkip(filteredTokens, skip);
  }

  getFirstTokens(node, options = {}) {
    const { count, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithCount(filteredTokens, count);
  }

  getFirstToken(node, options = {}) {
    const { skip, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokenWithSkip(filteredTokens, skip);
  }

  getLastTokens(node, options = {}) {
    const { count, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithCount(
      filteredTokens.reverse(),
      count,
    ).reverse();
  }

  getLastToken(node, options = {}) {
    const { skip, filter, includeComments } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokenWithSkip(
      filteredTokens.reverse(),
      skip,
    );
  }

  getFirstTokensBetween(node1, node2, options = {}) {
    const { count, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithCount(filteredTokens, count);
  }

  getFirstTokenBetween(node1, node2, options = {}) {
    const { skip, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokenWithSkip(filteredTokens, skip);
  }

  getLastTokensBetween(node1, node2, options = {}) {
    const { count, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokensWithCount(
      filteredTokens.reverse(),
      count,
    ).reverse();
  }

  getLastTokenBetween(node1, node2, options = {}) {
    const { skip, filter, includeComments } = options;
    const tokens = this._getTokensBetween(node1.range, node2.range, includeComments);
    const filteredTokens = this._filterTokens(tokens, filter);
    return this._getTokenWithSkip(
      filteredTokens.reverse(),
      skip,
    );
  }

  getTokensBetween(node1, node2) {
    return this._getTokensBetween(node1.range, node2.range);
  }

  getTokenByRangeStart(index, options = {}) {
    const { includeComments } = options;
    const tokens = includeComments
      ? [...this.tokens, ...this.comments]
      : this.tokens;
    return tokens.find(token => token.range[0] === index) || null;
  }

  commentsExistBetween(node1, node2) {
    return this._getCommentsBetween(node1.range, node2.range).length > 0;
  }

  getCommentsBefore(node) {
    return this._getCommentsBefore(node.range);
  }

  getCommentsAfter(node) {
    return this._getCommentsAfter(node.range);
  }

  getCommentsInside(node) {
    return this._getCommentsInside(node.range);
  }

  _getTokensInRange(range, includeComments) {
    const tokens = includeComments
      ? [...this.tokens, ...this.comments]
      : this.tokens;
    return tokens.filter(token => this._isTokenInRange(token.range, range));
  }

  _getTokensBefore(range, includeComments) {
    const tokens = includeComments
      ? [...this.tokens, ...this.comments]
      : this.tokens;
    return tokens.filter(token => this._isTokenBefore(token.range, range));
  }

  _getTokensAfter(range, includeComments) {
    const tokens = includeComments
      ? [...this.tokens, ...this.comments]
      : this.tokens;
    return tokens.filter(token => this._isTokenAfter(token.range, range));
  }

  _getTokensBetween(range1, range2, includeComments) {
    const tokens = includeComments
      ? [...this.tokens, ...this.comments]
      : this.tokens;
    return tokens.filter(token =>
      this._isTokenBetween(token.range, range1, range2),
    );
  }

  _filterTokens(tokens, filter) {
    return filter ? tokens.filter(filter) : tokens;
  }

  _getTokensWithCount(tokens, count) {
    return count ? tokens.slice(0, count) : tokens;
  }

  _getTokensWithPadding(tokens, before, after) {
    return [...this._getTokensBefore(tokens[0].range, true).slice(-before), ...tokens, ...this._getTokensAfter(tokens[tokens.length - 1].range, true).slice(0, after)];
  }

  _getTokenWithSkip(tokens, skip) {
    return skip ? tokens[skip] || null : tokens[0] || null;
  }

  _isTokenInRange(range, targetRange) {
    return range[0] >= targetRange[0] && range[1] <= targetRange[1];
  }

  _isTokenBefore(range, targetRange) {
    return range[1] <= targetRange[0];
  }

  _isTokenAfter(range, targetRange) {
    return range[0] >= targetRange[1];
  }

  _isTokenBetween(range, range1, range2) {
    return range[0] > range1[1] && range[1] < range2[0];
  }

  _getCommentsBefore(range) {
    return this.comments.filter(comment => this._isCommentBefore(comment.range, range));
  }

  _getCommentsAfter(range) {
    return this.comments.filter(comment => this._isCommentAfter(comment.range, range));
  }

  _getCommentsInside(range) {
    return this.comments.filter(comment => this._isCommentInRange(comment.range, range));
  }

  _getCommentsBetween(range1, range2) {
    return this.comments.filter(comment =>
      this._isCommentBetween(comment.range, range1, range2),
    );
  }

  _isCommentBefore(range, targetRange) {
    return range[1] <= targetRange[0];
  }

  _isCommentAfter(range, targetRange) {
    return range[0] >= targetRange[1];
  }

  _isCommentInRange(range, targetRange) {
    return range[0] >= targetRange[0] && range[1] <= targetRange[1];
  }

  _isCommentBetween(range, range1, range2) {
    return range[0] > range1[1] && range[1] < range2[0];
  }
}