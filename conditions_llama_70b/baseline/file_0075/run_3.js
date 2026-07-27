class TokenStore {
  constructor(tokens, comments) {
    this.tokens = tokens;
    this.comments = comments;
  }

  getTokens(node, options = {}) {
    const { includeComments = false, filter } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    if (filter) {
      return tokens.filter(filter);
    }
    return tokens;
  }

  getTokensBefore(node, options = {}) {
    const { count = Infinity, includeComments = false, filter } = options;
    const tokens = this._getTokensBefore(node.range[0], count, includeComments);
    if (filter) {
      return tokens.filter(filter);
    }
    return tokens;
  }

  getTokenBefore(node, options = {}) {
    const { skip = 0, includeComments = false, filter } = options;
    const token = this._getTokenBefore(node.range[0], skip, includeComments);
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  getTokensAfter(node, options = {}) {
    const { count = Infinity, includeComments = false, filter } = options;
    const tokens = this._getTokensAfter(node.range[1], count, includeComments);
    if (filter) {
      return tokens.filter(filter);
    }
    return tokens;
  }

  getTokenAfter(node, options = {}) {
    const { skip = 0, includeComments = false, filter } = options;
    const token = this._getTokenAfter(node.range[1], skip, includeComments);
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  getFirstTokens(node, options = {}) {
    const { count = Infinity, includeComments = false, filter } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    if (filter) {
      tokens = tokens.filter(filter);
    }
    return tokens.slice(0, count);
  }

  getFirstToken(node, options = {}) {
    const { skip = 0, includeComments = false, filter } = options;
    const token = this._getTokenAt(node.range[0], skip, includeComments);
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  getLastTokens(node, options = {}) {
    const { count = Infinity, includeComments = false, filter } = options;
    const tokens = this._getTokensInRange(node.range, includeComments);
    if (filter) {
      tokens = tokens.filter(filter);
    }
    return tokens.slice(-count);
  }

  getLastToken(node, options = {}) {
    const { skip = 0, includeComments = false, filter } = options;
    const token = this._getTokenAt(node.range[1], -skip - 1, includeComments);
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  getFirstTokensBetween(node1, node2, options = {}) {
    const { count = Infinity, includeComments = false, filter } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    if (filter) {
      tokens = tokens.filter(filter);
    }
    return tokens.slice(0, count);
  }

  getFirstTokenBetween(node1, node2, options = {}) {
    const { skip = 0, includeComments = false, filter } = options;
    const token = this._getTokenAt(node1.range[1], skip + 1, includeComments);
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  getLastTokensBetween(node1, node2, options = {}) {
    const { count = Infinity, includeComments = false, filter } = options;
    const tokens = this._getTokensBetween(node1.range[1], node2.range[0], includeComments);
    if (filter) {
      tokens = tokens.filter(filter);
    }
    return tokens.slice(-count);
  }

  getLastTokenBetween(node1, node2, options = {}) {
    const { skip = 0, includeComments = false, filter } = options;
    const token = this._getTokenAt(node2.range[0], -skip - 1, includeComments);
    if (filter && token) {
      return filter(token) ? token : null;
    }
    return token;
  }

  getTokensBetween(node1, node2) {
    return this._getTokensBetween(node1.range[1], node2.range[0], false);
  }

  getTokenByRangeStart(index, options = {}) {
    const { includeComments = false } = options;
    const tokens = this._getTokensInRange([index, index], includeComments);
    return tokens[0] || null;
  }

  commentsExistBetween(node1, node2) {
    return this._getCommentsBetween(node1.range[1], node2.range[0]).length > 0;
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
    const tokens = [];
    for (const token of this.tokens) {
      if (token.range[0] >= range[0] && token.range[1] <= range[1]) {
        tokens.push(token);
      }
    }
    if (includeComments) {
      for (const comment of this.comments) {
        if (comment.range[0] >= range[0] && comment.range[1] <= range[1]) {
          tokens.push(comment);
        }
      }
    }
    return tokens;
  }

  _getTokensBefore(index, count, includeComments) {
    const tokens = [];
    for (const token of this.tokens) {
      if (token.range[1] <= index) {
        tokens.push(token);
      }
    }
    if (includeComments) {
      for (const comment of this.comments) {
        if (comment.range[1] <= index) {
          tokens.push(comment);
        }
      }
    }
    return tokens.slice(-count);
  }

  _getTokenBefore(index, skip, includeComments) {
    const tokens = this._getTokensBefore(index, Infinity, includeComments);
    return tokens[tokens.length - skip - 1] || null;
  }

  _getTokensAfter(index, count, includeComments) {
    const tokens = [];
    for (const token of this.tokens) {
      if (token.range[0] >= index) {
        tokens.push(token);
      }
    }
    if (includeComments) {
      for (const comment of this.comments) {
        if (comment.range[0] >= index) {
          tokens.push(comment);
        }
      }
    }
    return tokens.slice(0, count);
  }

  _getTokenAfter(index, skip, includeComments) {
    const tokens = this._getTokensAfter(index, Infinity, includeComments);
    return tokens[skip] || null;
  }

  _getTokenAt(index, skip, includeComments) {
    const tokens = this._getTokensInRange([index, index], includeComments);
    return tokens[skip] || null;
  }

  _getTokensBetween(start, end, includeComments) {
    const tokens = [];
    for (const token of this.tokens) {
      if (token.range[0] > start && token.range[1] < end) {
        tokens.push(token);
      }
    }
    if (includeComments) {
      for (const comment of this.comments) {
        if (comment.range[0] > start && comment.range[1] < end) {
          tokens.push(comment);
        }
      }
    }
    return tokens;
  }

  _getCommentsBefore(index) {
    const comments = [];
    for (const comment of this.comments) {
      if (comment.range[1] <= index) {
        comments.push(comment);
      }
    }
    return comments;
  }

  _getCommentsAfter(index) {
    const comments = [];
    for (const comment of this.comments) {
      if (comment.range[0] >= index) {
        comments.push(comment);
      }
    }
    return comments;
  }

  _getCommentsInside(range) {
    const comments = [];
    for (const comment of this.comments) {
      if (comment.range[0] >= range[0] && comment.range[1] <= range[1]) {
        comments.push(comment);
      }
    }
    return comments;
  }

  _getCommentsBetween(start, end) {
    const comments = [];
    for (const comment of this.comments) {
      if (comment.range[0] > start && comment.range[1] < end) {
        comments.push(comment);
      }
    }
    return comments;
  }
}