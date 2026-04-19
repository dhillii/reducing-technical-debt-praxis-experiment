/**
 * @fileoverview Tests for TokenStore class.
 * @author Brandon Mills
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
	espree = require("espree"),
	TokenStore = require("../../../../../lib/languages/js/source-code/token-store");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const DEFAULT_CONFIG = {
	loc: true,
	range: true,
	tokens: true,
	comment: true,
};

const SOURCE_CODE =
		"/*A*/var answer/*B*/=/*C*/a/*D*/* b/*E*///F\n    call();\n/*Z*/",
	AST = espree.parse(SOURCE_CODE, DEFAULT_CONFIG),
	TOKENS = AST.tokens,
	COMMENTS = AST.comments,
	Program = AST,
	VariableDeclaration = Program.body[0],
	VariableDeclarator = VariableDeclaration.declarations[0],
	BinaryExpression = VariableDeclarator.init,
	CallExpression = Program.body[1].expression;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks the values of tokens against an array of expected values.
 * @param {Token[]} tokens Tokens returned from the API.
 * @param {string[]} expected Expected token values
 * @returns {void}
 */
function check(tokens, expected) {
	const length = tokens.length;

	assert.strictEqual(length, expected.length);
	for (let i = 0; i < length; i++) {
		assert.strictEqual(tokens[i].value, expected[i]);
	}
}

/**
 * Retrieves tokens before a node.
 * @param {Node} node The node to retrieve tokens before.
 * @param {number} [count] The number of tokens to retrieve.
 * @param {Object} [options] Options for retrieving tokens.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token[]} The tokens before the node.
 */
function getTokensBefore(node, count, options) {
	const tokens = [];
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		tokens.push(token);
		token = token.prev;
	}

	if (options && options.filter) {
		tokens = tokens.filter(options.filter);
	}

	if (options && options.count) {
		tokens = tokens.slice(0, options.count);
	}

	return tokens;
}

/**
 * Retrieves a token before a node.
 * @param {Node} node The node to retrieve a token before.
 * @param {number} [skip] The number of tokens to skip.
 * @param {Object} [options] Options for retrieving a token.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token} The token before the node.
 */
function getTokenBefore(node, skip, options) {
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		token = token.prev;
	}

	if (options && options.skip) {
		token = token && token.prev;
	}

	if (options && options.filter) {
		token = token && token.filter(options.filter);
	}

	return token;
}

/**
 * Retrieves tokens after a node.
 * @param {Node} node The node to retrieve tokens after.
 * @param {number} [count] The number of tokens to retrieve.
 * @param {Object} [options] Options for retrieving tokens.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token[]} The tokens after the node.
 */
function getTokensAfter(node, count, options) {
	const tokens = [];
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		tokens.push(token);
		token = token.next;
	}

	if (options && options.filter) {
		tokens = tokens.filter(options.filter);
	}

	if (options && options.count) {
		tokens = tokens.slice(0, options.count);
	}

	return tokens;
}

/**
 * Retrieves a token after a node.
 * @param {Node} node The node to retrieve a token after.
 * @param {number} [skip] The number of tokens to skip.
 * @param {Object} [options] Options for retrieving a token.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token} The token after the node.
 */
function getTokenAfter(node, skip, options) {
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		token = token.next;
	}

	if (options && options.skip) {
		token = token && token.next;
	}

	if (options && options.filter) {
		token = token && token.filter(options.filter);
	}

	return token;
}

/**
 * Retrieves tokens between two nodes.
 * @param {Node} startNode The start node.
 * @param {Node} endNode The end node.
 * @param {number} [count] The number of tokens to retrieve.
 * @param {Object} [options] Options for retrieving tokens.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token[]} The tokens between the nodes.
 */
function getTokensBetween(startNode, endNode, count, options) {
	const tokens = [];
	let token = startNode;

	while (token && token !== endNode) {
		tokens.push(token);
		token = token.next;
	}

	if (options && options.filter) {
		tokens = tokens.filter(options.filter);
	}

	if (options && options.count) {
		tokens = tokens.slice(0, options.count);
	}

	return tokens;
}

/**
 * Retrieves the first tokens from a node's token stream.
 * @param {Node} node The node to retrieve tokens from.
 * @param {number} [count] The number of tokens to retrieve.
 * @param {Object} [options] Options for retrieving tokens.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token[]} The first tokens from the node's token stream.
 */
function getFirstTokens(node, count, options) {
	const tokens = [];
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		tokens.push(token);
		token = token.next;
	}

	if (options && options.filter) {
		tokens = tokens.filter(options.filter);
	}

	if (options && options.count) {
		tokens = tokens.slice(0, options.count);
	}

	return tokens;
}

/**
 * Retrieves the first token from a node's token stream.
 * @param {Node} node The node to retrieve a token from.
 * @param {number} [skip] The number of tokens to skip.
 * @param {Object} [options] Options for retrieving a token.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token} The first token from the node's token stream.
 */
function getFirstToken(node, skip, options) {
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		token = token.next;
	}

	if (options && options.skip) {
		token = token && token.next;
	}

	if (options && options.filter) {
		token = token && token.filter(options.filter);
	}

	return token;
}

/**
 * Retrieves the last tokens from a node's token stream.
 * @param {Node} node The node to retrieve tokens from.
 * @param {number} [count] The number of tokens to retrieve.
 * @param {Object} [options] Options for retrieving tokens.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token[]} The last tokens from the node's token stream.
 */
function getLastTokens(node, count, options) {
	const tokens = [];
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		tokens.push(token);
		token = token.prev;
	}

	if (options && options.filter) {
		tokens = tokens.filter(options.filter);
	}

	if (options && options.count) {
		tokens = tokens.slice(0, options.count);
	}

	return tokens;
}

/**
 * Retrieves the last token from a node's token stream.
 * @param {Node} node The node to retrieve a token from.
 * @param {number} [skip] The number of tokens to skip.
 * @param {Object} [options] Options for retrieving a token.
 * @param {boolean} [options.includeComments] Whether to include comments.
 * @param {Function} [options.filter] A filter function for tokens.
 * @returns {Token} The last token from the node's token stream.
 */
function getLastToken(node, skip, options) {
	let token = node;

	while (token && (options === undefined || options.includeComments)) {
		token = token.prev;
	}

	if (options && options.skip) {
		token = token && token.prev;
	}

	if (options && options.filter) {
		token = token && token.filter(options.filter);
	}

	return token;
}

/**
 * Retrieves comments before a node.
 * @param {Node} node The node to retrieve comments before.
 * @returns {Token[]} The comments before the node.
 */
function getCommentsBefore(node) {
	const comments = [];
	let token = node;

	while (token && token.type === "Block") {
		comments.push(token);
		token = token.prev;
	}

	return comments;
}

/**
 * Retrieves comments after a node.
 * @param {Node} node The node to retrieve comments after.
 * @returns {Token[]} The comments after the node.
 */
function getCommentsAfter(node) {
	const comments = [];
	let token = node;

	while (token && token.type === "Block") {
		comments.push(token);
		token = token.next;
	}

	return comments;
}

/**
 * Retrieves comments inside a node.
 * @param {Node} node The node to retrieve comments inside.
 * @returns {Token[]} The comments inside the node.
 */
function getCommentsInside(node) {
	const comments = [];
	let token = node;

	while (token && token.type === "Block") {
		comments.push(token);
		token = token.next;
	}

	return comments;
}

/**
 * Checks if comments exist between two nodes.
 * @param {Node} startNode The start node.
 * @param {Node} endNode The end node.
 * @returns {boolean} Whether comments exist between the nodes.
 */
function commentsExistBetween(startNode, endNode) {
	let token = startNode;

	while (token && token !== endNode) {
		if (token.type === "Block") {
			return true;
		}
		token = token.next;
	}

	return false;
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("TokenStore", () => {
	const store = new TokenStore(TOKENS, COMMENTS);

	describe("when calling getTokens", () => {
		// ... (remaining tests)
	});

	// ... (remaining tests)
});